import {PermissionFlagsBits,OverwriteType,type Client} from 'discord.js';
import {applicationViolation,applicationIdentity,recordSecurity,database,config,type CommunitySettings} from '@turkishpix/core';
const processed=new Set<string>(),running=new Map<string,Promise<boolean>>(),bursts=new Map<string,number[]>(),lastTimeout=new Map<string,number>();
export async function protectApplicationMessage(message:any,settings:CommunitySettings,ownBotId:string,now=Date.now()):Promise<boolean>{
 const policy=settings.security.applications,reason=settings.security.enabled?applicationViolation(message,policy,ownBotId):null;if(!reason)return false;
 if(processed.has(message.id))return true;if(running.has(message.id))return running.get(message.id)!;
 const task=(async()=>{
  const identity=applicationIdentity(message,ownBotId),user=identity.user||(!message.author.bot&&!message.webhookId?message.author:null);
  let member=user?message.guild.members.cache.get(user.id):null;if(user&&!member)try{member=await message.guild.members.fetch(user.id);}catch{}
  let action='DELETE_PERMISSION_MISSING';if(message.deletable)try{await message.delete();action='MESSAGE_DELETED';}catch(e){action=(e as any)?.code===10008?'MESSAGE_DELETED':'DELETE_FAILED';}
  if(user){const key=message.guildId+':'+user.id,times=(bursts.get(key)||[]).filter(t=>now-t<policy.windowSeconds*1000);times.push(now);bursts.set(key,times);
   if(policy.timeoutMinutes&&times.length>=policy.timeoutAfter&&now-(lastTimeout.get(key)||0)>policy.windowSeconds*1000){
    if(member?.moderatable&&!config().owners.includes(user.id)){try{if(member.communicationDisabledUntilTimestamp&&member.communicationDisabledUntilTimestamp>now+policy.timeoutMinutes*60000)action+=' + ALREADY_TIMED_OUT';else{await member.timeout(policy.timeoutMinutes*60000,'TurkishPix: dış uygulama / yönlendirme spamı');action+=' + TIMEOUT';}lastTimeout.set(key,now);}catch{action+=' + TIMEOUT_FAILED';}}
    else action+=' + TIMEOUT_PERMISSION_MISSING';
   }
  }
  await recordSecurity(user?{id:user.id,username:user.username,avatar:user.avatar,roleIds:member?[...member.roles.cache.keys()].filter(id=>id!==message.guildId) as string[]:[]}:{id:'UNKNOWN_APPLICATION',username:'Tetikleyen üye bilgisi yok'},message.channelId,reason,action,settings,{messageId:message.id,content:message.content||'',source:reason==='USER_INSTALLED_APP'?'Hesaba kurulan uygulama':'Mesaj yönlendirme',appName:identity.appId?identity.appName:undefined,appId:identity.appId||undefined});
  processed.add(message.id);if(processed.size>4096)processed.delete(processed.values().next().value!);
  if(bursts.size>4096)for(const [k,v] of bursts)if(now-v.at(-1)!>300000){bursts.delete(k);lastTimeout.delete(k);}while(bursts.size>4096){const key=bursts.keys().next().value!;bursts.delete(key);lastTimeout.delete(key);}return true;
 })();running.set(message.id,task);try{return await task;}finally{running.delete(message.id);}
}
/** Back up just this permission bit so disabling the policy restores prior overwrites. */
export async function syncExternalApplicationPermissions(client:Client,settings:CommunitySettings){
 const guild=client.guilds.cache.get(config().guildId);if(!guild)return {state:'NO_GUILD',protected:0};
 const enabled=settings.security.enabled&&settings.security.applications.enabled&&settings.security.applications.blockUserInstalled&&settings.security.applications.nativeBlock;
 if(!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels))return {state:'PERMISSION_MISSING',protected:0};
 let changed=0,protectedCount=0,failed=0;
 if(!enabled){const backups=(await database().query('SELECT * FROM application_permission_backups WHERE guild_id=$1',[guild.id])).rows;
  for(const b of backups){const ch:any=guild.channels.cache.get(b.channel_id);if(!ch){await database().query('DELETE FROM application_permission_backups WHERE guild_id=$1 AND channel_id=$2',[guild.id,b.channel_id]);continue;}try{await ch.permissionOverwrites.edit(b.target_id,{UseExternalApps:b.original},{type:b.target_type,reason:'TurkishPix dış uygulama koruması: önceki izni geri yükle'});await database().query('DELETE FROM application_permission_backups WHERE guild_id=$1 AND channel_id=$2 AND target_id=$3',[guild.id,b.channel_id,b.target_id]);changed++;}catch{failed++;}if(changed>=20)break;}
  return {state:failed?'PARTIAL':backups.length>changed?'RESTORING':'OFF',protected:0,changed,failed};
 }
 for(const ch of guild.channels.cache.values()){
  if(!('permissionOverwrites' in ch)||ch.isThread()||!([0,5,15,16] as number[]).includes(ch.type))continue;
  const targets=[{id:guild.id,type:OverwriteType.Role},...ch.permissionOverwrites.cache.filter(o=>o.id!==guild.id&&o.allow.has(PermissionFlagsBits.UseExternalApps)&&!config().owners.includes(o.id)&&o.id!==guild.ownerId&&!(o.type===OverwriteType.Role&&guild.roles.cache.get(o.id)?.permissions.has(PermissionFlagsBits.Administrator))).map(o=>({id:o.id,type:o.type}))];
  let complete=true;
  for(const target of targets){const previous=ch.permissionOverwrites.cache.get(target.id);if(previous?.deny.has(PermissionFlagsBits.UseExternalApps))continue;
   if(changed>=20){complete=false;continue;}try{
    const original=previous?.allow.has(PermissionFlagsBits.UseExternalApps)?true:previous?.deny.has(PermissionFlagsBits.UseExternalApps)?false:null;
    await database().query('INSERT INTO application_permission_backups(guild_id,channel_id,target_id,target_type,original) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[guild.id,ch.id,target.id,target.type,original]);
    await ch.permissionOverwrites.edit(target.id,{UseExternalApps:false},{type:target.type,reason:'TurkishPix: hesaba kurulan dış uygulamaların herkese açık spamını engelle'});changed++;
   }catch{failed++;complete=false;}
  }
  if(complete)protectedCount++;
 }
 return {state:failed?'PARTIAL':changed>=20?'APPLYING':'ACTIVE',protected:protectedCount,changed,failed};
}
