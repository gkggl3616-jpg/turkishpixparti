import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTestDatabase,discordRoleCatalog,saveRoleMappings,roleMappings,roleManagement,memberRoles,createItem,approveItem,processOutbox,desiredRole,verifyAudit,reconcileRoles} from '../packages/core/src/index';
process.env.APP_URL='https://turkishpix.example';process.env.DATABASE_URL='postgresql://test.invalid/test';
process.env.AUDIT_HMAC_KEY='test-only-key-012345678901234567890123456789';
process.env.DISCORD_CLIENT_SECRET='test-oauth-secret';process.env.DISCORD_BOT_TOKEN='test-bot-token';
process.env.DISCORD_GUILD_ID='888888888888888888';process.env.DISCORD_VOTE_CHANNEL_ID='999999999999999999';process.env.DISCORD_LOG_CHANNEL_ID='999999999999999998';
process.env.DISCORD_OWNER_IDS='111111111111111111,222222222222222222,333333333333333333,444444444444444444';process.env.DEMO_MODE='false';
const owners=process.env.DISCORD_OWNER_IDS.split(',').map((id,i)=>({id,username:'owner'+i}));
const citizen={id:'555555555555555555',username:'citizen'},other={id:'666666666666666666',username:'other'};
const botId='777777777777777777',botRole='999999999999999900';
const mappings={TBMM_PRESIDENT:'999999999999999100',PARTY_LEADER:'999999999999999101',MP:'999999999999999102',PARTY_MEMBER:'999999999999999103'};
const roles=[{id:process.env.DISCORD_GUILD_ID,name:'@everyone',position:0,permissions:'0',managed:false,color:0},
 {id:botRole,name:'TurkishPix Bot',position:10,permissions:'268435456',managed:true,color:0},
 {id:'999999999999999901',name:'Yönetici',position:3,permissions:'8',managed:false,color:0},
 {id:'999999999999999902',name:'Entegrasyon',position:3,permissions:'0',managed:true,color:0},
 {id:'999999999999999903',name:'Üst rol',position:11,permissions:'0',managed:false,color:0},
 ...Object.entries(mappings).map(([name,id],i)=>({id,name,position:i+1,permissions:'0',managed:false,color:0})),
 {id:'999999999999999104',name:'Yeni parti rolü',position:3,permissions:'0',managed:false,color:0}];
let pg:PGlite;const originalFetch=globalThis.fetch;const mutations:{method:string;url:string}[]=[];let botPermission=true;
const db={query:async(sql:string,params:any[]=[])=>{const result=await pg.query(sql,params);return {rows:result.rows as any[],rowCount:result.affectedRows||0};}};
before(async()=>{
 pg=new PGlite();setTestDatabase(db);
 for(const file of ['001_initial','003_discord_roles','004_server_setup'])await pg.exec(await readFile(new URL('../packages/core/sql/'+file+'.sql',import.meta.url),'utf8'));
 for(const user of [...owners,citizen,other])await pg.query('INSERT INTO users(id,username) VALUES($1,$2)',[user.id,user.username]);
 globalThis.fetch=async(input:any,init:any)=>{
  const url=String(input),method=init?.method||'GET';
  if(url.includes('/members/')&&url.includes('/roles/')&&['PUT','DELETE'].includes(method)){mutations.push({method,url});return new Response(null,{status:204});}
  if(url.endsWith('/roles'))return Response.json(roles.map(r=>r.id===botRole?{...r,permissions:botPermission?'268435456':'0'}:r));
  if(url.endsWith('/users/@me'))return Response.json({id:botId,username:'TurkishPixBot'});
  if(url.endsWith('/guilds/'+process.env.DISCORD_GUILD_ID))return Response.json({name:'TurkishPix',owner_id:owners[0].id});
  if(url.includes('/members/')){const id=url.split('/').at(-1);const user=[...owners,citizen,other].find(u=>u.id===id)||{id,username:'bot'};return Response.json({user,roles:id===botId?[botRole]:id===citizen.id?[mappings.PARTY_MEMBER]:[],pending:false,joined_at:'2020-01-01T00:00:00Z'});}
  if(url.includes('/messages'))return Response.json({id:'123456789012345678'});
  throw new Error('Unexpected Discord URL');
 };
});
after(async()=>{globalThis.fetch=originalFetch;await pg.close();});
async function approveAll(id:string){for(const owner of owners)await approveItem(owner,{itemId:id,decision:'APPROVE'});}
async function drain(){for(let i=0;i<100;i++)if(!await processOutbox())return;throw new Error('Kuyruk boşalmadı');}
test('Discord rol kataloğu bot izinlerini, entegrasyonları ve hiyerarşiyi denetler',async()=>{
 const catalog=await discordRoleCatalog();assert.equal(catalog.bot.canManage,true);
 for(const id of [process.env.DISCORD_GUILD_ID,botRole,'999999999999999901','999999999999999902','999999999999999903'])assert.equal(catalog.roles.find(r=>r.id===id)?.manageable,false);
 assert.ok(catalog.roles.find(r=>r.id===mappings.MP)?.manageable);
 botPermission=false;assert.equal((await discordRoleCatalog()).roles.find(r=>r.id===mappings.MP)?.manageable,false);botPermission=true;
});
test('Eşleştirme yalnızca owner içindir; tehlikeli ve çift roller reddedilir',async()=>{
 await assert.rejects(saveRoleMappings(citizen,{mappings}),(e:any)=>e.code==='FORBIDDEN');
 await assert.rejects(roleManagement(citizen),(e:any)=>e.code==='FORBIDDEN');
 await assert.rejects(saveRoleMappings(owners[0],{mappings:{...mappings,MP:'999999999999999901'}}),(e:any)=>e.code==='ROLE_NOT_MANAGEABLE');
 await assert.rejects(saveRoleMappings(owners[0],{mappings:{...mappings,MP:mappings.PARTY_MEMBER}}),(e:any)=>e.code==='DUPLICATE_ROLE');
 await saveRoleMappings(owners[0],{mappings});assert.deepEqual(await roleMappings(),mappings);
 assert.equal((await verifyAudit()).valid,true);
});
test('Kullanıcı kendi Discord rollerini okuyabilir, başka hesaplar owner gerektirir',async()=>{
 const self=await memberRoles(citizen);assert.deepEqual(self.politicalRoles,[{key:'PARTY_MEMBER',label:'Parti üyesi'}]);
 await assert.rejects(memberRoles(citizen,other.id),(e:any)=>e.code==='FORBIDDEN');
 assert.equal((await memberRoles(owners[0],citizen.id)).user.id,citizen.id);
});
test('Rol ataması ilk üç onayda uygulanmaz; dördüncü onay Discord işini oluşturur',async()=>{
 const input={kind:'ROLE_ASSIGNMENT',userId:citizen.id,roleKey:'PARTY_LEADER',enabled:true,reason:'Topluluk siyasi görevlendirmesi.'};
 await assert.rejects(createItem(citizen,input),(e:any)=>e.code==='FORBIDDEN');
 const item=await createItem(owners[0],input);
 await assert.rejects(createItem(owners[0],input),(e:any)=>e.code==='ROLE_REQUEST_PENDING');
 for(const owner of owners.slice(0,3))await approveItem(owner,{itemId:item.id,decision:'APPROVE'});
 assert.equal((await pg.query('SELECT * FROM discord_role_grants')).rows.length,0);
 await approveItem(owners[3],{itemId:item.id,decision:'APPROVE'});
 assert.equal(await desiredRole(db,citizen.id,'PARTY_LEADER'),true);
 await drain();assert.ok(mutations.some(m=>m.method==='PUT'&&m.url.endsWith('/'+mappings.PARTY_LEADER)));
 assert.equal((await verifyAudit()).valid,true);
});
test('Gecikmiş rol işleri güncel kararı uygular; kaldırma da dört onay ister',async()=>{
 const remove=await createItem(owners[0],{kind:'ROLE_ASSIGNMENT',userId:citizen.id,roleKey:'PARTY_LEADER',enabled:false,reason:'Görevlendirmenin süresi tamamlandı.'});
 await reconcileRoles(owners[0]);await approveAll(remove.id);mutations.length=0;
 await drain();assert.ok(mutations.some(m=>m.method==='DELETE'&&m.url.endsWith('/'+mappings.PARTY_LEADER)));
 assert.equal(mutations.some(m=>m.method==='PUT'&&m.url.endsWith('/'+mappings.PARTY_LEADER)),false);
 assert.equal(await desiredRole(db,citizen.id,'PARTY_LEADER'),false);
});
let termId:string;
test('Milletvekili rolü meclis koltuğu yaratmaz; TBMM başkanı aktif MP olmalı',async()=>{
 for(const roleKey of ['MP','TBMM_PRESIDENT'])await assert.rejects(createItem(owners[0],{kind:'ROLE_ASSIGNMENT',userId:citizen.id,roleKey,enabled:true,reason:'Bu atama henüz uygun değil.'}),(e:any)=>['NO_MP_RECORD','PRESIDENT_MP_ONLY'].includes(e.code));
 const itemId=randomUUID(),partyId=randomUUID();termId=randomUUID();
 await pg.query("INSERT INTO items(id,kind,title,description,payload,author_id,owner_ids,approval_quorum,min_votes,ballot_hours,state) VALUES($1,'PARTY','Test parti','Test parti açıklaması','{}',$2,$3,4,1,24,'PASSED')",[itemId,citizen.id,JSON.stringify(owners.map(o=>o.id))]);
 await pg.query("INSERT INTO parties(id,item_id,name,abbreviation,description,goals,leader_id) VALUES($1,$2,'Test partisi','TP','Test parti açıklaması','Test parti hedefleri',$3)",[partyId,itemId,citizen.id]);
 await pg.query("INSERT INTO terms(id,election_item_id,name,seats) VALUES($1,$2,'Test yasama dönemi',2)",[termId,itemId]);
 for(const user of [citizen,other])await pg.query('INSERT INTO deputies(id,user_id,party_id,term_id,source_item_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.id,partyId,termId,itemId]);
 await assert.rejects(createItem(owners[0],{kind:'ROLE_ASSIGNMENT',userId:citizen.id,roleKey:'MP',enabled:false,reason:'Aktif kaydı atlayan kaldırma.'}),(e:any)=>e.code==='ACTIVE_ROLE');
});
test('Tek TBMM başkanı dört owner onayıyla değişir ve dönem bitince rol kaldırılır',async()=>{
 for(const user of [citizen,other]){const item=await createItem(owners[0],{kind:'ROLE_ASSIGNMENT',userId:user.id,roleKey:'TBMM_PRESIDENT',enabled:true,reason:'Meclis başkanlığı görevlendirmesi.'});await approveAll(item.id);}
 assert.equal(await desiredRole(db,citizen.id,'TBMM_PRESIDENT'),false);assert.equal(await desiredRole(db,other.id,'TBMM_PRESIDENT'),true);
 assert.equal((await pg.query("SELECT * FROM discord_role_grants WHERE role_key='TBMM_PRESIDENT' AND enabled")).rows.length,1);
 await pg.query('UPDATE terms SET ends_at=now() WHERE id=$1',[termId]);
 await drain();assert.equal(await desiredRole(db,other.id,'TBMM_PRESIDENT'),false);
 assert.equal(mutations.filter(m=>m.url.endsWith('/'+mappings.TBMM_PRESIDENT)).at(-1)?.method,'DELETE');
});
test('Rol eşleştirmesi değişince eski rol çıkarılır ve yeni rol eklenir',async()=>{
 const previous=mappings.PARTY_LEADER,newRole='999999999999999104';
 const item=await createItem(owners[0],{kind:'ROLE_ASSIGNMENT',userId:other.id,roleKey:'PARTY_LEADER',enabled:true,reason:'Yeni parti temsilcisi görevlendirmesi.'});await approveAll(item.id);await drain();mutations.length=0;
 await saveRoleMappings(owners[0],{mappings:{...mappings,PARTY_LEADER:newRole}});await drain();
 assert.ok(mutations.some(m=>m.method==='DELETE'&&m.url.endsWith('/'+previous)));
 assert.ok(mutations.some(m=>m.method==='PUT'&&m.url.endsWith('/'+newRole)));
 assert.equal((await verifyAudit()).valid,true);
});
