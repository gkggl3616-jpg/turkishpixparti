import {ChannelType, Events, MessageFlags, PermissionFlagsBits, type Client, type Interaction} from 'discord.js';
import {addFeatureRecord, checkFeature, communitySettings, database, DomainError, finishGiveaway, getFeatureRecord, giveawayParticipants, inspectContent, manageGiveaway, participateFeature, publishGiveaway, requestRoleScan, roleAutomationSettings, saveRoleAutomation} from '@turkishpix/core';
import {config} from '../../../packages/core/src/config';
import {withGuildScope} from './guild-scope';
import {configureTagRole, runRoleJob, scanMembers} from './role-automation';

const snowflake = /^\d{17,20}$/;
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const prefix = 'server-giveaway:';
type Language = 'tr' | 'en';

const translations:Record<string,[string,string]> = {
 FORBIDDEN:['Bu işlem için yetkin yok.','You do not have permission to do this.'],
 ROLE_NOT_FOUND:['Rol bulunamadı. Tam adını veya ID’sini kontrol et.','Role not found. Check its exact name or ID.'],
 ROLE_AMBIGUOUS:['Bu adda birden fazla rol var. Rol ID’sini gir.','Multiple roles have this name. Enter the role ID.'],
 ROLE_HIERARCHY:['Botun rolünü hedef rolün üstüne taşı.','Move the bot role above the target role.'],
 ROLE_PERMISSION:['Rolleri yönetme iznini ve rol sırasını kontrol et.','Check Manage Roles permission and role hierarchy.'],
 ROLE_CONFLICT:['Tag için ayrı bir rol seç.','Select a separate role for the tag.'],
 TAG_SERVER:['Geçerli bir Discord sunucu ID’si gir.','Enter a valid Discord server ID.'],
 GIVEAWAY_CHANNEL:['Botun okuyup mesaj ve embed gönderebildiği bir metin kanalı seç.','Choose a text channel where the bot can read and send messages and embeds.'],
 FEATURE_NOT_FOUND:['Çekiliş bulunamadı.','Giveaway not found.'],
 FEATURE_CLOSED:['Çekiliş artık katılıma açık değil.','This giveaway is no longer open.'],
 FEATURE_CAP:['Açık çekiliş sınırına ulaştın.','You reached the open giveaway limit.'],
 GIVEAWAY_TAG:['Katılmak için istenen sunucu tagını Discord profilinde etkinleştir.','Enable the required server tag on your Discord profile to enter.'],
 GIVEAWAY_TAG_UNAVAILABLE:['Tag doğrulanamadı. Biraz sonra tekrar dene.','The tag could not be verified. Try again shortly.'],
 GIVEAWAY_NOT_DONE:['Önce çekilişi bitir.','End the giveaway before rerolling.'],
 GIVEAWAY_NO_ALTERNATIVE:['Önceki kazananlar dışında katılımcı yok.','There are no entrants besides the previous winners.'],
 INVALID_PRIZE:['Ödülü yaz.','Enter a prize.']
};

export async function handleServerEngagement(interaction:Interaction) {
 if(!interaction.inGuild()||!interaction.guild)return false;
 const button=interaction.isButton()&&interaction.customId.startsWith(prefix);
 const command=interaction.isChatInputCommand()&&['giveaway','tag-role'].includes(interaction.commandName);
 if(!button&&!command)return false;
 const i=interaction;
 if(!i.isButton()&&!i.isChatInputCommand())return false;
 const guild=interaction.guild;
 return withGuildScope(guild.id,async()=>{
  let language:Language=i.locale==='tr'?'tr':'en';
  if(i.isChatInputCommand()&&i.commandName==='giveaway'&&i.options.getSubcommand()==='start'){
   language=(i.options.getString('language') as Language|null)??(guild.preferredLocale==='tr'?'tr':'en');
  }
  if(i.isButton())language=i.customId.split(':')[1]==='tr'?'tr':'en';
  const t=(tr:string,en:string)=>language==='tr'?tr:en;
  const actor={id:i.user.id,username:i.user.username,avatar:i.user.avatar};
  const fail=(code:string):never=>{throw new DomainError(code,code);};
  await i.deferReply({flags:MessageFlags.Ephemeral});
  let minimum=0;
  try{
   if(i.isButton()){
    const [, ,id,action,page]=i.customId.split(':');
    if(!uuid.test(id))fail('FEATURE_NOT_FOUND');
    const record=await getFeatureRecord(id);
    if(record.kind!=='GIVEAWAY'||!record.payload.giveawayLanguage||(action==='join'&&record.message_id!==i.message.id)||record.channel_id!==i.channelId)fail('FEATURE_NOT_FOUND');
    if(action==='join'){
     minimum=record.payload.minimumMessages??0;
     await participateFeature(actor,id,i.id);
     await i.editReply(t('Çekilişe katıldın.','You entered the giveaway.'));
    }else if(action==='participants'){
     if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)&&record.owner_id!==i.user.id)fail('FORBIDDEN');
     const result=await giveawayParticipants(id,Number(page)||0);
     const move=(dir:number,label:string)=>({type:2 as const,style:2 as const,label,custom_id:prefix+language+':'+id+':participants:'+dir});
     const controls=[...(result.page>0?[move(result.page-1,t('Önceki','Previous'))]:[]),...(result.page+1<result.pages?[move(result.page+1,t('Sonraki','Next'))]:[])];
     await i.editReply({
      content:t('Katılımcılar','Participants')+' ('+result.total+') · '+(result.page+1)+'/'+result.pages+'\n'+(result.rows.map(row=>'<@'+row.user_id+'>').join('\n')||t('Henüz katılım yok.','No entries yet.')),
      components:controls.length?[{type:1,components:controls}]:[],
      allowedMentions:{parse:[]}
     });
    }
    return true;
   }
   const action=i.options.getSubcommand();
   if(i.commandName==='tag-role'){
    if(!i.memberPermissions?.has(PermissionFlagsBits.ManageRoles))fail('FORBIDDEN');
    if(action==='set'){
     const input=i.options.getString('role',true).trim();
     const tagGuildId=i.options.getString('tag-server-id')?.trim()??guild.id;
     if(!snowflake.test(tagGuildId))fail('TAG_SERVER');
     const roles=await guild.roles.fetch();
     const matches=roles.filter(role=>role.name===input);
     const id=roles.get(input)?.id??(matches.size===1?matches.first()?.id:null);
     if(!id)throw new DomainError(matches.size>1?'ROLE_AMBIGUOUS':'ROLE_NOT_FOUND',input);
     await configureTagRole(guild,await guild.members.fetch({user:i.user.id,force:true}),id,tagGuildId);
     await i.editReply({content:t('Tag rolü ayarlandı.','Tag role configured.')+' <@&'+id+'> · '+tagGuildId,allowedMentions:{parse:[]}});
    }else if(action==='disable'){
     await saveRoleAutomation(actor,{tagEnabled:false});
     await i.editReply(t('Tag rolü otomasyonu kapatıldı.','Tag role automation was disabled.'));
    }else{
     await requestRoleScan();
     await i.editReply(t('Üye taraması sıraya alındı.','Member scan queued.'));
    }
    return true;
   }
   if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))fail('FORBIDDEN');
   if(action==='start'){
    const channelId=i.options.getChannel('channel')?.id??i.channelId;
    const channel=channelId?await guild.channels.fetch(channelId):null;
    const permissions=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory];
    if(!channel||(channel.type!==ChannelType.GuildText&&channel.type!==ChannelType.GuildAnnouncement)||!channel.permissionsFor(await guild.members.fetchMe())?.has(permissions)||!channel.permissionsFor(await guild.members.fetch(i.user.id))?.has(PermissionFlagsBits.ViewChannel))throw new DomainError('GIVEAWAY_CHANNEL','GIVEAWAY_CHANNEL');
    const title=i.options.getString('prize',true).trim();
    if(!title)fail('INVALID_PRIZE');
    const settings=await communitySettings();
    checkFeature(settings.features,'cekilis',channel.id);
    if(inspectContent(title,settings.security.content))fail('CONTENT_RULE');
    const requireTag=i.options.getBoolean('require-tag');
    const requiredTagGuildId=requireTag?((await roleAutomationSettings()).tagGuildId??guild.id):undefined;
    const record=await addFeatureRecord(actor,'GIVEAWAY',title,{
     giveawayLanguage:language,winnerCount:i.options.getInteger('winners')??1,requiredTagGuildId,
     minimumMessages:i.options.getInteger('minimum-messages')??0
    },{channelId:channel.id,minutes:i.options.getInteger('minutes',true)},'server-giveaway:'+i.id);
    await publishGiveaway(record.id);
    await i.editReply(t('Çekiliş başlatıldı. Yönetim kodu','Giveaway started. Management ID')+' `'+record.id+'`');
   }else{
    const id=i.options.getString('id',true);
    if(!uuid.test(id))fail('FEATURE_NOT_FOUND');
    const record=await getFeatureRecord(id);
    if(record.kind!=='GIVEAWAY')fail('FEATURE_NOT_FOUND');
    if(record.payload.giveawayLanguage)language=record.payload.giveawayLanguage;
    await manageGiveaway(actor,id,action as 'end'|'cancel'|'reroll',true,i.id);
    await i.editReply(t('Çekiliş güncellendi.','Giveaway updated.'));
   }
  }catch(error){
   const code=error instanceof DomainError?error.code:'INTERNAL';
   const translated=translations[code];
   const message=code==='GIVEAWAY_MESSAGES'
    ? t('Katılmak için toplam en az '+minimum+' mesaj göndermelisin.','Send at least '+minimum+' total messages to enter.')
    : translated?t(...translated):t('İşlem tamamlanamadı. Ayarları ve izinleri kontrol edip tekrar dene.','Unable to complete the action. Check settings and permissions, then try again.');
   if(!translated&&code!=='GIVEAWAY_MESSAGES')console.error('SERVER_ENGAGEMENT_FAILED',code);
   await i.editReply(message);
  }
  return true;
 });
}

export function trackGiveawayMessages(client:Client){
 client.on(Events.MessageCreate,message=>{
  if(!message.guildId||message.author.bot||message.system||message.webhookId)return;
  void database().query(`INSERT INTO giveaway_chat_totals(guild_id,user_id,messages) VALUES($1,$2,1)
   ON CONFLICT(guild_id,user_id) DO UPDATE SET messages=giveaway_chat_totals.messages+1`,[message.guildId,message.author.id])
   .catch(()=>console.error('GIVEAWAY_MESSAGE_COUNT_FAILED'));
 });
}

export async function externalTagTick(client:Client,scan=false){
 const guildIds=client.guilds.cache.filter(g=>g.available&&g.id!==config().guildId).map(g=>g.id);
 if(!guildIds.length)return;
 const {rows}=await database().query("SELECT guild_id FROM role_automation_settings WHERE guild_id=ANY($1::text[]) AND settings->>'tagEnabled'='true'",[guildIds]);
 for(const {guild_id} of rows){
  try{await withGuildScope(guild_id,()=>scan?scanMembers(client):runRoleJob(client));}
  catch{console.error('EXTERNAL_TAG_PENDING',guild_id);}
 }
}

const retryAt=new Map<string,number>();
export async function serverGiveawayTick(client:Client){
 const guildIds=client.guilds.cache.filter(g=>g.available).map(g=>g.id);
 if(!guildIds.length)return;
 for(const [id,until] of retryAt)if(until<=Date.now())retryAt.delete(id);
 const waiting=[...retryAt.keys()];
 const {rows}=await database().query(`SELECT r.*,u.username FROM feature_records r JOIN users u ON u.id=r.owner_id
  WHERE r.guild_id=ANY($1::text[]) AND r.kind='GIVEAWAY' AND r.payload ? 'giveawayLanguage' AND r.id<>ALL($2::uuid[])
  AND ((r.status='OPEN' AND r.due_at<=now()) OR (r.payload->>'discordMessageMissing' IS DISTINCT FROM 'true'
   AND (r.message_id IS NULL OR r.discord_updated_at IS NULL OR r.discord_updated_at<r.updated_at)))
  ORDER BY r.updated_at LIMIT 10`,[guildIds,waiting]);
 for(const r of rows){
  try{
   await withGuildScope(r.guild_id,async()=>{
    if(r.status==='OPEN'&&new Date(r.due_at).getTime()<=Date.now())await finishGiveaway({id:r.owner_id,username:r.username},r.id,true,'due:'+r.id);
    await publishGiveaway(r.id);
   });
   retryAt.delete(r.id);
  }catch{
   retryAt.set(r.id,Date.now()+60_000);
   console.error('SERVER_GIVEAWAY_PENDING',r.id);
  }
 }
}
