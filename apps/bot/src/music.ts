import {createAudioPlayer,createAudioResource,joinVoiceChannel,entersState,VoiceConnectionStatus,AudioPlayerStatus,NoSubscriberBehavior,StreamType,type VoiceConnection,type AudioResource} from '@discordjs/voice';
import {PermissionFlagsBits,MessageFlags,type Client,type Interaction} from 'discord.js';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {MusicQueue,radioStations,rateLimit,config,database,transaction,musicJobSchema,brightEmbed,theme,displayText,type CommunitySettings,type MusicTrack} from '@turkishpix/core';
import {audioURL,openAudio} from './audio-source';
type Payload={url?:string;title?:string;station?:string;index?:number;target?:number;volume?:number;mode?:'OFF'|'TRACK'|'QUEUE';seconds?:number};
export class MusicManager{
 readonly player=createAudioPlayer({behaviors:{noSubscriber:NoSubscriberBehavior.Pause}});queue:MusicQueue;connection:VoiceConnection|null=null;channelId:string|null=null;
 private ffmpeg:ChildProcessWithoutNullStreams|null=null;private input:IncomingMessage|null=null;private resource:AudioResource|null=null;private sequence=Promise.resolve();private jobRunning=false;private emptySince=0;private idleSince=Date.now();private offset=0;private lastPublish=0;private dirty=true;private failureCount=0;private limitTimer:ReturnType<typeof setTimeout>|null=null;lastError='';
 constructor(private client:Client,private settings:CommunitySettings){
  this.queue=new MusicQueue(settings.music);
  this.player.on(AudioPlayerStatus.Idle,(oldState:any)=>{const previous=oldState.resource;if(this.queue.current&&this.resource===previous)void this.serial(async()=>{if(this.resource===previous&&this.player.state.status===AudioPlayerStatus.Idle&&this.queue.current)await this.next(false);}).catch(()=>{this.lastError='Sıradaki parça açılamadı.';this.dirty=true;});});
  this.player.on('error',error=>{const failed=error.resource;if(this.resource!==failed)return;void this.serial(async()=>{if(this.resource!==failed)return;this.lastError='Parça oynatılamadı; sıradakine geçiliyor.';await this.next(true);}).catch(()=>{this.lastError='Ses oynatımı durdu.';});});
 }
 async serial<T>(work:()=>Promise<T>):Promise<T>{const next=this.sequence.catch(()=>{}).then(work);this.sequence=next.then(()=>{},()=>{});return next;}
 private guild(){const guild=this.client.guilds.cache.get(config().guildId);if(!guild)throw Error('Sunucu bağlantısı yok.');return guild;}
 private channel(){return this.channelId?this.guild().channels.cache.get(this.channelId):null;}
 listeners(){const ch:any=this.channel();return ch?.members?[...ch.members.values()].filter((m:any)=>!m.user.bot&&!m.voice.deaf).map((m:any)=>m.id) as string[]:[];}
 private cleanup(){if(this.limitTimer)clearTimeout(this.limitTimer);this.limitTimer=null;this.input?.destroy();this.input=null;this.ffmpeg?.kill('SIGKILL');this.ffmpeg=null;this.resource=null;}
 private leave(){this.queue.stop();this.cleanup();this.player.stop(true);this.connection?.destroy();this.connection=null;this.channelId=null;this.offset=0;this.emptySince=0;this.idleSince=Date.now();this.dirty=true;}
 private async join(channelId:string){
  const guild=this.guild(),ch=await guild.channels.fetch(channelId);if(!ch||ch.type!==2)throw Error('Normal bir ses kanalına katıl.');
  if(this.settings.music.channelIds.length&&!this.settings.music.channelIds.includes(channelId))throw Error('Bu ses kanalında müzik açık değil.');
  const perms=ch.permissionsFor(guild.members.me!);if(!perms?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]))throw Error('Botun bu kanalda Kanalı Gör, Bağlan ve Konuş izinleri olmalı.');
  if(ch.userLimit&&ch.members.size>=ch.userLimit&&!perms.has(PermissionFlagsBits.MoveMembers))throw Error('Ses kanalı dolu.');
  if(this.connection&&this.channelId===channelId&&this.connection.state.status===VoiceConnectionStatus.Ready)return;
  this.leave();this.channelId=channelId;this.connection=joinVoiceChannel({channelId,guildId:guild.id,adapterCreator:guild.voiceAdapterCreator,selfDeaf:true,selfMute:false});
  const connection=this.connection;connection.subscribe(this.player);this.dirty=true;
  connection.on(VoiceConnectionStatus.Disconnected,()=>{void Promise.race([entersState(connection,VoiceConnectionStatus.Signalling,5000),entersState(connection,VoiceConnectionStatus.Connecting,5000)]).catch(()=>this.serial(async()=>{if(this.connection===connection){this.lastError='Ses bağlantısı kesildi.';this.leave();}}));});
  try{await entersState(connection,VoiceConnectionStatus.Ready,20000);this.lastError='';this.idleSince=Date.now();}catch{this.leave();throw Error('Ses bağlantısı kurulamadı. Ses izinlerini ve bağlantıyı kontrol et.');}
 }
 private async start(seconds=0){
  const track=this.queue.current;if(!track)return;this.cleanup();this.offset=seconds;this.dirty=true;
  const input=await openAudio(track.url);this.input=input;
  const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0',...(seconds?['-ss',String(seconds)]:[]),'-t',String(Math.max(1,this.settings.music.maxTrackMinutes*60-seconds)),'-vn','-f','s16le','-ar','48000','-ac','2','pipe:1'],{stdio:['pipe','pipe','pipe']});this.ffmpeg=child;
  const resource=createAudioResource(child.stdout,{inputType:StreamType.Raw,inlineVolume:true,metadata:{trackId:track.id}});this.resource=resource;resource.volume?.setVolume(this.queue.volume/100);
  child.once('error',()=>{child.stdout.destroy(Error('Ses dönüştürücü başlatılamadı.'));});child.stdin.on('error',()=>{});child.stderr.resume();input.once('error',()=>child.stdout.destroy(Error('Ses kaynağı kesildi.')));input.pipe(child.stdin);
  this.player.play(resource);try{await entersState(this.player,AudioPlayerStatus.Playing,20000);}catch{this.cleanup();this.player.stop(true);throw Error('Ses dosyası çözümlenemedi veya kaynak yanıt vermedi.');}
  this.limitTimer=setTimeout(()=>{if(this.resource===resource)void this.serial(()=>this.next(true)).catch(()=>{this.lastError='Parça süre sınırında durdu.';this.dirty=true;});},this.settings.music.maxTrackMinutes*60000);this.limitTimer.unref();this.lastError='';this.idleSince=0;this.dirty=true;
 }
 private async next(skipped:boolean){
  this.cleanup();this.queue.advance(skipped);this.dirty=true;
  while(this.queue.current){try{await this.start();this.failureCount=0;return;}catch{this.lastError='Bir parça açılamadı; sıradakine geçiliyor.';this.failureCount++;this.queue.advance(true);if(this.failureCount>=5){this.queue.stop();break;}}}
  this.player.stop(true);this.idleSince=Date.now();this.dirty=true;
 }
 async execute(action:string,payload:Payload,actorId:string,channelId:string,remote=false){
  if(!this.settings.music.enabled)throw Error('Müzik modülü kapalı.');
  const guild=this.guild(),member=await guild.members.fetch(actorId),owner=config().owners.includes(actorId),listeners=this.listeners();
  const dj=owner||member.permissions.has(PermissionFlagsBits.ManageGuild)||this.settings.music.djRoleIds.some(id=>member.roles.cache.has(id));
  if(remote&&!owner)throw Error('Panel işlemi owner hesabı gerektirir.');
  if(!remote&&member.voice.channelId!==channelId)throw Error('Önce bir ses kanalına katıl.');
  if(this.channelId&&this.channelId!==channelId&&!(dj&&action==='katil'))throw Error('Bot başka bir ses kanalında. Onun kanalına katıl veya DJ olarak /ses katil kullan.');
  const control=dj||listeners.length===1&&listeners[0]===actorId;
  const requireControl=()=>{if(!control)throw Error('Bu kontrol DJ rolü veya Sunucuyu Yönet izni gerektirir. Parça atlamak için /muzik oyla kullan.');};
  if(action==='katil'){if(this.channelId&&this.channelId!==channelId)requireControl();await this.join(channelId);return '🔊 Ses kanalına katıldım.';}
  if(['oynat','radyo'].includes(action)){
   let url=payload.url||'',title=payload.title||'',radio=false;if(action==='radyo'){const station=radioStations.find(s=>s.id===payload.station);if(!station)throw Error('Bir radyo istasyonu seç.');url=station.url;title=station.name;radio=true;}
   const parsed=audioURL(url);if(!title)title=decodeURIComponent(parsed.pathname.split('/').pop()||'Ses kaydı').slice(0,120);if(!this.connection)await this.join(channelId);
   this.queue.add({id:randomUUID(),url:parsed.href,title,requesterId:actorId,radio});this.dirty=true;
   if(!this.queue.current){await this.next(true);if(!this.queue.current)throw Error('Ses kaynağı oynatılamadı. Bir ses dosyası yükle veya /muzik radyo kullan.');return '▶️ Çalıyor: '+displayText((this.queue.current as MusicTrack).title,120);}return '🎵 Kuyruğa eklendi: '+displayText(title,120)+' · Sıra '+this.queue.tracks.length;
  }
  if(!this.connection)throw Error('Bot ses kanalına bağlı değil. /ses katil veya /muzik oynat kullan.');
  if(action==='oyla'){if(!this.queue.current)throw Error('Şu anda parça çalmıyor.');const result=this.queue.vote(actorId,listeners);if(result.skip){await this.next(true);return '⏭️ Dinleyici oylarıyla parça atlandı.';}return '🗳️ Atlama oyu: '+result.votes+'/'+result.required;}
  if(action==='atla'){if(!this.queue.current)throw Error('Şu anda parça çalmıyor.');if(this.queue.current.requesterId!==actorId)requireControl();await this.next(true);return '⏭️ Sıradaki parçaya geçildi.';}
  if(action==='cikar'){const track=this.queue.tracks[(payload.index||0)-1];if(!track)throw Error('Bu sırada parça yok.');if(track.requesterId!==actorId)requireControl();this.queue.remove(payload.index!);this.dirty=true;return '🗑️ Parça kuyruktan çıkarıldı.';}
  requireControl();
  if(action==='ayril'){this.leave();return '👋 Ses kanalından ayrıldım.';}
  if(action==='durdur'){this.queue.stop();this.cleanup();this.player.stop(true);this.idleSince=Date.now();this.dirty=true;return '⏹️ Müzik durdu, kuyruk boşaltıldı.';}
  if(action==='duraklat'){if(this.player.state.status!==AudioPlayerStatus.Playing||!this.player.pause())throw Error('Çalan bir parça yok.');this.dirty=true;return '⏸️ Müzik duraklatıldı.';}
  if(action==='devam'){if(!this.player.unpause())throw Error('Duraklatılmış bir parça yok.');this.dirty=true;return '▶️ Müzik devam ediyor.';}
  if(action==='ses'){if(!Number.isInteger(payload.volume)||payload.volume!<1||payload.volume!>100)throw Error('Ses düzeyi 1–100 olmalı.');this.queue.volume=payload.volume!;this.resource?.volume?.setVolume(payload.volume!/100);this.dirty=true;return '🔉 Ses düzeyi: %'+payload.volume;}
  if(action==='tekrar'){if(!['OFF','TRACK','QUEUE'].includes(payload.mode||''))throw Error('Tekrar modu geçersiz.');this.queue.repeat=payload.mode!;this.dirty=true;return '🔁 Tekrar: '+({OFF:'kapalı',TRACK:'parça',QUEUE:'kuyruk'}[payload.mode!]);}
  if(action==='karistir'){this.queue.shuffle();this.dirty=true;return '🔀 Bekleyen parçalar karıştırıldı.';}
  if(action==='temizle'){this.queue.tracks=[];this.dirty=true;return '🧹 Bekleyen parçalar temizlendi.';}
  if(action==='tasi'){this.queue.move(payload.index||0,payload.target||0);this.dirty=true;return '↕️ Parçanın sırası değiştirildi.';}
  if(action==='ileri'){if(!this.queue.current||this.queue.current.radio)throw Error('İleri sarma yalnızca çalan dosyada kullanılabilir.');if(!Number.isInteger(payload.seconds)||payload.seconds!<0||payload.seconds!>=this.settings.music.maxTrackMinutes*60)throw Error('Saniye, parça süre sınırından küçük olmalı.');await this.start(payload.seconds);return '⏩ Parça '+payload.seconds+'. saniyeden devam ediyor.';}
  throw Error('Müzik işlemi geçersiz.');
 }
 snapshot(){const track=(t:any)=>t?{id:t.id,title:t.title,requesterId:t.requesterId,radio:t.radio}:null;return {connected:this.connection?.state.status===VoiceConnectionStatus.Ready,channelId:this.channelId,state:this.player.state.status,current:track(this.queue.current),queue:this.queue.tracks.map(track),volume:this.queue.volume,repeat:this.queue.repeat,votes:this.queue.votes.size,listeners:this.listeners().length,seconds:Math.floor((this.resource?.playbackDuration||0)/1000)+this.offset,lastError:this.lastError};}
 async tick(settings:CommunitySettings){
  this.settings=settings;this.queue.policy=settings.music;if(!this.jobRunning&&this.channelId){const now=Date.now(),ch:any=this.channel(),humans=ch?.members?[...ch.members.values()].filter((m:any)=>!m.user.bot).length:0;this.emptySince=humans?0:this.emptySince||now;
   if(!settings.music.enabled||this.emptySince&&now-this.emptySince>settings.music.emptySeconds*1000||this.idleSince&&now-this.idleSince>settings.music.idleSeconds*1000)await this.serial(async()=>this.leave());}
  if(this.dirty||Date.now()-this.lastPublish>=5000){await database().query("INSERT INTO integration_status(name,status) VALUES('music',$1) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",[this.snapshot()]);this.lastPublish=Date.now();this.dirty=false;}
  if(!this.jobRunning){this.jobRunning=true;void this.runJob().catch(()=>console.error('MUSIC_JOB_FAILED')).finally(()=>{this.jobRunning=false;});}
 }
 private async runJob(){
  await database().query("DELETE FROM music_jobs WHERE guild_id=$1 AND status IN ('DONE','FAILED') AND created_at<now()-interval '7 days'",[config().guildId]);
  await database().query("UPDATE music_jobs SET status='FAILED',result='İşlem süresi doldu; tekrar deneyin.',updated_at=now() WHERE guild_id=$1 AND ((status='RUNNING' AND updated_at<now()-interval '2 minutes') OR (status='QUEUED' AND created_at<now()-interval '5 minutes'))",[config().guildId]);
  const job=await transaction(async tx=>(await tx.query("UPDATE music_jobs SET status='RUNNING',updated_at=now() WHERE id=(SELECT id FROM music_jobs WHERE guild_id=$1 AND status='QUEUED' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",[config().guildId])).rows[0]);if(!job)return;
  try{const p=musicJobSchema.parse(job.payload);if(p.action!==job.action||p.channelId!==job.channel_id)throw Error('Müzik isteği geçersiz.');const result=await this.serial(()=>this.execute(job.action,p,job.actor_id,job.channel_id,true));await database().query("UPDATE music_jobs SET status='DONE',result=$2,updated_at=now() WHERE id=$1",[job.id,result]);}catch(e){await database().query("DELETE FROM music_jobs WHERE guild_id=$1 AND status IN ('DONE','FAILED') AND created_at<now()-interval '7 days'",[config().guildId]);
  await database().query("UPDATE music_jobs SET status='FAILED',result=$2,updated_at=now() WHERE id=$1",[job.id,e instanceof Error?e.message.slice(0,400):'İşlem tamamlanamadı.']);}this.dirty=true;
 }
 async shutdown(){await this.serial(async()=>this.leave());}
 async handle(interaction:Interaction){
  if(!interaction.isChatInputCommand()||!['ses','muzik'].includes(interaction.commandName))return false;
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{await rateLimit('music:'+interaction.user.id,15,60);const sub=interaction.options.getSubcommand();let text='';
   if(sub==='yardim')text='**Başlat:** /ses katil · /muzik oynat dosya: veya baglanti: · /muzik radyo\n**Kontroller:** duraklat, devam, atla, oyla, durdur, ses, tekrar\n**Kuyruk:** kuyruk, karistir, temizle, cikar, tasi\n**Diğer:** simdi, ileri, /ses durum, /ses ayril\nMP3, OGG, WAV, FLAC, M4A, AAC ve doğrudan HTTPS ses akışları desteklenir. YouTube/Spotify sayfa bağlantıları yerine ses dosyası yükle veya radyo seç. Bot boş kanaldan otomatik ayrılır. Ortak kontroller DJ rolü / Sunucuyu Yönet izni ister; herkes kendi parçasını atlayabilir ve oylayabilir.';
   else if(['durum','simdi','kuyruk'].includes(sub)){const s=this.snapshot();text=sub==='kuyruk'?(s.queue.length?s.queue.slice(0,20).map((t:any,n:number)=>`${n+1}. **${displayText(t.title,100)}** · <@${t.requesterId}>`).join('\n')+(s.queue.length>20?'\n… '+s.queue.length+' parça':''):'Kuyruk boş.'):`${s.connected?'🔊 Bağlı: <#'+s.channelId+'>':'Ses bağlantısı yok.'}\n${s.current?'🎵 **'+displayText(s.current.title,120)+'** · <@'+s.current.requesterId+'>\n'+s.seconds+' sn · '+(s.state==='paused'?'Duraklatıldı':'Çalıyor'):'Çalan parça yok.'}\n🔉 %${s.volume} · 🔁 ${{OFF:'Kapalı',TRACK:'Parça',QUEUE:'Kuyruk'}[s.repeat]} · ${s.listeners} dinleyici`+(s.lastError?'\n'+s.lastError:'');}
   else {const member=await this.guild().members.fetch(interaction.user.id),channelId=member.voice.channelId;if(!channelId)throw Error('Önce bir ses kanalına katıl.');const attachment=interaction.options.getAttachment('dosya');if(attachment&&attachment.size>100*1024*1024)throw Error('Dosya sınırı 100 MB.');text=await this.serial(()=>this.execute(sub,{url:attachment?.url||interaction.options.getString('baglanti')||undefined,title:interaction.options.getString('baslik')||attachment?.name||undefined,station:interaction.options.getString('istasyon')||undefined,index:interaction.options.getInteger('sira')||undefined,target:interaction.options.getInteger('hedef')||undefined,volume:interaction.options.getInteger('yuzde')||undefined,mode:interaction.options.getString('mod') as any,seconds:interaction.options.getInteger('saniye')??undefined},interaction.user.id,channelId));}
   await interaction.editReply({embeds:[brightEmbed('🎧 TurkishPix müzik',text,[],theme.purple)],allowedMentions:{parse:[]}});
  }catch(e){await interaction.editReply({embeds:[brightEmbed('🎧 Müzik kontrolü',e instanceof Error?e.message:'İşlem tamamlanamadı.',[],theme.gold)],allowedMentions:{parse:[]}});}return true;
 }
}
