import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {setTestDatabase} from '../packages/core/src/db';
import {osintRun,proxyResultLimit} from '../packages/core/src/osint';
import {osintDmPayload,queueOsintDm,retryOsintDelivery,retryPendingOsintDeliveries} from '../packages/core/src/osint-dm';
import {handleOsintInteraction} from '../apps/bot/src/osint';
import {GET} from '../apps/web/src/app/api/[...path]/route';
import {session,sha256} from '../packages/core/src/index';
import {createLoginHandoff,startLoginHandoff,completeLoginHandoff,redeemLoginHandoff} from '../packages/core/src/auth-bridge';
import {globalCommands,guildCommands} from '../packages/core/src/commands';

const guild='888888888888888888',bot='1557484052133707896',user={id:'666666666666666666',username:'researcher',avatar:null};
const originalFetch=globalThis.fetch;let pg:PGlite,dmOpen=true;
const posted:{channel:string;payload:any;text:string}[]=[];
const publicChannel='999999999999999999';let publicPosts=0,publicEdits=0;
process.env.APP_URL='https://turkishpix.example';process.env.DATABASE_URL='postgresql://test.invalid/test';
process.env.AUDIT_HMAC_KEY='test-only-key-012345678901234567890123456789';
process.env.DISCORD_CLIENT_SECRET='test-oauth-secret';process.env.DISCORD_BOT_TOKEN='test-bot-token';process.env.DISCORD_GUILD_ID=guild;
process.env.DISCORD_OWNER_IDS='111111111111111111,222222222222222222,333333333333333333,444444444444444444';process.env.DEMO_MODE='false';
before(async()=>{
 pg=new PGlite();setTestDatabase({query:async(sql:string,params:any[]=[])=>{const r=await pg.query(sql,params);return {rows:r.rows as any[],rowCount:r.affectedRows||0};}});
 const folder=new URL('../packages/core/sql/',import.meta.url);
 for(const file of (await readdir(folder)).filter(f=>/^\d+.*\.sql$/.test(f)&&!f.startsWith('002_')).sort())await pg.exec(await readFile(new URL(file,folder),'utf8'));
 await pg.query('INSERT INTO users(id,username) VALUES($1,$2)',[user.id,user.username]);
 globalThis.fetch=async(input:any,init:any={})=>{
  const u=String(input);
  if(u.includes('/proxyscrape/free-proxy-list@'))return Response.json([
   ...Array.from({length:320},(_,i)=>({protocol:'http',ip:'8.8.'+Math.floor(i/250)+'.'+(i%250+1),port:8080,country_code:'TR',anonymity:'elite',latency_ms:i,uptime_percent:100})),
   {protocol:'http',ip:'8.8.0.1',port:8080,country_code:'TR',anonymity:'elite',latency_ms:0,uptime_percent:100}
  ]);
  if(u.endsWith('/applications/@me'))return Response.json({id:bot,redirect_uris:['https://turkishpix.example/api/auth/callback']});
  if(u.endsWith('/oauth2/token'))return Response.json({access_token:'oauth-access'});
  if(u.endsWith('/users/@me'))return Response.json(user);
  if(u.includes('/members/')||u.endsWith('/member'))return Response.json({user,pending:false,joined_at:'2020-01-01T00:00:00Z'});
  if(u.endsWith('/users/@me/channels'))return Response.json({id:'990000000000000001'});
  if(u.includes('/channels/')&&u.includes('/messages')){
   const channel=u.split('/channels/')[1].split('/')[0];
   if(channel!==publicChannel&&!dmOpen)return Response.json({code:50007,message:'Cannot send messages to this user'},{status:403});
   const payload=init.body instanceof FormData?JSON.parse(String(init.body.get('payload_json'))):JSON.parse(init.body);
   const file=init.body instanceof FormData?init.body.get('files[0]'):null;
   posted.push({channel,payload,text:file instanceof Blob?await file.text():''});
   if(channel===publicChannel){if(init.method==='PATCH')publicEdits++;else publicPosts++;}
   return Response.json({id:channel===publicChannel?'977777777777777777':'988888888888888888'});
  }
  throw new Error('Unexpected fetch: '+new URL(u).pathname);
 };
});
after(async()=>{globalThis.fetch=originalFetch;await pg.close();});

test('Real XP controls 10 + 5 × level proxy results, regardless of client-supplied limit',async()=>{
 for(const level of [0,1,5,10,40]){
  const id=String(555555555555555550n+BigInt(level));
  await pg.query('INSERT INTO users(id,username) VALUES($1,$2)',[id,'level-'+level]);
  await pg.query('INSERT INTO member_profiles(guild_id,user_id,xp) VALUES($1,$2,$3)',[guild,id,level*level*100]);
  const r=await osintRun({id,username:'level-'+level},'proxy',JSON.stringify({limit:level===0?40000:1}),'proxy-test-level-'+level);
  assert.equal(r.quota.level,level);assert.equal(r.quota.proxyResultLimit,10+5*level);
  const rows=r.result.items.filter(row=>/^\d+ · /.test(row.name));assert.equal(rows.length,10+5*level);
  assert.equal(new Set(rows.map(x=>x.value.split(' · ')[0])).size,rows.length);
  assert.match(rows[0].value,/0ms/); // Zero latency remains a valid provider observation.
  const file=osintDmPayload(r.result,r.quota.remaining).file!;
  assert.equal(file.text.trim().split('\n').length,10+5*level);
 }
 assert.equal(proxyResultLimit(100),510);
});

let pendingId='';
test('A blocked DM retains encrypted results, never leaks to the channel, and can be retried without billing',async()=>{
 dmOpen=false;
 const i:any={id:'777777777777777770',guildId:guild,channelId:publicChannel,user,client:{user:{id:bot}},message:{author:{id:bot}},customId:'tp-osint:proxy',isChatInputCommand:()=>false,isButton:()=>true,isStringSelectMenu:()=>false,isModalSubmit:()=>false,deferred:false,deferReply:async function(v:any){assert.equal(v.flags,64);this.deferred=true;},editReply:async(v:any)=>{i.output=v;},reply:async(v:any)=>{i.output=v;}};
 assert.equal(await handleOsintInteraction(i),true);
 assert.match(i.output.content,/DM/);assert.ok(!i.output.content.includes('8.8.'));
 assert.deepEqual(i.output.allowedMentions,{parse:[]});assert.equal(i.output.components[0].components[0].style,3);
 pendingId=i.output.components[0].components[0].custom_id.replace('tp-osint:retry:','');
 const row=(await pg.query<any>('SELECT * FROM osint_dm_deliveries WHERE id=$1',[pendingId])).rows[0];
 assert.equal(row.status,'PENDING');assert.equal(row.last_error,'DM_CLOSED');assert.ok(!row.payload_cipher.includes('8.8.'));
 await assert.rejects(()=>retryOsintDelivery(pendingId,'555555555555555555',true),{code:'DM_NOT_FOUND'});
 const before=(await pg.query('SELECT count(*) n FROM osint_usage WHERE user_id=$1',[user.id])).rows;
 dmOpen=true;const outcome=await retryOsintDelivery(pendingId,user.id,true);assert.equal(outcome.delivered,true);
 const sent=posted.at(-1)!;assert.equal(sent.text.trim().split('\n').length,10);assert.deepEqual(sent.payload.allowed_mentions,{parse:[]});assert.equal(sent.payload.enforce_nonce,true);
 const count=posted.length;assert.equal((await retryOsintDelivery(pendingId,user.id,true)).delivered,true);assert.equal(posted.length,count);
 assert.deepEqual((await pg.query('SELECT count(*) n FROM osint_usage WHERE user_id=$1',[user.id])).rows,before);
 assert.equal((await pg.query<any>('SELECT payload_cipher FROM osint_dm_deliveries WHERE id=$1',[pendingId])).rows[0].payload_cipher,null);
});

test('Installing a panel twice updates its native Discord V2 card instead of posting duplicates',async()=>{
 const i:any={id:'777777777777777771',guildId:guild,channelId:publicChannel,user,client:{user:{id:bot,displayAvatarURL:()=> 'https://cdn.discordapp.com/test.png'}},channel:{id:publicChannel,guildId:guild,type:0},guild:{ownerId:user.id,members:{fetch:async()=>({permissions:{has:()=>true}})}},commandName:'proxy',options:{getSubcommand:()=> 'kur',getChannel:()=>null},isChatInputCommand:()=>true,isButton:()=>false,deferReply:async()=>{i.deferred=true;},editReply:async(v:any)=>{i.output=v;},reply:async(v:any)=>{i.output=v;}};
 const before=publicPosts;await handleOsintInteraction(i);await handleOsintInteraction({...i,id:'777777777777777772'});
 assert.equal(publicPosts,before+1);assert.equal(publicEdits,1);
 const payload=posted.filter(x=>x.channel===publicChannel).at(-1)!.payload;
 assert.equal(payload.flags,32768);assert.equal(payload.components[0].type,17);assert.equal(payload.components[0].accent_color,0x5865f2);
 const json=JSON.stringify(payload);assert.match(json,/Proxy Al/);assert.match(json,/Filtrele/);assert.match(json,/Proxy Checker/);assert.match(json,/discord.gg\/turkishpix/);
 assert.equal((await pg.query('SELECT * FROM osint_panels')).rows.length,1);
 const root=globalCommands.find(c=>c.name==='proxy')!;assert.ok(root);assert.ok(JSON.stringify(root).includes('"name":"gen"'));assert.ok(JSON.stringify(root).includes('"name":"kur"'));
 assert.ok(guildCommands.length<=100);assert.ok(globalCommands.length<=100);
});

test('Unrelated guilds cannot invoke TurkishPix panel actions',async()=>{
 let reply:any;const count=posted.length;
 const i:any={id:'777777777777777773',guildId:'123456789012345678',user,customId:'tp-osint:proxy',isChatInputCommand:()=>false,reply:async(v:any)=>{reply=v;}};
 assert.equal(await handleOsintInteraction(i),true);assert.match(reply.content,/TurkishPix/);assert.equal(reply.flags,64);assert.equal(posted.length,count);
});

test('Expired delivery payloads are erased and closed DMs are not repeatedly probed',async()=>{
 dmOpen=false;const outcome=await queueOsintDm(user,'expired-test-delivery',{content:'private-report'});
 await retryPendingOsintDeliveries();assert.equal((await pg.query<any>('SELECT attempts FROM osint_dm_deliveries WHERE id=$1',[outcome.id])).rows[0].attempts,1);
 await pg.query("UPDATE osint_dm_deliveries SET expires_at=now()-interval '1 minute' WHERE id=$1",[outcome.id]);await retryPendingOsintDeliveries();
 const row=(await pg.query<any>('SELECT status,payload_cipher FROM osint_dm_deliveries WHERE id=$1',[outcome.id])).rows[0];assert.equal(row.status,'EXPIRED');assert.equal(row.payload_cipher,null);
 await assert.rejects(()=>retryOsintDelivery(outcome.id,user.id,true),{code:'DM_EXPIRED'});dmOpen=true;
});

test('The OSINT host authenticates via the registered Discord callback and returns a browser-bound session',async()=>{
 process.env.APP_URL='https://osint.example';process.env.AUTH_BROKER_URL='https://turkishpix.example';process.env.OSINT_ONLY='true';
 const login=await GET(new Request('https://osint.example/api/auth/login?return=%2Fosint%2Fowner'));
 assert.equal(login.status,302);const broker=new URL(login.headers.get('location')!);assert.equal(broker.origin,'https://turkishpix.example');assert.equal(broker.pathname,'/api/auth/bridge');
 const verifier=/tp_oauth_handoff=([a-f0-9]+)/.exec(login.headers.get('set-cookie')!)![1];assert.match(login.headers.get('set-cookie')!,/HttpOnly.*SameSite=Lax.*Secure/);
 process.env.APP_URL='https://turkishpix.example';process.env.AUTH_HANDOFF_ORIGINS='https://osint.example';delete process.env.AUTH_BROKER_URL;delete process.env.OSINT_ONLY;
 const start=await GET(new Request(broker));const auth=new URL(start.headers.get('location')!);assert.equal(auth.origin,'https://discord.com');assert.equal(auth.searchParams.get('redirect_uri'),'https://turkishpix.example/api/auth/callback');
 const state=auth.searchParams.get('state')!;
 const callback=await GET(new Request('https://turkishpix.example/api/auth/callback?code=valid-code&state='+state,{headers:{cookie:'tp_oauth_state='+state}}));
 const target=new URL(callback.headers.get('location')!);assert.equal(target.origin,'https://osint.example');assert.equal(target.pathname,'/api/auth/bridge/callback');
 assert.ok(!callback.headers.getSetCookie().some(c=>c.startsWith('tp_session=')));
 process.env.APP_URL='https://osint.example';
 await assert.rejects(()=>redeemLoginHandoff(target.searchParams.get('ticket')!,'ab'.repeat(32)),{code:'AUTH_HANDOFF_EXPIRED'});
 const finish=await GET(new Request(target,{headers:{cookie:'tp_oauth_handoff='+verifier}}));assert.equal(finish.headers.get('location'),'https://osint.example/osint/owner');
 const token=/tp_session=([a-f0-9]+)/.exec(finish.headers.getSetCookie().find(c=>c.startsWith('tp_session='))!)![1];
 assert.equal((await session(new Request('https://osint.example/api/osint',{headers:{cookie:'tp_session='+token}})))?.id,user.id);
 await assert.rejects(()=>redeemLoginHandoff(target.searchParams.get('ticket')!,verifier),{code:'AUTH_HANDOFF_EXPIRED'});
 process.env.APP_URL='https://turkishpix.example';delete process.env.AUTH_HANDOFF_ORIGINS;
});

test('OAuth handoff rejects outside origins and expired or previously completed requests',async()=>{
 process.env.APP_URL='https://osint.example';process.env.AUTH_BROKER_URL='https://turkishpix.example';
 const created=await createLoginHandoff('https://evil.example/steal');const request=new URL(created.url).searchParams.get('request')!;
 assert.equal((await pg.query<any>('SELECT return_path FROM oauth_handoffs WHERE request_hash=$1',[sha256(request)])).rows[0].return_path,'/');
 process.env.APP_URL='https://turkishpix.example';delete process.env.AUTH_BROKER_URL;process.env.AUTH_HANDOFF_ORIGINS='https://different.example';
 await assert.rejects(()=>startLoginHandoff(request),{code:'AUTH_HANDOFF_FORBIDDEN'});
 process.env.AUTH_HANDOFF_ORIGINS='https://osint.example';
 await pg.query("UPDATE oauth_handoffs SET expires_at=now()-interval '1 minute' WHERE request_hash=$1",[sha256(request)]);
 await assert.rejects(()=>startLoginHandoff(request),{code:'AUTH_HANDOFF_EXPIRED'});
 await assert.rejects(()=>completeLoginHandoff(sha256(request),user.id),{code:'AUTH_HANDOFF_EXPIRED'});
 delete process.env.AUTH_HANDOFF_ORIGINS;
});
