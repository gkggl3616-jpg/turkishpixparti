import {randomUUID} from 'node:crypto';
import {ChannelType,PermissionFlagsBits} from 'discord.js';
import {config,DomainError,database,transaction,communitySettings,communitySettingsSchema,featureMutation,audit,syncUser,displayText,RELEASE_VERSION,type CommunitySettings,type FeatureActor} from '@turkishpix/core';

async function channelOrMissing(guild:any,id:string){try{return await guild.channels.fetch(id);}catch(e){if((e as any).code===10003)return null;throw e;}}
function overwrites(channel:any){return channel?[...channel.permissionOverwrites.cache.values()].map((o:any)=>({id:o.id,type:o.type,allow:o.allow.bitfield,deny:o.deny.bitfield})):[];}

export async function createMemberRoom(member:any,settings:CommunitySettings,key:string,name?:string,lobby?:any){
 const guild=member.guild,s=settings.expansion.rooms,actor={id:member.id,username:member.user.username,avatar:member.user.avatar};
 if(!settings.expansion.enabled||!s.enabled)throw new DomainError('ROOM_DISABLED','Özel oda sistemi kapalı.',403);
 if(member.pending||member.user.bot)throw new DomainError('MEMBERSHIP_PENDING','Önce sunucu doğrulamasını tamamla.');
 if(!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels))throw new DomainError('BOT_PERMISSION','Botun Kanalları Yönet yetkisi gerekli.');
 let created:any;
 try{return await featureMutation(actor,key,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['rooms:'+guild.id]);
  const old=(await tx.query('SELECT channel_id FROM community_voice_rooms WHERE guild_id=$1 AND owner_id=$2',[guild.id,actor.id])).rows[0];
  if(old){const room=await channelOrMissing(guild,old.channel_id);if(room)return {id:room.id,existing:true};await tx.query('DELETE FROM community_voice_rooms WHERE guild_id=$1 AND owner_id=$2',[guild.id,actor.id]);}
  if((await tx.query('SELECT count(*)::int AS n FROM community_voice_rooms WHERE guild_id=$1',[guild.id])).rows[0].n>=s.maxRooms)throw new DomainError('ROOM_LIMIT','Sunucunun geçici oda sınırına ulaşıldı.');
  const parent=s.categoryId||lobby?.parentId,category=parent?await guild.channels.fetch(parent):null;
  if(parent&&category?.type!==ChannelType.GuildCategory)throw new DomainError('ROOM_CATEGORY','Oda kategorisini panelden yeniden seç.');
  const inherited=overwrites(lobby||category);
  created=await guild.channels.create({name:displayText(name||'🔊・'+(member.displayName||actor.username),60),type:ChannelType.GuildVoice,parent:category?.id||undefined,userLimit:s.defaultLimit,permissionOverwrites:[...inherited.filter(o=>o.id!==actor.id),{id:actor.id,type:1,allow:PermissionFlagsBits.ViewChannel|PermissionFlagsBits.Connect,deny:0n}],reason:'TurkishPix geçici oda · '+actor.username});
  await tx.query('INSERT INTO community_voice_rooms(guild_id,owner_id,channel_id,empty_since) VALUES($1,$2,$3,now())',[guild.id,actor.id,created.id]);await audit(tx,actor.id,'VOICE_ROOM_CREATED',created.id);
  return {id:created.id,existing:false};
 });}catch(e){if(created)await created.delete('Oda kaydı oluşturulamadı').catch(()=>{});throw e;}
}

export async function ensureVoiceRoomLobby(guild:any,options:{actor?:FeatureActor;categoryId?:string}={}){
 let created:any;
 try{return await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['room-lobby:'+guild.id]);
  const defaults=await communitySettings(),stored=(await tx.query('SELECT settings FROM community_settings WHERE guild_id=$1 FOR UPDATE',[guild.id])).rows[0];
  const settings=communitySettingsSchema.parse(stored?.settings||defaults),s=settings.expansion.rooms;
  if(!settings.expansion.enabled||!s.enabled||!s.joinToCreate&&!options.actor)return null;
  if(!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels|PermissionFlagsBits.MoveMembers))throw new DomainError('BOT_PERMISSION','Botun Kanalları Yönet ve Üyeleri Taşı izinleri gerekli.');
  if(s.createChannelId){const existing=await channelOrMissing(guild,s.createChannelId);if(existing?.type===ChannelType.GuildVoice&&!options.categoryId){if(options.actor&&!s.joinToCreate){s.joinToCreate=true;await tx.query('UPDATE community_settings SET settings=$2,updated_at=now() WHERE guild_id=$1',[guild.id,settings]);}return {id:existing.id,categoryId:existing.parentId||'',created:false};}if(!existing&&!options.actor)throw new DomainError('ROOM_LOBBY_MISSING','Oda oluştur kanalı silinmiş. /topluluk oda kur ile yeniden kur.');if(existing&&existing.type!==ChannelType.GuildVoice)throw new DomainError('ROOM_LOBBY','Seçilen kanal bir ses kanalı olmalı.');if(existing&&options.categoryId){if(existing.parentId!==options.categoryId)await existing.setParent(options.categoryId,{lockPermissions:true});s.categoryId=options.categoryId;s.joinToCreate=true;await tx.query('UPDATE community_settings SET settings=$2,updated_at=now() WHERE guild_id=$1',[guild.id,settings]);return {id:existing.id,categoryId:s.categoryId,created:false};}}
  const channels=await guild.channels.fetch(),requested=options.categoryId||s.categoryId;
  let category=requested?channels.get(requested):null;
  if(requested&&category?.type!==ChannelType.GuildCategory)throw new DomainError('ROOM_CATEGORY','Bu sunucudan bir ses kategorisi seç.');
  if(!requested){const counts=new Map<string,number>();for(const ch of channels.values())if(ch.type===ChannelType.GuildVoice&&ch.parentId)counts.set(ch.parentId,(counts.get(ch.parentId)||0)+1);category=[...channels.values()].filter((c:any)=>c.type===ChannelType.GuildCategory&&(!c.permissionsFor||c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ViewChannel|PermissionFlagsBits.ManageChannels))).sort((a:any,b:any)=>(counts.get(b.id)||0)-(counts.get(a.id)||0)||a.position-b.position)[0];}
  created=await guild.channels.create({name:'➕・Oda Oluştur',type:ChannelType.GuildVoice,parent:category?.id||undefined,userLimit:0,permissionOverwrites:overwrites(category),reason:'TurkishPix katılınca özel oda oluşturma'});
  s.createChannelId=created.id;s.categoryId=category?.id||'';s.joinToCreate=true;
  if(options.actor)await syncUser(tx,options.actor);
  await tx.query('INSERT INTO community_settings(guild_id,settings,updated_by) VALUES($1,$2,$3) ON CONFLICT(guild_id) DO UPDATE SET settings=EXCLUDED.settings,updated_by=COALESCE(EXCLUDED.updated_by,community_settings.updated_by),updated_at=now()',[guild.id,settings,options.actor?.id||null]);
  const auditActor=options.actor||{id:guild.members.me.id,username:guild.members.me.user?.username||'TurkishPix'};if(!options.actor)await syncUser(tx,auditActor);await audit(tx,auditActor.id,'VOICE_ROOM_LOBBY_CREATED',created.id,{categoryId:s.categoryId});
  return {id:created.id,categoryId:s.categoryId,created:true};
 });}catch(e){if(created)await created.delete('Oda oluşturma ayarı kaydedilemedi').catch(()=>{});throw e;}
}

const pending=new Set<string>(),retryAt=new Map<string,number>();
export async function handleRoomVoiceJoin(oldState:any,newState:any,settings:CommunitySettings){
 const s=settings.expansion.rooms,member=newState.member;
 if(!settings.expansion.enabled||!s.enabled||!s.joinToCreate||!s.createChannelId||oldState.channelId===newState.channelId||newState.channelId!==s.createChannelId||!member||member.user.bot||member.pending)return false;
 const key=newState.guild.id+':'+member.id;if(pending.has(key)||(retryAt.get(key)||0)>Date.now())return true;
 pending.add(key);
 try{
  if(!member.movable||!newState.guild.members.me?.permissions.has(PermissionFlagsBits.MoveMembers))throw new DomainError('BOT_PERMISSION','Bot üyeyi kendi odasına taşıyamıyor.');
  const lobby=newState.channel||await newState.guild.channels.fetch(s.createChannelId);
  const room=await createMemberRoom(member,settings,'voice-room:'+randomUUID(),undefined,lobby);
  if(member.voice.channelId===s.createChannelId)await member.voice.setChannel(room.id,'TurkishPix katılınca oluşturulan kendi odası');
  retryAt.delete(key);console.log('VOICE_ROOM_JOIN_READY',JSON.stringify({version:RELEASE_VERSION,reused:room.existing}));
 }catch(e){if(retryAt.size>=500)retryAt.delete(retryAt.keys().next().value!);retryAt.set(key,Date.now()+10000);console.error('VOICE_ROOM_JOIN_PENDING',e instanceof DomainError?e.code:(e as any)?.code||'INTERNAL');}
 finally{pending.delete(key);}return true;
}
