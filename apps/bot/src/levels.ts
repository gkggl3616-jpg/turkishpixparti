import {createHash} from 'node:crypto';
import {ChannelType,PermissionFlagsBits} from 'discord.js';
import {config,database,transaction,memberRank,levelInfo,brightEmbed,userTag,theme,type CommunitySettings} from '@turkishpix/core';
import {discordAvatarData,renderRankCard} from '../../../packages/core/src/cards';

export async function levelNotificationTick(client:any,settings:CommunitySettings){
 const guild=client.guilds.cache.get(config().guildId);if(!guild)return;
 const f=settings.features;
 if(!f.enabled||!f.economy||!f.xpEnabled||!f.levelUpEnabled){await database().query("UPDATE level_up_notifications SET status='CANCELLED' WHERE guild_id=$1 AND status IN ('PENDING','SENDING')",[guild.id]);return;}
 const jobs=await transaction(async tx=>{
  const rows=(await tx.query("SELECT * FROM level_up_notifications WHERE guild_id=$1 AND status IN ('PENDING','SENDING') AND next_attempt_at<=now() ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED",[guild.id])).rows;
  for(const row of rows)await tx.query("UPDATE level_up_notifications SET status='SENDING',attempts=attempts+1,next_attempt_at=now()+interval '60 seconds' WHERE id=$1",[row.id]);return rows;
 });
 for(const row of jobs){try{
  const channel=await guild.channels.fetch(row.channel_id),member=await guild.members.fetch(row.user_id);
  if(!channel||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type)||channel.guildId!==guild.id||!member||member.user.bot){await database().query("UPDATE level_up_notifications SET status='CANCELLED' WHERE id=$1",[row.id]);continue;}
  const permissions=channel.permissionsFor(guild.members.me);
  if(!permissions?.has(PermissionFlagsBits.ViewChannel|PermissionFlagsBits.SendMessages|PermissionFlagsBits.EmbedLinks))throw {code:50013};
  const profile=await memberRank(member.id),progress=levelInfo(row.xp),view:any={content:'🎉 '+userTag(member.id)+', **'+row.level+'. seviyeye** ulaştın!',embeds:[brightEmbed('✦ Seviye atladın!',row.level+' → '+(row.level+1)+' · Bir sonraki seviye için '+progress.remaining+' XP',[],theme.purple)],allowedMentions:{parse:[],users:[member.id],repliedUser:false},nonce:BigInt('0x'+createHash('sha256').update(row.id).digest('hex').slice(0,16)).toString(),enforceNonce:true};
  if(permissions.has(PermissionFlagsBits.AttachFiles)){
   const avatarData=await discordAvatarData(member.id,member.user.avatar);
   const image=await renderRankCard({username:member.user.username,displayName:member.displayName||member.user.username,guildName:guild.name,xp:row.xp,...progress,rank:profile.rank,rankedMembers:profile.rankedMembers,messages:profile.messages,voiceMinutes:profile.voice_minutes,avatarData});
   view.files=[{attachment:image,name:'turkishpix-seviye.png'}];view.embeds[0].image={url:'attachment://turkishpix-seviye.png'};
  }
  const message=await channel.send(view);await database().query("UPDATE level_up_notifications SET status='SENT',message_id=$2 WHERE id=$1",[row.id,message.id]);
 }catch(e){const code=Number((e as any)?.code)||0;await database().query("UPDATE level_up_notifications SET status=$2,next_attempt_at=now()+interval '5 minutes' WHERE id=$1",[row.id,[10003,10007,50001].includes(code)||row.attempts>=7?'CANCELLED':'PENDING']);console.error('LEVEL_NOTIFICATION_PENDING',code||'NETWORK');}}
}
