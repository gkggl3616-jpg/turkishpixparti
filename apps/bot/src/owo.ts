import {randomUUID,createHash} from 'node:crypto';
import {MessageFlags,PermissionFlagsBits} from 'discord.js';
import {config,DomainError} from '../../../packages/core/src/config';
import {database,transaction} from '../../../packages/core/src/db';
import {audit} from '../../../packages/core/src/audit';
import {syncUser,discordRequest,DiscordAPIError} from '../../../packages/core/src/discord';
import {rateLimit} from '../../../packages/core/src/auth';
import {sealOsintSecret,openOsintSecret} from '../../../packages/core/src/osint-network';
import {OWO_ACCESS_ROLE,OWO_SOURCE_BOT} from '../../../packages/core/src/owo-command';
import {analyzeOwoMessage,type Observation} from './owo-analysis';

const snowflake=/^\d{17,20}$/,uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const permissions=PermissionFlagsBits.ViewChannel|PermissionFlagsBits.ReadMessageHistory;
const safe=(s:string)=>s.replace(/[@`*_~|<>]/g,'').slice(0,1100);
let scanning=false,ticking=false,nextCleanup=0;
async function record(actor:any,action:string,details:any={}){await transaction(async tx=>{await syncUser(tx,actor);await audit(tx,actor.id,action,config().guildId,details);});}
export async function assertOwoAccess(guild:any,userId:string,channel?:any){
 if(!guild||guild.id!==config().guildId)throw new DomainError('OWO_GUILD','Bu komut yalnız TurkishPix sunucusunda kullanılabilir.',403);
 const member=await guild.members.fetch({user:userId,force:true});
 if(member.pending||(!config().owners.includes(userId)&&!member.roles.cache.has(OWO_ACCESS_ROLE)))throw new DomainError('OWO_ROLE','ERROR 403: ACCESS DENIED. Role ID '+OWO_ACCESS_ROLE+' required. Bu rol veya owner yetkisi gerekiyor.',403);
 if(channel&&!channel.permissionsFor(member)?.has(permissions))throw new DomainError('OWO_CHANNEL_ACCESS','Bu kanalın geçmişini görme iznin yok.',403);
 return member;
}
async function allowedChannel(guild:any,channelId:string,userId:string){
 const channel=await guild.channels.fetch(channelId);if(!channel||channel.guildId!==guild.id||channel.type!==0)throw new DomainError('OWO_CHANNEL','Sunucudaki normal bir metin kanalı seç.',400);
 await assertOwoAccess(guild,userId,channel);
 const bot=guild.members.me||await guild.members.fetchMe();if(!channel.permissionsFor(bot)?.has(permissions))throw new DomainError('OWO_BOT_PERMISSION','Botun Kanalı Görüntüle ve Mesaj Geçmişini Oku izinleri gerekiyor.',403);
 return channel;
}
async function settings(){return (await database().query('SELECT * FROM owo_channels WHERE guild_id=$1',[config().guildId])).rows[0]||null;}
export async function configureOwo(i:any,channelId:string,sourceId:string){
 if(!snowflake.test(sourceId)||sourceId===i.client.user.id)throw new DomainError('OWO_SOURCE','Geçerli oyun botunu seç; TurkishPix botu kaynak olamaz.',400);
 await allowedChannel(i.guild,channelId,i.user.id);const source=await i.guild.members.fetch({user:sourceId,force:true});if(!source.user.bot)throw new DomainError('OWO_SOURCE','Kaynak bir bot hesabı olmalı; kullanıcı mesajı oyun sonucu sayılmaz.',400);
 await transaction(async tx=>{await syncUser(tx,i.user);await tx.query("UPDATE owo_sessions SET status='STOPPED',webhook_cipher='' WHERE guild_id=$1 AND status='ACTIVE'",[i.guildId]);await tx.query("INSERT INTO owo_channels(guild_id,channel_id,source_id,configured_by) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,source_id=EXCLUDED.source_id,configured_by=EXCLUDED.configured_by,scan_state='IDLE',cursor_before=NULL,scanned_count=0,scan_started_at=NULL,scan_completed_at=NULL,last_error='',updated_at=now()",[i.guildId,channelId,sourceId,i.user.id]);await audit(tx,i.user.id,'OWO_CONFIGURE',channelId,{sourceId});});return settings();
}
export async function ingestOwoMessage(message:any,force=false){
 if(message.guildId!==config().guildId||!message.author?.bot||message.webhookId||!snowflake.test(message.id))return false;
 const cfg=await settings();if(!cfg||message.channelId!==cfg.channel_id||message.author.id!==cfg.source_id)return false;
 if(!force&&cfg.scan_state!=='RUNNING'&&!(await database().query("SELECT id FROM owo_sessions WHERE guild_id=$1 AND channel_id=$2 AND status='ACTIVE' AND expires_at>now() LIMIT 1",[cfg.guild_id,cfg.channel_id])).rows.length)return false;
 const observed=analyzeOwoMessage(message);if(!observed)return false;
 const created=Number(message.createdTimestamp),edited=Number(message.editedTimestamp||created);if(!Number.isFinite(created)||created<=0||!Number.isFinite(edited)||edited<=0)return false;
 await database().query(`INSERT INTO owo_observations(guild_id,channel_id,source_id,message_id,player_id,game,phase,bet,payout,net,state,signature,source_created_at,source_edited_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
 ON CONFLICT(guild_id,channel_id,message_id) DO UPDATE SET source_id=EXCLUDED.source_id,player_id=EXCLUDED.player_id,game=EXCLUDED.game,phase=EXCLUDED.phase,bet=EXCLUDED.bet,payout=EXCLUDED.payout,net=EXCLUDED.net,state=EXCLUDED.state,signature=EXCLUDED.signature,source_edited_at=EXCLUDED.source_edited_at,observed_at=now()
 WHERE EXCLUDED.source_edited_at>=owo_observations.source_edited_at AND EXCLUDED.signature<>owo_observations.signature`,[cfg.guild_id,cfg.channel_id,cfg.source_id,message.id,observed.playerId,observed.game,observed.phase,observed.bet,observed.payout,observed.net,observed,observed.signature,new Date(created),new Date(edited)]);
 return true;
}
export async function handleOwoMessageUpdate(message:any){
 if(message.guildId!==config().guildId||message.author?.bot===false)return;
 const cfg=await settings();if(!cfg||message.channelId!==cfg.channel_id)return;
 const full=message.partial?await message.fetch():message;await ingestOwoMessage(full);
}
export async function owoStatistics(){
 const cfg=await settings();if(!cfg)throw new DomainError('OWO_NOT_CONFIGURED','Önce /owo kur ile kanal ve kaynak botu seç.',400);
 const scope=[cfg.guild_id,cfg.channel_id,cfg.source_id];
 const [totals,users,boards]=await Promise.all([
  database().query("SELECT count(*)::int AS observed,count(*) FILTER(WHERE phase IN ('WIN','LOSS','PUSH'))::int AS completed,count(*) FILTER(WHERE net IS NOT NULL)::int AS money_known,count(*) FILTER(WHERE phase='WIN')::int AS wins,count(*) FILTER(WHERE phase='LOSS')::int AS losses,count(*) FILTER(WHERE phase IN ('WIN','LOSS','PUSH') AND net IS NULL)::int AS money_unknown,COALESCE(sum(net),0)::text AS net,COALESCE(sum(payout),0)::text AS payout FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND expires_at>now()",scope),
  database().query("SELECT player_id,game,count(*)::int AS games,count(*) FILTER(WHERE phase='WIN')::int AS wins,count(*) FILTER(WHERE phase='LOSS')::int AS losses,count(*) FILTER(WHERE net IS NOT NULL)::int AS money_known,COALESCE(sum(net),0)::text AS net FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND phase IN ('WIN','LOSS','PUSH') AND expires_at>now() GROUP BY player_id,game ORDER BY sum(net) DESC NULLS LAST,player_id LIMIT 20001",scope),
  database().query("SELECT message_id,player_id,state FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND game='MINES' AND phase IN ('WIN','LOSS') AND expires_at>now() ORDER BY source_created_at DESC LIMIT 1000",scope)
 ]);
 const heat=Array.from({length:9},(_,index)=>({position:index+1,exposed:0,mines:0,hits:0}));for(const row of boards.rows){const b=row.state.board as string[];if(b?.length!==9)continue;for(let n=0;n<9;n++)if(['SAFE','MINE','HIT'].includes(b[n])){heat[n].exposed++;if(['MINE','HIT'].includes(b[n]))heat[n].mines++;if(b[n]==='HIT')heat[n].hits++;}}
 return {channelId:cfg.channel_id,sourceId:cfg.source_id,scan:{state:cfg.scan_state,scanned:Number(cfg.scanned_count),error:cfg.last_error,completedAt:cfg.scan_completed_at},totals:totals.rows[0],users:users.rows.slice(0,20000),truncated:users.rows.length>20000,boards:boards.rows.map(r=>({messageId:r.message_id,playerId:r.player_id,board:r.state.board})),heat,notice:'Gözlenen oyun ödemeleri; hesap bakiyesi veya tüm gerçek kazançlar değildir. Bir mesajın güncellemeleri tek oyun sayılır. Konum tablosu en yeni 1000 açıklanan 3×3 tahta örneğidir; sonraki oyunu tahmin etmez. Eksik/okunamayan veriler kesin kazanç sayılmaz. Gözlemler 30 gün saklanır.'};
}
async function currentObservation(session:any){return (await database().query("SELECT state,message_id,source_edited_at FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND player_id=$4 AND expires_at>now() ORDER BY source_created_at DESC LIMIT 1",[session.guild_id,session.channel_id,session.source_id,session.user_id])).rows[0]||null;}
export function owoSessionCard(session:any,observation:Observation|null,closed=false){
 const remaining=Math.max(0,Math.ceil((new Date(session.expires_at).getTime()-Date.now())/1000)),board=observation?.board?.length===9?observation.board.map((c,i)=>(i+1)+': '+({HIDDEN:'❔',SAFE:'💎',MINE:'💣',HIT:'💥',UNKNOWN:'◻️'} as any)[c]).reduce((rows:string[],value,index)=>{if(index%3===0)rows.push(value);else rows[rows.length-1]+='   '+value;return rows;},[]).join('\n'):'';
 return {content:'',embeds:[{title:'🔎 TurkishPix · OwO Analiz Oturumu',color:closed?0x6b7280:0x7c5cff,description:closed?'Oturum kapandı. Yeni analiz için /owo yardim sure:5.':'Kendi oyununu Discord’da elle oynarsın; bot mevcut mesajın görünen alanlarını analiz eder.',fields:[{name:'⏱️ Süre',value:closed?'Kapalı':remaining+' saniye · <t:'+Math.floor(new Date(session.expires_at).getTime()/1000)+':R>',inline:true},{name:'🎮 Gözlenen oyun',value:observation?observation.game+' · '+observation.phase:'Bu kanalda kullanıcı ID’nle ilişkilendirilen oyun bekleniyor.',inline:true},...(board?[{name:'🧩 Açıklanan hücreler',value:board}]:[]),{name:'📌 Analiz',value:safe(observation?.advice||'Yalnız yapılandırılmış bot kaynağı okunur. Gizli karelerde bomba konumu bilinmez; rastgele kare güvenli diye gösterilmez.')},{name:'🔐 Erişim',value:'Belirlenen rol veya owner · yalnız bu oturumun sahibi'}],footer:{text:'Salt okunur analiz • Otomatik bahis, düğme basma ve CAPTCHA aşma yok'}}],components:closed?[]:[{type:1,components:[{type:2,style:2,label:'Durumu yenile',custom_id:'tp-owo:refresh:'+session.id},{type:2,style:4,label:'Oturumu durdur',custom_id:'tp-owo:stop:'+session.id}]}],allowedMentions:{parse:[]}};
}
async function patchSession(row:any,observation:Observation|null,closed=false){
 if(!row.webhook_cipher)return;const token=openOsintSecret<string>(row.webhook_cipher);
 await discordRequest('/webhooks/'+config().clientId+'/'+token+'/messages/@original',{method:'PATCH',body:JSON.stringify({...owoSessionCard(row,observation,closed),allowed_mentions:{parse:[]},allowedMentions:undefined})});
}
export async function handleOwoInteraction(i:any){
 const slash=!!i.isChatInputCommand?.()&&i.commandName==='owo',button=!!i.isButton?.()&&typeof i.customId==='string'&&i.customId.startsWith('tp-owo:');if(!slash&&!button)return false;
 try{
  await i.deferReply({flags:MessageFlags.Ephemeral});await assertOwoAccess(i.guild,i.user.id);await rateLimit('owo-command:'+i.user.id,8,60);
  const sub=slash?i.options.getSubcommand():'';
  if(sub==='kur'){const channel=i.options.getChannel('kanal')?.id||i.channelId,source=i.options.getUser('kaynak')?.id||OWO_SOURCE_BOT;await configureOwo(i,channel,source);await i.editReply({content:'✅ Analiz kaynağı ayarlandı: <#'+channel+'> · <@'+source+'>. /owo yardim sure:5 ile oturum aç; /owo tara ile erişilebilir geçmişi tara.',allowedMentions:{parse:[]}});return true;}
  let cfg=await settings();if(!cfg&&sub==='yardim')cfg=await configureOwo(i,i.channelId,OWO_SOURCE_BOT);if(!cfg)throw new DomainError('OWO_NOT_CONFIGURED','Önce /owo kur ile kanal ve kaynak botu seç.',400);
  const channel=await allowedChannel(i.guild,cfg.channel_id,i.user.id);
  if(sub==='yardim'){
   if(i.channelId!==cfg.channel_id)throw new DomainError('OWO_WRONG_CHANNEL','Oturumu yapılandırılmış kanalda başlat: <#'+cfg.channel_id+'>.',400);
   const minutes=i.options.getInteger('sure')??5;if(!Number.isInteger(minutes)||minutes<1||minutes>15)throw new DomainError('OWO_DURATION','Süre 1–15 dakika olabilir.',400);
   const row=await transaction(async tx=>{await syncUser(tx,i.user);await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['owo-session:'+i.guildId+':'+i.user.id]);await tx.query("UPDATE owo_sessions SET status='STOPPED',webhook_cipher='' WHERE guild_id=$1 AND user_id=$2 AND status='ACTIVE'",[i.guildId,i.user.id]);return (await tx.query("INSERT INTO owo_sessions(id,guild_id,user_id,channel_id,source_id,expires_at,webhook_cipher) VALUES($1,$2,$3,$4,$5,now()+$6*interval '1 minute',$7) RETURNING *",[randomUUID(),i.guildId,i.user.id,cfg.channel_id,cfg.source_id,minutes,sealOsintSecret(i.token)])).rows[0];});
   const history=await channel.messages.fetch({limit:100});for(const message of history.values())await ingestOwoMessage(message,true);
   await record(i.user,'OWO_SESSION_START',{channelId:cfg.channel_id,minutes});await i.editReply(owoSessionCard(row,(await currentObservation(row))?.state||null));return true;
  }
  if(sub==='tara'){await database().query("UPDATE owo_channels SET scan_state='RUNNING',configured_by=$2,cursor_before=CASE WHEN scan_state='COMPLETE' THEN NULL ELSE cursor_before END,scanned_count=CASE WHEN scan_state='COMPLETE' THEN 0 ELSE scanned_count END,scan_started_at=CASE WHEN scan_state='COMPLETE' THEN now() ELSE COALESCE(scan_started_at,now()) END,scan_completed_at=NULL,last_error='',updated_at=now() WHERE guild_id=$1",[i.guildId,i.user.id]);await record(i.user,'OWO_SCAN_START',{channelId:cfg.channel_id});await i.editReply({content:'🔎 Geçmiş taraması başlatıldı/devam ediyor. Erişilebilir geçmiş sayfa sayfa sonuna kadar okunur; her sayfa 100 mesaj. /owo istatistik ilerlemeyi gösterir. Bot rol/kanal izinlerini her sayfada yeniden kontrol eder.',allowedMentions:{parse:[]}});return true;}
  if(sub==='istatistik'){const stats=await owoStatistics(),known=stats.totals.money_known;await i.editReply({content:'📊 **Kanalın gözlenen sonuçları**\n'+stats.totals.observed+' oyun mesajı · '+stats.totals.completed+' tamamlanmış · '+known+' kesin ödeme/net kaydı\nGözlenen net: '+stats.totals.net+' cowoncy · Kazanç bilinmeyen: '+stats.totals.money_unknown+'\nGeçmiş: '+stats.scan.state+' · '+stats.scan.scanned+' mesaj tarandı'+(stats.scan.error?' · '+stats.scan.error:'')+'\n\n'+stats.notice,files:[{attachment:Buffer.from(JSON.stringify(stats,null,2)),name:'owo-gozlenen-istatistikler.json'}],allowedMentions:{parse:[]}});return true;}
  const parts=button?i.customId.split(':'):[],sessionId=parts[2];if(button&&!uuid.test(sessionId||''))throw new DomainError('OWO_SESSION','Oturum ID geçersiz.',400);
  const row=(await database().query("SELECT * FROM owo_sessions WHERE guild_id=$1 AND user_id=$2 AND "+(button?'id=$3':"status='ACTIVE'")+" ORDER BY created_at DESC LIMIT 1",button?[i.guildId,i.user.id,sessionId]:[i.guildId,i.user.id])).rows[0];
  if(!row)throw new DomainError('OWO_SESSION','Bu oturum sana ait değil veya açık oturumun yok.',403);
  if(row.channel_id!==i.channelId)throw new DomainError('OWO_WRONG_CHANNEL','Oturum başka bir kanala ait.',403);
  if(row.status!=='ACTIVE'||new Date(row.expires_at).getTime()<=Date.now())throw new DomainError('OWO_EXPIRED','Oturumun süresi doldu. /owo yardim sure:5 ile yeniden başlat.',410);
  if(sub==='durdur'||button&&parts[1]==='stop'){await database().query("UPDATE owo_sessions SET status='STOPPED' WHERE id=$1",[row.id]);await patchSession(row,null,true).catch(()=>{});await database().query("UPDATE owo_sessions SET webhook_cipher='' WHERE id=$1",[row.id]);await record(i.user,'OWO_SESSION_STOP',{sessionId:row.id});await i.editReply({content:'✅ Kendi analiz oturumun kapatıldı.',allowedMentions:{parse:[]}});return true;}
  if(sub==='durum'||button&&parts[1]==='refresh'){const observation=(await currentObservation(row))?.state||null;if(button){await patchSession(row,observation);await i.editReply({content:'✅ Kendi panelin güncellendi.',allowedMentions:{parse:[]}});}else await i.editReply(owoSessionCard(row,observation));return true;}
  throw new DomainError('OWO_ACTION','Bilinmeyen analiz işlemi.',400);
 }catch(e){const code=e instanceof DomainError?e.code:'OWO_FAILED';await record(i.user,'OWO_ACCESS_OR_ACTION_DENIED',{code}).catch(()=>{});const body={content:'⚠️ '+(e instanceof DomainError?e.message:'Analiz işlemi tamamlanamadı. Kanal izinlerini ve kaynak botu kontrol et.'),allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(body).catch(()=>{});else await i.reply({...body,flags:MessageFlags.Ephemeral}).catch(()=>{});}
 return true;
}
/** Read one history page per tick. A persisted cursor resumes after restart. */
export async function owoTick(client:any){
 if(ticking)return;ticking=true;try{
  const guild=client.guilds.cache.get(config().guildId);if(!guild)return;
  if(Date.now()>nextCleanup){nextCleanup=Date.now()+3600000;await database().query('DELETE FROM owo_observations WHERE expires_at<=now()');await database().query("DELETE FROM owo_sessions WHERE status<>'ACTIVE' AND created_at<now()-interval '1 day'");}
  const sessions=(await database().query("SELECT * FROM owo_sessions WHERE guild_id=$1 AND status='ACTIVE' ORDER BY next_update_at LIMIT 50",[guild.id])).rows;
  for(const row of sessions){
   let closed=new Date(row.expires_at).getTime()<=Date.now(),status=closed?'EXPIRED':'ACTIVE';
   if(!closed)try{await allowedChannel(guild,row.channel_id,row.user_id);}catch{closed=true;status='REVOKED';}
   if(closed){await database().query('UPDATE owo_sessions SET status=$2 WHERE id=$1',[row.id,status]);await patchSession(row,null,true).catch(()=>{});await database().query("UPDATE owo_sessions SET webhook_cipher='' WHERE id=$1",[row.id]);continue;}
   if(new Date(row.next_update_at).getTime()>Date.now())continue;
   await database().query("UPDATE owo_sessions SET next_update_at=now()+interval '5 seconds' WHERE id=$1",[row.id]);
   const observed=await currentObservation(row),signature=createHash('sha256').update((observed?.state?.signature||'waiting')+':'+Math.floor(Date.now()/10000)).digest('hex');if(signature===row.last_signature)continue;
   try{await patchSession(row,observed?.state||null);await database().query("UPDATE owo_sessions SET last_signature=$2,last_error='' WHERE id=$1",[row.id,signature]);}
   catch(e){const terminal=e instanceof DiscordAPIError&&[401,403,404].includes(e.responseStatus);await database().query("UPDATE owo_sessions SET last_error=$2,next_update_at=now()+interval '30 seconds',status=CASE WHEN $3 THEN 'STOPPED' ELSE status END,webhook_cipher=CASE WHEN $3 THEN '' ELSE webhook_cipher END WHERE id=$1",[row.id,e instanceof DomainError?e.code:'UPDATE_FAILED',terminal]);}
  }
  if(scanning)return;const cfg=await settings();if(!cfg||cfg.scan_state!=='RUNNING')return;scanning=true;
  try{
   const channel=await allowedChannel(guild,cfg.channel_id,cfg.configured_by),page=await channel.messages.fetch({limit:100,...(cfg.cursor_before?{before:cfg.cursor_before}:{})}),messages=[...page.values()] as any[];
   if(messages.some(m=>!snowflake.test(m.id)||cfg.cursor_before&&BigInt(m.id)>=BigInt(cfg.cursor_before)))throw new DomainError('OWO_CURSOR','Discord geçmiş sayfası sıralaması doğrulanamadı.',503);
   for(const message of messages)await ingestOwoMessage(message,true);
   const cursor=messages.reduce((min:string|null,m:any)=>!min||BigInt(m.id)<BigInt(min)?m.id:min,cfg.cursor_before||null);
   await database().query("UPDATE owo_channels SET cursor_before=$2,scanned_count=scanned_count+$3,scan_state=CASE WHEN $4 THEN 'COMPLETE' ELSE 'RUNNING' END,scan_completed_at=CASE WHEN $4 THEN now() ELSE NULL END,last_error='' WHERE guild_id=$1 AND channel_id=$5 AND source_id=$6 AND scan_state='RUNNING' AND updated_at=$7",[guild.id,cursor,messages.length,messages.length<100,cfg.channel_id,cfg.source_id,cfg.updated_at]);
  }catch(e){await database().query("UPDATE owo_channels SET scan_state='ERROR',last_error=$2 WHERE guild_id=$1 AND channel_id=$3 AND source_id=$4 AND scan_state='RUNNING' AND updated_at=$5",[guild.id,e instanceof DomainError?e.code:'HISTORY_FAILED',cfg.channel_id,cfg.source_id,cfg.updated_at]);}finally{scanning=false;}
 }finally{ticking=false;}
}
