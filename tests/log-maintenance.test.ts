import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setTestDatabase,config,legacySecurityEmbed,repairLegacySecurityLogs,communityDeliveryTick} from '../packages/core/src/index';

const guild='888888888888888888',bot='123456789012345678',channel='999999999999999999',member='555555555555555555';
process.env.DATABASE_URL='postgresql://test.invalid/test';process.env.DISCORD_GUILD_ID=guild;process.env.DISCORD_BOT_TOKEN='test-only';process.env.APP_URL='https://turkishpix.example';process.env.DEMO_MODE='false';
let pg:PGlite;const original=globalThis.fetch;
const legacy='🛡️ **TurkishPix sohbet koruması**\nKural: Genel küfür\nÜye: '+member+'\nKanal: '+channel+'\nİşlem: NATIVE_BLOCKED + TIMEOUT\nKaynak: Discord AutoMod\nSon ihlal sayısı: 3\nKayıt: 01234567-abcd-1234';
before(async()=>{pg=new PGlite();setTestDatabase({query:async(sql:string,params:any[]=[])=>{const r=await pg.query(sql,params);return {rows:r.rows as any[],rowCount:r.affectedRows||0};}});for(const version of ['001_initial','003_discord_roles','004_server_setup','005_community','006_voice_presence','007_entertainment','008_chat_moderation','009_community_features'])await pg.exec(await readFile(new URL('../packages/core/sql/'+version+'.sql',import.meta.url),'utf8'));});
beforeEach(async()=>{globalThis.fetch=original;await pg.exec('DELETE FROM integration_status;DELETE FROM community_deliveries;');});
after(async()=>{globalThis.fetch=original;await pg.close();});

test('Eski iki log biçimi etiketli karta dönüşür, sıradan veya bozuk mesajlar değişmez',()=>{
 const embed=legacySecurityEmbed(legacy,config().appUrl)!;
 assert.equal(embed.fields.find((f:any)=>f.name==='👤 Üye').value,'<@'+member+'>');
 assert.equal(embed.fields.find((f:any)=>f.name==='💬 Kanal').value,'<#'+channel+'>');
 assert.ok(!JSON.stringify(embed).includes('NATIVE_BLOCKED'));
 const general=legacySecurityEmbed('🛡️ **TurkishPix güvenlik**\nKullanıcı: '+member+'\nKural: NEW_ACCOUNT\nİşlem: ALERT_ONLY',config().appUrl)!;
 assert.ok(JSON.stringify(general).includes('Yeni hesap'));
 for(const input of ['Üye: '+member,legacy.replace(member,'bozuk-id'),legacy.replace('TurkishPix','BaşkaBot')])assert.equal(legacySecurityEmbed(input,config().appUrl),null);
});

test('Geçmiş onarımı yalnızca kendi bot mesajlarını düzenler, etiketler bildirim göndermez ve bir kere çalışır',async()=>{
 const timestamp='2026-10-08T16:00:00.000Z';let reads=0;const patches:any[]=[];
 const messages=[{id:'1',author:{id:bot},content:legacy,timestamp},{id:'2',author:{id:member},content:legacy,timestamp},{id:'3',author:{id:bot},content:'',embeds:[{description:legacy}],timestamp},{id:'4',author:{id:bot},content:'Başka mesaj',timestamp}];
 globalThis.fetch=async(input:any,init:any)=>{const url=String(input);if(url.endsWith('/messages?limit=100')){reads++;return Response.json(messages);}if(init.method==='PATCH'){patches.push({url,body:JSON.parse(init.body)});return Response.json({id:'1'});}return Response.json({guild_id:guild});};
 assert.equal((await repairLegacySecurityLogs(bot,[channel,channel])).repaired,2);
 assert.equal(patches.length,2);assert.ok(patches.every(p=>p.body.content===null&&p.body.embeds[0].timestamp===timestamp&&p.body.allowed_mentions.parse.length===0));
 assert.ok(!patches.some(p=>p.url.endsWith('/2')));
 assert.equal((await repairLegacySecurityLogs(bot,[channel])).repaired,0);assert.equal(reads,1);
});

test('Onarım başarısız olursa tamamlandı işareti yazılmaz; yabancı sunucu kanalları onarılmaz',async()=>{
 globalThis.fetch=async()=>Response.json({guild_id:'777777777777777777'});
 assert.equal((await repairLegacySecurityLogs(bot,[channel])).repaired,0);
 assert.equal((await pg.query('SELECT name FROM integration_status')).rows.length,0);
 globalThis.fetch=async(input:any,init:any)=>{if(init.method==='PATCH')return Response.json({}, {status:403});if(String(input).endsWith('/messages?limit=100'))return Response.json([{id:'1',author:{id:bot},content:legacy}]);return Response.json({guild_id:guild});};
 await assert.rejects(repairLegacySecurityLogs(bot,[channel]));assert.equal((await pg.query('SELECT name FROM integration_status')).rows.length,0);
});

test('Yeniden başlatma öncesinden kalmış log kuyruğu yeni etiket biçimiyle gönderilir',async()=>{
 await pg.query("INSERT INTO community_deliveries(id,guild_id,kind,payload) VALUES(gen_random_uuid(),$1,'SECURITY_LOG',$2)",[guild,{channelId:channel,content:legacy}]);
 let sent:any;globalThis.fetch=async(input:any,init:any)=>{if(init.method==='POST'){sent=JSON.parse(init.body);return Response.json({id:'123456789012345679'});}return Response.json({guild_id:guild,type:0});};
 await communityDeliveryTick();assert.equal(sent.embeds[0].fields.find((f:any)=>f.name==='👤 Üye').value,'<@'+member+'>');assert.deepEqual(sent.allowed_mentions,{parse:[],users:[]});
 assert.equal((await pg.query<any>('SELECT status FROM community_deliveries')).rows[0].status,'SENT');
});

test('Geçmiş okuma izni olmadan gönderim kaydındaki kendi logu onarılır; silinmiş mesaj atlanır',async()=>{
 await pg.query("INSERT INTO community_deliveries(id,guild_id,kind,payload,status,message_id,sent_at) VALUES(gen_random_uuid(),$1,'SECURITY_LOG',$2,'SENT','123456789012345678',now()),(gen_random_uuid(),$1,'SECURITY_LOG',$2,'SENT','123456789012345679',now())",[guild,{channelId:channel,content:legacy}]);
 let historyReads=0,patches=0;globalThis.fetch=async(input:any,init:any)=>{const url=String(input);if(url.includes('?limit=')){historyReads++;return Response.json({}, {status:403});}if(init.method==='PATCH'){patches++;return url.endsWith('679')?Response.json({}, {status:404}):Response.json({id:'123456789012345678'});}return Response.json({guild_id:guild});};
 assert.equal((await repairLegacySecurityLogs(bot,[channel])).repaired,1);assert.equal(historyReads,0);assert.equal(patches,2);assert.equal((await pg.query('SELECT name FROM integration_status')).rows.length,1);
});

test('Discord hız sınırında beklenir; yarıda kesilen onarım tamamlanmış mesajı tekrar düzenlemez',async()=>{
 await pg.query("INSERT INTO community_deliveries(id,guild_id,kind,payload,status,message_id,sent_at) VALUES(gen_random_uuid(),$1,'SECURITY_LOG',$2,'SENT','123456789012345678',now()),(gen_random_uuid(),$1,'SECURITY_LOG',$2,'SENT','123456789012345679',now())",[guild,{channelId:channel,content:legacy}]);
 const calls:string[]=[],waits:number[]=[];let limited=true;
 globalThis.fetch=async(input:any,init:any)=>{if(init.method!=='PATCH')return Response.json({guild_id:guild});const url=String(input);calls.push(url);if(calls.length>1&&limited)return Response.json({retry_after:2.5},{status:429});return Response.json({id:'ok'});};
 const pause=async(ms:number)=>{waits.push(ms);};
 await assert.rejects(repairLegacySecurityLogs(bot,[channel],pause),(e:any)=>e.code==='LOG_REPAIR_RATE_LIMIT');
 assert.equal((await pg.query("SELECT id FROM community_deliveries WHERE payload->>'logPresentationVersion'='bright-v1'")).rows.length,1);
 assert.equal((await pg.query('SELECT name FROM integration_status')).rows.length,0);
 assert.equal(waits.filter(ms=>ms===2500).length,5);
 limited=false;assert.equal((await repairLegacySecurityLogs(bot,[channel],pause)).repaired,1);
 assert.equal(calls.filter(url=>url===calls[0]).length,1);
 assert.equal((await pg.query('SELECT name FROM integration_status')).rows.length,1);
});
