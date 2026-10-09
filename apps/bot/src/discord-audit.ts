import {Events,AuditLogEvent,PermissionFlagsBits,type Client,type GuildMember} from 'discord.js';
import {config,recordDiscordAudit,captureDiscordMessage,messageSnapshot,discordAuditSettings,shouldBlockBot,communitySettings,queueBotJoin,claimBotJoin,finishBotJoin,cleanupDiscordAudit} from '@turkishpix/core';
const target=(id:string|null|undefined)=>id===config().guildId;
const running=new Map<string,Promise<unknown>>();
function serial(key:string,task:()=>Promise<unknown>){const next=(running.get(key)||Promise.resolve()).catch(()=>{}).then(task);running.set(key,next);return next.finally(()=>{if(running.get(key)===next)running.delete(key);});}
function safe(task:Promise<unknown>,event:string){void task.catch((e:any)=>console.error('DISCORD_AUDIT_PENDING',JSON.stringify({event,code:typeof e?.code==='number'||typeof e?.code==='string'?e.code:'INTERNAL'})));}
const attachments=(m:any)=>m.attachments?[...m.attachments.values()].slice(0,10).map((a:any)=>({name:String(a.name||'Dosya').slice(0,200),url:a.url})):[];
async function messageData(m:any){
 const saved=m.author?null:await messageSnapshot(m.id);
 const authorId=m.author?.id||saved?.author_id;if(!authorId||m.author?.bot||m.webhookId)return null;
 return {id:m.id,channelId:m.channelId,authorId,authorName:m.author?.username||saved?.author_name||'Üye',content:m.content??saved?.content??'',attachments:m.partial?saved?.attachments||[]:attachments(m)};
}
export async function enforceNextBotJoin(client:Client){
 if(!client.isReady())return;const guild=client.guilds.cache.get(config().guildId);if(!guild?.available)return;
 const job=await claimBotJoin();if(!job)return;
 try{
  let s=await discordAuditSettings();
  if(!shouldBlockBot(job.bot_id,true,client.user.id,s,config().clientId)){await finishBotJoin(job,'SKIPPED',job.bot_id===client.user.id?'SELF_PROTECTED':'ALLOWED_OR_DISABLED');return;}
  let member:GuildMember;try{member=await guild.members.fetch({user:job.bot_id,force:true});}catch(e:any){if(e?.code===10007){await finishBotJoin(job,'SKIPPED','ALREADY_LEFT');return;}throw e;}
  if(!member.user.bot){await finishBotJoin(job,'SKIPPED','HUMAN_PROTECTED');return;}
  if(member.joinedTimestamp!==new Date(job.joined_at).getTime()){await finishBotJoin(job,'SKIPPED','JOIN_CHANGED');return;}
  s=await discordAuditSettings();
  if(!shouldBlockBot(member.id,member.user.bot,client.user.id,s,config().clientId)){await finishBotJoin(job,'SKIPPED','ALLOWED_OR_DISABLED');return;}
  const me=await guild.members.fetchMe();
  if(!me.permissions.has(PermissionFlagsBits.KickMembers)||!member.kickable){const error=!me.permissions.has(PermissionFlagsBits.KickMembers)?'KICK_PERMISSION_MISSING':'BOT_ROLE_HIERARCHY';await finishBotJoin(job,job.attempts<10?'QUEUED':'FAILED',error);await recordDiscordAudit({key:'bot-guard:'+member.id+':'+job.joined_at.toISOString()+':failed',kind:'BOT_BLOCK_FAILED',actorId:job.added_by,targetId:member.id,metadata:{action:error==='KICK_PERMISSION_MISSING'?'Botun Üyeleri At izni eksik.':'TurkishPix rolünü yeni botun rolünün üstüne taşı.',details:'Giriş engeli açık; Discord bu botun çıkarılmasına izin vermedi.'}});return;}
  await member.kick('TurkishPix: yeni bot girişleri kapalı. İzinli liste /botpanel üzerinden yönetilir.');
  await finishBotJoin(job,'REMOVED');
  await recordDiscordAudit({key:'bot-guard:'+member.id+':'+job.joined_at.toISOString()+':removed',kind:'BOT_BLOCKED',actorId:client.user.id,targetId:member.id,metadata:{action:'Yeni katılan bot çıkarıldı.',details:job.added_by?'Ekleyen kişi: '+job.added_by:'Botu ekleyen kişi Discord tarafından verilmedi.'}});
 }catch(e:any){const code=typeof e?.code==='number'?String(e.code):'RETRY';await finishBotJoin(job,job.attempts<10?'QUEUED':'FAILED',code);console.error('BOT_GUARD_PENDING',JSON.stringify({botId:job.bot_id,code}));}
}
export async function handleBotJoin(member:any,ownId:string){
 if(!target(member.guild.id)||!member.user.bot||member.id===ownId||member.id===config().clientId)return;
 const s=await discordAuditSettings(),date=member.joinedAt||new Date();
 if(shouldBlockBot(member.id,true,ownId,s,config().clientId)){await queueBotJoin({id:member.id,name:member.user.username,joinedAt:date});await recordDiscordAudit({key:'bot-join:'+member.id+':'+date.toISOString(),kind:'BOT_JOIN',targetId:member.id,metadata:{action:'Bot giriş engeli açık; çıkarma sıraya alındı.'}});}
 else await recordDiscordAudit({key:'bot-join:'+member.id+':'+date.toISOString(),kind:'BOT_ALLOWED',targetId:member.id,metadata:{action:s.botGuard.enabled?'İzinli listede.':'Bot engeli kapalı.'}});
}
export function installDiscordAudit(client:Client){
 client.on(Events.MessageCreate,message=>{if(!target(message.guildId)||message.author.bot||message.system||message.webhookId)return;safe(serial(message.id,async()=>{const data=await messageData(message);if(data){await captureDiscordMessage(data,'CREATE');const community=await communitySettings();if(message.channel.type===5||message.channelId===community.announcements.channelId)await recordDiscordAudit({key:'announcement-message:'+message.id,kind:'ANNOUNCEMENT',actorId:data.authorId,actorName:data.authorName,channelId:data.channelId,messageId:data.id,after:data.content,metadata:{attachments:data.attachments}});}}),'MESSAGE_CREATE');});
 client.on(Events.MessageUpdate,(old,message)=>{if(!target(message.guildId)||message.author?.bot||message.system||message.webhookId)return;safe(serial(message.id,async()=>{const full=message.partial?await message.fetch():message,data=await messageData(full);if(data)await captureDiscordMessage(data,'EDIT',old.partial?undefined:old.content);}),'MESSAGE_EDIT');});
 const deleted=async(message:any)=>{const data=await messageData(message);if(data)await captureDiscordMessage(data,'DELETE',message.partial?undefined:message.content);};
 client.on(Events.MessageDelete,message=>{if(target(message.guildId))safe(serial(message.id,()=>deleted(message)),'MESSAGE_DELETE');});
 client.on(Events.MessageBulkDelete,(messages,channel)=>{if(!target(channel.guild.id))return;for(const message of messages.values())safe(serial(message.id,()=>deleted(message)),'MESSAGE_BULK_DELETE');});
 client.on(Events.GuildMemberAdd,member=>{if(!target(member.guild.id))return;if(member.user.bot){safe(serial('bot-guard',async()=>{await handleBotJoin(member,client.user!.id);await enforceNextBotJoin(client);}),'BOT_JOIN');}else safe(recordDiscordAudit({key:'member-join:'+member.id+':'+member.joinedTimestamp,kind:'MEMBER_JOIN',targetId:member.id,metadata:{details:member.user.username}}),'MEMBER_JOIN');});
 client.on(Events.GuildMemberRemove,member=>{if(target(member.guild.id)&&member.id!==client.user?.id)safe(recordDiscordAudit({key:'member-leave:'+member.id+':'+member.joinedTimestamp,kind:'MEMBER_LEAVE',targetId:member.id,metadata:{details:'Ayrılma sebebi bu olayda verilmez; atma / yasaklama denetim kaydı ayrı gösterilir.'}}),'MEMBER_LEAVE');});
 const kinds=new Set([1,10,11,12,13,14,15,20,22,23,24,25,28,30,31,32,80,82]);
 client.on(Events.GuildAuditLogEntryCreate,(entry,guild)=>{
  if(!target(guild.id)||!kinds.has(entry.action))return;
  safe((async()=>{
   const name=AuditLogEvent[entry.action].replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase(),changes=(entry.changes||[]).slice(0,8).map(c=>`${c.key}: ${JSON.stringify(c.old)??'—'} → ${JSON.stringify(c.new)??'—'}`).join('\n').slice(0,1200);
   await recordDiscordAudit({key:'gateway-audit:'+entry.id,kind:name,actorId:entry.executorId,actorName:entry.executor?.username,targetId:entry.targetId,metadata:{reason:entry.reason||undefined,details:changes||undefined,auditLogId:entry.id,occurredAt:entry.createdAt.toISOString()}});
   if(entry.action===AuditLogEvent.BotAdd&&entry.targetId&&entry.targetId!==client.user!.id&&entry.targetId!==config().clientId){const member=await guild.members.fetch({user:entry.targetId,force:true});if(member.user.bot){const s=await discordAuditSettings();if(shouldBlockBot(member.id,true,client.user!.id,s,config().clientId)){await queueBotJoin({id:member.id,name:member.user.username,joinedAt:member.joinedAt||entry.createdAt,addedBy:entry.executorId||undefined});await serial('bot-guard',()=>enforceNextBotJoin(client));}}}
  })(),'GUILD_AUDIT');
 });
}
let lastCleanup=0;
export async function discordAuditTick(client:Client){await serial('bot-guard',()=>enforceNextBotJoin(client));if(Date.now()-lastCleanup>3600000){await cleanupDiscordAudit();lastCleanup=Date.now();}}
