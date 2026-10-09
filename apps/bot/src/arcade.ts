import {randomUUID} from 'node:crypto';
import {MessageFlags,PermissionFlagsBits,type Interaction} from 'discord.js';
import {arcadeGames,isArcadeBoard,startDiscordArcade,playEntertainment,checkEntertainment,entertainmentRate,brightEmbed,config,theme,DomainError,mineCount,type CommunitySettings,type EntertainmentSession,type ArcadeBoard} from '@turkishpix/core';
const row=(...components:any[])=>({type:1,components});
const button=(custom_id:string,label:string,style=2,disabled=false)=>({type:2,custom_id,label,style,disabled});
const link=(game='')=>({type:2,style:5,label:'Oyun salonunu aç ↗',url:config().appUrl+'/oyunlar'+(game?'?oyun='+game:'')});
const queues=new Map<string,Promise<unknown>>();
async function queue(id:string,work:()=>Promise<void>){const previous=queues.get(id)||Promise.resolve(),next=previous.catch(()=>{}).then(work);queues.set(id,next);try{await next;}finally{if(queues.get(id)===next)queues.delete(id);}}
export function discordArcadeView(session:EntertainmentSession,now=Date.now()){
 const s=session.state,p=s.puzzle as ArcadeBoard,game=arcadeGames.find(g=>g.id===s.kind)!;
 const done=session.status!=='ACTIVE'||s.phase==='DONE'||new Date(session.expires_at).getTime()<=now,id=(action:string)=>`arcade:move:${session.id}:${s.revision}:${action}`;
 let description=done?(s.result==='WIN'?'🏆 Kazandın!':s.result==='DRAW'?'🤝 Berabere.':s.result==='LOSE'?'Bu tur sona erdi.':'Tur süresi doldu.'):'Bu turu onu başlatan üye oynayabilir.';
 const fields:any[]=[{name:'Skor',value:String(p.score),inline:true},{name:'Hamle',value:String(p.moves),inline:true},{name:'Tur ücreti',value:s.entryCost+' Bot TL',inline:true}],components:any[]=[];
 if(p.kind==='2048'){
  fields.push({name:'Işık taşları · hedef 2048',value:Array.from({length:4},(_,y)=>p.board.slice(y*4,y*4+4).map(v=>'`'+String(v||'·').padStart(4)+'`').join(' ')).join('\n')});
  if(!done)components.push(row(...[['left','← Sol'],['up','↑ Yukarı'],['down','↓ Aşağı'],['right','→ Sağ']].map(([action,label])=>button(id(action),label,1))));
 }else if(p.kind==='mines'){
  description+='\n4 × 4 alan · 4 mayın · İlk kare ve çevresi güvenli.\n'+(p.flagMode?'🚩 Bayrak modu açık.':'🔎 Kare açma modu açık.');
  for(let y=0;y<4;y++)components.push(row(...Array.from({length:4},(_,x)=>{const i=y*4+x,open=p.opened.includes(i),bomb=done&&p.bombs.includes(i);return button(id(String(i)),bomb?'💥':p.flags.includes(i)?'🚩':open?String(mineCount(p,i)||'✓'):String(i+1),bomb?4:open?3:2,done||open);}))); 
 }else{
  description+='\nSen 🟡 · Bot 🟣 · Dört taşı bağla.';
  fields.push({name:'①　②　③　④　⑤　⑥　⑦',value:Array.from({length:6},(_,y)=>p.board.slice(y*7,y*7+7).map(v=>v===1?'🟡':v===2?'🟣':'⚫').join('')).join('\n')});
  if(!done){components.push(row(...[0,1,2,3].map(i=>button(id(String(i)),String(i+1)+'. sütun',1,!!p.board[i]))));components.push(row(...[4,5,6].map(i=>button(id(String(i)),String(i+1)+'. sütun',1,!!p.board[i]))));}
 }
 if(!done){description+=`\nBitiş: <t:${Math.floor(new Date(session.expires_at).getTime()/1000)}:R>`;components.push(row(...(p.kind==='mines'?[button(id('flag'),p.flagMode?'Kare aç':'Bayrak koy',p.flagMode?3:2)]:[]),button(id('cancel'),'Turu bitir',4),link(s.kind)));}
 else{description+='\nYeni tur için `/topluluk oyun '+(s.kind==='mines'?'mayin':s.kind==='connect4'?'dortlu':'2048')+'` kullan.\nOyun skoru Bot TL kazandırmaz.';if(s.awarded)description+='\nOyuncu profiline **'+s.awarded+' puan** eklendi.';components.push(row(link(s.kind)));}
 return {embeds:[brightEmbed('🎮 '+game.name,description,fields,s.result==='WIN'?theme.green:theme.purple)],components,allowedMentions:{parse:[]}};
}
export async function handleArcadeInteraction(i:Interaction,settings:CommunitySettings):Promise<boolean>{
 const slash=i.isChatInputCommand()&&i.commandName==='topluluk'&&i.options.getSubcommandGroup(false)==='oyun';
 const component=i.isButton()&&i.customId.startsWith('arcade:');if(!slash&&!component)return false;
 const actor={id:i.user.id,username:i.user.username,avatar:i.user.avatar};
 try{
  if(!i.guildId||i.guildId!==config().guildId||!i.channelId)throw new DomainError('WRONG_GUILD','Bu oyunları TurkishPix sunucusunda kullan.');
  if(i.appPermissions&&!i.appPermissions.has(PermissionFlagsBits.EmbedLinks))throw new DomainError('BOT_PERMISSION','Botun bu kanalda Bağlantıları Yerleştir izni olmalı.');
  if(slash&&i.isChatInputCommand()){
   const sub=i.options.getSubcommand();
   if(sub==='salon'){const game=i.options.getString('oyun')||'',selected=arcadeGames.find(g=>g.id===game);await i.reply({embeds:[brightEmbed('🕹️ TurkishPix oyun salonu',selected?selected.description:'Dokuz oyun; telefonda ve bilgisayarda oyna. 2048, Mayın Tarlası ve Dörtlü Bağla Discord’da da oynanır.',[{name:'Nasıl oynanır?',value:'Tarayıcıda: aşağıdaki düğmeye bas. Ücretsiz dene veya Bot TL ile tur başlat.\nDiscord’da: `/topluluk oyun 2048` · `/topluluk oyun mayin` · `/topluluk oyun dortlu`.'}],theme.cyan)],components:[row(link(game))],allowedMentions:{parse:[]}});return true;}
   const game=sub==='2048'?'2048':sub==='mayin'?'mines':sub==='dortlu'?'connect4':'';if(!isArcadeBoard(game))throw new DomainError('UNKNOWN_GAME','Bir oyun seç.');
   checkEntertainment(settings.entertainment,game,i.channelId);await entertainmentRate(actor,game,settings.entertainment);const selected=arcadeGames.find(g=>g.id===game)!;
   await i.reply({embeds:[brightEmbed('🎮 '+selected.name,selected.description,[{name:'Tur ücreti',value:'**'+selected.cost+' Bot TL** · Başlat düğmesine basınca bir kez düşer. Turu bırakınca iade edilmez.'},{name:'Kontrol',value:'Discord mesajındaki düğmelerle oynarsın. Süre: 12 dakika. Skor Bot TL kazandırmaz.'}],theme.purple)],components:[row(button(`arcade:start:${actor.id}:${game}:${randomUUID()}`,selected.cost+' Bot TL ile başlat',1),link(game))],allowedMentions:{parse:[]}});return true;
  }
  if(!i.isButton())return false;
  const start=/^arcade:start:(\d{17,20}):(2048|mines|connect4):([0-9a-f-]{36})$/.exec(i.customId);
  if(start){if(start[1]!==actor.id)throw new DomainError('GAME_OWNER','Bu turu yalnız komutu yazan üye başlatabilir.');const game=start[2];if(!isArcadeBoard(game))throw new DomainError('UNKNOWN_GAME','Oyun bulunamadı.');await i.deferUpdate();await queue(start[3],async()=>{const {session}=await startDiscordArcade(actor,i.channelId!,game,start[3]);await i.editReply(discordArcadeView(session) as any);});return true;}
  const move=/^arcade:move:([0-9a-f-]{36}):(\d{1,5}):(left|right|up|down|flag|cancel|\d{1,2})$/.exec(i.customId);if(!move)throw new DomainError('INVALID_COMPONENT','Oyun düğmesi geçersiz.');
  await i.deferUpdate();await queue(move[1],async()=>{const session=await playEntertainment(move[1],actor,i.channelId!,Number(move[2]),move[3],'',settings.entertainment);await i.editReply(discordArcadeView(session) as any);});return true;
 }catch(e){const content=e instanceof DomainError?e.message:'Oyun açılamadı. Biraz sonra tekrar dene.';if(i.isRepliable()){if(i.deferred||i.replied)await i.followUp({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}}).catch(()=>{});else await i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}}).catch(()=>{});}if(!(e instanceof DomainError))console.error('ARCADE_INTERACTION_FAILED',e instanceof Error?e.name:'Unknown');return true;}
}
