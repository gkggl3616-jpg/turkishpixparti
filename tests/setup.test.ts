import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setTestDatabase,setServerSettings,config,saveServerSettings,loadServerSettings,detectConnection,effectiveChannelPermissions,verifyAudit,botInviteUrl} from '../packages/core/src/index';
process.env.DATABASE_URL='postgresql://test.invalid/test';process.env.APP_URL='https://turkishpix.example';
process.env.DISCORD_GUILD_ID='888888888888888888';process.env.DISCORD_BOT_TOKEN='test-token';process.env.DEMO_MODE='false';
process.env.AUDIT_HMAC_KEY='test-only-key-012345678901234567890123456789';
process.env.DISCORD_OWNER_IDS='111111111111111111,222222222222222222,333333333333333333,444444444444444444';
const owner={id:'111111111111111111',username:'owner'},citizen={id:'555555555555555555',username:'citizen'};
let pg:PGlite;const originalFetch=globalThis.fetch;
before(async()=>{pg=new PGlite();setTestDatabase({query:async(sql:string,params:any[]=[])=>{const r=await pg.query(sql,params);return{rows:r.rows as any[],rowCount:r.affectedRows||0};}});for(const v of ['001_initial','003_discord_roles','004_server_setup'])await pg.exec(await readFile(new URL('../packages/core/sql/'+v+'.sql',import.meta.url),'utf8'));});
after(async()=>{globalThis.fetch=originalFetch;setServerSettings({});await pg.close();});
test('Bot daveti yalnızca hedef sunucu kurulumunu seçer ve denetim kaydını okuyabilir',()=>{
 const url=new URL(botInviteUrl()),params=url.searchParams;
 assert.equal(url.origin,'https://discord.com');assert.equal(params.get('client_id'),config().clientId);
 assert.equal(params.get('integration_type'),'0');assert.equal(params.get('guild_id'),config().guildId);assert.equal(params.get('disable_guild_select'),'true');
 assert.deepEqual(params.get('scope')?.split(' '),['bot','applications.commands']);
 const permissions=BigInt(params.get('permissions')!);assert.equal(permissions&128n,128n);assert.equal(permissions&8n,0n);
 assert.equal(permissions&1099934297143n,1099934297143n);
});
test('Kanal izinleri everyone, birleşik roller, üye ve yönetici sırasıyla hesaplanır',()=>{
 const channel={permission_overwrites:[{id:'guild',type:0,deny:'2048',allow:'0'},{id:'a',type:0,deny:'1024',allow:'2048'},{id:'b',type:0,deny:'2048',allow:'1024'},{id:'member',type:1,deny:'2048',allow:'0'}]};
 const permissions=effectiveChannelPermissions(1024n|2048n,['a','b'],'member',channel,'guild');assert.equal(permissions&1024n,1024n);assert.equal(permissions&2048n,0n);
 assert.equal(effectiveChannelPermissions(8n,['a'],'member',channel,'guild')&2048n,2048n);
});
test('Sunucu ayarları owner gerektirir, aynı kanalı reddeder ve yeniden yüklenir',async()=>{
 const input={guildId:'888888888888888888',voteChannel:'999999999999999999',logChannel:'999999999999999998'};
 await assert.rejects(saveServerSettings(citizen,input),/owner/);
 await assert.rejects(saveServerSettings(owner,{...input,logChannel:input.voteChannel}),/farklı/);
 await saveServerSettings(owner,input);assert.equal(config().voteChannel,input.voteChannel);
 setServerSettings({});assert.notEqual(config().voteChannel,input.voteChannel);await loadServerSettings();assert.equal(config().voteChannel,input.voteChannel);assert.equal((await verifyAudit()).valid,true);
});
test('Geçerli bot sunucuya eklenmediyse erişim varmış gibi gösterilmez; secret dönmez',async()=>{
 const urls:string[]=[];globalThis.fetch=async(input:any)=>{const url=String(input);urls.push(url);if(url.endsWith('/applications/@me'))return Response.json({id:'1557484052133707896',redirect_uris:[],owner:{id:owner.id,username:owner.username}});if(url.endsWith('/users/@me'))return Response.json({id:'777777777777777777',username:'TurkishPix'});if(url.endsWith('/users/@me/guilds'))return Response.json([]);throw new Error('Unexpected request');};
 await assert.rejects(detectConnection(citizen),/owner/);const result=await detectConnection(owner);
 assert.equal(result.bot.authenticated,true);assert.equal(result.bot.installed,false);assert.equal(urls.length,3);assert.equal(result.application.redirectRegistered,false);assert.ok(!JSON.stringify(result).includes(process.env.DISCORD_BOT_TOKEN!));assert.ok(!JSON.stringify(result).includes(process.env.AUDIT_HMAC_KEY!));
});
