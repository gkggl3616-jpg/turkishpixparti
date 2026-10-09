import {handleUpdatesInteraction} from './updates';
import {handleArcadeInteraction} from './arcade';
import {runCurrencyGrant} from './currency-grant';
import {createGuildRecovery} from './guild-recovery';
import {ensureVoiceRoomLobby,handleRoomVoiceJoin} from './rooms';
import {levelNotificationTick} from './levels';
import {reportYouTubeSearchReady} from './youtube';
import {renderCategoryBanner} from '../../../packages/core/src/cards';
import {handleExpansionInteraction,expansionMessage,expansionMemberJoin,expansionMemberLeave,expansionTick,expansionVoiceChange,syncLevelRoles,reportExpansionReady} from './expansion';
import {handleSupportInteraction} from './support';
import 'dotenv/config';
import {verifyAudioEncoding,verifyRadioSources} from './audio-diagnostics';
import {MusicManager} from './music';
import {generateDependencyReport} from '@discordjs/voice';
import {protectApplicationMessage,syncExternalApplicationPermissions} from './application-security';
import {handleFeatureInteraction,featureTick} from './features';
import {handleEntertainmentInteraction,entertainmentTick} from './entertainment';
import {moderateChat,nativeModerationExecution,moderationMaintenance} from './moderation';
import {Client,GatewayIntentBits,Events,MessageFlags,PermissionFlagsBits,ActivityType,Partials} from 'discord.js';
import {randomUUID} from 'node:crypto';
import {RELEASE_VERSION as version} from '../../../packages/core/src/config';
import {config,readiness,checkActor,castVote,workerTick,closeDatabase,DomainError,database,loadServerSettings,discordRequest,communitySettings,defaultCommunitySettings,communityDeliveryTick,queueWelcome,queueVoiceNotifications,setVoiceDMPreference,recordSecurity,MessageGuard,isGreeting,setAIEnabled,setDMSubscription,assistantAnswer,ticketTopics,entertainmentCommands,syncNativeModeration,awardChatXP,cleanupFeatures,brightEmbed,theme,repairLegacySecurityLogs} from '@turkishpix/core';
import {commandReply,commands} from '../../../packages/core/src/commands';
const initial=config();
if(!process.env.DATABASE_URL||!initial.botToken||initial.demo){console.error('Bot token ve veritabanı gerekli; demo modu kapalı olmalı.');process.exit(1);}
await loadServerSettings();
let appFlags=0;try{appFlags=(await discordRequest('/applications/@me')).flags||0;}catch{console.error('Uygulama izinleri doğrulanamadı; temel komutlarla devam ediliyor.');}
const enabledIntents={members:!!(appFlags&((1<<14)|(1<<15))),messageContent:!!(appFlags&((1<<18)|(1<<19))),voiceStates:true};
const client=new Client({partials:[Partials.Message,Partials.Channel],intents:[GatewayIntentBits.AutoModerationExecution,GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.GuildVoiceStates,...(enabledIntents.members?[GatewayIntentBits.GuildMembers]:[]),...(enabledIntents.messageContent?[GatewayIntentBits.MessageContent]:[])]});
const recoverGuild=createGuildRecovery(client,()=>config().guildId);
let registeredGuild='',settings=defaultCommunitySettings();const guard=new MessageGuard();const greetingTimes=new Map<string,number>();let joins:number[]=[],lastRaid=0;
const music=new MusicManager(client,settings);let applicationStatus:any=null,lastApplicationSync=0;
let appliedPresence='',lastProtection='';let nativeStatus:any=null;
function applyPresence(){
 if(!client.isReady())return;
 const key=JSON.stringify(settings.presence);if(key===appliedPresence)return;
 const p=settings.presence,types={PLAYING:ActivityType.Playing,LISTENING:ActivityType.Listening,WATCHING:ActivityType.Watching,COMPETING:ActivityType.Competing};
 client.user.setPresence({status:p.status,activities:p.enabled?[{name:p.text,type:types[p.activityType]}]:[]});appliedPresence=key;
}
async function heartbeat(connected=client.isReady()){
 const guild=client.guilds.cache.get(config().guildId),bot=guild?.members.me;
 await database().query("INSERT INTO integration_status(name,status) VALUES('discord',$1) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",[{connected,version,configuredGuild:!!guild?.available,commandsRegistered:registeredGuild===config().guildId,registeredVersion:registeredGuild===config().guildId?version:null,botId:client.user?.id||null,botName:client.user?.username||null,guilds:[...client.guilds.cache.keys()],intents:enabledIntents,presence:appliedPresence?settings.presence:null,applicationProtection:applicationStatus,music:{enabled:settings.music.enabled,connect:!!bot?.permissions.has(PermissionFlagsBits.Connect),speak:!!bot?.permissions.has(PermissionFlagsBits.Speak)},protection:{enabled:settings.security.enabled&&settings.security.content.enabled,categories:Object.entries(settings.security.content.modes).filter(([,v])=>v!=='OFF').map(([k])=>k),edits:settings.security.content.checkEdits,native:nativeStatus},features:{enabled:settings.features.enabled,commands:50,totalCommands:commands.length,xp:settings.features.xpEnabled},permissions:{createInvite:!!bot?.permissions.has(PermissionFlagsBits.CreateInstantInvite),manageNicknames:!!bot?.permissions.has(PermissionFlagsBits.ManageNicknames),banMembers:!!bot?.permissions.has(PermissionFlagsBits.BanMembers),kickMembers:!!bot?.permissions.has(PermissionFlagsBits.KickMembers),moveMembers:!!bot?.permissions.has(PermissionFlagsBits.MoveMembers),manageChannels:bot?.permissions.has(PermissionFlagsBits.ManageChannels)||false,manageRoles:bot?.permissions.has(PermissionFlagsBits.ManageRoles)||false,embedLinks:bot?.permissions.has(PermissionFlagsBits.EmbedLinks)||false,manageGuild:bot?.permissions.has(PermissionFlagsBits.ManageGuild)||false,deleteMessages:bot?.permissions.has(PermissionFlagsBits.ManageMessages)||false,timeout:bot?.permissions.has(PermissionFlagsBits.ModerateMembers)||false}}]);
}
async function register(){const c=config();if(c.guildId&&client.guilds.cache.has(c.guildId)&&registeredGuild!==c.guildId){const saved=await discordRequest(`/applications/${c.clientId}/guilds/${c.guildId}/commands`,{method:'PUT',body:JSON.stringify(commands.map(({contexts,integration_types,...cmd})=>cmd))});if(!Array.isArray(saved)||saved.length!==commands.length)throw new DomainError('COMMAND_REGISTRATION_FAILED','Komut kaydı doğrulanamadı.');const ticket=saved.find((command:any)=>command.name==='bilet')?.options?.find((option:any)=>option.name==='ac')?.options;const support=saved.find((command:any)=>command.name==='destek')?.options;for(const options of [ticket,support]){if(options?.length!==1||options[0]?.name!=='tur'||options[0]?.choices?.length!==ticketTopics.length||!ticketTopics.every(topic=>options[0].choices.some((choice:any)=>choice.value===topic.id&&choice.name===topic.label)))throw new DomainError('COMMAND_REGISTRATION_FAILED','Bilet kategorilerinin kaydı doğrulanamadı.');}console.log('TICKET_CATEGORIES_READY',JSON.stringify({version,categories:ticketTopics.map(topic=>topic.label),subjectForm:false}));registeredGuild=c.guildId;try{const lobby=await ensureVoiceRoomLobby(client.guilds.cache.get(c.guildId));settings=await communitySettings();console.log('VOICE_ROOM_LOBBY_READY',JSON.stringify({version,...lobby,enabled:settings.expansion.enabled&&settings.expansion.rooms.enabled&&settings.expansion.rooms.joinToCreate}));}catch(e){console.error('VOICE_ROOM_LOBBY_PENDING',e instanceof DomainError?e.code:(e as any)?.code||'INTERNAL');}console.log('LEVEL_NOTIFICATIONS_READY',JSON.stringify({version,enabled:settings.features.levelUpEnabled,channel:settings.features.levelUpChannel?'selected':'xp-message-channel',photo:true,mention:true,persistent:true}));await reportExpansionReady();await reportYouTubeSearchReady(settings);try{await renderCategoryBanner('rank');console.log('RANK_CARD_READY',JSON.stringify({version,photo:true,public:true,rank:true,chatXP:settings.features.enabled&&settings.features.economy&&settings.features.xpEnabled,xpPerMessage:settings.features.xpPerMessage,cooldownSeconds:settings.features.xpCooldownSeconds,dailyCap:settings.features.xpDailyCap,attachFiles:!!client.guilds.cache.get(c.guildId)?.members.me?.permissions.has(PermissionFlagsBits.AttachFiles)}));}catch{console.error('RANK_CARD_RENDER_FAILED');}console.log(`TurkishPix ${saved.length} slash komutu kaydedildi (${entertainmentCommands.length} eğlence + 50 yeni topluluk özelliği).`);console.log('UPDATES_COMMAND_READY',JSON.stringify({version,command:'guncellemeler',website:'/guncellemeler'}));console.log('PUBLIC_COMMAND_REPLIES_READY',JSON.stringify({version,help:'public',features:'public except personal records',music:'public',ai:'public'}));}}
client.on(Events.ClientReady,()=>{appliedPresence='';applyPresence();console.log(`TurkishPix bot hazır: ${client.user?.tag}`);console.log('VOICE_DEPENDENCIES',generateDependencyReport());void verifyAudioEncoding().then(result=>console.log('AUDIO_ENCODING_READY',JSON.stringify(result))).catch(()=>console.error('AUDIO_ENCODING_FAILED'));void verifyRadioSources().then(result=>console.log('RADIO_SOURCES_READY',JSON.stringify(result))).catch(()=>console.error('RADIO_SOURCES_FAILED'));const bot=client.guilds.cache.get(config().guildId)?.members.me;console.log('FEATURE_PERMISSIONS',JSON.stringify({createInvite:!!bot?.permissions.has(PermissionFlagsBits.CreateInstantInvite),manageNicknames:!!bot?.permissions.has(PermissionFlagsBits.ManageNicknames),banMembers:!!bot?.permissions.has(PermissionFlagsBits.BanMembers),kickMembers:!!bot?.permissions.has(PermissionFlagsBits.KickMembers),moveMembers:!!bot?.permissions.has(PermissionFlagsBits.MoveMembers),manageChannels:!!bot?.permissions.has(PermissionFlagsBits.ManageChannels),manageRoles:!!bot?.permissions.has(PermissionFlagsBits.ManageRoles),embedLinks:!!bot?.permissions.has(PermissionFlagsBits.EmbedLinks),connect:!!bot?.permissions.has(PermissionFlagsBits.Connect),speak:!!bot?.permissions.has(PermissionFlagsBits.Speak)}));void heartbeat().catch(()=>{});});
client.on(Events.GuildCreate,()=>{registeredGuild='';});client.on(Events.GuildDelete,()=>{registeredGuild='';});
client.on(Events.Error,()=>console.error('DISCORD_GATEWAY_ERROR'));
client.on(Events.InteractionCreate,async interaction=>{
 if(interaction.guildId!==config().guildId){if(interaction.isRepliable())await interaction.reply({content:'Bu bot TurkishPix sunucusuna bağlı.',flags:MessageFlags.Ephemeral});return;}
 if(await handleUpdatesInteraction(interaction))return;
 if(await music.handle(interaction))return;
 if(await handleArcadeInteraction(interaction,settings))return;
 if(await handleExpansionInteraction(interaction,settings))return;
 if(await handleSupportInteraction(interaction,settings))return;
 if(await handleFeatureInteraction(interaction,settings))return;
 if(await handleEntertainmentInteraction(interaction,settings.entertainment))return;
 if(interaction.isChatInputCommand()){
  const name=interaction.commandName,actor={id:interaction.user.id,username:interaction.user.username,avatar:interaction.user.avatar};
  if(['yapayzekaaktif','yapayzekakapat','duyurukatıl','duyuruayril','sesdmac','sesdmkapat','sor'].includes(name)){
   await interaction.deferReply(['sor','yapayzekaaktif','yapayzekakapat'].includes(name)?{}:{flags:MessageFlags.Ephemeral});
   try{settings=await communitySettings();let content:string;
    if(name==='yapayzekaaktif'||name==='yapayzekakapat'){content=(await setAIEnabled(actor,name==='yapayzekaaktif')).message;settings=await communitySettings();}
    else if(name==='duyurukatıl'||name==='duyuruayril'){if(name==='duyurukatıl'&&!settings.announcements.enabled)throw new DomainError('ANNOUNCEMENTS_DISABLED','DM duyuruları şu anda kapalı.');content=(await setDMSubscription(actor,name==='duyurukatıl')).message;}
    else if(name==='sesdmac'||name==='sesdmkapat')content=(await setVoiceDMPreference(actor,name==='sesdmac')).message;
    else{if(settings.ai.channelIds.length&&!settings.ai.channelIds.includes(interaction.channelId))throw new DomainError('AI_CHANNEL','Bu kanalda yapay zekâ açık değil.');content=(await assistantAnswer(actor.id,interaction.options.getString('soru',true),settings.ai)).text;}
    await interaction.editReply(name==='sor'?{content,allowedMentions:{parse:[]}}:{embeds:[brightEmbed('✨ Tercihin güncellendi',content,[],theme.purple)],allowedMentions:{parse:[]}});
   }catch(e){await interaction.editReply({content:e instanceof DomainError?e.message:'İşlem tamamlanamadı. Biraz sonra tekrar deneyin.',allowedMentions:{parse:[]}});}return;
  }
  await interaction.reply(commandReply(name) as any);return;
 }
 if(!interaction.isButton()&&!interaction.isStringSelectMenu())return;
 if(!/^(vote|elect):/.test(interaction.customId))return;
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 try{const actor={id:interaction.user.id,username:interaction.user.username,avatar:interaction.user.avatar};await checkActor(actor);const [,ballotId,option]=interaction.customId.split(':');const choice=interaction.isStringSelectMenu()?interaction.values[0]:option;const result=await castVote(actor,{ballotId,choice},interaction.id);await interaction.editReply({content:result.message});}
 catch(e){await interaction.editReply({content:e instanceof DomainError?e.message:'Oy kaydedilemedi. Biraz sonra tekrar deneyin.'});}
});
client.on(Events.VoiceStateUpdate,async(oldState,newState)=>{
 if(newState.guild.id===config().guildId)expansionVoiceChange(oldState,newState);
 if(newState.guild.id!==config().guildId||oldState.channelId===newState.channelId)return;
 try{
  const member=newState.member||oldState.member;if(!member||member.user.bot)return;
  if(await handleRoomVoiceJoin(oldState,newState,settings))return;
  await queueVoiceNotifications({id:member.id,username:member.user.username,server:newState.guild.name,oldChannelId:oldState.channelId,newChannelId:newState.channelId,oldChannelName:oldState.channel?.name||'Ses kanalı',newChannelName:newState.channel?.name||'Ses kanalı',eventId:randomUUID()},settings);
 }catch{console.error('VOICE_EVENT_FAILED');}
});
client.on(Events.GuildMemberAdd,async member=>{
 if(member.guild.id!==config().guildId||member.user.bot)return;
 try{
  await expansionMemberJoin(member,settings);
  await queueWelcome({id:member.id,username:member.user.username,server:member.guild.name,count:member.guild.memberCount,joinedAt:member.joinedAt?.toISOString()||new Date().toISOString()},settings);
  if(!settings.security.enabled)return;
  const actor={id:member.id,username:member.user.username,avatar:member.user.avatar,roleIds:[...member.roles.cache.keys()].filter(id=>id!==member.guild.id)},now=Date.now();
  if(settings.security.minAccountDays>0&&now-member.user.createdTimestamp<settings.security.minAccountDays*86400000)await recordSecurity(actor,null,'NEW_ACCOUNT','ALERT_ONLY',settings);
  joins=joins.filter(t=>now-t<settings.security.raidWindowSeconds*1000);joins.push(now);
  if(joins.length>=settings.security.raidJoinCount&&now-lastRaid>settings.security.raidWindowSeconds*1000){lastRaid=now;await recordSecurity(actor,null,'JOIN_BURST','ALERT_ONLY',settings);}
 }catch{console.error('MEMBER_EVENT_FAILED');}
});
client.on(Events.GuildMemberRemove,member=>{if(member.guild.id===config().guildId&&!member.user.bot)void expansionMemberLeave(member,settings).catch(()=>console.error('FAREWELL_PENDING'));});
client.on(Events.GuildMemberUpdate,(oldMember,member)=>{if(member.guild.id===config().guildId&&oldMember.pending&&!member.pending)void expansionMemberJoin(member,settings).catch(()=>console.error('AUTOMATIC_ROLE_PENDING'));});
client.on(Events.MessageCreate,async message=>{
 if(message.guildId!==config().guildId||!message.guild||message.system)return;
 try{
  if(await protectApplicationMessage(message,settings,client.user!.id))return;
  if(message.author.bot||message.webhookId)return;
  const member=message.member;const privileged=config().owners.includes(message.author.id)||message.author.id===message.guild.ownerId||!!member?.permissions.has(PermissionFlagsBits.Administrator)||!!member?.permissions.has(PermissionFlagsBits.ManageGuild);
  if(await moderateChat(message,settings,privileged))return;
  const violation=guard.evaluate({userId:message.author.id,channelId:message.channelId,content:message.content,mentions:message.mentions.users.size+message.mentions.roles.size+(message.mentions.everyone?settings.security.maxMentions:0),privileged,roles:member?[...member.roles.cache.keys()]:[]},settings.security);
  if(violation){let action='PERMISSION_MISSING';if(message.deletable){try{await message.delete();action='MESSAGE_DELETED';}catch{action='DELETE_FAILED';}}
   if(settings.security.timeoutMinutes&&member?.moderatable){try{await member.timeout(settings.security.timeoutMinutes*60000,'TurkishPix güvenlik: '+violation);action+=' + TIMEOUT';}catch{action+=' + TIMEOUT_FAILED';}}
   await recordSecurity({id:message.author.id,username:message.author.username,avatar:message.author.avatar,roleIds:member?[...member.roles.cache.keys()].filter(id=>id!==message.guildId):[]},message.channelId,violation,action,settings);return;
  }
  if(await expansionMessage(message,settings))return;
  const earned=await awardChatXP({id:message.author.id,username:message.author.username,avatar:message.author.avatar},message.content,settings.features,message.channelId).catch(()=>false);if(earned&&member)await syncLevelRoles(member,settings).catch(()=>console.error('LEVEL_ROLE_PENDING'));
  if(settings.welcome.greetingsEnabled&&(!settings.welcome.greetingChannelIds.length||settings.welcome.greetingChannelIds.includes(message.channelId))&&isGreeting(message.content)){
   const key=message.channelId+':'+message.author.id,now=Date.now();if(now-(greetingTimes.get(key)||0)>=60000){greetingTimes.set(key,now);if(greetingTimes.size>4096)greetingTimes.delete(greetingTimes.keys().next().value!);await message.reply({content:settings.welcome.replies[Math.floor(Math.random()*settings.welcome.replies.length)],allowedMentions:{parse:[],repliedUser:false}});}return;
  }
  if(!settings.ai.enabled||(settings.ai.channelIds.length&&!settings.ai.channelIds.includes(message.channelId)))return;
  const mentioned=!!client.user&&message.mentions.users.has(client.user.id);let previous:string|undefined;
  if(!mentioned&&message.reference?.messageId){try{const ref=await message.fetchReference();if(ref.author.id===client.user?.id)previous=ref.content||ref.embeds.map(e=>e.description||'').join('\n');}catch{}}
  if(!mentioned&&!previous)return;const text=message.content.replace(new RegExp('<@!?'+client.user!.id+'>','g'),'').trim();
  try{const answer=await assistantAnswer(message.author.id,text,settings.ai,previous);await message.reply({content:answer.text,allowedMentions:{parse:[],repliedUser:false}});}catch(e){await message.reply({content:e instanceof DomainError?e.message:'Yapay zekâ yanıtı şu anda alınamıyor.',allowedMentions:{parse:[],repliedUser:false}});}
 }catch{console.error('MESSAGE_EVENT_FAILED');}
});
client.on(Events.MessageUpdate,async(oldMessage,newMessage)=>{
 if(newMessage.guildId!==config().guildId)return;
 try{const message=newMessage.partial?await newMessage.fetch():newMessage;if(!message.guild||message.system)return;if(await protectApplicationMessage(message,settings,client.user!.id))return;if(message.author.bot||message.webhookId||(!oldMessage.partial&&oldMessage.content===message.content))return;
  const member=message.member,privileged=config().owners.includes(message.author.id)||message.author.id===message.guild.ownerId||!!member?.permissions.has(PermissionFlagsBits.Administrator)||!!member?.permissions.has(PermissionFlagsBits.ManageGuild);
  if(!settings.security.content.checkEdits)return;
  if(await moderateChat(message,settings,privileged,true))return;
  // Edited links and mass mentions are checked without counting the edit as another spam message.
  const violation=guard.evaluate({userId:message.author.id,channelId:message.channelId,content:message.content,mentions:message.mentions.users.size+message.mentions.roles.size+(message.mentions.everyone?settings.security.maxMentions:0),privileged,roles:member?[...member.roles.cache.keys()]:[]},{...settings.security,antiSpam:false});
  if(violation){let action='DELETE_PERMISSION_MISSING';if(message.deletable)try{await message.delete();action='MESSAGE_DELETED';}catch{action='DELETE_FAILED';}await recordSecurity({id:message.author.id,username:message.author.username,avatar:message.author.avatar,roleIds:member?[...member.roles.cache.keys()].filter(id=>id!==message.guildId):[]},message.channelId,violation,action,settings);}
 }catch{console.error('MESSAGE_EDIT_MODERATION_FAILED');}
});
client.on(Events.AutoModerationActionExecution,execution=>{void nativeModerationExecution(execution,settings,nativeStatus?.ruleId||'').catch(()=>console.error('NATIVE_MODERATION_RECORD_FAILED'));});
let stopped=false,lastRefresh=0,lastPolitical=0,lastEntertainment=0,lastModeration=0,lastFeatures=0,lastLogRepair=0,logRepairDone=false,logRepairRunning=false;
async function worker(){while(!stopped){try{
 const configuredGuild=client.isReady()?await recoverGuild():null;
 const now=Date.now();if(now-lastRefresh>=5000){await loadServerSettings();settings=await communitySettings();applyPresence();if(client.isReady()){const bot=client.guilds.cache.get(config().guildId)?.members.me;nativeStatus=await syncNativeModeration(settings.security.content,settings.security.enabled,!!bot?.permissions.has(PermissionFlagsBits.ManageGuild),client.user.id)||nativeStatus;const protection=JSON.stringify({enabled:settings.security.enabled&&settings.security.content.enabled,modes:settings.security.content.modes,edits:settings.security.content.checkEdits,normalize:settings.security.content.normalizeObfuscation,escalation:settings.security.content.escalation,messageContent:enabledIntents.messageContent,deleteMessages:!!bot?.permissions.has(PermissionFlagsBits.ManageMessages),timeout:!!bot?.permissions.has(PermissionFlagsBits.ModerateMembers),native:nativeStatus?.reason});if(protection!==lastProtection){console.log('CHAT_PROTECTION_STATUS',protection);lastProtection=protection;}}await heartbeat();lastRefresh=now;}
 if(client.isReady()&&configuredGuild){await register();void runCurrencyGrant(client.guilds.cache.get(config().guildId));if(now-lastApplicationSync>=30000){applicationStatus=await syncExternalApplicationPermissions(client,settings);lastApplicationSync=now;console.log('APPLICATION_PROTECTION_STATUS',JSON.stringify(applicationStatus));}await music.tick(settings);if(!logRepairDone&&!logRepairRunning&&now-lastLogRepair>=30000){lastLogRepair=now;logRepairRunning=true;void repairLegacySecurityLogs(client.user.id,[settings.security.logChannel,config().logChannel]).then(result=>{logRepairDone=true;console.log('LOG_PRESENTATION_READY',JSON.stringify(result));}).catch(e=>console.error('LOG_PRESENTATION_REPAIR_PENDING',e instanceof DomainError?e.message:(e as any)?.code||'INTERNAL')).finally(()=>{logRepairRunning=false;});}if(now-lastModeration>=3600000){await moderationMaintenance(settings);await cleanupFeatures();lastModeration=now;}if(now-lastFeatures>=5000){await featureTick(client,settings);await expansionTick(client,settings);await levelNotificationTick(client,settings);lastFeatures=now;}await communityDeliveryTick();if(now-lastEntertainment>=30000){await entertainmentTick();lastEntertainment=now;}if(now-lastPolitical>=5000&&readiness().ready){await workerTick();lastPolitical=now;}}
 }catch(e){console.error('Kuyruk kontrolü başarısız:',e instanceof DomainError?e.code:'INTERNAL');}await new Promise(r=>setTimeout(r,1000));}}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{stopped=true;await music.shutdown().catch(()=>{});await heartbeat(false).catch(()=>{});client.destroy();await closeDatabase();process.exit(0);});
try{await client.login(initial.botToken);void worker();}catch{console.error('Bot Discord bağlantısını kuramadı. Token, intent izinleri ve Gateway bağlantısını kontrol edin.');await closeDatabase();process.exit(1);}
