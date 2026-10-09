import {randomUUID} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction,type DB} from './db';
import {audit,sha256} from './audit';
import {discordAuditSettingsSchema,defaultDiscordAuditSettings,auditCategory,auditKindLabels,captureAuditMessage,type DiscordAuditSettings,type AuditCategory} from './discord-audit-policy';
import {discordCard,uiText,uiRow,uiButton,messageQuote} from './discord-ui';
import {userTag,roleTag,channelTag,displayText,theme} from './presentation';
export type DiscordAuditEvent={id?:string;key:string;kind:string;actorId?:string|null;actorName?:string|null;targetId?:string|null;channelId?:string|null;messageId?:string|null;before?:string|null;after?:string|null;metadata?:Record<string,any>};
export type AuditManager={id:string;username:string;manageGuild:boolean;guardManager:boolean};
export async function discordAuditSettings():Promise<DiscordAuditSettings>{const row=(await database().query('SELECT settings FROM discord_audit_settings WHERE guild_id=$1',[config().guildId])).rows[0];return row?discordAuditSettingsSchema.parse(row.settings):defaultDiscordAuditSettings();}
export function auditEventCard(event:DiscordAuditEvent,createdAt:Date|string=new Date()){
 const title=auditKindLabels[event.kind]||displayText(event.kind,80),date=Math.floor(new Date(createdAt).getTime()/1000),body:any[]=[];
 const actorLabel=event.kind.startsWith('MESSAGE_')||event.kind==='BLOCKED_MESSAGE'?'Mesaj sahibi':'İşlemi yapan';const target=event.targetId?(event.kind.startsWith('ROLE_')?roleTag(event.targetId):event.kind.startsWith('CHANNEL_')?channelTag(event.targetId):event.kind==='GUILD_UPDATE'?displayText(event.targetId):userTag(event.targetId)):'';
 body.push(uiText('**👤 '+actorLabel+'** '+(event.actorId?userTag(event.actorId,event.actorName||'Üye'):'Bilgi Discord tarafından verilmedi.')+(target?'\n**🎯 Hedef** '+target:'')+(event.channelId?'\n**💬 Kanal** '+channelTag(event.channelId):'')+'\n**🕒 Zaman** <t:'+date+':F>'));
 if(event.before!==undefined)body.push(uiText('**Önceki içerik**\n'+messageQuote(event.before)));
 if(event.after!==undefined)body.push(uiText((event.kind==='BLOCKED_MESSAGE'?'**Engellenen içerik**':'**İçerik**')+'\n'+messageQuote(event.after)));
 const m=event.metadata||{};
 if(m.reason||m.action||m.details)body.push(uiText([m.reason&&'**Gerekçe / kural** '+displayText(String(m.reason),280),m.action&&'**Sonuç** '+displayText(String(m.action),160),m.details&&'**Ayrıntı** '+displayText(String(m.details),400)].filter(Boolean).join('\n')));
 if(m.attachments?.length)body.push(uiText('**📎 Dosyalar**\n'+m.attachments.slice(0,4).map((a:any)=>displayText(a.name||'Dosya',100)).join(' · ')));
 if(event.id){const row=[uiButton('audit:detail:'+event.id,'Ayrıntılar',2)];if(event.channelId&&event.messageId&&/^\d{17,20}$/.test(event.messageId))row.push({type:2,style:5,label:'Mesaja git',url:`https://discord.com/channels/${config().guildId}/${event.channelId}/${event.messageId}`} as any);body.push(uiRow(...row));}
 body.push(uiText('-# TurkishPix • Denetim Merkezi'+(event.id?' • '+event.id.slice(0,8):'')));
 return discordCard(title,'Sunucu işlem kaydı',body,event.kind==='BLOCKED_MESSAGE'||event.kind==='BOT_BLOCK_FAILED'?theme.red:event.kind==='MESSAGE_EDIT'?theme.gold:theme.cyan);
}
async function writeEvent(tx:DB,s:DiscordAuditSettings,event:DiscordAuditEvent,fallbackChannelId=config().logChannel){
 const category=auditCategory(event.kind);
 if(!s.enabled||!s.categories[category]||event.channelId&&s.ignoredChannelIds.includes(event.channelId))return null;
 if(event.kind==='MESSAGE_CREATE'&&!s.messageCreate||event.kind==='MESSAGE_EDIT'&&!s.messageEdit||event.kind==='MESSAGE_DELETE'&&!s.messageDelete)return null;
 const id=randomUUID(),metadata=event.metadata||{};
 const result=await tx.query('INSERT INTO discord_audit_events(id,guild_id,event_key,kind,actor_id,actor_name,target_id,channel_id,message_id,before_content,after_content,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(guild_id,event_key) DO NOTHING RETURNING id',[id,config().guildId,event.key.slice(0,300),event.kind,event.actorId||null,event.actorName?.slice(0,100)||null,event.targetId||null,event.channelId||null,event.messageId||null,event.before?.slice(0,4000)??null,event.after?.slice(0,4000)??null,metadata]);
 if(!result.rows.length)return null;
 const channelId=s.channels[category]||s.logChannelId||fallbackChannelId;
 if(channelId){const card=auditEventCard({...event,id});await tx.query("INSERT INTO community_deliveries(id,guild_id,kind,payload,dedupe_key) VALUES($1,$2,'SECURITY_LOG',$3,$4) ON CONFLICT(dedupe_key) DO NOTHING",[randomUUID(),config().guildId,{channelId,auditEventId:id,flags:card.flags,components:card.components},'discord-audit:'+id]);}
 return id;
}
export async function recordDiscordAudit(event:DiscordAuditEvent,fallbackChannelId=config().logChannel){const s=await discordAuditSettings();return transaction(tx=>writeEvent(tx,s,event,fallbackChannelId));}
export async function updateDiscordAuditSettings(actor:AuditManager,patch:Partial<DiscordAuditSettings>,expectedRevision?:number){
 if(!actor.manageGuild)throw new DomainError('FORBIDDEN','Bu ayar için Sunucuyu Yönet izni gerekir.',403);
 if(patch.botGuard&&!actor.guardManager)throw new DomainError('FORBIDDEN','Bot engelini sunucu sahibi veya yönetici değiştirebilir.',403);
 if(config().demo)throw new DomainError('DEMO_READONLY','Önizlemede ayarlar değiştirilemez.',403);
 return transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['discord-audit-settings:'+config().guildId]);
  const row=(await tx.query('SELECT settings,revision FROM discord_audit_settings WHERE guild_id=$1 FOR UPDATE',[config().guildId])).rows[0];
  if(expectedRevision!==undefined&&expectedRevision!==(row?.revision||0))throw new DomainError('STALE_SETTINGS','Ayarlar değişmiş. Paneli yenileyip yeniden seç.',409);
  const s=discordAuditSettingsSchema.parse({...row?.settings,...patch});
  await tx.query('INSERT INTO discord_audit_settings(guild_id,settings,updated_by) VALUES($1,$2,$3) ON CONFLICT(guild_id) DO UPDATE SET settings=EXCLUDED.settings,updated_by=EXCLUDED.updated_by,revision=discord_audit_settings.revision+1,updated_at=now()',[config().guildId,s,actor.id]);
  if(!s.botGuard.enabled)await tx.query("UPDATE bot_join_jobs SET status='SKIPPED',last_error='GUARD_DISABLED',updated_at=now() WHERE guild_id=$1 AND status IN ('QUEUED','RUNNING')",[config().guildId]);
  if(!s.enabled)await tx.query("UPDATE community_deliveries SET status='CANCELLED',last_error='AUDIT_DISABLED' WHERE guild_id=$1 AND payload ? 'auditEventId' AND status='QUEUED'",[config().guildId]);
  await audit(tx,actor.id,'DISCORD_AUDIT_SETTINGS_UPDATED',config().guildId,{settings:s});return s;
 });
}
export async function auditSettingsRevision(){const row=(await database().query('SELECT revision FROM discord_audit_settings WHERE guild_id=$1',[config().guildId])).rows[0];return Number(row?.revision||0);}
export type AuditMessage={id:string;channelId:string;authorId:string;authorName:string;content:string;attachments?:Array<{name:string;url?:string}>};
export async function captureDiscordMessage(message:AuditMessage,mode:'CREATE'|'EDIT'|'DELETE',oldContent?:string|null){
 const s=await discordAuditSettings();if(!captureAuditMessage(message.channelId,s,config().logChannel))return null;
 return transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['discord-message:'+config().guildId+':'+message.id]);
  const old=(await tx.query('SELECT * FROM discord_message_snapshots WHERE guild_id=$1 AND message_id=$2 FOR UPDATE',[config().guildId,message.id])).rows[0];
  const content=message.content.slice(0,4000),attachments=message.attachments||[];
  if(mode==='CREATE'&&old)return null;
  if(mode==='EDIT'&&old?.content===content&&JSON.stringify(old.attachments)===JSON.stringify(attachments))return null;
  // Embed refreshes with a cached, unchanged message are not edits.
  if(mode==='EDIT'&&!old&&oldContent!==undefined&&oldContent===content)return null;
  const revision=(old?.revision||0)+(mode==='EDIT'?1:0);
  if(mode!=='DELETE')await tx.query('INSERT INTO discord_message_snapshots(guild_id,message_id,channel_id,author_id,author_name,content,attachments,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(guild_id,message_id) DO UPDATE SET content=EXCLUDED.content,attachments=EXCLUDED.attachments,revision=EXCLUDED.revision,updated_at=now()',[config().guildId,message.id,message.channelId,message.authorId,message.authorName,content,JSON.stringify(attachments),revision]);
  else await tx.query('DELETE FROM discord_message_snapshots WHERE guild_id=$1 AND message_id=$2',[config().guildId,message.id]);
  const event:DiscordAuditEvent={key:'message:'+message.id+':'+mode+(mode==='EDIT'?':'+revision+':'+sha256(content):''),kind:'MESSAGE_'+mode,actorId:message.authorId,actorName:message.authorName,channelId:message.channelId,messageId:message.id,metadata:{attachments:mode==='DELETE'?old?.attachments||attachments:attachments,...(mode==='DELETE'?{details:'Mesajın yazarı gösterilir; silen kişi Discord tarafından verilmez.'}:{})}};
  if(mode==='EDIT')event.before=old?.content??oldContent??null;
  if(mode==='DELETE')event.before=old?.content??oldContent??null;else event.after=content;
  return writeEvent(tx,s,event);
 });
}
export async function messageSnapshot(messageId:string){return (await database().query('SELECT * FROM discord_message_snapshots WHERE guild_id=$1 AND message_id=$2',[config().guildId,messageId])).rows[0]||null;}
export async function recentDiscordAudit(category?:AuditCategory,offset=0){const rows=await database().query('SELECT * FROM discord_audit_events WHERE guild_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[config().guildId]);const selected=category?rows.rows.filter(r=>auditCategory(r.kind)===category):rows.rows;return {rows:selected.slice(Math.max(0,offset),Math.max(0,offset)+3),total:selected.length};}
export async function discordAuditEvent(id:string){return (await database().query('SELECT * FROM discord_audit_events WHERE guild_id=$1 AND id=$2',[config().guildId,id])).rows[0]||null;}
export function auditRowToEvent(r:any):DiscordAuditEvent{return {id:r.id,key:r.event_key,kind:r.kind,actorId:r.actor_id,actorName:r.actor_name,targetId:r.target_id,channelId:r.channel_id,messageId:r.message_id,before:['MESSAGE_EDIT','MESSAGE_DELETE'].includes(r.kind)?r.before_content:r.before_content??undefined,after:r.after_content??undefined,metadata:r.metadata};}
export async function queueBotJoin(bot:{id:string;name:string;joinedAt:Date;addedBy?:string}){
 await database().query("INSERT INTO bot_join_jobs(guild_id,bot_id,bot_name,joined_at,added_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,bot_id) DO UPDATE SET joined_at=EXCLUDED.joined_at,bot_name=EXCLUDED.bot_name,added_by=coalesce(EXCLUDED.added_by,bot_join_jobs.added_by),status='QUEUED',attempts=0,available_at=now(),last_error=NULL,updated_at=now() WHERE bot_join_jobs.joined_at<EXCLUDED.joined_at",[config().guildId,bot.id,bot.name.slice(0,100),bot.joinedAt,bot.addedBy||null]);
 if(bot.addedBy)await database().query('UPDATE bot_join_jobs SET added_by=$4 WHERE guild_id=$1 AND bot_id=$2 AND joined_at=$3',[config().guildId,bot.id,bot.joinedAt,bot.addedBy]);
}
export async function claimBotJoin(){return transaction(async tx=>(await tx.query("UPDATE bot_join_jobs SET status='RUNNING',attempts=attempts+1,updated_at=now() WHERE (guild_id,bot_id)=(SELECT guild_id,bot_id FROM bot_join_jobs WHERE guild_id=$1 AND ((status='QUEUED' AND available_at<=now()) OR (status='RUNNING' AND updated_at<now()-interval '1 minute')) ORDER BY available_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",[config().guildId])).rows[0]||null);}
export async function finishBotJoin(job:any,status:'REMOVED'|'SKIPPED'|'FAILED'|'QUEUED',error:string|null=null){await database().query('UPDATE bot_join_jobs SET status=$4,last_error=$5,available_at=now()+interval \'30 seconds\',updated_at=now() WHERE guild_id=$1 AND bot_id=$2 AND joined_at=$3',[config().guildId,job.bot_id,job.joined_at,status,error]);}
export async function botGuardStatus(){return (await database().query('SELECT bot_id,bot_name,status,last_error,attempts,updated_at FROM bot_join_jobs WHERE guild_id=$1 ORDER BY updated_at DESC LIMIT 10',[config().guildId])).rows;}
export async function cleanupDiscordAudit(){const s=await discordAuditSettings();await database().query("DELETE FROM discord_audit_events WHERE guild_id=$1 AND created_at<now()-$2*interval '1 day'",[config().guildId,s.retentionDays]);await database().query("DELETE FROM discord_message_snapshots WHERE guild_id=$1 AND updated_at<now()-interval '7 days'",[config().guildId]);await database().query("DELETE FROM bot_join_jobs WHERE guild_id=$1 AND status NOT IN ('QUEUED','RUNNING') AND updated_at<now()-interval '30 days'",[config().guildId]);await database().query("DELETE FROM community_deliveries WHERE guild_id=$1 AND payload ? 'auditEventId' AND status NOT IN ('QUEUED','SENDING') AND created_at<now()-$2*interval '1 day'",[config().guildId,s.retentionDays]);}
