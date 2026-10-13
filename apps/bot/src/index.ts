import {handleOwoInteraction,ingestOwoMessage,handleOwoMessageUpdate,owoTick,owoOcrTick} from './owo';
import {verifyOwoOcr} from './owo-ocr';
import {OSINT_VERSION} from '../../../packages/core/src/osint-releases';
import {osintCategories} from '../../../packages/core/src/osint-navigation';
import {queueWelcomeStaff,welcomeStaffTick,ensureWelcomeReady} from '../../../packages/core/src/welcome-staff';
import {probeOsintProviders,probeOsintHead} from '../../../packages/core/src/osint-admin';
import {purgeExpiredMailboxes} from '../../../packages/core/src/osint-mail';
import {CommandRegistrar} from './command-registration';
import {discordErrorDetails} from '../../../packages/core/src/discord';
import {retryPendingOsintDeliveries} from '../../../packages/core/src/osint-dm';
import {InviteTracker} from './invites';
import {handleOsintInteraction,refreshOsintPanels} from './osint';
import {reportYouTubeAudioReady} from './youtube-audio';
import {reportSoundCloudReady} from './soundcloud-audio';
import {BackgroundTasks} from './background';
import {safeInteraction} from './interaction-errors';
import {ticketTick,giveawayTick,eventMaintenance,supportState} from '@turkishpix/core';
import {handleUpdatesInteraction} from './updates';
import {handleControlInteraction} from './control-panel';
import {installDiscordAudit,discordAuditTick} from './discord-audit';
import {installRoleAutomation,roleAutomationTick,handleRoleAutomationInteraction} from './role-automation';
import {handleArcadeInteraction} from './arcade';
import {runCurrencyGrant} from './currency-grant';
import {createGuildRecovery} from './guild-recovery';
import {ensureVoiceRoomLobby,handleRoomVoiceJoin} from './rooms';
import {levelNotificationTick} from './levels';
import {reportYouTubeSearchReady} from './youtube';
import {renderCategoryBanner} from '../../../packages/core/src/cards';
import {handleExpansionInteraction,expansionMessage,expansionMemberJoin,expansionMemberLeave,expansionTick,voiceXPTick,expansionVoiceChange,syncLevelRoles,reportExpansionReady} from './expansion';
import {handleSupportInteraction} from './support';
import 'dotenv/config';
import {verifyAudioEncoding,verifyRadioSources} from './audio-diagnostics';
import {MusicManager} from './music';
import {generateDependencyReport} from '@discordjs/voice';
import {protectApplicationMessage,syncExternalApplicationPermissions} from './application-security';
import {handleFeatureInteraction,featureTick} from './features';
import {handleEntertainmentInteraction,entertainmentTick} from './entertainment';
import {moderateChat,nativeModerationExecution,moderationMaintenance} from './moderation';
import {handleModerationInteraction} from './moderation-actions';
import {handlePurgeInteraction} from './message-purge';
import {Client,GatewayIntentBits,Events,MessageFlags,PermissionFlagsBits,ActivityType,Partials,AuditLogEvent} from 'discord.js';
import {randomUUID} from 'node:crypto';
import {RELEASE_VERSION as version} from '../../../packages/core/src/config';
import {config,readiness,checkActor,castVote,workerTick,closeDatabase,DomainError,database,loadServerSettings,discordRequest,communitySettings,defaultCommunitySettings,communityDeliveryTick,queueWelcome,queueVoiceNotifications,setVoiceDMPreference,recordSecurity,MessageGuard,isGreeting,setAIEnabled,setDMSubscription,assistantAnswer,ticketTopics,entertainmentCommands,syncNativeModeration,awardChatXP,cleanupFeatures,brightEmbed,theme,repairLegacySecurityLogs} from '@turkishpix/core';
import {commandReply,commands,guildCommands,globalCommands} from '../../../packages/core/src/commands';
const initial=config();
if(!process.env.DATABASE_URL||!initial.botToken||initial.demo){console.error('Bot token ve veritabanı gerekli; demo modu kapalı olmalı.');process.exit(1);}
await loadServerSettings();
let appFlags=0;try{const app=await discordRequest('/applications/@me');appFlags=app.flags||0;console.log('DISCORD_APPLICATION_CONNECTION',JSON.stringify({applicationId:app.id,botId:app.bot?.id||null,identityMatches:app.id===initial.clientId,botPublic:app.bot_public,requiresCodeGrant:app.bot_require_code_grant,guildInstall:app.integration_types_config?Object.hasOwn(app.integration_types_config,'0'):null}));}catch{console.error('Uygulama izinleri doğrulanamadı; temel komutlarla devam ediliyor.');}
const enabledIntents={members:!!(appFlags&((1<<14)|(1<<15))),messageContent:!!(appFlags&((1<<18)|(1<<19))),voiceStates:true};
const client=new Client({partials:[Partials.Message,Partials.Channel,Partials.Reaction,Partials.User],intents:[GatewayIntentBits.AutoModerationExecution,GatewayIntentBits.GuildModeration,GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.GuildInvites,GatewayIntentBits.GuildMessageReactions,GatewayIntentBits.GuildVoiceStates,...(enabledIntents.members?[GatewayIntentBits.GuildMembers]:[]),...(enabledIntents.messageContent?[GatewayIntentBits.MessageContent]:[])]});
const recoverGuild=createGuildRecovery(client,()=>config().guildId);
installDiscordAudit(client);
installRoleAutomation(client);
const invites=new InviteTracker(client);invites.install();
const commandRegistrar=new CommandRegistrar();let osintPanelsReported=false,owoReported=false;
let registeredGuild='',settings=defaultCommunitySettings();const guard=new MessageGuard();const greetingTimes=new Map<string,number>();let joins:number[]=[],lastRaid=0;
const music=new MusicManager(client,settings);let applicationStatus:any=null;
let appliedPresence='',lastProtection='';let nativeStatus:any=null;
function applyPresence(){
 if(!client.isReady())return;
 const key=JSON.stringify(settings.presence);if(key===appliedPresence)return;
 const p=settings.presence,types={PLAYING:ActivityType.Playing,LISTENING:ActivityType.Listening,WATCHING:ActivityType.Watching,COMPETING:ActivityType.Competing};
 client.user.setPresence({status:p.status,activities:p.enabled?[{name:p.text,type:types[p.activityType]}]:[]});appliedPresence=key;
}
async function heartbeat(connected=client.isReady()){
 const guild=client.guilds.cache.get(config().guildId),bot=guild?.members.me;
 await database().query("INSERT INTO integration_status(name,status) VALUES('discord',$1) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",[{connected,version,configuredGuild:!!guild?.available,osintPanelsRegistered:commandRegistrar.hasGlobal('kur'),commandsRegistered:registeredGuild===config().guildId,registeredVersion:registeredGuild===config().guildId?version:null,botId:client.user?.id||null,botName:client.user?.username||null,guilds:[...client.guilds.cache.keys()],intents:enabledIntents,presence:appliedPresence?settings.presence:null,applicationProtection:applicationStatus,music:{enabled:settings.music.enabled,connect:!!bot?.permissions.has(PermissionFlagsBits.Connect),speak:!!bot?.permissions.has(PermissionFlagsBits.Speak)},protection:{enabled:settings.security.enabled&&settings.security.content.enabled,categories:Object.entries(settings.security.content.modes).filter(([,v])=>v!=='OFF').map(([k])=>k),edits:settings.security.content.checkEdits,native:nativeStatus},features:{enabled:settings.features.enabled,commands:50,totalCommands:commands.length,xp:settings.features.xpEnabled},permissions:{createInvite:!!bot?.permissions.has(PermissionFlagsBits.CreateInstantInvite),manageNicknames:!!bot?.permissions.has(PermissionFlagsBits.ManageNicknames),banMembers:!!bot?.permissions.has(PermissionFlagsBits.BanMembers),kickMembers:!!bot?.permissions.has(PermissionFlagsBits.KickMembers),moveMembers:!!bot?.permissions.has(PermissionFlagsBits.MoveMembers),manageChannels:bot?.permissions.has(PermissionFlagsBits.ManageChannels)||false,manageRoles:bot?.permissions.has(PermissionFlagsBits.ManageRoles)||false,embedLinks:bot?.permissions.has(PermissionFlagsBits.EmbedLinks)||false,manageGuild:bot?.permissions.has(PermissionFlagsBits.ManageGuild)||false,deleteMessages:bot?.permissions.has(PermissionFlagsBits.ManageMessages)||false,timeout:bot?.permissions.has(PermissionFlagsBits.ModerateMembers)||false}}]);
}
async function register(){const c=config();if(c.guildId&&client.guilds.cache.has(c.guildId)&&registeredGuild!==c.guildId){
 const result=await commandRegistrar.sync(c.clientId,c.guildId,globalCommands,guildCommands,saved=>{
  const ticket=saved.find((command:any)=>command.name==='bilet')?.options?.find((option:any)=>option.name==='ac')?.options;
  const support=saved.find((command:any)=>command.name==='destek')?.options;
  for(const options of [ticket,support])if(options?.length!==1||options[0]?.name!=='tur'||options[0]?.choices?.length!==ticketTopics.length||!ticketTopics.every(topic=>options[0].choices.some((choice:any)=>choice.value===topic.id&&choice.name===topic.label)))throw new DomainError('COMMAND_REGISTRATION_FAILED','Bilet kategorilerinin kaydı doğrulanamadı.');
 });
 if(commandRegistrar.hasGlobal('kur')&&!osintPanelsReported){osintPanelsReported=true;void refreshOsintPanels(client.user?.displayAvatarURL({size:256,extension:'png'})).then(result=>console.log('OSINT_PANEL_REFRESH',JSON.stringify(result))).catch(()=>console.error('OSINT_PANEL_REFRESH_FAILED'));console.log('OSINT_PANELS_READY',JSON.stringify({version:OSINT_VERSION,commands:osintCategories.map(c=>'kur '+c.command),categories:osintCategories.length,componentsV2:true,persistent:true,dmOnly:false,resultDelivery:'invoking-channel',privateInboxes:true,proxyCount:'10+5*level',ownerProxyCount:'unlimited'}));}
 if(commandRegistrar.hasGlobal('owo')&&!owoReported){owoReported=true;console.log('OWO_ANALYSIS_READY',JSON.stringify({command:'owo',role:'1557607714681786448',owners:true,commands:['kanal','tara','calistir'],continuous:true,readOnly:true,personal:true,catalog:197,empirical:true,manualScan:'oldest-or-date',automaticScanLimit:700,periodDays:3}));void verifyOwoOcr().then(status=>console.log('OWO_OCR_READY',JSON.stringify(status)));}
 if(result.error)console.error('COMMAND_REGISTRATION_DEFERRED',JSON.stringify({...discordErrorDetails(result.error),retryMs:result.retryMs}));
 if(!result.ready)return;
console.log('TICKET_CATEGORIES_READY',JSON.stringify({version,categories:ticketTopics.map(topic=>topic.label),subjectForm:false}));registeredGuild=c.guildId;try{const lobby=await ensureVoiceRoomLobby(client.guilds.cache.get(c.guildId));settings=await communitySettings();console.log('VOICE_ROOM_LOBBY_READY',JSON.stringify({version,...lobby,enabled:settings.expansion.enabled&&settings.expansion.rooms.enabled&&settings.expansion.rooms.joinToCreate}));}catch(e){console.error('VOICE_ROOM_LOBBY_PENDING',e instanceof DomainError?e.code:(e as any)?.code||'INTERNAL');}try{console.log('WELCOME_ROLES_READY',JSON.stringify({version,...await ensureWelcomeReady({id:client.user!.id,username:client.user!.username,avatar:client.user!.avatar})}));settings=await communitySettings();}catch(e){console.error('WELCOME_ROLES_PENDING',e instanceof DomainError?e.code:(e as any)?.code||'INTERNAL');}console.log('LEVEL_NOTIFICATIONS_READY',JSON.stringify({version,enabled:settings.features.levelUpEnabled,channel:settings.features.levelUpChannel?'selected':'xp-message-channel',photo:true,mention:true,persistent:true}));await reportExpansionReady();await reportYouTubeSearchReady(settings);try{await renderCategoryBanner('rank');console.log('RANK_CARD_READY',JSON.stringify({version,photo:true,public:true,rank:true,chatXP:settings.features.enabled&&settings.features.economy&&settings.features.xpEnabled,xpPerMessage:settings.features.xpPerMessage,cooldownSeconds:settings.features.xpCooldownSeconds,dailyCap:settings.features.xpDailyCap,attachFiles:!!client.guilds.cache.get(c.guildId)?.members.me?.permissions.has(PermissionFlagsBits.AttachFiles)}));}catch{console.error('RANK_CARD_RENDER_FAILED');}console.log(`TurkishPix ${commands.length} slash komutu kaydedildi (${entertainmentCommands.length} eğlence + 50 yeni topluluk özelliği).`);console.log('GIVEAWAY_STATE_READY',JSON.stringify(await supportState()));console.log('DISCORD_CONTROL_READY',JSON.stringify({version,command:'botpanel',native:true,componentsV2:true,audit:true,roleAutomation:true,reactionRoles:true,guildTagRoles:true,selfBotProtected:true}));console.log('MODERATION_COMMANDS_READY',JSON.stringify({version,commands:['kick','ban','sil'],messageFilter:true,protectedGiveaways:true,reasonOptional:true,banDM:true,freshPermissions:true}));console.log('UPDATES_COMMAND_READY',JSON.stringify({version,command:'guncellemeler',website:'/guncellemeler'}));console.log('PUBLIC_COMMAND_REPLIES_READY',JSON.stringify({version,help:'public',features:'public except personal records',music:'public',ai:'public'}));}}
client.on(Events.ClientReady,()=>{appliedPresence='';applyPresence();console.log(`TurkishPix bot hazır: ${client.user?.tag}`);console.log('VOICE_DEPENDENCIES',generateDependencyReport());void reportYouTubeAudioReady();void reportSoundCloudReady();void verifyAudioEncoding().then(result=>console.log('AUDIO_ENCODING_READY',JSON.stringify(result))).catch(()=>console.error('AUDIO_ENCODING_FAILED'));void verifyRadioSources().then(result=>console.log('RADIO_SOURCES_READY',JSON.stringify(result))).catch(()=>console.error('RADIO_SOURCES_FAILED'));const bot=client.guilds.cache.get(config().guildId)?.members.me;console.log('FEATURE_PERMISSIONS',JSON.stringify({createInvite:!!bot?.permissions.has(PermissionFlagsBits.CreateInstantInvite),manageNicknames:!!bot?.permissions.has(PermissionFlagsBits.ManageNicknames),banMembers:!!bot?.permissions.has(PermissionFlagsBits.BanMembers),kickMembers:!!bot?.permissions.has(PermissionFlagsBits.KickMembers),moveMembers:!!bot?.permissions.has(PermissionFlagsBits.MoveMembers),manageChannels:!!bot?.permissions.has(PermissionFlagsBits.ManageChannels),manageRoles:!!bot?.permissions.has(PermissionFlagsBits.ManageRoles),embedLinks:!!bot?.permissions.has(PermissionFlagsBits.EmbedLinks),connect:!!bot?.permissions.has(PermissionFlagsBits.Connect),speak:!!bot?.permissions.has(PermissionFlagsBits.Speak)}));void heartbeat().catch(()=>{});});
// Record only our bot's membership events. A Gateway outage is distinct from removal.
const membershipActions=new Set<number>([AuditLogEvent.BotAdd,AuditLogEvent.MemberKick,AuditLogEvent.MemberBanAdd,AuditLogEvent.MemberBanRemove]);
function membershipAudit(entry:{id:string;targetId:string|null;executorId:string|null;action:number;createdTimestamp:number},guildId:string){if(guildId===config().guildId&&entry.targetId===client.user?.id&&membershipActions.has(entry.action))console.log('BOT_MEMBERSHIP_AUDIT',JSON.stringify({guildId,botId:entry.targetId,action:AuditLogEvent[entry.action],executorId:entry.executorId,eventId:entry.id,occurredAt:new Date(entry.createdTimestamp).toISOString()}));}
client.on(Events.GuildCreate,guild=>{if(guild.id!==config().guildId)return;registeredGuild='';commandRegistrar.resetGuild();console.log('BOT_GUILD_JOINED',JSON.stringify({guildId:guild.id,botId:client.user?.id,available:guild.available,viewAuditLog:!!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)}));void heartbeat().catch(()=>{});if(guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog))void guild.fetchAuditLogs({limit:50}).then(logs=>{for(const entry of logs.entries.values())membershipAudit(entry,guild.id);}).catch(e=>console.error('BOT_MEMBERSHIP_AUDIT_PENDING',JSON.stringify({guildId:guild.id,code:typeof e?.code==='number'?e.code:'INTERNAL'})));});
client.on(Events.GuildDelete,guild=>{if(guild.id!==config().guildId)return;registeredGuild='';commandRegistrar.resetGuild();console.error('BOT_GUILD_REMOVED',JSON.stringify({guildId:guild.id,botId:client.user?.id,gatewayGuilds:client.guilds.cache.size}));void heartbeat().catch(()=>{});});
client.on(Events.GuildUnavailable,guild=>{if(guild.id===config().guildId)console.warn('BOT_GUILD_UNAVAILABLE',JSON.stringify({guildId:guild.id}));});
client.on(Events.GuildAuditLogEntryCreate,(entry,guild)=>membershipAudit(entry,guild.id));
client.on(Events.Error,()=>console.error('DISCORD_GATEWAY_ERROR'));
client.on(Events.InteractionCreate,interaction=>{void safeInteraction(interaction,async()=>{
 if(interaction.guildId!==config().guildId){if(interaction.isRepliable())await interaction.reply({content:'Bu bot TurkishPix sunucusuna bağlı.',flags:MessageFlags.Ephemeral});return;}
 if(await handleUpdatesInteraction(interaction))return;
 if(await handleRoleAutomationInteraction(interaction))return;
 if(await handleControlInteraction(interaction))return;
 if(await invites.handle(interaction))return;
 if(await handleModerationInteraction(interaction))return;
 if(await handlePurgeInteraction(interaction))return;
 if(await music.handle(interaction))return;
 if(await handleArcadeInteraction(interaction,settings))return;
 if(await handleExpansionInteraction(interaction,settings))return;
 if(await handleSupportInteraction(interaction,settings))return;
 if(await handleOwoInteraction(interaction))return;
 if(await handleOsintInteraction(interaction))return;
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
});});
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
 await queueWelcome({id:member.id,username:member.user.username,server:member.guild.name,count:member.guild.memberCount,joinedAt:member.joinedAt?.toISOString()||new Date().toISOString()},settings).catch(()=>console.error('WELCOME_QUEUE_PENDING'));
 await queueWelcomeStaff({id:member.id,username:member.user.username,server:member.guild.name,count:member.guild.memberCount,joinedAt:member.joinedAt?.toISOString()||new Date().toISOString()},settings).catch(()=>console.error('WELCOME_STAFF_QUEUE_PENDING'));
 try{
  await expansionMemberJoin(member,settings);
  if(!settings.security.enabled)return;
  const actor={id:member.id,username:member.user.username,avatar:member.user.avatar,roleIds:[...member.roles.cache.keys()].filter(id=>id!==member.guild.id)},now=Date.now();
  if(settings.security.minAccountDays>0&&now-member.user.createdTimestamp<settings.security.minAccountDays*86400000)await recordSecurity(actor,null,'NEW_ACCOUNT','ALERT_ONLY',settings);
  joins=joins.filter(t=>now-t<settings.security.raidWindowSeconds*1000);joins.push(now);
  if(joins.length>=settings.security.raidJoinCount&&now-lastRaid>settings.security.raidWindowSeconds*1000){lastRaid=now;await recordSecurity(actor,null,'JOIN_BURST','ALERT_ONLY',settings);}
 }catch{console.error('MEMBER_EVENT_FAILED');}
});
client.on(Events.GuildMemberRemove,member=>{if(member.guild.id===config().guildId&&!member.user.bot)void expansionMemberLeave(member,settings).catch(()=>console.error('FAREWELL_PENDING'));});
client.on(Events.GuildMemberUpdate,(oldMember,member)=>{if(member.guild.id===config().guildId&&oldMember.pending&&!member.pending)void expansionMemberJoin(member,settings).catch(()=>console.error('AUTOMATIC_ROLE_PENDING'));});
client.on(Events.MessageCreate,message=>{void ingestOwoMessage(message).catch(e=>console.error('OWO_MESSAGE_FAILED',e instanceof DomainError?e.code:'INTERNAL'));});
client.on(Events.MessageUpdate,async(_old,message)=>{if(message.guildId!==config().guildId)return;try{await handleOwoMessageUpdate(message);}catch(e){console.error('OWO_UPDATE_FAILED',e instanceof DomainError?e.code:'INTERNAL');}});
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
   await recordSecurity({id:message.author.id,username:message.author.username,avatar:message.author.avatar,roleIds:member?[...member.roles.cache.keys()].filter(id=>id!==message.guildId):[]},message.channelId,violation,action,settings,{messageId:message.id,content:message.content});return;
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
  if(violation){let action='DELETE_PERMISSION_MISSING';if(message.deletable)try{await message.delete();action='MESSAGE_DELETED';}catch{action='DELETE_FAILED';}await recordSecurity({id:message.author.id,username:message.author.username,avatar:message.author.avatar,roleIds:member?[...member.roles.cache.keys()].filter(id=>id!==message.guildId):[]},message.channelId,violation,action,settings,{messageId:message.id,content:message.content,source:'Düzenlenmiş mesaj'});}
 }catch{console.error('MESSAGE_EDIT_MODERATION_FAILED');}
});
client.on(Events.AutoModerationActionExecution,execution=>{void nativeModerationExecution(execution,settings,nativeStatus?.ruleId||'').catch(()=>console.error('NATIVE_MODERATION_RECORD_FAILED'));});
const background=new BackgroundTasks();let stopped=false,lastRefresh=0,logRepairDone=false;
async function worker(){while(!stopped){try{
 const configuredGuild=client.isReady()?await recoverGuild():null,now=Date.now();
 if(now-lastRefresh>=5000){await loadServerSettings();settings=await communitySettings();applyPresence();lastRefresh=now;await heartbeat();}
 if(client.isReady()&&configuredGuild){
  await register();
  background.run('native-moderation',30000,async()=>{const bot=client.guilds.cache.get(config().guildId)?.members.me;nativeStatus=await syncNativeModeration(settings.security.content,settings.security.enabled,!!bot?.permissions.has(PermissionFlagsBits.ManageGuild),client.user.id)||nativeStatus;const protection=JSON.stringify({enabled:settings.security.enabled&&settings.security.content.enabled,modes:settings.security.content.modes,edits:settings.security.content.checkEdits,normalize:settings.security.content.normalizeObfuscation,escalation:settings.security.content.escalation,messageContent:enabledIntents.messageContent,deleteMessages:!!bot?.permissions.has(PermissionFlagsBits.ManageMessages),timeout:!!bot?.permissions.has(PermissionFlagsBits.ModerateMembers),native:nativeStatus?.reason});if(protection!==lastProtection){console.log('CHAT_PROTECTION_STATUS',protection);lastProtection=protection;}});
  background.run('application-protection',30000,async()=>{applicationStatus=await syncExternalApplicationPermissions(client,settings);});
  background.run('currency',30000,()=>runCurrencyGrant(client.guilds.cache.get(config().guildId)));
  background.run('invite-baseline',30000,()=>invites.start());
  background.run('music',1000,()=>music.tick(settings));
  background.run('welcome-staff',1000,()=>welcomeStaffTick());
  background.run('osint-dm',30000,()=>retryPendingOsintDeliveries());
  background.run('osint-mail-expiry',300000,()=>purgeExpiredMailboxes());
  background.run('osint-provider-health',300000,()=>probeOsintProviders());
  background.run('osint-public-head',3600000,()=>probeOsintHead());
  background.run('owo-analysis',1000,()=>owoTick(client));
  background.run('owo-ocr',2000,()=>owoOcrTick(client));
  background.run('features',5000,()=>featureTick(client,settings,false));
  background.run('voice-xp',1000,()=>voiceXPTick(client,settings));
  background.run('rooms-voice',5000,()=>expansionTick(client,settings));
  background.run('level-notifications',5000,()=>levelNotificationTick(client,settings));
  background.run('tickets',15000,()=>ticketTick());
  background.run('giveaway-publish',5000,()=>giveawayTick());
  background.run('events',10000,()=>eventMaintenance(settings));
  background.run('audit',1000,()=>discordAuditTick(client));
  background.run('roles',1000,()=>roleAutomationTick(client));
  background.run('deliveries',1000,()=>communityDeliveryTick());
  background.run('entertainment',30000,()=>entertainmentTick());
  if(readiness().ready)background.run('political',5000,()=>workerTick());
  background.run('maintenance',3600000,async()=>{await moderationMaintenance(settings);await cleanupFeatures();});
  if(!logRepairDone)background.run('log-repair',30000,async()=>{const result=await repairLegacySecurityLogs(client.user.id,[settings.security.logChannel,config().logChannel]);logRepairDone=true;console.log('LOG_PRESENTATION_READY',JSON.stringify(result));});
 }
 }catch(e){console.error('WORKER_FAILED',JSON.stringify(discordErrorDetails(e)));}await new Promise(r=>setTimeout(r,1000));}}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopped)return;stopped=true;await background.stop();await music.shutdown().catch(()=>{});await heartbeat(false).catch(()=>{});client.destroy();await closeDatabase();process.exit(0);});
try{await client.login(initial.botToken);void worker();}catch{console.error('Bot Discord bağlantısını kuramadı. Token, intent izinleri ve Gateway bağlantısını kontrol edin.');await closeDatabase();process.exit(1);}
