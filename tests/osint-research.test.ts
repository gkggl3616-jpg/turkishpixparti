import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setTestDatabase,transaction} from '../packages/core/src/db';
import {createHash} from 'node:crypto';
import {osintAdminState,osintAuditExport} from '../packages/core/src/osint-admin';
import {canonical} from '../packages/core/src/audit';
import {validateOsint} from '../packages/core/src/osint';
import {config} from '../packages/core/src/config';
import {entitlement,consumeOsintCredit,osintGrant,revokeOsintGrant} from '../packages/core/src/osint-entitlements';
import {providerJson,osintProviderStatus,setOsintProviderKey,sealOsintSecret,openOsintSecret} from '../packages/core/src/osint-network';
import {dnsQuery,publicResearchIp,researchUrl,publicHead,headersReport,combineResearch,emailConfiguration,passiveSubdomains,lookupMalwareHash} from '../packages/core/src/osint-research';
import {lookupCve} from '../packages/core/src/osint-providers';
import {temporaryMailbox,temporaryInbox,purgeExpiredMailboxes} from '../packages/core/src/osint-mail';
import {verifyAudit} from '../packages/core/src/audit';
import {osintQuota} from '../packages/core/src/osint';
import {eventPreview} from '../packages/core/src/osint-access';
let pg:PGlite;const originalFetch=globalThis.fetch;
const guild='888888888888888888',owner={id:'111111111111111111',username:'owner'},member={id:'555555555555555555',username:'member'};
process.env.DISCORD_GUILD_ID=guild;process.env.DISCORD_OWNER_IDS='111111111111111111,222222222222222222,333333333333333333,444444444444444444';process.env.DISCORD_BOT_TOKEN='fixture';process.env.AUDIT_HMAC_KEY='fixture-research-key-012345678901234567890123456789';process.env.DEMO_MODE='false';
const requests:string[]=[];let accounts=0;
before(async()=>{
 pg=new PGlite();setTestDatabase({query:async(sql,params=[])=>{const r=await pg.query(sql,params);return {rows:r.rows as any[],rowCount:r.affectedRows||0};}});
 const folder=new URL('../packages/core/sql/',import.meta.url);for(const name of (await readdir(folder)).filter(n=>/^\d+.*\.sql$/.test(n)&&!n.startsWith('002_')).sort())await pg.exec(await readFile(new URL(name,folder),'utf8'));
 await pg.query('INSERT INTO users(id,username) VALUES($1,$2),($3,$4)',[owner.id,owner.username,member.id,member.username]);
 globalThis.fetch=async(input:any,init:any={})=>{
  const u=new URL(String(input));requests.push(u.hostname+u.pathname);
  if(u.hostname==='discord.com')return Response.json({user:{id:u.pathname.split('/').at(-1),username:'verified'},roles:[],pending:false,joined_at:'2020-01-01T00:00:00Z'});
  if(u.hostname==='cloudflare-dns.com')return Response.json({Status:2},{status:503});
  if(u.hostname==='dns.google'){const name=u.searchParams.get('name'),type=Number(u.searchParams.get('type'));return Response.json({Status:0,AD:true,Answer:type===16?[{name,type,TTL:60,data:name?.startsWith('_dmarc.')?'"v=DMARC1; p=none"':'"v=spf1 +all"'}]:[{name,type,TTL:300,data:'93.184.215.14'}]});}
  if(u.hostname==='services.nvd.nist.gov')return Response.json({},{status:503});
  if(u.hostname==='cveawg.mitre.org')return Response.json({cveMetadata:{state:'PUBLISHED',datePublished:'2024-03-29'},containers:{cna:{descriptions:[{lang:'en',value:'CVE fallback fixture'}],metrics:[{cvssV3_1:{baseScore:10}}]}}});
  if(u.hostname==='crt.sh')return Response.json({},{status:503});
  if(u.hostname==='api.hackertarget.com')return new Response('www.example.com,1.1.1.1\napi.example.com,1.1.1.2\nwww.example.com,1.1.1.1\nevil.other.com,1.1.1.3');
  if(u.hostname==='api.mail.tm'){
   if(u.pathname==='/domains')return Response.json([{domain:'mail.example',isActive:true,isPrivate:false}]);
   if(u.pathname==='/accounts'){accounts++;return Response.json({id:'mail-fixture-account'});}
   if(u.pathname==='/token')return Response.json({token:'private-fixture-mail-token'});
   assert.equal(init.headers.Authorization,'Bearer private-fixture-mail-token');
   if(u.pathname==='/messages')return Response.json([{id:'fixture-message',subject:'Private inbox fixture',createdAt:'2026-10-12T10:00:00Z'}]);
   if(u.pathname==='/messages/fixture-message')return Response.json({from:{address:'sender@example.com'},text:'private fixture contents',html:['<script>never execute</script>']});
   if(init.method==='DELETE')return new Response(null,{status:204});
  }
  if(u.hostname==='www.virustotal.com')return Response.json({},{status:503});
  if(u.hostname==='mb-api.abuse.ch')return Response.json({query_status:'hash_not_found'});
  throw new Error('Unexpected fixture request: '+u.hostname+u.pathname);
 };
});
after(async()=>{globalThis.fetch=originalFetch;await pg.close();});
test('All four configured owners receive unlimited quota at level zero; ordinary XP quota still applies',async()=>{
 for(const id of config().owners){if(id!==owner.id)await pg.query('INSERT INTO users(id,username) VALUES($1,$2)',[id,'owner']);const q=await osintQuota(id);assert.equal(q.unlimited,true);assert.equal(q.remaining,null);assert.equal(q.dailyLimit,null);assert.equal(q.level,0);assert.equal(q.proxyResultLimit,null);}
 const q=await osintQuota(member.id);assert.equal(q.unlimited,false);assert.equal(q.remaining,5);
});
test('Additional credits expire, are server scoped and consume once per request after the daily allowance',async()=>{
 const g=await osintGrant(owner,member.id,2,new Date(Date.now()+86400000).toISOString());
 await pg.query("INSERT INTO osint_grants(guild_id,user_id,assigned_by,credits,expires_at) VALUES($1,$2,$3,100,now()-interval '1 minute'),('123456789012345678',$2,$3,100,now()+interval '1 day')",[guild,member.id,owner.id]);
 assert.equal((await entitlement(member.id,5)).remaining,7);
 for(let i=0;i<6;i++)await transaction(tx=>consumeOsintCredit(tx,member.id,'request-id-'+i,'dns','a'.repeat(64),5));
 let q=await entitlement(member.id,5);assert.equal(q.used,5);assert.equal(q.extraCredits,1);assert.equal(q.remaining,1);
 const duplicate=await transaction(tx=>consumeOsintCredit(tx,member.id,'request-id-5','dns','a'.repeat(64),5));assert.equal(duplicate.duplicate,true);assert.equal((await entitlement(member.id,5)).remaining,1);
 await assert.rejects(()=>transaction(tx=>consumeOsintCredit(tx,member.id,'request-id-5','dns','b'.repeat(64),5)),{code:'OSINT_REQUEST_REUSED'});
 await revokeOsintGrant(owner,g.id);assert.equal((await entitlement(member.id,5)).remaining,0);
 await assert.rejects(()=>transaction(tx=>consumeOsintCredit(tx,member.id,'request-id-6','dns','a'.repeat(64),5)),{code:'OSINT_QUOTA'});
 assert.equal((await verifyAudit()).valid,true);
});
test('Grant management rejects non-owner actors, malformed credits and past or timezone-free expiry dates',async()=>{
 await assert.rejects(()=>osintGrant(member,member.id,100,new Date(Date.now()+86400000).toISOString()),{code:'FORBIDDEN'});
 for(const credits of [-1,0,1.1,'100',Number.MAX_SAFE_INTEGER+1])await assert.rejects(()=>osintGrant(owner,member.id,credits,new Date(Date.now()+86400000).toISOString()),{code:'INVALID_GRANT'});
 await assert.rejects(()=>osintGrant(owner,member.id,100,'2026-10-13T12:00:00'),{code:'INVALID_GRANT'});
 await assert.rejects(()=>osintGrant(owner,member.id,100,'2020-01-01T00:00:00Z'),{code:'INVALID_EXPIRY'});
});
test('Provider vault encrypts authenticated secrets and status endpoints return no secret values',async()=>{
 const secret='fixture-private-provider-key';await setOsintProviderKey(owner,'virustotal',secret);
 const row=(await pg.query<any>("SELECT key_cipher FROM osint_provider_keys WHERE provider='virustotal'")).rows[0];assert.ok(!row.key_cipher.includes(secret));assert.equal(openOsintSecret(row.key_cipher),secret);
 const status=await osintProviderStatus();assert.equal(status.find(p=>p.id==='virustotal')?.configured,true);assert.ok(!JSON.stringify(status).includes(secret));assert.equal(status.find(p=>p.id==='securitytrails')?.state,'KEY_REQUIRED');
 const sealed=sealOsintSecret({token:'test'}),b=Buffer.from(sealed,'base64');b[b.length-1]^=1;assert.throws(()=>openOsintSecret(b.toString('base64')));
});
test('DNS and CVE use actual alternative response data when the primary provider fails',async()=>{
 const dns=await dnsQuery('example.com','A');assert.equal(dns.provider,'google-dns');assert.equal(dns.records[0].data,'93.184.215.14');assert.equal(dns.ad,true);
 const cve=await lookupCve('CVE-2024-3094');assert.match(cve.summary,/MITRE/);assert.ok(cve.items.some(i=>i.value==='CVE fallback fixture'));assert.ok(cve.items.some(i=>i.value==='10'));
 const email=await emailConfiguration('example.com');assert.match(email.items.find(r=>r.name==='Yapılandırma gözlemleri')!.value,/\+all/);assert.match(email.items.find(r=>r.name==='Yapılandırma gözlemleri')!.value,/p=none/);
 const sub=await passiveSubdomains('example.com');assert.match(sub.items[0].value,/api.example.com/);assert.ok(!sub.items[0].value.includes('other.com'));
});
test('Public HTTP inspection rejects private, mapped, metadata and nonstandard-port targets before opening a socket',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.1','100.64.0.1','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1','2002:7f00:1::'])assert.equal(publicResearchIp(ip),false,ip);
 for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(publicResearchIp(ip),true,ip);
 for(const url of ['http://127.0.0.1','http://169.254.169.254/latest/meta-data','https://[::ffff:127.0.0.1]','https://example.com:8443','https://user:pass@example.com','file:///etc/passwd'])assert.throws(()=>researchUrl(url));
 await assert.rejects(()=>publicHead('https://127.0.0.1'),{code:'UNSAFE_URL'});
});
test('Header and combo reports distinguish incomplete observations from confirmed vulnerabilities or origin discovery',()=>{
 const headers=headersReport({url:'https://example.com',status:200,headers:{'content-type':'text/html',server:'cloudflare'}});assert.match(headers.items.find(r=>r.name==='Yapılandırma gözlemleri')!.value,/HSTS/);assert.match(headers.notice,/tek başına/);
 const combo=combineResearch('Fixture combo',[{name:'DNS',result:{status:'fulfilled',value:headers}},{name:'CT',result:{status:'rejected',reason:new Error('fixture')}}]);assert.match(combo.summary,/1\/2/);assert.match(combo.notice,/backend/);assert.ok(combo.items.some(i=>i.name==='CT / Sağlayıcı durumu'));assert.throws(()=>combineResearch('none',[{name:'DNS',result:{status:'rejected',reason:new Error()}}]),{code:'COMBO_UNAVAILABLE'});
 assert.equal(eventPreview('headers','https://user:pass@example.com/path?token=secret'),'https://example.com/path');assert.equal(eventPreview('mail-inbox','private content'),'[kişisel geçici e-posta]');
});
test('A user gets a real provider mailbox reused until expiry, encrypted credentials and text-only private inbox',async()=>{
 const first=await temporaryMailbox(owner.id),second=await temporaryMailbox(owner.id);assert.equal(first.items[0].value,second.items[0].value);assert.equal(accounts,1);
 const row=(await pg.query<any>('SELECT credentials_cipher FROM osint_mailboxes WHERE user_id=$1',[owner.id])).rows[0];assert.ok(!row.credentials_cipher.includes('private-fixture-mail-token'));assert.ok(!JSON.stringify(openOsintSecret(row.credentials_cipher)).includes('password'));
 const inbox=await temporaryInbox(owner.id);assert.match(inbox.items[1].value,/private fixture contents/);assert.ok(!JSON.stringify(inbox).includes('never execute'));assert.match(inbox.notice,/Mail.tm/);
 await assert.rejects(()=>temporaryInbox(member.id),{code:'MAILBOX_MISSING'});
 await pg.query("UPDATE osint_mailboxes SET expires_at=now()-interval '1 minute' WHERE user_id=$1",[owner.id]);await purgeExpiredMailboxes();assert.equal((await pg.query('SELECT * FROM osint_mailboxes')).rows.length,0);
});
test('A failed Mail.tm token exchange retains encrypted account credentials and retries the same account',async()=>{
 await pg.query("DELETE FROM rate_limits WHERE key='mailtm-upstream'");const original=globalThis.fetch;let tokenRequests=0;
 globalThis.fetch=async(input:any,init:any={})=>{if(String(input).endsWith('/token')&&++tokenRequests===1)return Response.json({},{status:503});return original(input,init);};
 const count=accounts;
 try{await assert.rejects(()=>temporaryMailbox(member.id),{code:'PROVIDER_UNAVAILABLE'});assert.equal(accounts,count+1);const pending=(await pg.query<any>('SELECT address,credentials_cipher FROM osint_mailboxes WHERE user_id=$1',[member.id])).rows[0];assert.ok(pending);assert.ok(openOsintSecret(pending.credentials_cipher).password);const result=await temporaryMailbox(member.id);assert.equal(result.items[0].value,pending.address);assert.equal(accounts,count+1);const ready=(await pg.query<any>('SELECT credentials_cipher FROM osint_mailboxes WHERE user_id=$1',[member.id])).rows[0];assert.ok(!openOsintSecret(ready.credentials_cipher).password);}
 finally{globalThis.fetch=original;}
});
test('Hash reputation uses the configured MalwareBazaar alternative without downloading or submitting a file',async()=>{
 await setOsintProviderKey(owner,'malwarebazaar','fixture-mb-key-1234');const r=await lookupMalwareHash('a'.repeat(64));assert.match(r.summary,/bulunamadı/);assert.match(r.notice,/indirilmez/);assert.ok(requests.includes('mb-api.abuse.ch/api/v1/'));
});
test('Owner directory and audit export use real stored fields, exclude secrets, and hash the exact downloadable JSON',async()=>{
 const state=await osintAdminState(owner.id,member.id);assert.equal(state.users.length,1);assert.equal(state.users[0].queries,6);assert.equal(state.users[0].level,0);
 assert.ok(!JSON.stringify(state).includes('fixture-private-provider-key'));assert.ok(!JSON.stringify(state).includes('private fixture contents'));assert.ok(!('credentials_cipher' in state.users[0]));
 const exported=JSON.parse(JSON.stringify(await osintAuditExport(owner.id,member.id)));const {sha256,hashEncoding,...document}=exported;assert.equal(sha256,createHash('sha256').update(canonical(document)).digest('hex'));assert.equal((await verifyAudit()).valid,true);
 await assert.rejects(()=>osintAdminState(member.id),{code:'FORBIDDEN'});
});
test('Local file metadata input is bounded and does not accept raw file content or false hash formats',()=>{
 const input={name:'fixture.pdf',size:100,mime:'application/pdf',sha256:'a'.repeat(64),magic:'255044462d',lastModified:0};assert.equal(validateOsint('metadata',JSON.stringify(input)).kind,'metadata');
 for(const patch of [{size:26*1024*1024},{sha256:'bad'},{magic:'not-hex'},{lastModified:-1}])assert.throws(()=>validateOsint('metadata',JSON.stringify({...input,...patch})));
});
test('Upstream Retry-After is respected and oversized streaming responses are cancelled',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'120'}});};await assert.rejects(()=>providerJson('fixture-rate','https://example.com'),{code:'PROVIDER_UNAVAILABLE'});await assert.rejects(()=>providerJson('fixture-rate','https://example.com'),{code:'PROVIDER_COOLDOWN'});assert.equal(calls,1);
 let cancelled=false;globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(100));},cancel(){cancelled=true;}}));await assert.rejects(()=>providerJson('fixture-size','https://example.com',20),{code:'PROVIDER_SIZE'});assert.equal(cancelled,true);
});
