import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTestDatabase,createItem,approveItem,castVote,closeBallot,verifyAudit,audit,dhondt,createSchema,csrf,transaction,DomainError,overview,rateLimit} from '../packages/core/src/index';
process.env.AUDIT_HMAC_KEY='test-only-key-012345678901234567890123456789';
process.env.DISCORD_OWNER_IDS='111111111111111111,222222222222222222,333333333333333333,444444444444444444';
process.env.APP_URL='https://turkishpix.example';
process.env.MIN_VOTES='1';
const owners=process.env.DISCORD_OWNER_IDS.split(',').map((id,i)=>({id,username:'owner'+(i+1)}));
const leader={id:'555555555555555555',username:'leader'};
const secondLeader={id:'666666666666666666',username:'second'};
let pg:PGlite;let partyId:string,ballotId:string;let party2:string;
before(async()=>{
 pg=new PGlite();setTestDatabase({query:async(sql:string,params:any[]=[])=>{const result=await pg.query(sql,params);return {rows:result.rows as any[],rowCount:result.affectedRows||0};}});
 await pg.exec(await readFile(new URL('../packages/core/sql/001_initial.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../packages/core/sql/003_discord_roles.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../packages/core/sql/004_server_setup.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../packages/core/sql/005_community.sql',import.meta.url),'utf8'));
 for(const user of [...owners,leader,secondLeader])await pg.query('INSERT INTO users(id,username) VALUES($1,$2)',[user.id,user.username]);
});
after(async()=>{await pg.close();});
const party=(name:string,abbreviation:string,username:string)=>({kind:'PARTY',name,abbreviation,leaderUsername:username,logo:'',description:'Ortak bir gelecek için siyasi parti açıklaması.',goals:'Şeffaf bir yönetim ve etkin meclis hedefleri.',color:'#dc3a45'});
async function approveAll(id:string){for(const o of owners)await approveItem(o,{itemId:id,decision:'APPROVE'});}
async function expire(id:string){await pg.query("UPDATE ballots SET ends_at=now()-interval '1 second' WHERE id=$1",[id]);}
test('Parti: dört ayrı owner onayı tek halk oylaması açar',async()=>{
 const result=await createItem(leader,party('Cumhuriyet Test Partisi','CTP','leader'));partyId=result.id;
 await assert.rejects(approveItem(leader,{itemId:partyId,decision:'APPROVE'}),(e:any)=>e.code==='FORBIDDEN');
 await approveItem(owners[0],{itemId:partyId,decision:'APPROVE'});
 await assert.rejects(approveItem(owners[0],{itemId:partyId,decision:'APPROVE'}),(e:any)=>e.code==='ALREADY_REVIEWED');
 await approveItem(owners[1],{itemId:partyId,decision:'APPROVE'});await approveItem(owners[2],{itemId:partyId,decision:'APPROVE'});
 assert.equal((await pg.query<any>('SELECT count(*) AS n FROM ballots WHERE item_id=$1',[partyId])).rows[0].n,0);
 await approveItem(owners[3],{itemId:partyId,decision:'APPROVE'});
 const rows=(await pg.query<any>('SELECT * FROM ballots WHERE item_id=$1',[partyId])).rows;assert.equal(rows.length,1);assert.equal(rows[0].audience,'PUBLIC');ballotId=rows[0].id;
});
test('Tek hesap tek oy; hatalı seçenek ve süresi dolmuş oylama reddedilir',async()=>{
 await assert.rejects(castVote(leader,{ballotId,choice:'INVALID'}),(e:any)=>e.code==='INVALID_CHOICE');
 await castVote(leader,{ballotId,choice:'YES'});
 await assert.rejects(castVote(leader,{ballotId,choice:'NO'}),(e:any)=>e.code==='ALREADY_VOTED');
 assert.equal(await closeBallot(ballotId),null);
 await expire(ballotId);await assert.rejects(castVote(owners[0],{ballotId,choice:'YES'}),(e:any)=>e.code==='BALLOT_CLOSED');
 const result=await closeBallot(ballotId);assert.equal(result?.passed,true);assert.equal(result?.totals.YES,1);
 assert.equal((await pg.query<any>('SELECT count(*) AS n FROM parties WHERE id=$1',[partyId])).rows[0].n,1);assert.equal(await closeBallot(ballotId),null);
});
test('Gerekçeli ret halk oylaması açmaz, lider kimliği doğrulanır',async()=>{
 await assert.rejects(createItem(secondLeader,party('Kimlik Hata Partisi','KHP','other')),(e:any)=>e.code==='LEADER_MISMATCH');
 const result=await createItem(secondLeader,party('Reddedilecek Test Partisi','RTP','second'));
 await approveItem(owners[0],{itemId:result.id,decision:'REJECT',reason:'Parti hedefleri yeterince açık değil.'});
 await assert.rejects(approveItem(owners[1],{itemId:result.id,decision:'APPROVE'}),(e:any)=>e.code==='NOT_REVIEWING');
 assert.equal((await pg.query<any>('SELECT state FROM items WHERE id=$1',[result.id])).rows[0].state,'REJECTED');
 assert.equal((await pg.query<any>('SELECT count(*) AS n FROM ballots WHERE item_id=$1',[result.id])).rows[0].n,0);
});
test('İkinci parti kabul edilir ve seçim için hazırlanır',async()=>{
 const result=await createItem(secondLeader,party('Hürriyet Test Partisi','HTP','second'));party2=result.id;await approveAll(result.id);
 const b=(await pg.query<any>('SELECT id FROM ballots WHERE item_id=$1',[result.id])).rows[0].id;await castVote(secondLeader,{ballotId:b,choice:'YES'});await expire(b);assert.equal((await closeBallot(b))?.passed,true);
});
test('Seçim D’Hondt dağılımıyla yeni dönem ve milletvekilleri oluşturur',async()=>{
 const result=await createItem(owners[0],{kind:'ELECTION',title:'Birinci Yasama Dönemi',description:'İlk meclisin kurulması için genel seçim.',seats:4,hours:1,slates:[{partyId,candidates:[leader.id,owners[0].id,owners[2].id]},{partyId:party2,candidates:[secondLeader.id,owners[1].id]}]});
 await approveAll(result.id);const b=(await pg.query<any>('SELECT * FROM ballots WHERE item_id=$1',[result.id])).rows[0];
 await castVote(leader,{ballotId:b.id,choice:partyId});await castVote(owners[0],{ballotId:b.id,choice:partyId});await castVote(secondLeader,{ballotId:b.id,choice:party2});
 await expire(b.id);const outcome=await closeBallot(b.id);assert.equal(outcome?.passed,true);assert.equal(Object.values(outcome?.allocation).reduce((a:any,n:any)=>a+n,0),4);
 const deputies=(await pg.query<any>('SELECT * FROM deputies')).rows;assert.equal(deputies.length,4);const term=(await pg.query<any>('SELECT * FROM terms WHERE ends_at IS NULL')).rows;assert.equal(term.length,1);
});
test('Meclis teklifi aktif MP seçmen listesi ve katılım çoğunluğu ister',async()=>{
 const outsider={id:'777777777777777777',username:'outsider'};await pg.query('INSERT INTO users(id,username) VALUES($1,$2)',[outsider.id,outsider.username]);
 await assert.rejects(createItem(outsider,{kind:'BILL',title:'Yetkisiz teklif',description:'Bu teklif yetkisiz bir hesap tarafından sunuluyor.',articles:'Madde 1: Test maddesi.'}),(e:any)=>e.code==='MP_ONLY');
 const result=await createItem(leader,{kind:'BILL',title:'Haftalık meclis oturumları',description:'Meclis haftada bir düzenli oturum yapmalı.',articles:'Madde 1: Her hafta meclis oturumu yapılır.'});await approveAll(result.id);
 const b=(await pg.query<any>('SELECT * FROM ballots WHERE item_id=$1',[result.id])).rows[0];assert.equal(b.audience,'MP');assert.equal(b.electorate.length,4);
 await assert.rejects(castVote(outsider,{ballotId:b.id,choice:'YES'}),(e:any)=>e.code==='MP_ONLY');
 await castVote(leader,{ballotId:b.id,choice:'YES'});await expire(b.id);assert.equal((await closeBallot(b.id))?.passed,false);
});
test('Kayıt, oy ve onay değiştirilemez; imzalı zincir doğrulanır',async()=>{
 await assert.rejects(pg.query("UPDATE audit_events SET action='FAKE' WHERE seq=1"));await assert.rejects(pg.query('DELETE FROM audit_events WHERE seq=1'));await assert.rejects(pg.query('TRUNCATE audit_events'));
 await assert.rejects(pg.query("UPDATE votes SET choice='NO' WHERE ballot_id=$1",[ballotId]));await assert.rejects(pg.query('DELETE FROM approvals WHERE item_id=$1',[partyId]));
 const v=await verifyAudit();assert.equal(v.valid,true);assert.ok(v.count>20);
 const all=(await pg.query<any>('SELECT * FROM audit_events ORDER BY seq')).rows;all[0].details={tampered:true};const broken=await verifyAudit({query:async()=>({rows:all,rowCount:all.length})});assert.equal(broken.valid,false);
});
test('Başarısız iş transaction içinde audit kaydını da geri alır',async()=>{
 const count=(await pg.query<any>('SELECT count(*) AS n FROM audit_events')).rows[0].n;
 await assert.rejects(transaction(async tx=>{await audit(tx,leader.id,'ROLLBACK_TEST','test');throw new Error('rollback');}));
 assert.equal((await pg.query<any>('SELECT count(*) AS n FROM audit_events')).rows[0].n,count);assert.equal((await verifyAudit()).valid,true);
});
test('CSRF, same-origin, rate limit, logo ve seçim doğrulamaları',async()=>{
 const req=new Request('https://turkishpix.example/api/actions',{method:'POST',headers:{origin:'https://turkishpix.example','x-csrf-token':'secret'}});assert.doesNotThrow(()=>csrf(req,{csrf:'secret'}));
 assert.throws(()=>csrf(new Request('https://turkishpix.example',{headers:{origin:'https://evil.example','x-csrf-token':'secret'}}),{csrf:'secret'}));
 await rateLimit('test-key',1);await assert.rejects(rateLimit('test-key',1),(e:any)=>e.code==='RATE_LIMIT');
 assert.equal(createSchema.safeParse({...party('Test Parti','TP','leader'),logo:'data:image/svg+xml;base64,AAAA'}).success,false);
 assert.deepEqual(dhondt({a:100,b:60,c:20},5),{a:3,b:2,c:0});assert.deepEqual(dhondt({a:10,b:10},2),{a:1,b:1});assert.deepEqual(dhondt({a:0,b:0},3),{a:0,b:0});
 assert.deepEqual(dhondt({a:100,b:60},5,{a:1,b:2}),{a:1,b:2});
});
test('Genel bakış kullanıcı oylarını yalnızca kendi hesabına döndürür',async()=>{
 const publicData=await overview();assert.equal(publicData.me,null);assert.equal(publicData.parties.length,2);
 const privateData=await overview(leader);assert.equal(privateData.me.isDeputy,true);assert.ok(privateData.me.votes.length>0);assert.ok(publicData.ballots.every((b:any)=>!b.user_id));
});
test('Kısıtlı uygulama rolü audit trigger’larını devre dışı bırakamaz',async()=>{
 await pg.exec(await readFile(new URL('../packages/core/sql/002_runtime_role.sql',import.meta.url),'utf8'));
 await pg.exec('SET ROLE turkishpix_runtime');
 try{
  await assert.rejects(pg.query('ALTER TABLE audit_events DISABLE TRIGGER ALL'));
  await assert.rejects(pg.query('DROP TABLE audit_events'));
  await assert.rejects(pg.query("UPDATE audit_events SET action='FAKE' WHERE seq=1"));
  await assert.rejects(pg.query('TRUNCATE votes'));
  assert.ok((await pg.query<any>('SELECT count(*) AS n FROM audit_events')).rows[0].n>0);
 }finally{await pg.exec('RESET ROLE');}
});
