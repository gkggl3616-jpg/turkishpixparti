import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {Socket} from 'node:net';
import jsQR from 'jsqr';
import {PGlite} from '@electric-sql/pglite';
import {setTestDatabase} from '../packages/core/src/db';
import {generateQr,searchRepositories,parseRepositorySearch} from '../packages/core/src/osint-utilities';
import {parsePublicApiReadme,searchApiDirectory,parseApiSearch} from '../packages/core/src/osint-api-directory';
import {robloxUsername,parseMinecraftTarget,readMinecraftStatus,minecraftStatus} from '../packages/core/src/osint-game-tools';
import {osintRun,validateOsint} from '../packages/core/src/osint';
import {osintDmPayload,sendOsintResult} from '../packages/core/src/osint-dm';
import {eventPreview} from '../packages/core/src/osint-access';
import {osintCategories} from '../packages/core/src/osint-navigation';
import {commands,globalCommands,guildCommands} from '../packages/core/src/commands';
import {osintSetupCommand} from '../packages/core/src/osint-policy';
import {handleOsintInteraction} from '../apps/bot/src/osint';
import {POST} from '../apps/web/src/app/api/osint/run/route';
import {decryptResearchReport} from '../packages/core/src/osint-reports';
const {PNG}=createRequire(import.meta.url)('pngjs');
const owner={id:'111111111111111111',username:'owner'},guild='888888888888888888',bot='999999999999999999';let pg:PGlite,originalFetch=globalThis.fetch,searchCalls=0,catalogCalls=0,mode='normal';const posted:{body:any;blob:Blob|null}[]=[];
process.env.DISCORD_OWNER_IDS=owner.id+',222222222222222222,333333333333333333,444444444444444444';process.env.DISCORD_GUILD_ID=guild;process.env.DISCORD_BOT_TOKEN='fixture';process.env.AUDIT_HMAC_KEY='utilities-fixture-012345678901234567890123456789';process.env.DEMO_MODE='false';
const markdown=`### Weather
| API | Description | Auth | HTTPS | CORS |
|:---|:---|:---|:---|:---|
| [Open-Meteo](https://open-meteo.com/) | Forecast | No | Yes | Yes |
| [Docs](https://example.com/docs?x='test') | Documentation | apiKey | Yes | Unknown |
| [HTTP](http://example.org/docs) | HTTP only | No | No | No |
### Finance
| [Rates](https://open.er-api.com/) | Public rates | No | Yes | Yes |
`;
before(async()=>{
 pg=new PGlite();setTestDatabase({query:async(sql,params=[])=>{const r=await pg.query(sql,params);return {rows:r.rows as any[],rowCount:r.affectedRows||0};}});
 const folder=new URL('../packages/core/sql/',import.meta.url);for(const n of (await readdir(folder)).filter(n=>/^\d+.*\.sql$/.test(n)&&!n.startsWith('002_')).sort())await pg.exec(await readFile(new URL(n,folder),'utf8'));
 await pg.query('INSERT INTO users(id,username) VALUES($1,$2)',[owner.id,owner.username]);
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input));
  if(u.hostname==='discord.com'){
   if(u.pathname.endsWith('/members/'+owner.id))return Response.json({user:owner,roles:[],pending:false});
   if(u.pathname.endsWith('/users/@me/channels')){assert.equal(JSON.parse(String(init.body)).recipient_id,owner.id);return Response.json({id:'777777777777777777'});}
   if(u.pathname.includes('/messages')){assert.ok(u.pathname.includes('777777777777777777'));const body=init.body instanceof FormData?JSON.parse(String(init.body.get('payload_json'))):JSON.parse(String(init.body));posted.push({body,blob:init.body instanceof FormData?init.body.get('files[0]') as Blob:null});return Response.json({id:'666666666666666666'});}
  }
  if(u.hostname==='api.github.com'){
   searchCalls++;assert.equal(u.pathname,'/search/repositories');assert.match(u.searchParams.get('q')!,/is:public archived:false fork:false/);assert.equal(init.headers&&new Headers(init.headers).get('X-GitHub-Api-Version'),'2022-11-28');
   if(u.searchParams.get('q')!.includes('failFixture'))return Response.json({message:'down'},{status:503});
   return Response.json({total_count:4,incomplete_results:false,items:[{private:false,archived:false,fork:false,full_name:'owner/template',html_url:'https://evil.example',description:'Useful template',language:'TypeScript',license:{spdx_id:'MIT'},stargazers_count:12,forks_count:2,pushed_at:'2026-01-01',topics:['bot']},{private:true,full_name:'private/repo'},{private:false,archived:true,full_name:'old/repo'},{private:false,archived:false,fork:false,full_name:'license/unknown',license:{spdx_id:'NOASSERTION'}}]});
  }
  if(u.hostname==='raw.githubusercontent.com'){catalogCalls++;assert.equal(u.pathname,'/public-apis/public-apis/master/README.md');return new Response(markdown);}
  if(u.hostname==='users.roblox.com'){assert.equal(init.method,'POST');const body=JSON.parse(String(init.body));assert.equal(body.excludeBannedUsers,false);if(mode==='empty')return Response.json({data:[]});if(mode==='broken')return Response.json({error:'bad'});return Response.json({data:[{id:123,name:body.usernames[0],displayName:'Public name'}]});}
  throw Error('Unexpected external request '+u.hostname);
 };
});
after(async()=>{globalThis.fetch=originalFetch;await pg.close();});
test('QR PNG round-trips Turkish and URL contents through an independent decoder',async()=>{
 for(const content of ['Türkçe QR: İstanbul, şğüöç','https://example.com/?q=test&x=1']){
  const result=await generateQr(content),png=PNG.sync.read(Buffer.from(result.qr.pngDataUrl.split(',')[1],'base64'));assert.equal(png.width,1024);assert.equal(png.height,1024);
  const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);assert.equal(decoded?.data,content);assert.match(result.qr.svg,/^<svg/);assert.doesNotMatch(result.qr.svg,/<script/);
 }
 assert.throws(()=>validateOsint('qr-code','ü'.repeat(1001)),{code:'INVALID_QR'});assert.throws(()=>validateOsint('qr-code','\u0000'),{code:'INVALID_QR'});assert.equal(eventPreview('qr-code','secret value'),'[QR içeriği]');
});
test('Repository filters use a fixed API and reject arbitrary query qualifiers; safe links and license absence remain explicit',async()=>{
 assert.throws(()=>parseRepositorySearch('{"query":"example","page":51}'));assert.throws(()=>parseRepositorySearch('repo:private/repo'));
 const input=JSON.stringify({query:'fixture template',license:'mit',language:'TypeScript'}),[a,b]=await Promise.all([searchRepositories(input),searchRepositories(input)]);assert.equal(searchCalls,1);assert.equal(a.repositorySearch.repositories.length,2);assert.equal(a.repositorySearch.repositories[0].url,'https://github.com/owner/template');assert.equal(a.repositorySearch.repositories[1].license,null);assert.equal(b.repositorySearch.checkedAt,a.repositorySearch.checkedAt);
 assert.equal((await searchRepositories(input)).repositorySearch.cached,true);assert.equal(searchCalls,1);
 await assert.rejects(()=>searchRepositories('failFixture'),{code:'PROVIDER_UNAVAILABLE'});await assert.rejects(()=>searchRepositories('failFixture'),{code:'PROVIDER_UNAVAILABLE'});assert.equal(searchCalls,3);
});
test('API catalog parses five-column tables and distinguishes real example calls from documentation cURL',async()=>{
 const parsed=parsePublicApiReadme(markdown);assert.equal(parsed.length,4);assert.equal(parsed[0].curlKind,'api');assert.match(parsed[0].curl,/api.open-meteo.com/);assert.equal(parsed[1].curlKind,'docs');assert.match(parsed[1].curl,/%27test%27/);
 assert.equal(parseApiSearch('hava durumu').category,'Weather');const a=await searchApiDirectory(JSON.stringify({category:'Weather',noAuth:true}));assert.equal(a.apiDirectory.total,1);assert.equal(a.apiDirectory.entries[0].name,'Open-Meteo');await searchApiDirectory('Finans');assert.equal(catalogCalls,1);
 await assert.rejects(()=>searchApiDirectory('not-a-category'),{code:'API_CATEGORY'});
});
test('Roblox lookup differentiates public-account match, no match and broken provider response',async()=>{
 const a=await robloxUsername('Roblox');assert.match(a.summary,/bulundu/);assert.ok(a.items.some(r=>r.value==='https://www.roblox.com/users/123/profile'));
 mode='empty';assert.match((await robloxUsername('UnusedFixture')).items[1].value,/garantisi değildir/);mode='broken';await assert.rejects(()=>robloxUsername('Roblox'),{code:'PROVIDER_FORMAT'});mode='normal';assert.throws(()=>validateOsint('roblox-username','_bad'));
});
function v(n:number){const out:number[]=[];do{let b=n&127;n>>>=7;if(n)b|=128;out.push(b);}while(n);return Buffer.from(out);}
test('Minecraft frame parser handles fragmentation and excludes player samples; target validation blocks reserved networks',async()=>{
 const json=Buffer.from(JSON.stringify({version:{name:'1.21'},players:{online:3,max:20,sample:[{name:'private-sample'}]}})),body=Buffer.concat([v(0),v(json.length),json]),frame=Buffer.concat([v(body.length),body]);
 for(let i=0;i<frame.length;i++)assert.equal(readMinecraftStatus(frame.subarray(0,i)),null);assert.deepEqual(readMinecraftStatus(frame),{version:'1.21',online:3,max:20});assert.throws(()=>readMinecraftStatus(v(70000)),{code:'MC_SIZE'});
 for(const target of ['127.0.0.1','10.0.0.1:25565','[::1]:25565','[::ffff:127.0.0.1]:25565','https://example.com','example.com:0','example.com:65536'])assert.throws(()=>parseMinecraftTarget(target));
 assert.deepEqual(parseMinecraftTarget('play.example.com:25565'),{host:'play.example.com',port:25565});await assert.rejects(()=>minecraftStatus('127.0.0.1'),{code:'MC_PUBLIC_HOST'});
});
test('Minecraft status opens one pinned public connection, sends the protocol request and caches only a valid reply',async()=>{
 const connect=Socket.prototype.connect,write=Socket.prototype.write,sockets=new WeakSet<Socket>();let connections=0,sent:Buffer|undefined;
 const json=Buffer.from(JSON.stringify({version:{name:'fixture-java'},players:{online:0,max:40,sample:[{name:'not-retained'}]}})),body=Buffer.concat([v(0),v(json.length),json]),frame=Buffer.concat([v(body.length),body]);
 (Socket.prototype as any).connect=function(options:any,callback:any){if(options?.host!=='1.1.1.1')return (connect as any).call(this,options,callback);assert.equal(options.port,25566);assert.equal(options.family,4);sockets.add(this);connections++;queueMicrotask(()=>callback());return this;};
 (Socket.prototype as any).write=function(buffer:any,...args:any[]){if(!sockets.has(this))return (write as any).call(this,buffer,...args);sent=Buffer.from(buffer);queueMicrotask(()=>{this.emit('data',frame.subarray(0,10));this.emit('data',frame.subarray(10));});return true;};
 try{const first=await minecraftStatus('1.1.1.1:25566'),second=await minecraftStatus('1.1.1.1:25566');assert.equal(connections,1);assert.ok(sent?.includes(Buffer.from('1.1.1.1')));assert.equal(sent?.subarray(-2).toString('hex'),'0100');assert.match(first.summary,/0\/40/);assert.match(second.items.at(-1)!.value,/önbellek/);assert.ok(!JSON.stringify(first).includes('not-retained'));}
 finally{Socket.prototype.connect=connect;Socket.prototype.write=write;}
});
test('QR web report stays encrypted under its owner and PNG DM attachment is actual binary image',async()=>{
 const data=await osintRun(owner,'qr-code','private QR text','utility-web-fixture-001',undefined,'WEB');const record=(await pg.query<any>('SELECT target,result_cipher FROM osint_reports WHERE id=$1',[data.reportId])).rows[0];assert.equal(record.target,'[QR içeriği]');assert.ok(!record.result_cipher.includes('private QR text'));assert.equal(decryptResearchReport(record.result_cipher).items[0].value,'private QR text');
 const payload=osintDmPayload(data.result,null);assert.equal(payload.file?.contentType,'image/png');assert.equal(payload.file?.name,'turkishpix-qr.png');
 assert.equal((await sendOsintResult(owner,data.result,null,'utility-dm-fixture-001')).delivered,true);const sent=posted.at(-1)!;assert.equal(sent.blob?.type,'image/png');const bytes=Buffer.from(await sent.blob!.arrayBuffer());assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(PNG.sync.read(bytes).width,1024);assert.deepEqual(sent.body.allowed_mentions,{parse:[]});
});
test('Direct slash wrappers show channel results through the shared engine; /kur remains exactly eight categories',async()=>{
 const replies:any[]=[];const i:any={id:'555555555555555555',guildId:guild,commandName:'qr-olustur',user:owner,client:{user:{id:bot}},isChatInputCommand:()=>true,isButton:()=>false,isStringSelectMenu:()=>false,isModalSubmit:()=>false,options:{getString:()=> 'slash fixture QR'},deferReply:async function(d:any){assert.equal(d.flags,undefined);this.deferred=true;},editReply:async(d:any)=>replies.push(d),reply:async(d:any)=>replies.push(d)};
 assert.equal(await handleOsintInteraction(i),true);assert.match(replies.at(-1).embeds[0].title,/QR/);assert.equal(replies.at(-1).files[0].name,'turkishpix-qr.png');assert.deepEqual(replies.at(-1).allowedMentions,{parse:[]});
 assert.equal(osintSetupCommand.options.length,8);assert.equal(osintCategories.find(c=>c.id==='research')?.tools.includes('api-directory'),true);assert.equal(guildCommands.length,100);for(const name of ['qr-olustur','api-ara','altyapi-ara','temp-mail','proxy-cek','roblox-isim-kontrol','mc-durum'])assert.ok(globalCommands.some(c=>c.name===name));assert.equal(new Set(commands.map(c=>c.name)).size,commands.length);
});
test('New web tools remain behind the session gate',async()=>{const response=await POST(new Request('https://osint.example/api/osint/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'qr-code',target:'test',requestId:'anonymous-fixture'})}));assert.equal(response.status,401);});

test('Roblox bulk lookup keeps each missing/invalid name visible and deduplicates case-insensitively',async()=>{
 mode='empty';const data=await robloxUsername('MissingOne, MissingTwo\nmissingone, _bad');assert.equal(data.items.length,3);assert.equal(data.items[0].value,'Bulunamadı: MissingOne');assert.equal(data.items[1].value,'Bulunamadı: MissingTwo');assert.match(data.items[2].value,/Geçersiz/);mode='normal';
});

test('Target-based bulk input preserves individual failures and supports TXT modals without splitting QR content',async()=>{
 const {bulkTargets,readTargetAttachment}=await import('../packages/core/src/osint-bulk');const {osintQueryModal,osintPanel}=await import('../packages/core/src/osint-panels');
 assert.deepEqual(bulkTargets('dns','example.com,EXAMPLE.COM\nother.example'),['example.com','other.example']);assert.deepEqual(bulkTargets('qr-code','a,b\nc'),['a,b\nc']);assert.throws(()=>bulkTargets('dns',Array.from({length:21},(_,n)=>n+'.example').join(',')),{code:'BULK_LIMIT'});
 assert.equal(osintQueryModal('dns')!.components[1].component.type,19);assert.match(JSON.stringify(osintPanel('research')),/query:qr-code/);assert.match(JSON.stringify(osintPanel('social')),/query:roblox-username/);await assert.rejects(()=>readTargetAttachment({name:'bad.txt',url:'https://evil.example/a.txt',size:10}),{code:'BULK_FILE_URL'});
 const batch=await osintRun(owner,'ioc','example[.]com,https://example.com','bulk-normalizer-fixture');assert.equal(batch.result.items.length,2);assert.ok(batch.result.items.every(i=>!i.value.startsWith('Hata:')));
});
