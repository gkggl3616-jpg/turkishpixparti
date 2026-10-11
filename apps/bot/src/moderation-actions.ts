import {MessageFlags,PermissionFlagsBits,type Guild,type User} from 'discord.js';
import {DomainError,brightEmbed,displayText,userTag,theme,discordErrorDetails} from '@turkishpix/core';
export type ModerationAction='kick'|'ban';
function banNotice(server:string,reason:string,state:'pending'|'done'|'failed'){
 const title=state==='failed'?'⚠️ Yasaklama tamamlanmadı':state==='done'?'🔨 Sunucudan yasaklandın':'🔨 Yasaklama bildirimi';
 const description=state==='failed'?'Yasaklama isteği uygulanamadı. Bu bildirim başarılı bir yasaklama anlamına gelmez.':state==='done'?'Sunucu yetkilisi tarafından yasaklandın.':'Sunucu yetkilisi hesabın için yasaklama işlemi başlattı.';
 return {embeds:[brightEmbed(title,description,[{name:'🏛️ Sunucu',value:displayText(server,200)},{name:'📝 Sebep',value:displayText(reason,1000)}],state==='failed'?theme.gold:theme.red)],allowedMentions:{parse:[] as string[]}};
}
export async function executeModerationAction(guild:Guild,actorId:string,targetUser:User,action:ModerationAction,inputReason?:string|null){
 const permission=action==='ban'?PermissionFlagsBits.BanMembers:PermissionFlagsBits.KickMembers,label=action==='ban'?'Üyeleri Yasakla':'Üyeleri At';
 if(targetUser.id===actorId)throw new DomainError('SELF_MODERATION','Kendine bu işlemi uygulayamazsın.');
 if(targetUser.id===guild.ownerId)throw new DomainError('OWNER_PROTECTED','Sunucu sahibine bu işlemi uygulayamazsın.');
 if(targetUser.id===guild.client.user!.id)throw new DomainError('BOT_PROTECTED','TurkishPix kendi hesabını çıkaramaz veya yasaklayamaz.');
 // Reload roles and all three members rather than trusting the interaction's cached permissions.
 await guild.roles.fetch();
 const [actor,bot,target]=await Promise.all([
  guild.members.fetch({user:actorId,force:true}),guild.members.fetch({user:guild.client.user!.id,force:true}),
  guild.members.fetch({user:targetUser.id,force:true}).catch((e:any)=>{if(e.code===10007)throw new DomainError('MEMBER_NOT_FOUND','Seçtiğin kullanıcı artık bu sunucuda değil.');throw e;})
 ]);
 if(!actor.permissions.has(permission))throw new DomainError('FORBIDDEN',`Bu komut için ${label} iznin olmalı.`,403);
 if(!bot.permissions.has(permission))throw new DomainError('BOT_PERMISSION',`TurkishPix rolüne ${label} izni verilmeli.`,403);
 if(actor.id!==guild.ownerId&&actor.roles.highest.comparePositionTo(target.roles.highest)<=0)throw new DomainError('ACTOR_HIERARCHY','Kendi en yüksek rolüne eşit veya daha yüksek roldeki üyeye işlem yapamazsın.',403);
 if(!(action==='ban'?target.bannable:target.kickable))throw new DomainError('BOT_HIERARCHY','TurkishPix rolünü, işlem yapılacak üyenin en yüksek rolünün üstüne taşı.',403);
 const reason=inputReason?.trim()||'Sebep belirtilmedi.';
 if(reason.length>500)throw new DomainError('INVALID_REASON','Sebep en fazla 500 karakter olabilir.');
 const auditReason=(`${action==='ban'?'Ban':'Kick'} • ${actor.user.username} (${actor.id}) • ${reason}`).slice(0,512);
 // Open the DM before removing shared-guild access. A closed DM never prevents the ban.
 let notice:any=null;
 if(action==='ban'&&!targetUser.bot)try{notice=await targetUser.send(banNotice(guild.name,reason,'pending') as any);}catch{}
 try{
  if(action==='ban')await target.ban({reason:auditReason,deleteMessageSeconds:0});else await target.kick(auditReason);
 }catch(e){if(notice)await notice.edit(banNotice(guild.name,reason,'failed')).catch(()=>{});throw e;}
 if(notice)await notice.edit(banNotice(guild.name,reason,'done')).catch(()=>{});
 return {reason,dm:notice?'sent':targetUser.bot?'bot':'unavailable'};
}
export async function handleModerationInteraction(i:any){
 if(!i.isChatInputCommand()||!['kick','ban'].includes(i.commandName))return false;
 await i.deferReply({flags:MessageFlags.Ephemeral});
 try{
  if(!i.guild)throw new DomainError('GUILD_REQUIRED','Bu komut yalnızca sunucuda kullanılabilir.');
  const action=i.commandName as ModerationAction,user=i.options.getUser('uye',true),guild=await i.guild.fetch();
  const result=await executeModerationAction(guild,i.user.id,user,action,i.options.getString('reason'));
  const fields=[{name:'👤 Üye',value:userTag(user.id,user.username)},{name:'📝 Sebep',value:displayText(result.reason,1000)},...(action==='ban'?[{name:'✉️ DM bildirimi',value:result.dm==='sent'?'Gönderildi.':result.dm==='bot'?'Bot hesaplarına DM gönderilmez.':'Gönderilemedi; kullanıcı DM kabul etmiyor olabilir. Yasaklama tamamlandı.'}]:[])];
  await i.editReply({embeds:[brightEmbed(action==='ban'?'🔨 Üye yasaklandı':'🥾 Üye sunucudan çıkarıldı','İşlem tamamlandı.',fields,theme.green)],allowedMentions:{parse:[]}});
 }catch(e:any){
  console.error('MODERATION_ACTION_FAILED',JSON.stringify({command:i.commandName,...discordErrorDetails(e)}));
  const text=e instanceof DomainError?e.message:e.code===50013?'Discord işlemi reddetti. Botun atma/yasaklama iznini ve güncel rol sırasını kontrol et.':e.code===10007?'Üye artık sunucuda değil.':'İşlem doğrulanamadı. Sunucunun denetim kaydından sonucu kontrol et.';
  await i.editReply({embeds:[brightEmbed('⚠️ İşlem tamamlanamadı',text,[],theme.red)],allowedMentions:{parse:[]}});
 }
 return true;
}
