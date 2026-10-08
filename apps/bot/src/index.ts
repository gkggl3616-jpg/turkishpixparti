import 'dotenv/config';
import {handleEntertainmentInteraction,entertainmentTick} from './entertainment';
import {Client,GatewayIntentBits,Events,MessageFlags,PermissionFlagsBits,ActivityType} from 'discord.js';
import {randomUUID} from 'node:crypto';
import {config,readiness,checkActor,castVote,workerTick,closeDatabase,DomainError,database,loadServerSettings,discordRequest,communitySettings,defaultCommunitySettings,communityDeliveryTick,queueWelcome,queueVoiceNotifications,setVoiceDMPreference,recordSecurity,MessageGuard,isGreeting,setAIEnabled,setDMSubscription,assistantAnswer,entertainmentCommands} from '@turkishpix/core';
import {commandReply,commands} from '../../../packages/core/src/commands';
const initial=config();
if(!process.env.DATABASE_URL||!initial.botToken||initial.demo){console.error('Bot token ve veritabanı gerekli; demo modu kapalı olmalı.');process.exit(1);}
await loadServerSettings();
let appFlags=0;try{appFlags=(await discordRequest('/applications/@me')).flags||0;}catch{console.error('Uygulama izinleri doğrulanamadı; temel komutlarla devam ediliyor.');}
const enabledIntents={members:!!(appFlags&((1<<14)|(1<<15))),messageContent:!!(appFlags&((1<<18)|(1<<19))),voiceStates:true};
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.GuildVoiceStates,...(enabledIntents.members?[GatewayIntentBits.GuildMembers]:[]),...(enabledIntents.messageContent?[GatewayIntentBits.MessageContent]:[])]});
let registeredGuild='',settings=defaultCommunitySettings();const guard=new MessageGuard();const greetingTimes=new Map<string,number>();let joins:number[]=[],lastRaid=0;
let appliedPresence='';
function applyPresence(){
 if(!client.isReady())return;
 const key=JSON.stringify(settings.presence);if(key===appliedPresence)return;
 const p=settings.presence,types={PLAYING:ActivityType.Playing,LISTENING:ActivityType.Listening,WATCHING:ActivityType.Watching,COMPETING:ActivityType.Competing};
 client.user.setPresence({status:p.status,activities:p.enabled?[{name:p.text,type:types[p.activityType]}]:[]});appliedPresence=key;
}
async function heartbeat(connected=client.isReady()){
 const guild=client.guilds.cache.get(config().guildId),bot=guild?.members.me;
 await database().query("INSERT INTO integration_status(name,status) VALUES('discord',$1) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",[{connected,botId:client.user?.id||null,botName:client.user?.username||null,guilds:[...client.guilds.cache.keys()],intents:enabledIntents,presence:appliedPresence?settings.presence:null,permissions:{deleteMessages:bot?.permissions.has(PermissionFlagsBits.ManageMessages)||false,timeout:bot?.permissions.has(PermissionFlagsBits.ModerateMembers)||false}}]);
}
async function register(){const c=config();if(c.guildId&&client.guilds.cache.has(c.guildId)&&registeredGuild!==c.guildId){const saved=await discordRequest(`/applications/${c.clientId}/guilds/${c.guildId}/commands`,{method:'PUT',body:JSON.stringify(commands.map(({contexts,integration_types,...cmd})=>cmd))});if(!Array.isArray(saved)||saved.length!==commands.length)throw new DomainError('COMMAND_REGISTRATION_FAILED','Komut kaydı doğrulanamadı.');registeredGuild=c.guildId;console.log(`TurkishPix ${saved.length} slash komutu kaydedildi (${entertainmentCommands.length} yeni eğlence komutu).`);}}
client.on(Events.ClientReady,()=>{appliedPresence='';applyPresence();console.log(`TurkishPix bot hazır: ${client.user?.tag}`);void heartbeat().catch(()=>{});});
client.on(Events.GuildCreate,()=>{registeredGuild='';});client.on(Events.GuildDelete,()=>{registeredGuild='';});
client.on(Events.Error,()=>console.error('DISCORD_GATEWAY_ERROR'));
client.on(Events.InteractionCreate,async interaction=>{
 if(interaction.guildId!==config().guildId){if(interaction.isRepliable())await interaction.reply({content:'Bu bot TurkishPix sunucusuna bağlı.',flags:MessageFlags.Ephemeral});return;}
 if(await handleEntertainmentInteraction(interaction,settings.entertainment))return;
 if(interaction.isChatInputCommand()){
  const name=interaction.commandName,actor={id:interaction.user.id,username:interaction.user.username,avatar:interaction.user.avatar};
  if(['yapayzekaaktif','yapayzekakapat','duyurukatıl','duyuruayril','sesdmac','sesdmkapat','sor'].includes(name)){
   await interaction.deferReply({flags:MessageFlags.Ephemeral});
   try{settings=await communitySettings();let content:string;
    if(name==='yapayzekaaktif'||name==='yapayzekakapat'){content=(await setAIEnabled(actor,name==='yapayzekaaktif')).message;settings=await communitySettings();}
    else if(name==='duyurukatıl'||name==='duyuruayril'){if(name==='duyurukatıl'&&!settings.announcements.enabled)throw new DomainError('ANNOUNCEMENTS_DISABLED','DM duyuruları şu anda kapalı.');content=(await setDMSubscription(actor,name==='duyurukatıl')).message;}
    else if(name==='sesdmac'||name==='sesdmkapat')content=(await setVoiceDMPreference(actor,name==='sesdmac')).message;
    else{if(settings.ai.channelIds.length&&!settings.ai.channelIds.includes(interaction.channelId))throw new DomainError('AI_CHANNEL','Bu kanalda yapay zekâ açık değil.');content=(await assistantAnswer(actor.id,interaction.options.getString('soru',true),settings.ai)).text;}
    await interaction.editReply({content,allowedMentions:{parse:[]}});
   }catch(e){await interaction.editReply({content:e instanceof DomainError?e.message:'İşlem tamamlanamadı. Biraz sonra tekrar deneyin.',allowedMentions:{parse:[]}});}return;
  }
  await interaction.reply({...commandReply(name) as any,flags:MessageFlags.Ephemeral});return;
 }
 if(!interaction.isButton()&&!interaction.isStringSelectMenu())return;
 if(!/^(vote|elect):/.test(interaction.customId))return;
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 try{const actor={id:interaction.user.id,username:interaction.user.username,avatar:interaction.user.avatar};await checkActor(actor);const [,ballotId,option]=interaction.customId.split(':');const choice=interaction.isStringSelectMenu()?interaction.values[0]:option;const result=await castVote(actor,{ballotId,choice},interaction.id);await interaction.editReply({content:result.message});}
 catch(e){await interaction.editReply({content:e instanceof DomainError?e.message:'Oy kaydedilemedi. Biraz sonra tekrar deneyin.'});}
});
client.on(Events.VoiceStateUpdate,async(oldState,newState)=>{
 if(newState.guild.id!==config().guildId||oldState.channelId===newState.channelId)return;
 try{
  const member=newState.member||oldState.member;if(!member||member.user.bot)return;
  await queueVoiceNotifications({id:member.id,username:member.user.username,server:newState.guild.name,oldChannelId:oldState.channelId,newChannelId:newState.channelId,oldChannelName:oldState.channel?.name||'Ses kanalı',newChannelName:newState.channel?.name||'Ses kanalı',eventId:randomUUID()},settings);
 }catch{console.error('VOICE_EVENT_FAILED');}
});
client.on(Events.GuildMemberAdd,async member=>{
 if(member.guild.id!==config().guildId||member.user.bot)return;
 try{
  await queueWelcome({id:member.id,username:member.user.username,server:member.guild.name,count:member.guild.memberCount,joinedAt:member.joinedAt?.toISOString()||new Date().toISOString()},settings);
  if(!settings.security.enabled)return;
  const actor={id:member.id,username:member.user.username,avatar:member.user.avatar},now=Date.now();
  if(settings.security.minAccountDays>0&&now-member.user.createdTimestamp<settings.security.minAccountDays*86400000)await recordSecurity(actor,null,'NEW_ACCOUNT','ALERT_ONLY',settings);
  joins=joins.filter(t=>now-t<settings.security.raidWindowSeconds*1000);joins.push(now);
  if(joins.length>=settings.security.raidJoinCount&&now-lastRaid>settings.security.raidWindowSeconds*1000){lastRaid=now;await recordSecurity(actor,null,'JOIN_BURST','ALERT_ONLY',settings);}
 }catch{console.error('MEMBER_EVENT_FAILED');}
});
client.on(Events.MessageCreate,async message=>{
 if(message.guildId!==config().guildId||message.author.bot||message.webhookId||!message.guild||message.system)return;
 try{
  const member=message.member;const privileged=config().owners.includes(message.author.id)||message.author.id===message.guild.ownerId||!!member?.permissions.has(PermissionFlagsBits.Administrator)||!!member?.permissions.has(PermissionFlagsBits.ManageGuild);
  const violation=guard.evaluate({userId:message.author.id,channelId:message.channelId,content:message.content,mentions:message.mentions.users.size+message.mentions.roles.size+(message.mentions.everyone?settings.security.maxMentions:0),privileged,roles:member?[...member.roles.cache.keys()]:[]},settings.security);
  if(violation){let action='PERMISSION_MISSING';if(message.deletable){try{await message.delete();action='MESSAGE_DELETED';}catch{action='DELETE_FAILED';}}
   if(settings.security.timeoutMinutes&&member?.moderatable){try{await member.timeout(settings.security.timeoutMinutes*60000,'TurkishPix güvenlik: '+violation);action+=' + TIMEOUT';}catch{action+=' + TIMEOUT_FAILED';}}
   await recordSecurity({id:message.author.id,username:message.author.username,avatar:message.author.avatar},message.channelId,violation,action,settings);return;
  }
  if(settings.welcome.greetingsEnabled&&(!settings.welcome.greetingChannelIds.length||settings.welcome.greetingChannelIds.includes(message.channelId))&&isGreeting(message.content)){
   const key=message.channelId+':'+message.author.id,now=Date.now();if(now-(greetingTimes.get(key)||0)>=60000){greetingTimes.set(key,now);if(greetingTimes.size>4096)greetingTimes.delete(greetingTimes.keys().next().value!);await message.reply({content:settings.welcome.replies[Math.floor(Math.random()*settings.welcome.replies.length)],allowedMentions:{parse:[],repliedUser:false}});}return;
  }
  if(!settings.ai.enabled||(settings.ai.channelIds.length&&!settings.ai.channelIds.includes(message.channelId)))return;
  const mentioned=!!client.user&&message.mentions.users.has(client.user.id);let previous:string|undefined;
  if(!mentioned&&message.reference?.messageId){try{const ref=await message.fetchReference();if(ref.author.id===client.user?.id)previous=ref.content;}catch{}}
  if(!mentioned&&!previous)return;const text=message.content.replace(new RegExp('<@!?'+client.user!.id+'>','g'),'').trim();
  try{const answer=await assistantAnswer(message.author.id,text,settings.ai,previous);await message.reply({content:answer.text,allowedMentions:{parse:[],repliedUser:false}});}catch(e){await message.reply({content:e instanceof DomainError?e.message:'Yapay zekâ yanıtı şu anda alınamıyor.',allowedMentions:{parse:[],repliedUser:false}});}
 }catch{console.error('MESSAGE_EVENT_FAILED');}
});
let stopped=false,lastRefresh=0,lastPolitical=0,lastEntertainment=0;
async function worker(){while(!stopped){try{
 const now=Date.now();if(now-lastRefresh>=5000){await loadServerSettings();settings=await communitySettings();applyPresence();await heartbeat();lastRefresh=now;}
 if(client.isReady()&&client.guilds.cache.has(config().guildId)){await register();await communityDeliveryTick();if(now-lastEntertainment>=30000){await entertainmentTick();lastEntertainment=now;}if(now-lastPolitical>=5000&&readiness().ready){await workerTick();lastPolitical=now;}}
 }catch(e){console.error('Kuyruk kontrolü başarısız:',e instanceof DomainError?e.code:'INTERNAL');}await new Promise(r=>setTimeout(r,1000));}}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{stopped=true;await heartbeat(false).catch(()=>{});client.destroy();await closeDatabase();process.exit(0);});
try{await client.login(initial.botToken);void worker();}catch{console.error('Bot Discord bağlantısını kuramadı. Token, intent izinleri ve Gateway bağlantısını kontrol edin.');await closeDatabase();process.exit(1);}
