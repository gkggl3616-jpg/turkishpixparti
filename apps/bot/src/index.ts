import 'dotenv/config';
import {Client,GatewayIntentBits,Events,MessageFlags} from 'discord.js';
import {config,readiness,checkActor,castVote,workerTick,closeDatabase,DomainError,database,loadServerSettings,discordRequest} from '@turkishpix/core';
import {commandReply,commands} from '../../../packages/core/src/commands';
const initial=config();
if(!process.env.DATABASE_URL||!initial.botToken||initial.demo){console.error('Bot token ve veritabanı gerekli; demo modu kapalı olmalı.');process.exit(1);}
await loadServerSettings();
const client=new Client({intents:[GatewayIntentBits.Guilds]});
let registeredGuild='';
async function heartbeat(connected=client.isReady()){
 await database().query("INSERT INTO integration_status(name,status) VALUES('discord',$1) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",[{connected,botId:client.user?.id||null,botName:client.user?.username||null,guilds:[...client.guilds.cache.keys()]}]);
}
async function register(){const c=config();if(c.guildId&&client.guilds.cache.has(c.guildId)&&registeredGuild!==c.guildId){await discordRequest(`/applications/${c.clientId}/guilds/${c.guildId}/commands`,{method:'PUT',body:JSON.stringify(commands.map(({contexts,integration_types,...cmd})=>cmd))});registeredGuild=c.guildId;console.log('TurkishPix slash komutları kaydedildi.');}}
client.once(Events.ClientReady,()=>{console.log(`TurkishPix bot hazır: ${client.user?.tag}`);void heartbeat().catch(()=>{});});
client.on(Events.GuildCreate,()=>{registeredGuild='';});
client.on(Events.GuildDelete,()=>{registeredGuild='';});
client.on(Events.Error,()=>console.error('DISCORD_GATEWAY_ERROR'));
client.on(Events.InteractionCreate,async interaction=>{
 if(interaction.guildId!==config().guildId){if(interaction.isRepliable())await interaction.reply({content:'Bu bot TurkishPix sunucusuna bağlı.',flags:MessageFlags.Ephemeral});return;}
 if(interaction.isChatInputCommand()){await interaction.reply({...commandReply(interaction.commandName) as any,flags:MessageFlags.Ephemeral});return;}
 if(!interaction.isButton()&&!interaction.isStringSelectMenu())return;
 if(!/^(vote|elect):/.test(interaction.customId))return;
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 try{
  const actor={id:interaction.user.id,username:interaction.user.username,avatar:interaction.user.avatar};
  await checkActor(actor);const [,ballotId,option]=interaction.customId.split(':');
  const choice=interaction.isStringSelectMenu()?interaction.values[0]:option;
  const result=await castVote(actor,{ballotId,choice},interaction.id);await interaction.editReply({content:result.message});
 }catch(e){await interaction.editReply({content:e instanceof DomainError?e.message:'Oy kaydedilemedi. Biraz sonra tekrar deneyin.'});}
});
let stopped=false;
async function worker(){while(!stopped){try{await loadServerSettings();await heartbeat();if(client.isReady()){await register();if(readiness().ready&&client.guilds.cache.has(config().guildId))await workerTick();}}catch(e){console.error('Kuyruk kontrolü başarısız:',e instanceof DomainError?e.code:'INTERNAL');}await new Promise(r=>setTimeout(r,5000));}}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{stopped=true;await heartbeat(false).catch(()=>{});client.destroy();await closeDatabase();process.exit(0);});
try{await client.login(initial.botToken);void worker();}catch{console.error('Bot Discord bağlantısını kuramadı. Token ve Gateway bağlantısını kontrol edin.');await closeDatabase();process.exit(1);}
