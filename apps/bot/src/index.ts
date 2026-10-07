import 'dotenv/config';
import {Client,GatewayIntentBits,Events,MessageFlags} from 'discord.js';
import {config,readiness,checkActor,castVote,workerTick,closeDatabase,DomainError} from '@turkishpix/core';
import {commandReply} from '../../../packages/core/src/commands';
const c=config();
if(!readiness().ready||c.demo){console.error('Eksik yapılandırma. npm run check:config çalıştırın.');process.exit(1);}
const client=new Client({intents:[GatewayIntentBits.Guilds]});
client.once(Events.ClientReady,()=>console.log(`TurkishPix bot hazır: ${client.user?.tag}`));
client.on(Events.InteractionCreate,async interaction=>{
 if(interaction.guildId!==c.guildId){if(interaction.isRepliable())await interaction.reply({content:'Bu bot TurkishPix sunucusuna bağlı.',flags:MessageFlags.Ephemeral});return;}
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
async function worker(){while(!stopped){try{await workerTick();}catch(e){console.error('Kuyruk kontrolü başarısız:',e instanceof DomainError?e.code:'INTERNAL');}await new Promise(r=>setTimeout(r,5000));}}
void worker();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{stopped=true;client.destroy();await closeDatabase();process.exit(0);});
await client.login(c.botToken);
