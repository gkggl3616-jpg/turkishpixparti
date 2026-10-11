import {MessageFlags,PermissionFlagsBits} from 'discord.js';
import {config,database,DomainError,brightEmbed,theme,channelTag,userTag,recordDiscordAudit,discordErrorDetails} from '@turkishpix/core';
const ageLimit=14*24*60*60*1000;
/** Delete only fetched IDs, so newer messages arriving during the scan are never swept in. */
export async function purgeMessages(i:any,count:number,userId?:string,auditSummary=true){
 if(!Number.isInteger(count)||count<1||count>100)throw new DomainError('PURGE_COUNT','Mesaj sayısı 1–100 arasında olmalı.');
 const guild=i.guild,channel=i.channel;
 if(!guild||!channel?.messages?.fetch||typeof channel.bulkDelete!=='function')throw new DomainError('PURGE_CHANNEL','Bu komut sunucudaki bir yazı kanalında kullanılabilir.');
 const [actor,bot]=await Promise.all([guild.members.fetch({user:i.user.id,force:true}),guild.members.fetch({user:guild.client.user.id,force:true})]);
 if(!channel.permissionsFor(actor)?.has(PermissionFlagsBits.ManageMessages))throw new DomainError('FORBIDDEN','Bu kanalda Mesajları Yönet iznin olmalı.',403);
 if(!channel.permissionsFor(bot)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageMessages]))throw new DomainError('BOT_PERMISSION','Botun Kanalı Gör, Mesaj Geçmişini Oku ve Mesajları Yönet izinleri olmalı.',403);
 const protectedRows=(await database().query("SELECT message_id FROM feature_records WHERE guild_id=$1 AND channel_id=$2 AND kind='GIVEAWAY' AND status='OPEN' AND message_id IS NOT NULL",[config().guildId,channel.id])).rows;
 const protectedIds=new Set(protectedRows.map(r=>r.message_id)),ids:string[]=[],cutoff=Date.now()-ageLimit+60000;
 let before:string|undefined,scanned=0,protectedCount=0,old=0;
 for(let page=0;page<10&&ids.length<count;page++){
  const messages=await channel.messages.fetch({limit:100,...(before?{before}:{}),cache:false});
  const rows=[...messages.values()] as any[];if(!rows.length)break;
  rows.sort((a,b)=>a.createdTimestamp===b.createdTimestamp?(BigInt(a.id)>BigInt(b.id)?-1:1):b.createdTimestamp-a.createdTimestamp);
  for(const message of rows){
   scanned++;
   if(message.createdTimestamp<cutoff){old++;continue;}
   if(userId&&message.author?.id!==userId)continue;
   // Keep all interactive TurkishPix panels, including live giveaway buttons.
   if(message.pinned||protectedIds.has(message.id)||message.author?.id===guild.client.user.id&&message.components?.length){protectedCount++;continue;}
   ids.push(message.id);if(ids.length===count)break;
  }
  const last=rows[rows.length-1];if(rows.length<100||last.createdTimestamp<cutoff||before===last.id)break;before=last.id;
 }
 let deleted=0;
 try{if(ids.length){const result=await channel.bulkDelete(ids,true);deleted=result.size;}}
 catch(e:any){console.error('MESSAGE_PURGE_DELETE_FAILED',JSON.stringify(discordErrorDetails(e)));throw new DomainError('PURGE_DELETE_FAILED','Silme sonucu doğrulanamadı. Mesaj geçmişini kontrol et; bu işlem otomatik tekrar denenmedi.');}
 if(deleted&&auditSummary)await recordDiscordAudit({key:'message-purge:'+i.id,kind:'MESSAGE_PURGE',actorId:i.user.id,actorName:i.user.username,targetId:userId||null,channelId:channel.id,metadata:{reason:userId?'Kullanıcıya göre mesaj temizliği':'Kanal mesaj temizliği',action:deleted+' mesaj silindi',details:`İstenen: ${count} · Taranan: ${scanned} · Korunan: ${protectedCount}`}}).catch(()=>console.error('MESSAGE_PURGE_AUDIT_PENDING'));
 return {deleted,requested:count,scanned,protectedCount,old};
}
export async function handlePurgeInteraction(i:any){
 if(!i.isChatInputCommand()||i.commandName!=='sil')return false;
 await i.deferReply({flags:MessageFlags.Ephemeral});
 try{
  const user=i.options.getUser('uye'),result=await purgeMessages(i,i.options.getInteger('adet',true),user?.id);
  await i.editReply({embeds:[brightEmbed('🧹 Mesaj temizliği tamamlandı',`**${result.deleted} mesaj** silindi.\n*Yalnızca bu işlem için seçilen mesajlar temizlendi.*`,[
   {name:'💬 Kanal',value:channelTag(i.channelId),inline:true},{name:'🎯 Filtre',value:user?userTag(user.id):'Tüm kullanıcılar',inline:true},
   {name:'📊 Sonuç',value:`İstenen **${result.requested}** · Taranan **${result.scanned}** · Korunan **${result.protectedCount}**`},
   {name:'🛡️ Korunan mesajlar',value:'Sabitlenen mesajlar, aktif çekilişler ve etkileşimli bot panelleri korunur. 14 günden eski mesajlar toplu silinmez; en fazla son 1.000 mesaj taranır.'}
  ],theme.green)],allowedMentions:{parse:[]}});
 }catch(e:any){await i.editReply({embeds:[brightEmbed('⚠️ Mesaj temizliği yapılamadı',e instanceof DomainError?e.message:'Kanal geçmişi okunamadı. İzinleri kontrol edip yeniden dene.',[],theme.red)],allowedMentions:{parse:[]}});}
 return true;
}
