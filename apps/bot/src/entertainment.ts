import {MessageFlags,ModalBuilder,TextInputBuilder,TextInputStyle,ActionRowBuilder,PermissionFlagsBits,type Interaction} from 'discord.js';
import {brightEmbed,theme,userTag,roleTag,featureNames,config,DomainError,entertainmentCommands,entertainmentNames,entertainmentCategories,checkEntertainment,entertainmentRate,startEntertainment,playEntertainment,pollEntertainment,validateEntertainmentSession,getEntertainmentSession,attachEntertainmentMessage,entertainmentProfile,entertainmentLeaderboard,expireEntertainmentSessions,createGame,shuffle,rand,dailyValue,listItems,safeText,discordRequest,type EntertainmentSettings,type EntertainmentSession} from '@turkishpix/core';
import {handleHelpInteraction} from './help';
// A single bot replica serializes per-message edits; SQL row locks protect persisted state.
const sessionQueues=new Map<string,Promise<unknown>>();
async function sessionQueue<T>(id:string,work:()=>Promise<T>):Promise<T>{const previous=sessionQueues.get(id)||Promise.resolve();const next=previous.catch(()=>{}).then(work);sessionQueues.set(id,next);try{return await next;}finally{if(sessionQueues.get(id)===next)sessionQueues.delete(id);}}
const colors=theme;
function embed(title:string,description:string,fields:any[]=[],color=colors.purple){return {...brightEmbed(title,description,fields,color),description};}
const button=(id:string,label:string,style=2,disabled=false)=>({type:2,custom_id:id,label,style,disabled});
const row=(...components:any[])=>({type:1,components});
export function entertainmentView(session:EntertainmentSession,now=Date.now()){
 const s=session.state,done=session.status!=='ACTIVE'||s.phase==='DONE'||new Date(session.expires_at).getTime()<=now;
 const name=entertainmentCommands.find(x=>x.name===s.kind)?.name||s.kind,id=(action:string)=>`fun:${session.id}:${s.revision}:${action}`;
 let description=s.message,components:any[]=[],fields:any[]=[];
 if(s.kind==='anket'){
  const total=(s.counts as number[]).reduce((a,b)=>a+b,0);description=safeText(s.question)+`\n\n${done?'Anket kapandı.':'Her hesap bir kez oy kullanabilir.'} **${total} oy**`;
  fields=s.choices.map((choice:string,i:number)=>{const n=s.counts[i]||0,percent=total?Math.round(n/total*100):0;return {name:`${i+1}. ${safeText(choice)}`,value:`${'▰'.repeat(Math.round(percent/10))}${'▱'.repeat(10-Math.round(percent/10))} ${n} oy · %${percent}`,inline:false};});
  if(!done){components=[row(...s.choices.map((_:string,i:number)=>button(id(String(i)),String(i+1),1))),row(button(id('close'),'Anketi kapat',4))];description+=`\nBitiş: <t:${Math.floor(new Date(session.expires_at).getTime()/1000)}:R>`;}
 }else if(s.kind==='tas-kagit-makas'){if(!done)components=[row(...['🪨 Taş','📄 Kâğıt','✂️ Makas'].map((x,i)=>button(id(String(i)),x,1)))];}
 else if(s.kind==='sayi-tahmin'){if(s.guesses.length)fields=[{name:'Denenen sayılar',value:s.guesses.join(' · ')}];if(!done)components=[row(button(id('open'),'Sayı tahmin et',1))];}
 else if(s.kind==='kelime-tahmin'){
  const masked=done?s.answer:[...s.answer].map((x:string)=>s.letters.includes(x)?x:'＿').join(' ');fields=[{name:'Kelime',value:masked},{name:'İpucu',value:s.hint},{name:'Denemeler',value:s.letters.length?s.letters.join(' · '):'Henüz yok'}];if(!done)components=[row(button(id('open'),'Harf veya kelime gir',1))];
 }else if(s.kind==='xox'){components=[0,3,6].map(start=>row(...[start,start+1,start+2].map(i=>button(id(String(i)),s.board[i]==='X'?'❌':s.board[i]==='O'?'⭕':'·',s.board[i]==='X'?1:s.board[i]==='O'?4:2,done||!!s.board[i]))));description+=`\nSeviye: ${s.difficulty} · Sen ❌, bot ⭕.`;}
 else if(s.kind==='refleks'){if(!done)components=[row(button(id(s.phase==='READY'?'start':'hit'),s.phase==='READY'?'Hazırım':now>=s.targetAt?'Şimdi bas!':'Bekle…',s.phase==='READY'?1:now>=s.targetAt?3:2))];}
 else if(s.kind==='hafiza'&&s.phase==='MEMORIZE'){description='Bu diziyi aklında tut:\n\n'+s.sequence+'\n\nHazır olunca dizi gizlenecek.';components=[row(button(id('ready'),'Aklımda, devam et',1))];}
 else{
  if(s.question)fields.push({name:'Soru',value:s.question});if(!done){fields.push({name:'Seçenekler',value:s.choices.map((x:string,i:number)=>`${i+1}. ${x}`).join('\n')});components=[row(...s.choices.map((_:string,i:number)=>button(id(String(i)),String(i+1),1)))];}
 }
 if(s.kind!=='anket'){
  if(!done)components.push(row(button(id('cancel'),'Turu bitir',2)));
  if(done){if(s.result){description+=(s.result==='WIN'?'\n🏆 Kazandın!':s.result==='DRAW'?'\n🤝 Berabere.':'\nBir sonraki turda şansını dene.');description+=`\nBu tur: **${s.awarded||0} puan**. Günlük puan tavanı: 500.`;}else description='Oyun süresi doldu. Yeni bir tur başlatabilirsin.';}
  else description+='\n\n⏳ 5 dakika · Bu oyunu başlatan üye oynayabilir.';
 }
 return {embeds:[embed('/'+name,description,fields,s.result==='WIN'?colors.green:s.result==='LOSE'?colors.red:colors.purple)],components,allowedMentions:{parse:[]}};
}
const compliments=['Sohbete kattığın sıcaklık fark ediliyor.','Merakın ve düşüncelerin bu topluluğa değer katıyor.','Küçük bir iyiliğin bile birinin gününü güzelleştirebilir.','Kendin olman yeterli; bu sohbetin güzel bir parçasısın.','Birlikte güzel fikirler üretilecek bir arkadaşsın.','Bugün birine ilham verecek bir şey söyleyebilirsin.'];
const jokes=['Mecliste çay neden hiç soğumaz? Herkes sürekli sıcak bir konu açar. ☕','Takvim toplantıya geç kalmış. Günleri birbirine karıştırmış! 📅','Bilgisayar niye üşümüş? Pencereleri açık kalmış. 🪟','Kütüphanede en sessiz yarış hangisi? Sayfa çevirme yarışı. 📚','Zar toplantıya neden katılamamış? Hep başka bir yüze dönmüş. 🎲','Bir piksel diğerine ne demiş? Yan yana daha güzel görünüyoruz. 🎨'];
const puns=['Çaydanlık: Demleniyorum, o hâlde varım. ☕','Saatle tartışma; onun zamanı hep değerlidir. ⏰','Kitap kurdu bugün çok okumuş; sayfalara doymuş. 📖','Piksel piksel birikir, sonunda koca bir resim olur. 🖼️','Matematikçi arkadaşım çok pozitif; eksilerini de kabul ediyor. ➕','Toplantı kısa sürmüş: herkes aynı noktada buluşmuş. 📍'];
const motivation=['Bugün tek bir küçük adım at. Devamı o adımla kolaylaşır.','Her şeyi bir günde çözmek zorunda değilsin. Başlayabileceğin kısmı seç.','Dünkü deneme bugünkü deneyimindir. Yeniden denemek ilerlemenin parçasıdır.','Dinlenmek de çalışmanın bir parçası. Kendine alan tanı.','Mükemmel başlangıç bekleme. Küçük ve yapılabilir bir hedef seç.','Bir soruyu sormak, yeni bir şey öğrenmenin başlangıcıdır.','İlerlemeni başkalarının hızına göre ölçme. Kendi yolunda devam et.'];
const dailyQuotes=['Bir topluluğu güçlü yapan, birbirini dinleyen insanlardır.','Küçük iyilikler yan yana geldiğinde büyük bir değişim başlar.','Bir fikrin büyümesi için önce paylaşılması gerekir.','Ortak bir geleceğin ilk adımı, bugünkü saygılı sohbettir.','Merak, öğrenmenin kapısını her gün yeniden açar.','Birlikte üretilen bir fikir, tek başına kurulan hayalden ileri gider.','İyi bir soru, yeni bir yolun başlangıcıdır.'];
function parseId(customId:string){const match=/^fun:([0-9a-f-]{36}):(\d{1,5}):(open|guess|ready|start|hit|close|cancel|[0-8])$/.exec(customId);if(!match||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(match[1]))throw new DomainError('INVALID_COMPONENT','Bu oyun düğmesi geçerli değil.');return {id:match[1],revision:Number(match[2]),action:match[3]};}
export async function handleEntertainmentInteraction(interaction:Interaction,settings:EntertainmentSettings):Promise<boolean>{
 const slash=interaction.isChatInputCommand(),component=interaction.isButton()||interaction.isModalSubmit();
 if(await handleHelpInteraction(interaction))return true;
 const helpMenu=false,helpCommand=false;
 if(!helpMenu&&!helpCommand&&!(slash&&entertainmentNames.includes(interaction.commandName))&&!(component&&interaction.customId.startsWith('fun:')))return false;
 const actor={id:interaction.user.id,username:interaction.user.username,avatar:interaction.user.avatar},channelId=interaction.channelId!;
 try{
  if(component){
   const parsed=parseId(interaction.customId);
   if(interaction.isButton()&&parsed.action==='open'){
    const session=await validateEntertainmentSession(parsed.id,actor,channelId,parsed.revision,settings);
    const input=new TextInputBuilder().setCustomId('guess').setLabel(session.kind==='sayi-tahmin'?`1–${session.state.max} arasında bir sayı`:'Tek harf veya kelime').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(session.kind==='sayi-tahmin'?3:20);
    const modal=new ModalBuilder().setCustomId(`fun:${parsed.id}:${parsed.revision}:guess`).setTitle(session.kind==='sayi-tahmin'?'Sayı tahminin':'Kelime tahminin').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));await interaction.showModal(modal);return true;
   }
   const hasMessage=interaction.isButton()||interaction.isFromMessage();if(hasMessage)await interaction.deferUpdate();else await interaction.deferReply({flags:MessageFlags.Ephemeral});
   const next=await sessionQueue(parsed.id,async()=>{
    const current=await getEntertainmentSession(parsed.id);
    const updated=current?.kind==='anket'?await pollEntertainment(parsed.id,actor,channelId,parsed.revision,parsed.action,settings):await playEntertainment(parsed.id,actor,channelId,parsed.revision,parsed.action,interaction.isModalSubmit()?interaction.fields.getTextInputValue('guess'):'',settings);
    await interaction.editReply(entertainmentView(updated) as any);return updated;
   });
   if(next.kind==='refleks'&&next.state.phase==='WAIT'&&parsed.action==='start'){
    await new Promise(r=>setTimeout(r,Math.max(0,next.state.targetAt-Date.now())));await sessionQueue(next.id,async()=>{const active=await getEntertainmentSession(next.id);if(active?.status==='ACTIVE'&&active.state.revision===next.state.revision)await interaction.editReply(entertainmentView(active) as any);});
   }return true;
  }
  if(!slash)return false;
  const name=interaction.commandName,isGame=entertainmentCommands.find(x=>x.name===name)?.category==='oyun';
  await interaction.deferReply({});checkEntertainment(settings,name,channelId);
  if(interaction.appPermissions&&!interaction.appPermissions.has(PermissionFlagsBits.EmbedLinks))throw new DomainError('EMBED_PERMISSION','Bu kanalda botun “Bağlantıları Yerleştir” iznini açın.');
  await entertainmentRate(actor,name,settings);
  if(isGame||name==='anket'){
   const state=name==='anket'?{kind:name,phase:'PLAY',revision:0,message:'',question:interaction.options.getString('soru',true),choices:listItems(interaction.options.getString('secenekler',true),2,5),counts:[]}:createGame(name,interaction.options.getString('zorluk')||'normal');
   if(name==='anket')state.counts=state.choices.map(()=>0);
   const session=await startEntertainment(actor,channelId,state,(name==='anket'?(interaction.options.getInteger('dakika')||10)*60:300));
   const message=await interaction.editReply(entertainmentView(session) as any);if(name==='anket')await attachEntertainmentMessage(session.id,message.id);return true;
  }
  const selected=interaction.options.getUser('uye')||interaction.user,display=safeText(selected.username);let title=name,description='',fields:any[]=[],image:string|undefined;
  const string=(key:string)=>interaction.options.getString(key,true),pick=(items:string[])=>items[rand(items.length)];
  if(name==='zar'){const count=interaction.options.getInteger('adet')||1,sides=interaction.options.getInteger('yuz')||6,values=Array.from({length:count},()=>rand(sides)+1);title='🎲 Zar';description=`${count} × ${sides} yüzlü zar\n\n**${values.join(' · ')}**\nToplam: **${values.reduce((a,b)=>a+b,0)}**`;}
  else if(name==='yazitura'){const result=rand(2)?'yazi':'tura',guess=interaction.options.getString('tahmin');title='🪙 Yazı tura';description=`Sonuç: **${result==='yazi'?'Yazı':'Tura'}**`+(guess?`\n${guess===result?'Tahminin doğru!':'Bu kez tutmadı.'}`:'');}
  else if(name==='8top'){title='🎱 Sihirli 8 top';description=`${safeText(string('soru'))}\n\n**${pick(['İşaretler olumlu görünüyor.','Biraz daha düşünmek iyi olabilir.','Bugün şans senden yana.','Şimdilik belirsiz. Biraz zaman tanı.','Cesur bir deneme iyi bir başlangıç olabilir.','Yeni bir ihtimal var gibi görünüyor.','Bu sefer başka bir yol dene.','Önce bir çay molası ver!'])}**\n\nYalnızca eğlence amaçlıdır.`;}
  else if(name==='sans'){title='🍀 Günün şansı';description=`${safeText(actor.username)}, bugünkü eğlencelik şansın: **%${dailyValue(config().guildId+':'+actor.id)%101}**\nGünlük sonuç Türkiye saatiyle yenilenir; gerçek bir tahmin değildir.`;}
  else if(name==='uyum'){if(selected.id===actor.id||selected.bot)throw new DomainError('INVALID_PARTNER','Kendin veya bir bot yerine bir arkadaşını seç.');const key=[actor.id,selected.id].sort().join(':');title='🤝 Günün uyumu';description=`${userTag(actor.id)} & ${userTag(selected.id)}\n\nBugünkü eğlencelik uyum: **%${dailyValue(config().guildId+':pair:'+key)%101}**\nBu bir kişilik analizi değildir; birlikte gülmek için küçük bir oyun.`;}
  else if(name==='iltifat'){title='✨ Güzel bir söz';description=`${userTag(selected.id)}, ${pick(compliments)}`;}
  else if(name==='saka'){title='😄 Bir şaka';description=pick(jokes);}
  else if(name==='espri'){title='💬 Kelime oyunu';description=pick(puns);}
  else if(name==='motivasyon'){title='🌱 Küçük bir adım';description=pick(motivation);}
  else if(name==='gununsozu'){title='📜 Günün sözü';description=dailyQuotes[dailyValue('turkishpix:quote')%dailyQuotes.length]+'\n\nTurkishPix için yazılmış özgün söz.';}
  else if(name==='sec'){const options=listItems(string('secenekler'),2,10);title='🎯 Seçimim';description=`**${safeText(pick(options))}**\n${options.length} seçenek arasından rastgele seçildi.`;}
  else if(name==='karistir'){title='🔀 Karıştırılmış liste';description=shuffle(listItems(string('liste'),2,20)).map((x,i)=>`${i+1}. ${safeText(x)}`).join('\n');}
  else if(name==='takim'){const people=shuffle(listItems(string('kisiler'),2,30)),count=interaction.options.getInteger('adet',true);if(count>people.length)throw new DomainError('INVALID_TEAMS','Takım sayısı kişi sayısını aşamaz.');title='👥 Rastgele takımlar';description='Takımların kişi sayısı en fazla bir kişi farklıdır.';fields=[];for(let i=0;i<count;i++){const members=people.filter((_,j)=>j%count===i).map(safeText);let chunk='',part=1;for(const member of members){if(chunk.length+member.length+1>1000){fields.push({name:`Takım ${i+1}${part>1?' · devam':''}`,value:chunk,inline:true});chunk='';part++;}chunk+=(chunk?'\n':'')+member;}if(chunk)fields.push({name:`Takım ${i+1}${part>1?' · devam':''}`,value:chunk,inline:true});}}
  else if(name==='profil'){const p=await entertainmentProfile(selected.id);title='🏅 Oyuncu profili';description=userTag(selected.id); fields=[{name:'Puan',value:String(p.points),inline:true},{name:'Tamamlanan oyun',value:String(p.played),inline:true},{name:'Galibiyet',value:`${p.wins} · %${p.played?Math.round(p.wins/p.played*100):0}`,inline:true},{name:'En iyi refleks',value:p.best_reflex_ms===null?'Henüz yok':p.best_reflex_ms+' ms'}];description+='\nGalibiyet 20, beraberlik 5 puan. Günlük en fazla 500 puan; puanların parasal değeri yoktur.';}
  else if(name==='liderlik'){const leaders=await entertainmentLeaderboard();title='🏆 Sunucu liderlik tablosu';description=leaders.length?leaders.map((x,i)=>`**${i+1}.** ${userTag(x.user_id)} — **${x.points} puan** · ${x.wins} galibiyet`).join('\n'):'Henüz tamamlanmış oyun yok. /bilgi veya /xox ile ilk puanını kazan!';}
  else if(name==='avatar'){title=display+' · Avatar';description=`[Avatarı tam boy aç](${selected.displayAvatarURL({size:4096})})`;image=selected.displayAvatarURL({size:1024});}
  else if(name==='kullanici'){const member=await interaction.guild!.members.fetch(selected.id);title='👤 Üye bilgisi';description=userTag(selected.id); fields=[{name:'Hesap açılışı',value:`<t:${Math.floor(selected.createdTimestamp/1000)}:D>`,inline:true},{name:'Sunucuya katılış',value:member.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:D>`:'Bilgi yok',inline:true},{name:'Tür',value:selected.bot?'Bot':'Üye',inline:true},{name:'Roller',value:member.roles.cache.filter(r=>r.id!==interaction.guildId).map(r=>roleTag(r.id)).join(' · ').slice(0,1000)||'Ek rol yok'}];image=selected.displayAvatarURL({size:256});}
  else if(name==='sunucu'){const guild=interaction.guild!;title='🏛️ Sunucu bilgisi';description=safeText(guild.name);fields=[{name:'Üye',value:String(guild.memberCount),inline:true},{name:'Metin kanalı',value:String(guild.channels.cache.filter(c=>[0,5].includes(c.type)).size),inline:true},{name:'Ses & sahne kanalı',value:String(guild.channels.cache.filter(c=>[2,13].includes(c.type)).size),inline:true},{name:'Takviye',value:`${guild.premiumSubscriptionCount||0} · Seviye ${guild.premiumTier}`,inline:true},{name:'Kuruluş',value:`<t:${Math.floor(guild.createdTimestamp/1000)}:D>`,inline:true}];image=guild.iconURL({size:256})||undefined;}
  else if(name==='ping'){title='🏓 Bağlantı gecikmesi';description=`Gateway: **${interaction.client.ws.ping<0?'Ölçülüyor':interaction.client.ws.ping+' ms'}**\nKomut işleme: **${Date.now()-interaction.createdTimestamp} ms**\nİşleme süresi Discord, ağ ve veritabanı beklemelerini içerir.`;}
  const output=embed(title,description,fields);await interaction.editReply({embeds:[{...output,...(image?{image:{url:image}}:{})}],allowedMentions:{parse:[]}});return true;
 }catch(e){const content=e instanceof DomainError?e.message:'İşlem tamamlanamadı. Biraz sonra tekrar deneyin.';
  if(interaction.isRepliable()){if(interaction.deferred||interaction.replied){if(component||helpMenu)await interaction.followUp({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}}).catch(()=>{});else await interaction.editReply({content,embeds:[],components:[],allowedMentions:{parse:[]}}).catch(()=>{});}else await interaction.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}}).catch(()=>{});}if(!(e instanceof DomainError))console.error('ENTERTAINMENT_FAILED',e instanceof Error?e.name:'Unknown');return true;
 }
}
export async function entertainmentTick(){for(const session of await expireEntertainmentSessions()){try{await sessionQueue(session.id,async()=>{const latest=await getEntertainmentSession(session.id);if(!latest)return;const {allowedMentions,...view}=entertainmentView(latest);await discordRequest(`/channels/${session.channel_id}/messages/${session.message_id}`,{method:'PATCH',body:JSON.stringify({...view,allowed_mentions:{parse:[]}})});});}catch{console.error('POLL_EXPIRY_EDIT_FAILED');}}}
