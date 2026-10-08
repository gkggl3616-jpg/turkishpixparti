import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {audit} from './audit';
import {discordRequest,syncUser} from './discord';
import {aiProviderStatus} from './assistant';
import {listBotChannels} from './setup';
import {defaultEntertainmentSettings,entertainmentLeaderboard} from './entertainment';
import {entertainmentNames} from './entertainment-catalog';
import {contentModerationSchema,defaultContentModeration} from './moderation-policy';
import {moderationOverview} from './moderation-service';
type Actor={id:string;username:string;avatar?:string|null};
const channel=z.union([z.string().regex(/^\d{17,20}$/),z.literal('')]);
const ids=z.array(z.string().regex(/^\d{17,20}$/)).max(50);
export const voiceSettingsSchema=z.object({enabled:z.boolean(),joinEnabled:z.boolean(),leaveEnabled:z.boolean(),channelIds:ids,joinMessage:z.string().trim().min(1).max(1500),leaveMessage:z.string().trim().min(1).max(1500),cooldownSeconds:z.number().int().min(10).max(3600)});
export const presenceSettingsSchema=z.object({enabled:z.boolean(),status:z.enum(['online','idle','dnd']),activityType:z.enum(['PLAYING','LISTENING','WATCHING','COMPETING']),text:z.string().trim().min(1).max(128)});
export function defaultVoiceSettings(){return {enabled:false,joinEnabled:true,leaveEnabled:true,channelIds:[],joinMessage:'Merhaba {username}! 🔊 {server} sunucusunda {channel} ses kanalına katıldın. İyi sohbetler!',leaveMessage:'{username}, {channel} ses kanalından ayrıldın. 👋 {server} sohbetinde yine görüşürüz!',cooldownSeconds:60};}
export function defaultPresenceSettings(){return {enabled:true,status:'online' as const,activityType:'WATCHING' as const,text:'TurkishPix • /botpanel'};}
export const communitySettingsSchema=z.object({
 security:z.object({content:contentModerationSchema.default(defaultContentModeration),enabled:z.boolean(),antiSpam:z.boolean(),maxMessages:z.number().int().min(3).max(30),windowSeconds:z.number().int().min(3).max(60),maxMentions:z.number().int().min(2).max(30),blockInvites:z.boolean(),blockLinks:z.boolean(),allowedDomains:z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/)).max(40),ignoredChannelIds:ids,ignoredRoleIds:ids,timeoutMinutes:z.number().int().min(0).max(60),minAccountDays:z.number().int().min(0).max(365),raidJoinCount:z.number().int().min(3).max(100),raidWindowSeconds:z.number().int().min(5).max(300),logChannel:channel}),
 welcome:z.object({enabled:z.boolean(),channelId:channel,message:z.string().trim().min(1).max(1500),greetingsEnabled:z.boolean(),greetingChannelIds:ids,replies:z.array(z.string().trim().min(1).max(400)).min(1).max(12)}),
 ai:z.object({enabled:z.boolean(),channelIds:ids,personality:z.string().trim().max(1500),perMinute:z.number().int().min(1).max(10),dailyLimit:z.number().int().min(1).max(2000)}),
 announcements:z.object({enabled:z.boolean(),channelId:channel}),
 entertainment:z.object({enabled:z.boolean(),channelIds:ids,disabledCommands:z.array(z.enum(entertainmentNames as [string,...string[]])).max(30),cooldownSeconds:z.number().int().min(3).max(60)}).default(defaultEntertainmentSettings),
 voice:voiceSettingsSchema.default(defaultVoiceSettings),presence:presenceSettingsSchema.default(defaultPresenceSettings)
}).refine(s=>!s.welcome.enabled||!!s.welcome.channelId,{message:'Karşılama için bir kanal seçin.',path:['welcome','channelId']});
export type CommunitySettings=z.infer<typeof communitySettingsSchema>;
export function defaultCommunitySettings():CommunitySettings{return {
 security:{content:defaultContentModeration(),enabled:true,antiSpam:true,maxMessages:6,windowSeconds:8,maxMentions:5,blockInvites:true,blockLinks:false,allowedDomains:['discord.com','youtube.com','youtu.be'],ignoredChannelIds:[],ignoredRoleIds:[],timeoutMinutes:0,minAccountDays:3,raidJoinCount:8,raidWindowSeconds:30,logChannel:''},
 welcome:{enabled:false,channelId:'',message:'Hoş geldin {user}! 🏛️ {server} meclisinde yerin hazır. Seninle birlikte {count} kişiyiz. Kuralları okuyup sohbete katılabilirsin.',greetingsEnabled:true,greetingChannelIds:[],replies:['Aleykümselam, hoş geldin! 🏛️','Selam! Mecliste çaylar hazır, buyur. ☕','Hoş geldin! Bugün tarihe hangi notu düşüyoruz? 📜']},
 ai:{enabled:false,channelIds:[],personality:'Tarih ve topluluk sohbetlerine ilgili, sıcak ve saygılı ol. Matematik sorularında yöntemi kısaca açıkla.',perMinute:3,dailyLimit:200},announcements:{enabled:true,channelId:''},voice:defaultVoiceSettings(),presence:defaultPresenceSettings(),entertainment:defaultEntertainmentSettings()
};}
export async function communitySettings(){const row=(await database().query('SELECT settings FROM community_settings WHERE guild_id=$1',[config().guildId])).rows[0];return row?communitySettingsSchema.parse(row.settings):defaultCommunitySettings();}
function owner(actor:Actor){if(!config().owners.includes(actor.id))throw new DomainError('FORBIDDEN','Bu alan yalnızca owner hesaplarına açık.',403);if(config().demo)throw new DomainError('DEMO_READONLY','Önizlemede değişiklik kaydedilmez.',403);}
async function validateChannel(id:string){if(!id)return;const ch=await discordRequest('/channels/'+id);if(ch.guild_id!==config().guildId||![0,5].includes(ch.type))throw new DomainError('INVALID_CHANNEL','Seçilen kanal TurkishPix sunucusunda bir metin kanalı olmalı.');}
export async function saveCommunitySettings(actor:Actor,input:unknown){owner(actor);const settings=communitySettingsSchema.parse(input);
 const selected=new Set([settings.security.logChannel,settings.welcome.channelId,settings.announcements.channelId,...settings.ai.channelIds,...settings.entertainment.channelIds,...settings.welcome.greetingChannelIds,...settings.security.ignoredChannelIds,...settings.security.content.excludedChannelIds].filter(Boolean));
 for(const id of selected)await validateChannel(id);
 if(settings.voice.channelIds.length){const catalog=await listBotChannels();if(catalog.error)throw new DomainError('CHANNEL_LOOKUP_FAILED',catalog.error,503);for(const id of settings.voice.channelIds)if(!catalog.channels.some(ch=>ch.id===id&&[2,13].includes(ch.type)))throw new DomainError('INVALID_VOICE_CHANNEL','Botun gördüğü bir ses kanalı seçin.');}
 await transaction(async tx=>{await syncUser(tx,actor);await tx.query('INSERT INTO community_settings(guild_id,settings,updated_by) VALUES($1,$2,$3) ON CONFLICT(guild_id) DO UPDATE SET settings=EXCLUDED.settings,updated_by=EXCLUDED.updated_by,updated_at=now()',[config().guildId,settings,actor.id]);await audit(tx,actor.id,'COMMUNITY_SETTINGS_UPDATED',config().guildId,{settings});});
 return {message:'Bot modülleri kaydedildi. Değişiklikler birkaç saniye içinde uygulanır.'};
}
export async function setAIEnabled(actor:Actor,enabled:boolean){owner(actor);const settings=await communitySettings();settings.ai.enabled=enabled;return saveCommunitySettings(actor,settings);}
export async function setDMSubscription(actor:Actor,active:boolean){
 await transaction(async tx=>{await syncUser(tx,actor);await tx.query('INSERT INTO dm_subscriptions(guild_id,user_id,active) VALUES($1,$2,$3) ON CONFLICT(guild_id,user_id) DO UPDATE SET active=EXCLUDED.active,updated_at=now()',[config().guildId,actor.id,active]);await audit(tx,actor.id,active?'DM_SUBSCRIBED':'DM_UNSUBSCRIBED',actor.id);});
 return {message:active?'Duyuru DM’lerine katıldınız. /duyuruayril ile istediğiniz zaman ayrılabilirsiniz.':'DM duyurularından ayrıldınız. Bekleyen mesajlar da gönderilmeyecek.'};
}
const campaignSchema=z.object({title:z.string().trim().min(3).max(100),content:z.string().trim().min(1).max(1700),delivery:z.enum(['CHANNEL','DM']),confirmed:z.literal(true)});
export async function createAnnouncement(actor:Actor,input:unknown){owner(actor);const data=campaignSchema.parse(input),settings=await communitySettings();if(!settings.announcements.enabled)throw new DomainError('ANNOUNCEMENTS_DISABLED','Duyuru modülü kapalı.',403);
 const channelId=settings.announcements.channelId;if(data.delivery==='CHANNEL'){if(!channelId)throw new DomainError('CHANNEL_REQUIRED','Önce duyuru kanalını belirleyin.');await validateChannel(channelId);}
 const id=randomUUID();let recipients=0;
 await transaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(1557484056)');if((await tx.query("SELECT id FROM announcement_campaigns WHERE guild_id=$1 AND created_at>now()-interval '10 minutes' AND status<>'CANCELLED' LIMIT 1",[config().guildId])).rows.length)throw new DomainError('CAMPAIGN_COOLDOWN','Duyurular arasında en az 10 dakika bekleyin.',429);
  const subs=data.delivery==='DM'?(await tx.query('SELECT user_id FROM dm_subscriptions WHERE guild_id=$1 AND active=true',[config().guildId])).rows:[];if(data.delivery==='DM'&&!subs.length)throw new DomainError('NO_SUBSCRIBERS','Henüz DM duyurularına katılan üye yok. Üyeler /duyurukatıl komutunu kullanabilir.');
  await syncUser(tx,actor);await tx.query('INSERT INTO announcement_campaigns(id,guild_id,author_id,title,content,delivery,channel_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,config().guildId,actor.id,data.title,data.content,data.delivery,channelId||null]);
  const content='**'+data.title+'**\n'+data.content;
  for(const target of data.delivery==='DM'?subs:[{user_id:null}]){await tx.query('INSERT INTO community_deliveries(id,guild_id,campaign_id,kind,payload) VALUES($1,$2,$3,$4,$5)',[randomUUID(),config().guildId,id,data.delivery==='DM'?'DM':'ANNOUNCEMENT',{content:content+(data.delivery==='DM'?'\n\nDuyuruları kapatmak için sunucuda /duyuruayril kullanın.':''),channelId,userId:target.user_id}]);recipients++;}
  await audit(tx,actor.id,'ANNOUNCEMENT_CREATED',id,{delivery:data.delivery,recipients,title:data.title});
 });return {id,recipients,message:recipients+' gönderim sıraya alındı.'};
}
export async function cancelAnnouncement(actor:Actor,id:string){owner(actor);z.uuid().parse(id);await transaction(async tx=>{const found=await tx.query("UPDATE announcement_campaigns SET status='CANCELLED' WHERE id=$1 AND guild_id=$2 AND status='QUEUED' RETURNING id",[id,config().guildId]);if(!found.rows.length)throw new DomainError('CAMPAIGN_CLOSED','Bu duyuru artık iptal edilemiyor.');await tx.query("UPDATE community_deliveries SET status='CANCELLED',last_error='CAMPAIGN_CANCELLED' WHERE campaign_id=$1 AND status='QUEUED'",[id]);await syncUser(tx,actor);await audit(tx,actor.id,'ANNOUNCEMENT_CANCELLED',id);});return {message:'Bekleyen gönderimler iptal edildi. Başlamış veya gönderilmiş mesajlar geri alınmaz.'};}
export async function communityOverview(actor:Actor){owner(actor);const c=config();const [settings,heartbeat,events,campaigns,subscribers,usage,directory,voiceDeliveries]=await Promise.all([communitySettings(),database().query("SELECT status,updated_at FROM integration_status WHERE name='discord'"),database().query('SELECT * FROM security_events WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 50',[c.guildId]),database().query("SELECT c.*,jsonb_build_object('queued',count(d.id) FILTER(WHERE d.status IN ('QUEUED','SENDING')),'sent',count(d.id) FILTER(WHERE d.status='SENT'),'failed',count(d.id) FILTER(WHERE d.status='FAILED'),'cancelled',count(d.id) FILTER(WHERE d.status='CANCELLED')) AS totals FROM announcement_campaigns c LEFT JOIN community_deliveries d ON d.campaign_id=c.id WHERE c.guild_id=$1 GROUP BY c.id ORDER BY c.created_at DESC LIMIT 30",[c.guildId]),database().query('SELECT count(*)::int AS n FROM dm_subscriptions WHERE guild_id=$1 AND active=true',[c.guildId]),database().query("SELECT requests FROM ai_daily_usage WHERE guild_id=$1 AND day=(now() AT TIME ZONE 'Europe/Istanbul')::date",[c.guildId]),listBotChannels(),database().query("SELECT id,payload->>'userId' AS user_id,payload->>'event' AS event,payload->>'channelName' AS channel_name,status,last_error,created_at FROM community_deliveries WHERE guild_id=$1 AND kind='VOICE_DM' ORDER BY created_at DESC LIMIT 30",[c.guildId])]);
 return {settings,moderation:await moderationOverview(),entertainment:{leaderboard:await entertainmentLeaderboard()},channels:directory.channels,channelError:directory.error,voiceDeliveries:voiceDeliveries.rows,heartbeat:heartbeat.rows[0]||null,events:events.rows,campaigns:campaigns.rows,subscribers:subscribers.rows[0].n,ai:{...await aiProviderStatus(),used:usage.rows[0]?.requests||0},botInviteUrl:'https://discord.com/oauth2/authorize?'+new URLSearchParams({client_id:c.clientId,scope:'bot applications.commands',permissions:'1099780156448',guild_id:c.guildId,disable_guild_select:'true'}).toString()};
}
export async function setVoiceDMPreference(actor:Actor,enabled:boolean){await transaction(async tx=>{await syncUser(tx,actor);await tx.query('INSERT INTO voice_dm_preferences(guild_id,user_id,enabled) VALUES($1,$2,$3) ON CONFLICT(guild_id,user_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()',[config().guildId,actor.id,enabled]);await audit(tx,actor.id,enabled?'VOICE_DM_ENABLED':'VOICE_DM_DISABLED',actor.id);});return {message:enabled?'Ses giriş/çıkış DM bildirimlerin açıldı. Sunucunun ses DM modülü de açık olmalı.':'Ses giriş/çıkış DM bildirimlerin kapatıldı. Bekleyen bildirimler de gönderilmeyecek.'};}
export function voiceTransitionEvents(oldId:string|null,newId:string|null,settings:CommunitySettings['voice']){
 if(!settings.enabled||oldId===newId)return [];
 const allowed=(id:string)=>!settings.channelIds.length||settings.channelIds.includes(id);
 const result:Array<{event:'JOIN'|'LEAVE';channelId:string}>=[];
 if(oldId&&settings.leaveEnabled&&allowed(oldId))result.push({event:'LEAVE',channelId:oldId});
 if(newId&&settings.joinEnabled&&allowed(newId))result.push({event:'JOIN',channelId:newId});
 return result;
}
export function voiceMessage(template:string,member:{username:string;server:string},channelName:string){
 const values:Record<string,string>={user:member.username,username:member.username,server:member.server,channel:channelName};
 return template.replace(/\{(user|username|server|channel)\}/g,(_,key)=>values[key].replace(/@/g,'＠')).slice(0,1800)+'\n\nBildirimleri kapat: /sesdmkapat';
}
export async function queueVoiceNotifications(member:{id:string;username:string;server:string;oldChannelId:string|null;newChannelId:string|null;oldChannelName:string;newChannelName:string;eventId:string},settings:CommunitySettings){
 const events=voiceTransitionEvents(member.oldChannelId,member.newChannelId,settings.voice);if(!events.length)return;
 const guildId=config().guildId;
 await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['voice:'+guildId+':'+member.id]);
  if((await tx.query('SELECT enabled FROM voice_dm_preferences WHERE guild_id=$1 AND user_id=$2',[guildId,member.id])).rows[0]?.enabled===false)return;
  for(const event of events){
   if((await tx.query("SELECT id FROM community_deliveries WHERE guild_id=$1 AND kind='VOICE_DM' AND payload->>'userId'=$2 AND payload->>'event'=$3 AND created_at>now()-$4*interval '1 second' LIMIT 1",[guildId,member.id,event.event,settings.voice.cooldownSeconds])).rows.length)continue;
   const channelName=event.event==='JOIN'?member.newChannelName:member.oldChannelName;
   await tx.query("INSERT INTO community_deliveries(id,guild_id,kind,payload,dedupe_key) VALUES($1,$2,'VOICE_DM',$3,$4) ON CONFLICT(dedupe_key) DO NOTHING",[randomUUID(),guildId,{userId:member.id,event:event.event,channelId:event.channelId,channelName,content:voiceMessage(event.event==='JOIN'?settings.voice.joinMessage:settings.voice.leaveMessage,member,channelName)},'voice:'+guildId+':'+member.eventId+':'+event.event]);
  }
 });
}
export function welcomeText(template:string,member:{id:string;username:string;server:string;count:number}){return template.replace(/\{(user|username|server|count)\}/g,(_,key)=>(({user:'<@'+member.id+'>',username:member.username.replace(/@/g,'＠'),server:member.server.replace(/@/g,'＠'),count:String(member.count)} as Record<string,string>)[key]!)).slice(0,1900);}
export function isGreeting(text:string){const value=text.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr-TR').replace(/[!?.،,]/g,'').trim().replace(/\s+/g,' ');return /^(sa|s a|selam|merhaba|selamunaleykum|selamun aleykum|selamünaleyküm|selamün aleyküm)$/.test(value);}
export class MessageGuard{
 private messages=new Map<string,number[]>();
 evaluate(input:{userId:string;channelId:string;content:string;mentions:number;privileged:boolean;roles:string[]},settings:CommunitySettings['security'],now=Date.now()):string|null{
  if(!settings.enabled||input.privileged||settings.ignoredChannelIds.includes(input.channelId)||input.roles.some(id=>settings.ignoredRoleIds.includes(id)))return null;
  if(input.mentions>=settings.maxMentions)return 'MASS_MENTION';
  if(settings.blockInvites&&/(?:discord(?:app)?\.com\/invite|discord\.gg)\/[a-z0-9-]+/i.test(input.content))return 'DISCORD_INVITE';
  if(settings.blockLinks){const urls=input.content.match(/(?:https?:\/\/|www\.)[^\s<>]+/gi)||[];for(const text of urls){try{const host=new URL(text.startsWith('www.')?'https://'+text:text).hostname.toLowerCase();if(!settings.allowedDomains.some(d=>host===d||host.endsWith('.'+d)))return 'EXTERNAL_LINK';}catch{return 'EXTERNAL_LINK';}}}
  if(settings.antiSpam){const key=input.channelId+':'+input.userId;const times=(this.messages.get(key)||[]).filter(t=>now-t<=settings.windowSeconds*1000);times.push(now);this.messages.set(key,times);if(this.messages.size>4096){for(const [key,list] of this.messages)if(now-list.at(-1)!>60000)this.messages.delete(key);if(this.messages.size>4096)this.messages.delete(this.messages.keys().next().value!);}if(times.length>settings.maxMessages)return 'SPAM';}
  return null;
 }
}
export async function queueWelcome(member:{id:string;username:string;server:string;count:number;joinedAt:string},settings:CommunitySettings){if(!settings.welcome.enabled||!settings.welcome.channelId)return;await database().query("INSERT INTO community_deliveries(id,guild_id,kind,payload,dedupe_key) VALUES($1,$2,'WELCOME',$3,$4) ON CONFLICT(dedupe_key) DO NOTHING",[randomUUID(),config().guildId,{channelId:settings.welcome.channelId,content:welcomeText(settings.welcome.message,member),mentionUser:member.id},'welcome:'+config().guildId+':'+member.id+':'+member.joinedAt]);}
export async function recordSecurity(actor:Actor,channelId:string|null,reason:string,action:string,settings:CommunitySettings){const id=randomUUID();await transaction(async tx=>{await syncUser(tx,actor);await tx.query('INSERT INTO security_events(id,guild_id,user_id,channel_id,reason,action) VALUES($1,$2,$3,$4,$5,$6)',[id,config().guildId,actor.id,channelId,reason,action]);await audit(tx,actor.id,'SECURITY_EVENT',id,{reason,action,channelId});const channel=settings.security.logChannel||config().logChannel;if(channel)await tx.query("INSERT INTO community_deliveries(id,guild_id,kind,payload) VALUES($1,$2,'SECURITY_LOG',$3)",[randomUUID(),config().guildId,{channelId:channel,content:'🛡️ **TurkishPix güvenlik**\nKullanıcı: '+actor.id+'\nKural: '+reason+'\nİşlem: '+action+(channelId?'\nKanal: '+channelId:'')}]);});}
async function deliveryRequest(path:string,body?:any){const r=await fetch('https://discord.com/api/v10'+path,{method:body?'POST':'GET',headers:{Authorization:'Bot '+config().botToken,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});if(r.status===429){const d=await r.json();throw Object.assign(Error('DISCORD_RATE_LIMIT'),{retry:Math.max(1,Math.min(600,Number(d.retry_after)||5))});}if(!r.ok)throw Error('DISCORD_'+r.status);return r.json();}
export async function communityDeliveryTick(){
 const c=config();await database().query("UPDATE announcement_campaigns c SET status='COMPLETED' WHERE guild_id=$1 AND status='QUEUED' AND NOT EXISTS(SELECT 1 FROM community_deliveries WHERE campaign_id=c.id AND status IN ('QUEUED','SENDING'))",[c.guildId]);await database().query("UPDATE community_deliveries SET status='FAILED',last_error='DELIVERY_UNCERTAIN' WHERE guild_id=$1 AND status='SENDING' AND locked_at<now()-interval '2 minutes'",[c.guildId]);
 const row=await transaction(async tx=>(await tx.query("UPDATE community_deliveries SET status='SENDING',locked_at=now(),attempts=attempts+1 WHERE id=(SELECT id FROM community_deliveries WHERE guild_id=$1 AND status='QUEUED' AND available_at<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",[c.guildId])).rows[0]);if(!row)return;
 const p=row.payload;
 try{
  const moduleSettings=await communitySettings();if((['DM','ANNOUNCEMENT'].includes(row.kind)&&!moduleSettings.announcements.enabled)||(row.kind==='WELCOME'&&!moduleSettings.welcome.enabled))throw Error('MODULE_DISABLED');
  if(row.kind==='VOICE_DM'){
   if(!moduleSettings.voice.enabled||(p.event==='JOIN'?!moduleSettings.voice.joinEnabled:!moduleSettings.voice.leaveEnabled)||(moduleSettings.voice.channelIds.length&&!moduleSettings.voice.channelIds.includes(p.channelId)))throw Error('MODULE_DISABLED');
   if((await database().query('SELECT enabled FROM voice_dm_preferences WHERE guild_id=$1 AND user_id=$2',[c.guildId,p.userId])).rows[0]?.enabled===false)throw Error('UNSUBSCRIBED');
   if(Date.now()-new Date(row.created_at).getTime()>300000)throw Error('EXPIRED');
  }
  if(row.campaign_id){const campaign=(await database().query('SELECT status FROM announcement_campaigns WHERE id=$1',[row.campaign_id])).rows[0];if(campaign?.status==='CANCELLED')throw Error('CANCELLED');}
  let channelId=p.channelId;
  if(row.kind==='DM'||row.kind==='VOICE_DM'){if(row.kind==='DM'){const active=(await database().query('SELECT active FROM dm_subscriptions WHERE guild_id=$1 AND user_id=$2',[c.guildId,p.userId])).rows[0]?.active;if(!active)throw Error('UNSUBSCRIBED');}const member=await deliveryRequest(`/guilds/${c.guildId}/members/${p.userId}`);if(member.pending)throw Error('MEMBERSHIP_PENDING');channelId=(await deliveryRequest('/users/@me/channels',{recipient_id:p.userId})).id;}
  else{const channel=await deliveryRequest('/channels/'+channelId);if(channel.guild_id!==c.guildId||![0,5].includes(channel.type))throw Error('INVALID_CHANNEL');}
  const nonce=BigInt('0x'+row.id.replace(/-/g,'').slice(0,16)).toString();
  const message=await deliveryRequest('/channels/'+channelId+'/messages',{content:p.content,allowed_mentions:{parse:[],users:p.mentionUser?[p.mentionUser]:[]},nonce,enforce_nonce:true});
  await database().query("UPDATE community_deliveries SET status='SENT',message_id=$2,sent_at=now(),last_error=NULL WHERE id=$1",[row.id,message.id]);
 }catch(e){const err=e as any;const retry=Number(err.retry);if(retry&&row.attempts<5)await database().query("UPDATE community_deliveries SET status='QUEUED',available_at=now()+$2*interval '1 second',last_error=$3 WHERE id=$1",[row.id,retry,'DISCORD_RATE_LIMIT']);else await database().query('UPDATE community_deliveries SET status=$2,last_error=$3 WHERE id=$1',[row.id,['CANCELLED','UNSUBSCRIBED','MODULE_DISABLED','EXPIRED'].includes(err.message)?'CANCELLED':'FAILED',/^([A-Z_]+|DISCORD_\d+)$/.test(err.message)?err.message:'DELIVERY_UNCERTAIN']);}
 if(row.campaign_id)await database().query("UPDATE announcement_campaigns SET status='COMPLETED' WHERE id=$1 AND status='QUEUED' AND NOT EXISTS(SELECT 1 FROM community_deliveries WHERE campaign_id=$1 AND status IN ('QUEUED','SENDING'))",[row.campaign_id]);
}
