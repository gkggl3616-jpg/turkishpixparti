import {randomUUID} from 'node:crypto';
import {Events,PermissionFlagsBits,ChannelType,MessageFlags,type Client} from 'discord.js';
import {config,DomainError,database,discordRequest,roleAutomationSettings,saveRoleAutomation,queueRoleChange,claimRoleChange,finishRoleChange,createRoleBulk,activateRoleBulk,cancelRoleBulk,roleBulkStatus,reactionRolePanel,requestRoleScan,hasServerTag,reactionEmojiKey,AUTOMATIC_ROLE_DANGER_MASK,discordCard,uiText,uiRow,uiButton,userTag,roleTag,channelTag,theme,displayText,recordDiscordAudit} from '@turkishpix/core';
import {controlActor} from './control-panel';
const timers=new Map<string,number>();
const guarded=(task:Promise<unknown>,event:string)=>{void task.catch((e:any)=>console.error('ROLE_AUTOMATION_PENDING',JSON.stringify({event,code:typeof e?.code==='number'||typeof e?.code==='string'?e.code:'INTERNAL'})));};
export async function automationRole(guild:any,id:string,executor?:any){
 const role=await guild.roles.fetch(id),me=await guild.members.fetchMe();
 if(!role||role.id===guild.id||role.managed||role.permissions.bitfield&AUTOMATIC_ROLE_DANGER_MASK)throw new DomainError('ROLE_UNSAFE','@everyone, entegrasyon rolü veya yönetici yetkisi taşıyan rol otomatik verilemez.');
 if(!me.permissions.has(PermissionFlagsBits.ManageRoles)||me.roles.highest.comparePositionTo(role)<=0)throw new DomainError('ROLE_HIERARCHY','Bota Rolleri Yönet izni ver ve TurkishPix rolünü bu rolün üstüne taşı.');
 if(executor&&executor.id!==guild.ownerId&&!config().owners.includes(executor.id)&&(!executor.permissions.has(PermissionFlagsBits.ManageRoles)||executor.roles.highest.comparePositionTo(role)<=0))throw new DomainError('ROLE_PERMISSION','Rolleri Yönet iznin bulunmalı; yalnızca kendi rolünün altındaki rolleri seçebilirsin.',403);
 return role;
}
async function roleManager(i:any){const actor=await controlActor(i,true);if(!actor.configuredOwner&&actor.id!==i.guild.ownerId&&!actor.member.permissions.has(PermissionFlagsBits.ManageRoles))throw new DomainError('ROLE_PERMISSION','Bu işlem için Rolleri Yönet izni gerekir.',403);return actor;}
export async function reconcileMember(member:any,rawUser?:any){
 if(member.user.bot||member.pending)return;const s=await roleAutomationSettings();
 if(s.autoEnabled)for(const roleId of s.autoRoleIds)if(!member.roles.cache.has(roleId))await queueRoleChange(member.id,roleId,true,'AUTO');
 if(s.tagEnabled){const user=rawUser??await discordRequest('/users/'+member.id),tag=hasServerTag(user,member.guild.id);if(tag!==null&&member.roles.cache.has(s.tagRoleId)!==tag)await queueRoleChange(member.id,s.tagRoleId,tag,'TAG');}
}
export async function runRoleJob(client:Client){
 const guild=client.guilds.cache.get(config().guildId);if(!guild?.available)return;const job=await claimRoleChange();if(!job)return;
 try{
  const s=await roleAutomationSettings();
  if(job.source==='AUTO'&&(!s.autoEnabled||!s.autoRoleIds.includes(job.role_id))||job.source==='TAG'&&(!s.tagEnabled||s.tagRoleId!==job.role_id)){await finishRoleChange(job,'SKIPPED','AUTOMATION_DISABLED');return;}
  if(job.source==='BULK'){const c=(await database().query('SELECT status,owner_id FROM role_bulk_campaigns WHERE guild_id=$1 AND id=$2',[guild.id,job.metadata.campaignId])).rows[0];if(!c||['CANCELLED','FAILED','DRAFT'].includes(c.status)){await finishRoleChange(job,'SKIPPED','BULK_CANCELLED');return;}await automationRole(guild,job.role_id,await guild.members.fetch({user:c.owner_id,force:true}));}
  if(job.source==='REACTION'){const p=(await database().query('SELECT active FROM role_reaction_panels WHERE guild_id=$1 AND id=$2',[guild.id,job.metadata.panelId])).rows[0];if(!p?.active||s.autoRoleIds.includes(job.role_id)||s.tagRoleId===job.role_id){await finishRoleChange(job,'SKIPPED','PANEL_CLOSED_OR_ROLE_CONFLICT');return;}}
  const role=await automationRole(guild,job.role_id),member=await guild.members.fetch({user:job.user_id,force:true});
  if(member.user.bot||member.pending){await finishRoleChange(job,member.pending?'QUEUED':'SKIPPED',member.pending?'MEMBERSHIP_PENDING':'BOT_PROTECTED');return;}
  let desired=job.desired;
  if(job.source==='TAG'){const tag=hasServerTag(await discordRequest('/users/'+member.id),guild.id);if(tag===null){await finishRoleChange(job,'QUEUED','TAG_IDENTITY_UNAVAILABLE');return;}desired=tag;}
  // A newer reaction or configuration must win over a queued older mutation.
  const current=(await database().query('SELECT revision FROM role_automation_jobs WHERE guild_id=$1 AND user_id=$2 AND role_id=$3',[guild.id,job.user_id,job.role_id])).rows[0];if(current?.revision!==job.revision)return;
  if(member.roles.cache.has(role.id)!==desired){if(desired)await member.roles.add(role,'TurkishPix: '+job.source+' rol otomasyonu');else await member.roles.remove(role,'TurkishPix: '+job.source+' rol otomasyonu');}
  await finishRoleChange(job,'DONE');
 }catch(e:any){if(e?.code===10007){await finishRoleChange(job,'SKIPPED','MEMBER_LEFT');return;}const reason=e instanceof DomainError?e.code:typeof e?.code==='number'?String(e.code):'RETRY';await finishRoleChange(job,job.attempts<10?'QUEUED':'FAILED',reason);}
}
async function scanMembers(client:Client){
 const guild=client.guilds.cache.get(config().guildId);if(!guild?.available)return;
 const s=await roleAutomationSettings();if(!s.autoEnabled&&!s.tagEnabled)return;
 await database().query('INSERT INTO role_scan_state(guild_id) VALUES($1) ON CONFLICT DO NOTHING',[guild.id]);
 const scan=(await database().query('SELECT * FROM role_scan_state WHERE guild_id=$1 AND next_scan<=now()',[guild.id])).rows[0];if(!scan)return;
 try{
  const rows=await discordRequest(`/guilds/${guild.id}/members?limit=50&after=${scan.cursor_id}`);if(!Array.isArray(rows))throw Error('MEMBER_SCAN');
  for(const row of rows){if(row.user?.bot||row.pending)continue;const roles=new Set(row.roles||[]);
   if(s.autoEnabled)for(const roleId of s.autoRoleIds)if(!roles.has(roleId))await queueRoleChange(row.user.id,roleId,true,'AUTO');
   if(s.tagEnabled){const raw=Object.hasOwn(row.user,'primary_guild')?row.user:await discordRequest('/users/'+row.user.id),tag=hasServerTag(raw,guild.id);if(tag!==null&&roles.has(s.tagRoleId)!==tag)await queueRoleChange(row.user.id,s.tagRoleId,tag,'TAG');}
  }
  const cursor=rows.length===50?rows.at(-1).user.id:'0';await database().query("UPDATE role_scan_state SET cursor_id=$2,next_scan=now()+$3*interval '1 second',last_error=NULL,updated_at=now() WHERE guild_id=$1 AND revision=$4",[guild.id,cursor,cursor==='0'?300:5,scan.revision]);
 }catch{await database().query("UPDATE role_scan_state SET next_scan=now()+interval '30 seconds',last_error='MEMBER_SCAN_RETRY',updated_at=now() WHERE guild_id=$1 AND revision=$2",[guild.id,scan.revision]);}
}
export async function scanBulk(client:Client){
 const guild=client.guilds.cache.get(config().guildId);if(!guild?.available)return;
 const campaign=(await database().query("SELECT * FROM role_bulk_campaigns WHERE guild_id=$1 AND status IN ('QUEUED','SCANNING') AND available_at<=now() ORDER BY created_at LIMIT 1",[guild.id])).rows[0];if(!campaign)return;
 try{
  await automationRole(guild,campaign.role_id,await guild.members.fetch({user:campaign.owner_id,force:true}));
  const members=await discordRequest(`/guilds/${guild.id}/members?limit=100&after=${campaign.cursor_id}`);let count=0;
  for(const member of members){if(member.user.bot||member.pending||member.roles.includes(campaign.role_id))continue;await queueRoleChange(member.user.id,campaign.role_id,true,'BULK',{campaignId:campaign.id});count++;}
  await database().query("UPDATE role_bulk_campaigns SET status=$2,cursor_id=$3,queued=queued+$4,updated_at=now() WHERE id=$1 AND status IN ('QUEUED','SCANNING')",[campaign.id,members.length===100?'SCANNING':'APPLYING',members.at(-1)?.user.id||campaign.cursor_id,count]);
 }catch(e:any){const permanent=e instanceof DomainError&&e.code!=='DISCORD_ERROR';await database().query("UPDATE role_bulk_campaigns SET status=CASE WHEN $2 THEN 'FAILED' ELSE status END,last_error=$3,available_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1 AND status IN ('QUEUED','SCANNING')",[campaign.id,permanent,e instanceof DomainError?e.code:'MEMBER_SCAN_RETRY']);console.error('BULK_ROLE_PENDING',JSON.stringify({campaignId:campaign.id,code:e instanceof DomainError?e.code:'MEMBER_SCAN_RETRY'}));}
}
let ticking=false,scanning=false,lastScan=0;
export async function roleAutomationTick(client:Client){
 if(ticking)return;ticking=true;
 try{
  for(let n=0;n<3;n++)await runRoleJob(client);
  if(!scanning&&Date.now()-lastScan>5000){
   scanning=true;lastScan=Date.now();
   // Profile lookups can be slow. Scanning must not hold up reaction or join jobs.
   void (async()=>{await scanBulk(client);await scanMembers(client);})().catch(()=>console.error('ROLE_SCAN_PENDING')).finally(()=>{scanning=false;});
  }
  await database().query("UPDATE role_bulk_campaigns c SET status='DONE',updated_at=now() WHERE guild_id=$1 AND status='APPLYING' AND NOT EXISTS(SELECT 1 FROM role_bulk_targets j WHERE j.campaign_id=c.id AND j.status IN ('QUEUED','RUNNING'))",[config().guildId]);
 }finally{ticking=false;}
}
export async function reactionRoleChange(reaction:any,user:any,desired:boolean){
 if(user.bot||reaction.message.guildId!==config().guildId)return;const key=reaction.emoji.id||reactionEmojiKey(reaction.emoji.name||''),panel=await reactionRolePanel(reaction.message.id,key);if(!panel||panel.channel_id!==reaction.message.channelId)return;
 const member=await reaction.message.guild.members.fetch({user:user.id,force:true});if(member.user.bot||member.pending)return;await automationRole(member.guild,panel.role_id);await queueRoleChange(user.id,panel.role_id,desired,'REACTION',{panelId:panel.id});
}
export function installRoleAutomation(client:Client){
 client.on(Events.GuildMemberAdd,member=>{if(member.guild.id===config().guildId)guarded(reconcileMember(member),'MEMBER_JOIN');});
 client.on(Events.GuildMemberUpdate,(_,member)=>{if(member.guild.id===config().guildId)guarded(reconcileMember(member),'MEMBER_UPDATE');});
 client.on(Events.UserUpdate,(_,user)=>{const member=client.guilds.cache.get(config().guildId)?.members.cache.get(user.id);if(member)guarded(reconcileMember(member),'TAG_UPDATE');});
 client.on(Events.MessageCreate,message=>{if(message.guildId!==config().guildId||message.author.bot||!message.member)return;const now=Date.now();if(now-(timers.get(message.author.id)||0)<120000)return;timers.set(message.author.id,now);if(timers.size>5000)timers.delete(timers.keys().next().value!);guarded(reconcileMember(message.member),'ACTIVE_MEMBER');});
 client.on(Events.MessageReactionAdd,(reaction,user)=>guarded(reactionRoleChange(reaction,user,true),'REACTION_ADD'));
 client.on(Events.MessageReactionRemove,(reaction,user)=>guarded(reactionRoleChange(reaction,user,false),'REACTION_REMOVE'));
}
const key=(userId:string,action:string,value='')=>`rolepanel:${userId}:${action}:${value}`;
export async function rolePanelView(i:any,notice=''){
 await roleManager(i);const s=await roleAutomationSettings(),campaigns=await roleBulkStatus(),scan=(await database().query('SELECT updated_at,last_error FROM role_scan_state WHERE guild_id=$1',[i.guildId])).rows[0];const panels=(await database().query('SELECT * FROM role_reaction_panels WHERE guild_id=$1 AND active ORDER BY created_at DESC LIMIT 5',[i.guildId])).rows;const cancellable=campaigns.filter(c=>c.owner_id===i.user.id&&['QUEUED','SCANNING','APPLYING'].includes(c.status)).slice(0,3);
 return discordCard('🎭 Rol otomasyonları',notice||'Üyeler, emojiler ve gerçek Discord sunucu tagı için kalıcı rol sistemi.',[
  uiText('**👋 Yeni üye rolü** '+(s.autoEnabled?'🟢 Açık':'⚪ Kapalı')+'\n'+(s.autoRoleIds.map(roleTag).join(' · ')||'Henüz rol seçilmedi.')+'\n**🏷️ Sunucu tagı rolü** '+(s.tagEnabled?'🟢 Açık':'⚪ Kapalı')+' · '+(s.tagRoleId?roleTag(s.tagRoleId):'Rol seçilmedi')+'\nTag kaldırılırsa veya başka sunucu seçilirse tag rolü otomatik alınır. Düzenli kontrol döngüsü: 5 dk; büyük sunucularda tarama süresi eklenir.'),
  uiRow({type:6,custom_id:key(i.user.id,'auto'),placeholder:'Yeni girenlere verilecek rolleri seç',min_values:1,max_values:10,...(s.autoRoleIds.length?{default_values:s.autoRoleIds.map(id=>({id,type:'role'}))}:{})}),
  uiRow({type:6,custom_id:key(i.user.id,'tag'),placeholder:'Bu sunucunun tagını kullananlara verilecek rol',min_values:1,max_values:1,...(s.tagRoleId?{default_values:[{id:s.tagRoleId,type:'role'}]}:{})}),
  uiRow(uiButton(key(i.user.id,'autooff'),'Otorolü kapat',4),uiButton(key(i.user.id,'tagoff'),'Tag rolünü kapat',4),uiButton(key(i.user.id,'scan'),'🔄 Tagları kontrol et'),uiButton(key(i.user.id,'refresh'),'Yenile')),
  uiText('**📦 Mevcut üyelere rol dağıtımı**\n`/topluluk roller herkese rol: @Rol`\nBotlar, üyelik doğrulaması bekleyenler ve rolü zaten taşıyanlar atlanır. Dağıtım yeniden başlatmada kaldığı yerden sürer.\n'+(campaigns.map(c=>roleTag(c.role_id)+' · '+c.done+' tamam · '+c.pending+' bekliyor · '+c.failed+' sorun · '+displayText(c.status,30)).join('\n')||'Dağıtım başlatılmadı.')),
  ...(cancellable.length?[uiRow(...cancellable.map((c,n)=>uiButton(key(i.user.id,'cancel',c.id),'Dağıtım '+(n+1)+' durdur',4)))]:[]),
  uiText('**😀 Emoji rol mesajları**\n`/topluluk roller emoji rol: @Rol emoji: ✅`\nEmojiye bas → rolü al. Tepkini kaldır → rolü bırak.\n'+(panels.map(p=>p.emoji+' → '+roleTag(p.role_id)+' · [Mesaj]('+`https://discord.com/channels/${i.guildId}/${p.channel_id}/${p.message_id}`+')').join('\n')||'Aktif emoji rol mesajı yok.')),
  uiText('**🎛️ Düğmeyle rol alma**\n`/rolmenu` ile mevcut düğmeli rol menüsünü oluştur.\n'+(scan?'Son kontrol: <t:'+Math.floor(new Date(scan.updated_at).getTime()/1000)+':R>'+(scan.last_error?' · Kontrol yeniden denenecek.':''):'')+'\n-# TurkishPix • /botpanel • Rol otomasyonları'),
  uiRow(uiButton('control:'+i.user.id+':view:home','🏛️ Kontrol merkezine dön'))
 ],theme.purple);
}
export async function handleRoleAutomationInteraction(i:any){
 const slash=i.isChatInputCommand?.()&&i.commandName==='topluluk'&&i.options.getSubcommandGroup(false)==='roller',component=i.customId?.startsWith('rolepanel:');if(!slash&&!component)return false;
 try{
  if(component&&i.customId.split(':')[1]!==i.user.id)throw new DomainError('PANEL_OWNER','Bu rol menüsü sana ait değil. /topluluk roller panel ile yeniden aç.',403);
  if(component)await i.deferUpdate();else await i.deferReply({flags:MessageFlags.Ephemeral});
  const actor=await roleManager(i),s=await roleAutomationSettings(),action=slash?i.options.getSubcommand():i.customId.split(':')[2],value=i.customId?.split(':')[3];let notice='';
  if(['otorol','tag','auto'].includes(action)&&!(component&&action==='tag'&&!i.values)){
   const ids=component?i.values:[i.options.getRole('rol',true).id];for(const id of ids)await automationRole(i.guild,id,actor.member);
   if(action==='tag'){if((await database().query('SELECT id FROM role_reaction_panels WHERE guild_id=$1 AND role_id=$2 AND active LIMIT 1',[i.guildId,ids[0]])).rows.length)throw new DomainError('ROLE_CONFLICT','Tag rolü emoji rolünden farklı olmalı.');s.tagRoleId=ids[0];s.tagEnabled=true;}
   else{s.autoRoleIds=ids;s.autoEnabled=true;if((await database().query('SELECT id FROM role_reaction_panels WHERE guild_id=$1 AND role_id=ANY($2::text[]) AND active LIMIT 1',[i.guildId,ids])).rows.length)throw new DomainError('ROLE_CONFLICT','Otorol emoji rolünden farklı olmalı.');}await saveRoleAutomation(actor,action==='tag'?{tagEnabled:true,tagRoleId:ids[0]}:{autoEnabled:true,autoRoleIds:ids});notice='Rol otomasyonu kaydedildi; mevcut üyeler de kontrol edilecek.';
  }else if(['otorol-kapat','tag-kapat','autooff','tagoff'].includes(action)){await saveRoleAutomation(actor,action.startsWith('tag')?{tagEnabled:false}:{autoEnabled:false});notice='Otomasyon durduruldu; verilen roller korundu.';}
  else if(['tag-tara','scan'].includes(action)){await requestRoleScan();notice='Üye taglarının kontrolü sıraya alındı.';}
  else if(action==='herkese'){
   const role=await automationRole(i.guild,i.options.getRole('rol',true).id,actor.member);if(role.id===s.tagRoleId)throw new DomainError('ROLE_CONFLICT','Tag rolü herkese dağıtılamaz. Ayrı bir üye rolü seç.');const id=await createRoleBulk(actor.id,role.id,i.guild.memberCount);
   await i.editReply(discordCard('📦 Toplu rol dağıtımı','Başlamadan önce dağıtımın kapsamını kontrol et.',[uiText('**Rol** '+roleTag(role.id)+'\n**Sunucu üye sayısı** '+i.guild.memberCount+'\nİnsan üyeler kontrol edilir; botlar, doğrulama bekleyenler ve rolü bulunanlar atlanır. **Mevcut roller silinmez.**'),uiRow(uiButton(key(actor.id,'start',id),'Dağıtımı başlat',3),uiButton(key(actor.id,'cancel',id),'İptal',4))],theme.gold));return true;
  }else if(action==='start'){const campaign=(await database().query('SELECT role_id FROM role_bulk_campaigns WHERE id=$1 AND guild_id=$2 AND owner_id=$3',[value,i.guildId,actor.id])).rows[0];if(!campaign)throw new DomainError('BULK_MISSING','Dağıtım bulunamadı.');await automationRole(i.guild,campaign.role_id,actor.member);await activateRoleBulk(actor.id,value);notice='Toplu dağıtım başlatıldı. İlerlemeyi Yenile düğmesinden gör.';}
  else if(action==='cancel'){await cancelRoleBulk(actor.id,value);notice='Dağıtım iptal edildi. Verilen roller korundu.';}
  else if(action==='emoji'){
   const role=await automationRole(i.guild,i.options.getRole('rol',true).id,actor.member);if(role.id===s.tagRoleId||s.autoRoleIds.includes(role.id))throw new DomainError('ROLE_CONFLICT','Tag ve otorol emoji rolünden farklı olmalı. Ayrı bir rol seç.');if((await database().query('SELECT id FROM role_reaction_panels WHERE guild_id=$1 AND role_id=$2 AND active',[i.guildId,role.id])).rows.length)throw new DomainError('ROLE_CONFLICT','Bu rolün emoji mesajı zaten var. Önce /topluluk roller emoji-kapat kullan.');const emoji=i.options.getString('emoji',true).trim();let emojiKey:string;try{emojiKey=reactionEmojiKey(emoji);}catch{throw new DomainError('EMOJI_INVALID','Tek bir geçerli Discord veya Unicode emojisi gir.');}if(/^\d+$/.test(emojiKey)&&!i.guild.emojis.cache.has(emojiKey))throw new DomainError('EMOJI_ACCESS','Bu sunucudaki özel emojilerden birini seç.');
   const channel=i.options.getChannel('kanal')||i.channel,me=await i.guild.members.fetchMe();if(channel?.guildId!==i.guildId||channel.type!==ChannelType.GuildText||!channel.permissionsFor(actor.member)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages])||!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AddReactions,PermissionFlagsBits.ReadMessageHistory]))throw new DomainError('ROLE_CHANNEL','Bir metin kanalı seç. Botun Mesaj Gönder, Geçmişi Oku ve Tepki Ekle izinleri bulunmalı.');
   const message=await channel.send(discordCard('😀 '+displayText(i.options.getString('baslik')||'Rolünü seç',80),'Topluluğun içinde kendine yer aç.',[uiText('### '+emoji+' → '+roleTag(role.id)+'\nAşağıdaki emojiye basarak rolü al. Tepkini kaldırınca rolün otomatik geri alınır.\n-# TurkishPix • Emoji Rol Sistemi')],theme.purple));
   await database().query('INSERT INTO role_reaction_panels(id,guild_id,channel_id,message_id,role_id,emoji_key,emoji,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),i.guildId,channel.id,message.id,role.id,emojiKey,emoji,actor.id]);try{await message.react(emojiKey);}catch{await database().query('UPDATE role_reaction_panels SET active=false WHERE guild_id=$1 AND message_id=$2',[i.guildId,message.id]);await message.delete().catch(()=>{});throw new DomainError('EMOJI_REACTION','Emoji eklenemedi. Botun Tepki Ekle iznini ve seçtiğin emojiyi kontrol et.');}notice=channelTag(channel.id)+' kanalında emoji rol mesajı hazır.';
  }else if(action==='emoji-kapat'){const result=await database().query('UPDATE role_reaction_panels SET active=false WHERE guild_id=$1 AND message_id=$2 RETURNING id',[i.guildId,i.options.getString('mesaj',true)]);if(!result.rowCount)throw new DomainError('PANEL_MISSING','Emoji rol mesajı bulunamadı.');notice='Emoji rol mesajı kapatıldı. Verilen roller korundu.';}
  else if(!['panel','toplu-durum','refresh'].includes(action))throw new DomainError('ROLE_ACTION','Rol işlemi bulunamadı.');
  await i.editReply(await rolePanelView(i,notice));
 }catch(e){const text=e instanceof DomainError?e.message:'Rol işlemi tamamlanamadı. Botun rol sırasını ve kanal izinlerini kontrol et.';const view=discordCard('⚠️ Rol işlemi tamamlanamadı',text,[uiText('`/topluluk roller panel` ile ayarları yeniden aç.')],theme.gold);if(i.deferred||i.replied)await i.editReply(view);else await i.reply({...view,flags:view.flags|MessageFlags.Ephemeral});}
 return true;
}
