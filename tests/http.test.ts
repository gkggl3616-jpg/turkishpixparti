import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {setTestDatabase,sha256,oauthStart,cookieValue,resetApplicationCache} from '../packages/core/src/index';
import {GET,POST} from '../apps/web/src/app/api/[...path]/route';
process.env.APP_URL='https://turkishpix.example';process.env.DATABASE_URL='postgresql://test.invalid/test';
process.env.AUDIT_HMAC_KEY='test-only-key-012345678901234567890123456789';
process.env.DISCORD_CLIENT_SECRET='test-oauth-secret';process.env.DISCORD_BOT_TOKEN='test-bot-token';
process.env.DISCORD_GUILD_ID='888888888888888888';process.env.DISCORD_VOTE_CHANNEL_ID='999999999999999999';process.env.DISCORD_LOG_CHANNEL_ID='999999999999999998';
process.env.DISCORD_OWNER_IDS='111111111111111111,222222222222222222,333333333333333333,444444444444444444';process.env.DEMO_MODE='false';
let pg:PGlite;const token='ab'.repeat(32),csrf='test-csrf';const user={id:'555555555555555555',username:'citizen',avatar:null};
const originalFetch=globalThis.fetch;let registeredRedirects=['https://turkishpix.example/api/auth/callback'];
before(async()=>{
 pg=new PGlite();setTestDatabase({query:async(sql:string,params:any[]=[])=>{const r=await pg.query(sql,params);return{rows:r.rows as any[],rowCount:r.affectedRows||0};}});
 await pg.exec(await readFile(new URL('../packages/core/sql/001_initial.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../packages/core/sql/003_discord_roles.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../packages/core/sql/004_server_setup.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../packages/core/sql/005_community.sql',import.meta.url),'utf8'));
 await pg.query('INSERT INTO users(id,username) VALUES($1,$2)',[user.id,user.username]);
 await pg.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sha256(token),user.id,csrf]);
 globalThis.fetch=async(input:any,init:any)=>{
  const u=String(input);if(u.endsWith('/applications/@me'))return Response.json({id:'1557484052133707896',redirect_uris:registeredRedirects,owner:{id:'111111111111111111',username:'owner'}});if(u.endsWith('/oauth2/token'))return Response.json({access_token:'test-access-token'});
  if(u.endsWith('/users/@me'))return Response.json(user);
  if(u.includes('/members/')||u.endsWith('/member'))return Response.json({user,pending:false,joined_at:'2020-01-01T00:00:00Z',roles:[]});
  throw new Error('Unexpected external request');
 };
});
after(async()=>{globalThis.fetch=originalFetch;await pg.close();});
const headers={cookie:'tp_session='+token,origin:'https://turkishpix.example','x-csrf-token':csrf,'Content-Type':'application/json'};
test('HTTP: anonim yazma ve owner kayıt erişimi engellenir',async()=>{
 const r=await POST(new Request('https://turkishpix.example/api/actions',{method:'POST',body:'{}'}));assert.equal(r.status,401);
 const denied=await GET(new Request('https://turkishpix.example/api/audit',{headers:{cookie:headers.cookie}}));assert.equal(denied.status,403);
});
test('HTTP: CSRF ile parti başvurusu gerçek PostgreSQL şemasına kaydedilir',async()=>{
 const data={action:'create',data:{kind:'PARTY',name:'API Test Partisi',abbreviation:'ATP',description:'Bu parti HTTP üzerinden test için kuruluyor.',goals:'Katılımcı ve şeffaf meclis hedefleniyor.',leaderUsername:'citizen',logo:'',color:'#dc3a45'}};
 const invalid=await POST(new Request('https://turkishpix.example/api/actions',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:JSON.stringify(data)}));assert.equal(invalid.status,403);
 const good=await POST(new Request('https://turkishpix.example/api/actions',{method:'POST',headers,body:JSON.stringify(data)}));assert.equal(good.status,200);assert.ok((await good.json()).id);
 const dashboard=await GET(new Request('https://turkishpix.example/api/overview',{headers:{cookie:headers.cookie}}));const body=await dashboard.json();assert.equal(body.items.length,1);assert.equal(body.me.username,'citizen');assert.equal(body.csrf,csrf);
});
test('OAuth2: state ve cookie eşleşir, callback yalnızca bir kez kullanılır',async()=>{
 const start=await oauthStart('/?view=basvurular');assert.equal(new URL(start.url).searchParams.get('scope'),'identify guilds.members.read');
 const invalid=await GET(new Request('https://turkishpix.example/api/auth/callback?state='+start.state+'&code=test',{headers:{cookie:'tp_oauth_state=wrong'}}));assert.ok(invalid.headers.get('location')?.includes('INVALID_STATE'));
 const callback=new Request('https://turkishpix.example/api/auth/callback?state='+start.state+'&code=test',{headers:{cookie:'tp_oauth_state='+start.state}});
 const success=await GET(callback);assert.equal(success.status,307);assert.ok(success.headers.get('location')?.endsWith('/?view=basvurular'));const cookies=success.headers.getSetCookie();assert.ok(cookies.some(c=>c.includes('tp_session=')&&c.includes('HttpOnly')&&c.includes('Secure')));
 const repeated=await GET(callback);assert.ok(repeated.headers.get('location')?.includes('STATE_EXPIRED'));
});
test('HTTP: çıkış kalıcı session kaydını siler',async()=>{
 const response=await POST(new Request('https://turkishpix.example/api/auth/logout',{method:'POST',headers}));assert.equal(response.status,200);
 const result=await GET(new Request('https://turkishpix.example/api/overview',{headers:{cookie:headers.cookie}}));assert.equal((await result.json()).me,null);
});

test('HTTP: health şemayı doğrular; açık kurulum bilgisi gizli anahtar içermez',async()=>{
 const health=await GET(new Request('https://turkishpix.example/api/health'));assert.equal(health.status,200);assert.equal((await health.json()).status,'ok');
 const response=await GET(new Request('https://turkishpix.example/api/config'));assert.equal(response.status,200);const body=await response.json();assert.equal(body.redirectUri,'https://turkishpix.example/api/auth/callback');
 for(const name of ['DISCORD_BOT_TOKEN','DISCORD_CLIENT_SECRET','AUDIT_HMAC_KEY'])assert.ok(!JSON.stringify(body).includes(process.env[name]!));
});

test('OAuth2: kayıtlı redirect yoksa Discord’a yönlendirme ve state oluşturma engellenir',async()=>{
 registeredRedirects=[];resetApplicationCache();
 try{
  const before=await pg.query('SELECT count(*)::int n FROM oauth_states');
  const response=await GET(new Request('https://turkishpix.example/api/auth/login'));
  assert.equal(response.status,307);assert.equal(response.headers.get('location'),'https://turkishpix.example/?view=owner&error=OAUTH_REDIRECT_NOT_REGISTERED');assert.equal(response.headers.get('set-cookie'),null);
  const after=await pg.query('SELECT count(*)::int n FROM oauth_states');assert.deepEqual(after.rows,before.rows);
  const config=await GET(new Request('https://turkishpix.example/api/config'));const body=await config.json();assert.equal(body.checks.oauth,false);assert.equal(body.application.redirectRegistered,false);
 }finally{registeredRedirects=['https://turkishpix.example/api/auth/callback'];resetApplicationCache();}
});
