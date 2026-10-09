import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setTestDatabase,defaultCommunitySettings,communitySettings,communityOverview,saveCommunitySettings,MessageGuard,isGreeting,welcomeText,queueWelcome,communityDeliveryTick,setDMSubscription,createAnnouncement,cancelAnnouncement,saveAIProvider,aiProviderStatus,assistantAnswer,calculateMath,verifyAudit,communitySettingsSchema,buildChannelCatalog,voiceTransitionEvents,voiceMessage,queueVoiceNotifications,setVoiceDMPreference} from '../packages/core/src/index';
process.env.DATABASE_URL='postgresql://test.invalid/test';process.env.APP_URL='https://turkishpix.example';process.env.DISCORD_GUILD_ID='888888888888888888';process.env.DISCORD_BOT_TOKEN='test-bot-token';process.env.DEMO_MODE='false';process.env.AUDIT_HMAC_KEY='test-only-encryption-key-0123456789012345678901';process.env.DISCORD_OWNER_IDS='111111111111111111,222222222222222222,333333333333333333,444444444444444444';delete process.env.OPENAI_API_KEY;
const owner={id:'111111111111111111',username:'owner'},citizen={id:'555555555555555555',username:'citizen'},guildId='888888888888888888',channelId='999999999999999999';
let pg:PGlite;const originalFetch=globalThis.fetch;let sent:any[]=[];const voiceId='777777777777777777',otherVoiceId='666666666666666666',botId='123456789012345678';let dmRecipients:string[]=[];
before(async()=>{pg=new PGlite();setTestDatabase({query:async(sql:string,params:any[]=[])=>{const r=await pg.query(sql,params);return{rows:r.rows as any[],rowCount:r.affectedRows||0};}});for(const v of ['001_initial','003_discord_roles','004_server_setup','005_community','006_voice_presence','007_entertainment','008_chat_moderation','009_community_features','010_music_application_security','011_tickets_giveaways'])await pg.exec(await readFile(new URL('../packages/core/sql/'+v+'.sql',import.meta.url),'utf8'));globalThis.fetch=async(input:any,init:any)=>{const url=String(input);if(url.endsWith('/users/@me'))return Response.json({id:botId,username:'TurkishPix'});if(url.endsWith('/roles'))return Response.json([{id:guildId,permissions:'3072'}]);if(url.endsWith('/guilds/'+guildId+'/channels'))return Response.json([{id:channelId,name:'sohbet',type:0},{id:voiceId,name:'Ses odası',type:2},{id:otherVoiceId,name:'Meclis sesi',type:13}]);if(url.includes('/channels/')&&!url.endsWith('/messages'))return Response.json({id:channelId,guild_id:guildId,type:0});if(url.endsWith('/messages')){sent.push(JSON.parse(init.body));return Response.json({id:'123456789012345678'});}if(url.includes('/members/'))return Response.json({pending:false,roles:[]});if(url.endsWith('/users/@me/channels')){dmRecipients.push(JSON.parse(init.body).recipient_id);return Response.json({id:channelId});}throw Error('Unexpected request');};});
after(async()=>{globalThis.fetch=originalFetch;await pg.close();});
test('Güvenlik filtreleri yöneticileri ve muafları korur; spam ve yanıltıcı alan adlarını yakalar',()=>{
 const s=defaultCommunitySettings().security;s.enabled=true;s.blockLinks=true;const guard=new MessageGuard();const input={userId:citizen.id,channelId,content:'Merhaba',mentions:0,privileged:false,roles:[] as string[]};
 for(let i=0;i<s.maxMessages;i++)assert.equal(guard.evaluate(input,s,1000+i),null);assert.equal(guard.evaluate(input,s,1010),'SPAM');assert.equal(guard.evaluate(input,s,20000),null);
 assert.equal(guard.evaluate({...input,content:'https://youtube.com.evil.example'},s,30000),'EXTERNAL_LINK');assert.equal(guard.evaluate({...input,content:'https://www.youtube.com/video'},s,31000),null);
 assert.equal(guard.evaluate({...input,content:'discord.gg/abc'},s),'DISCORD_INVITE');assert.equal(guard.evaluate({...input,mentions:5},s),'MASS_MENTION');assert.equal(guard.evaluate({...input,mentions:20,privileged:true},s),null);
 s.ignoredRoleIds=['777777777777777777'];assert.equal(guard.evaluate({...input,mentions:20,roles:s.ignoredRoleIds},s),null);
});
test('Selam ve matematik girdileri sınırlıdır; kod çalıştırılmaz ve işlem sırası doğrudur',()=>{
 for(const s of ['sa','Selamünaleyküm!','selamun aleykum','merhaba','SELAM'])assert.equal(isGreeting(s),true,s);assert.equal(isGreeting('Mesajımı silme sa'),false);
 assert.equal(calculateMath('(12 + 8) × 3 kaç eder?'),60);assert.equal(calculateMath('hesapla: 2^3^2'),512);assert.equal(calculateMath('-2^2'),-4);assert.equal(calculateMath('2^-3'),0.125);assert.equal(calculateMath('1,5 + 2,5'),4);
 for(const s of ['process.exit()','1/0','2**3','('.repeat(40)+'2'+')'.repeat(40),'2^10000','merhaba'])assert.equal(calculateMath(s),null,s);
});
test('Ayarlar owner ve sunucu kanal doğrulaması gerektirir; provider anahtarı şifreli saklanır',async()=>{
 await assert.rejects(saveCommunitySettings(citizen,defaultCommunitySettings()),/owner/);
 const s=defaultCommunitySettings();s.welcome.enabled=true;s.welcome.channelId=channelId;s.ai.enabled=true;await saveCommunitySettings(owner,s);assert.equal((await communitySettings()).welcome.channelId,channelId);
 const key='sk-test-private-abcdefghijklmnopqrstuvwxyz';await assert.rejects(saveAIProvider(citizen,{apiKey:key}),/owner/);await saveAIProvider(owner,{apiKey:key,model:'gpt-4.1-mini'});
 const row=await pg.query('SELECT provider FROM community_secrets');assert.ok(!JSON.stringify(row.rows).includes(key));assert.equal((await aiProviderStatus()).configured,true);
 const panel=await communityOverview(owner);assert.ok(!JSON.stringify(panel).includes(key));assert.equal(panel.settings.ai.enabled,true);assert.equal((await verifyAudit()).valid,true);
});
test('Karşılama tekrar gönderilmez; yalnızca yeni üyeye etiket izni verilir',async()=>{
 const s=await communitySettings();s.welcome.message='Hoş geldin {user}! {username} · {server} · {count} @everyone';const member={id:citizen.id,username:'name@everyone',server:'guild@everyone',count:30,joinedAt:'2026-10-08T00:00:00Z'};
 assert.ok(welcomeText(s.welcome.message,member).includes('name＠everyone'));
 await queueWelcome(member,s);await queueWelcome(member,s);assert.equal((await pg.query('SELECT id FROM community_deliveries')).rows.length,1);await communityDeliveryTick();assert.deepEqual(sent.at(-1).allowed_mentions,{parse:[],users:[citizen.id]});assert.equal((await pg.query<{status:string}>('SELECT status FROM community_deliveries')).rows[0].status,'SENT');
});
test('DM sadece abonelere hazırlanır; abonelikten çıkış ve kampanya iptali bekleyen gönderimi keser',async()=>{
 await setDMSubscription(citizen,true);const campaign=await createAnnouncement(owner,{title:'Duyuru',content:'Topluluk etkinliği',delivery:'DM',confirmed:true});assert.equal(campaign.recipients,1);
 await setDMSubscription(citizen,false);const count=sent.length;await communityDeliveryTick();assert.equal(sent.length,count);assert.equal((await pg.query<{status:string}>('SELECT status FROM community_deliveries WHERE campaign_id=$1',[campaign.id])).rows[0].status,'CANCELLED');
 await pg.query("UPDATE announcement_campaigns SET created_at=now()-interval '20 minutes'");await assert.rejects(createAnnouncement(owner,{title:'Duyuru',content:'Yeniden',delivery:'DM',confirmed:true}),/üye yok/);
 await setDMSubscription(citizen,true);const next=await createAnnouncement(owner,{title:'İptal duyurusu',content:'Etkinlik',delivery:'DM',confirmed:true});await cancelAnnouncement(owner,next.id);await communityDeliveryTick();assert.equal(sent.length,count);
 await assert.rejects(createAnnouncement(owner,{title:'Duyuru',content:'Etkinlik',delivery:'DM',confirmed:false}));
});
test('Yapay zekâ yerel matematiği kullanır; dış API yanıtı ve anahtar gizliliği korunur',async()=>{
 const s=(await communitySettings()).ai;assert.equal((await assistantAnswer(citizen.id,'2+2',s)).source,'calculator');
 const previous=globalThis.fetch;try{globalThis.fetch=async(input:any,init:any)=>{assert.equal(String(input),'https://api.openai.com/v1/responses');const body=JSON.parse(init.body);assert.equal(body.store,false);assert.ok(!JSON.stringify(body).includes('sk-test-private'));return Response.json({output:[{content:[{type:'output_text',text:'Merhaba TurkishPix.'}]}]});};assert.equal((await assistantAnswer(owner.id,'Topluluk nedir?',s)).text,'Merhaba TurkishPix.');}finally{globalThis.fetch=previous;}
 s.enabled=false;await assert.rejects(assistantAnswer(owner.id,'2+2',s),/kapalı/);
});

test('Duyuru modülünü kapatmak kuyruktaki DM’leri gönderilmeden iptal eder',async()=>{
 await pg.query("UPDATE announcement_campaigns SET created_at=now()-interval '20 minutes'");
 const campaign=await createAnnouncement(owner,{title:'Kapatma testi',content:'Gönderilmemesi gereken mesaj',delivery:'DM',confirmed:true});
 const s=await communitySettings();s.announcements.enabled=false;await saveCommunitySettings(owner,s);const count=sent.length;await communityDeliveryTick();assert.equal(sent.length,count);assert.equal((await pg.query<{status:string}>('SELECT status FROM community_deliveries WHERE campaign_id=$1',[campaign.id])).rows[0].status,'CANCELLED');
});


test('Eski ayarlar ses ve aktivite varsayılanlarıyla açılır; geçersiz süre ve aktivite reddedilir',()=>{
 const old:any=defaultCommunitySettings();delete old.voice;delete old.presence;
 const restored=communitySettingsSchema.parse(old);assert.equal(restored.voice.enabled,false);assert.equal(restored.voice.cooldownSeconds,60);assert.equal(restored.presence.text,'TurkishPix • /botpanel');
 assert.equal(communitySettingsSchema.safeParse({...restored,voice:{...restored.voice,cooldownSeconds:0}}).success,false);
 assert.equal(communitySettingsSchema.safeParse({...restored,presence:{...restored.presence,activityType:'INVALID'}}).success,false);
});
test('Kanal listesi gizli kanalları çıkarır; kategori ve mesaj izinlerini korur',()=>{
 const roles=[{id:guildId,permissions:'3072'}],member={id:botId,roles:[]};
 const result=buildChannelCatalog([{id:'cat',type:4,name:'Topluluk'},{id:channelId,type:0,name:'sohbet',parent_id:'cat'},{id:voiceId,type:2,name:'Ses'},{id:'hidden',type:0,name:'Gizli',permission_overwrites:[{id:guildId,type:0,deny:'1024',allow:'0'}]},{id:'readonly',type:5,name:'Duyurular',permission_overwrites:[{id:botId,type:1,deny:'2048',allow:'0'}]}],roles,member,guildId);
 assert.ok(!result.some(ch=>ch.id==='hidden'));assert.equal(result.find(ch=>ch.id===channelId)?.category,'Topluluk');assert.equal(result.find(ch=>ch.id==='readonly')?.usable,false);assert.equal(result.find(ch=>ch.id===voiceId)?.type,2);
});
test('Ses olayları mikrofon değişikliğini yok sayar; kanal geçişini ve kanal filtresini ayırır',()=>{
 const s=defaultCommunitySettings().voice;s.enabled=true;
 assert.deepEqual(voiceTransitionEvents(voiceId,voiceId,s),[]);
 assert.deepEqual(voiceTransitionEvents(null,voiceId,s),[{event:'JOIN',channelId:voiceId}]);
 assert.deepEqual(voiceTransitionEvents(voiceId,null,s),[{event:'LEAVE',channelId:voiceId}]);
 assert.deepEqual(voiceTransitionEvents(voiceId,otherVoiceId,s),[{event:'LEAVE',channelId:voiceId},{event:'JOIN',channelId:otherVoiceId}]);
 s.channelIds=[voiceId];assert.deepEqual(voiceTransitionEvents(voiceId,otherVoiceId,s),[{event:'LEAVE',channelId:voiceId}]);
 s.leaveEnabled=false;assert.deepEqual(voiceTransitionEvents(voiceId,null,s),[]);
 assert.ok(voiceMessage('{username} {channel}',{username:'name@everyone',server:'TurkishPix'},'@everyone').includes('name＠everyone ＠everyone'));
});
const voiceMember={id:citizen.id,username:citizen.username,server:'TurkishPix',oldChannelId:null,newChannelId:voiceId,oldChannelName:'',newChannelName:'Ses odası',eventId:'voice-test-event'};
test('Ses DM kuyruğu tekrarları sınırlar, üyeye gönderir ve modül kapatılınca iptal eder',async()=>{
 const s=await communitySettings();s.voice.enabled=true;s.voice.channelIds=[voiceId];await saveCommunitySettings(owner,s);
 await queueVoiceNotifications(voiceMember,s);await queueVoiceNotifications({...voiceMember,eventId:'duplicate-event'},s);
 assert.equal((await pg.query("SELECT id FROM community_deliveries WHERE kind='VOICE_DM'")).rows.length,1);
 const count=sent.length;await communityDeliveryTick();assert.equal(sent.length,count+1);assert.equal(dmRecipients.at(-1),citizen.id);assert.deepEqual(sent.at(-1).allowed_mentions,{parse:[],users:[]});assert.ok(sent.at(-1).embeds[0].description.includes('Ses odası'));assert.ok(sent.at(-1).embeds[0].description.includes('/sesdmkapat'));
 await queueVoiceNotifications({...voiceMember,oldChannelId:voiceId,newChannelId:null,oldChannelName:'Ses odası',eventId:'leave-event'},s);
 s.voice.enabled=false;await saveCommunitySettings(owner,s);await communityDeliveryTick();assert.equal(sent.length,count+1);
 assert.equal((await pg.query<any>("SELECT status FROM community_deliveries WHERE kind='VOICE_DM' AND payload->>'event'='LEAVE'")).rows[0].status,'CANCELLED');
});
test('Ses DM kapatma kuyruktaki mesajı ve sonraki olayları durdurur; duyuru aboneliğine dokunmaz',async()=>{
 const s=await communitySettings();s.voice.enabled=true;s.voice.channelIds=[];await saveCommunitySettings(owner,s);
 await pg.query("UPDATE community_deliveries SET created_at=now()-interval '2 minutes' WHERE kind='VOICE_DM'");
 await queueVoiceNotifications({...voiceMember,eventId:'opt-out-pending'},s);await setVoiceDMPreference(citizen,false);
 const count=sent.length;await communityDeliveryTick();assert.equal(sent.length,count);
 const before=(await pg.query("SELECT id FROM community_deliveries WHERE kind='VOICE_DM'")).rows.length;
 await queueVoiceNotifications({...voiceMember,oldChannelId:voiceId,newChannelId:null,eventId:'disabled-event'},s);
 assert.equal((await pg.query("SELECT id FROM community_deliveries WHERE kind='VOICE_DM'")).rows.length,before);
 assert.equal((await pg.query<any>('SELECT active FROM dm_subscriptions WHERE user_id=$1',[citizen.id])).rows[0].active,true);
 await setVoiceDMPreference(citizen,true);assert.equal((await pg.query<any>('SELECT enabled FROM voice_dm_preferences WHERE user_id=$1',[citizen.id])).rows[0].enabled,true);
});
test('DM kapalı hatası ve hız sınırı kayda alınır; eski ses bildirimi gönderilmez',async()=>{
 const s=await communitySettings();const oldFetch=globalThis.fetch;
 await pg.query("UPDATE community_deliveries SET created_at=now()-interval '2 minutes' WHERE kind='VOICE_DM'");
 await queueVoiceNotifications({...voiceMember,eventId:'blocked-dm'},s);
 try{globalThis.fetch=async(input:any,init:any)=>String(input).endsWith('/messages')?new Response('',{status:403}):oldFetch(input,init);await communityDeliveryTick();assert.equal((await pg.query<any>("SELECT last_error FROM community_deliveries WHERE dedupe_key LIKE '%blocked-dm%'")).rows[0].last_error,'DISCORD_403');}finally{globalThis.fetch=oldFetch;}
 await pg.query("UPDATE community_deliveries SET created_at=now()-interval '2 minutes' WHERE kind='VOICE_DM'");await queueVoiceNotifications({...voiceMember,eventId:'rate-limited'},s);
 try{globalThis.fetch=async(input:any,init:any)=>String(input).endsWith('/messages')?Response.json({retry_after:10},{status:429}):oldFetch(input,init);await communityDeliveryTick();const row=(await pg.query<any>("SELECT status,last_error FROM community_deliveries WHERE dedupe_key LIKE '%rate-limited%'")).rows[0];assert.equal(row.status,'QUEUED');assert.equal(row.last_error,'DISCORD_RATE_LIMIT');}finally{globalThis.fetch=oldFetch;}
 await pg.query("UPDATE community_deliveries SET created_at=now()-interval '6 minutes',available_at=now() WHERE kind='VOICE_DM' AND status='QUEUED'");const count=sent.length;await communityDeliveryTick();assert.equal(sent.length,count);assert.equal((await pg.query<any>("SELECT last_error FROM community_deliveries WHERE dedupe_key LIKE '%rate-limited%'")).rows[0].last_error,'EXPIRED');
});
