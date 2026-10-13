import {randomUUID,createHash} from 'node:crypto';
import {MessageFlags,PermissionFlagsBits} from 'discord.js';
import {config,DomainError} from '../../../packages/core/src/config';
import {database,transaction} from '../../../packages/core/src/db';
import {audit} from '../../../packages/core/src/audit';
import {syncUser,discordRequest,DiscordAPIError} from '../../../packages/core/src/discord';
import {rateLimit} from '../../../packages/core/src/auth';
import {sealOsintSecret,openOsintSecret} from '../../../packages/core/src/osint-network';
import {OWO_ACCESS_ROLE,OWO_SOURCE_BOT} from '../../../packages/core/src/owo-command';
import {owoCatalog,parseOwoCommand} from '../../../packages/core/src/owo-catalog';
import {mineProfiles,profileSummary,wilson} from './owo-math';
import {analyzeOwoMessage,normalizeOwoName,signatureFor,type Observation} from './owo-analysis';
import {owoPeriod} from './owo-period';
import {observedReport,advisorText} from './owo-empirical';
import {approvedOcrUrl,downloadOwoImage,readOwoImage,snapshotMessage,sourceImages,type OcrResult} from './owo-ocr';
import {renderMinesStatistics,renderBlackjackStatistics} from './owo-render';

const snowflake=/^\d{17,20}$/,uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const permissions=PermissionFlagsBits.ViewChannel|PermissionFlagsBits.ReadMessageHistory;
const safe=(s:string)=>s.replace(/[@`*_~|<>]/g,'').slice(0,1000);
let scanning=false,ticking=false,nextCleanup=0;
let ocrRunning=false;
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
async function settings(){return (await database().query('SELECT *,updated_at::text AS revision FROM owo_channels WHERE guild_id=$1',[config().guildId])).rows[0]||null;}
async function genericObservation(message:any,cfg:any):Promise<Observation|null>{
 const reference=message.reference?.messageId||message.reference?.message_id;if(!reference)return null;
 const request=(await database().query('SELECT * FROM owo_requests WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND message_id=$4 AND expires_at>now()',[cfg.guild_id,cfg.channel_id,cfg.source_id,reference])).rows[0];if(!request)return null;
 const state:Observation={game:request.game||'CATALOG:'+request.command,playerId:request.user_id,playerName:null,identity:'EXPLICIT',phase:'UNKNOWN',bet:null,payout:null,net:null,board:[],selected:[],mines:null,cashOut:null,next:null,failure:null,steps:null,dealer:null,score:null,soft:null,cards:[],choice:null,advice:'Komut yanıtı kaydedildi. Tanınmayan sonuç biçimi için başarı veya parasal tutar üretilmez.',evidence:sourceImages(message).length?'IMAGE_ONLY':'TEXT',signature:''};state.signature=signatureFor(state);return state;
}
async function queueOcr(message:any,cfg:any){
 const payload=snapshotMessage(message);for(const url of sourceImages(message)){
  const id=createHash('sha256').update(cfg.guild_id+':'+message.id+':'+payload.editedTimestamp+':'+url).digest('hex');
  let status='NEW',error='';try{approvedOcrUrl(url);}catch{status='UNSUPPORTED';error='OWO_OCR_HOST';}
  await database().query('INSERT INTO owo_ocr_jobs(id,guild_id,channel_id,source_id,message_id,image_url,payload,status,last_error) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[id,cfg.guild_id,cfg.channel_id,cfg.source_id,message.id,url,payload,status,error]);
 }
}
export async function owoOcrTick(client:any){
 if(ocrRunning)return;ocrRunning=true;try{
  await database().query("UPDATE owo_ocr_jobs SET status='NEW' WHERE status='RUNNING' AND next_try_at<now()-interval '2 minutes'");
  const cfg=await settings(),guild=client.guilds.cache.get(config().guildId);if(!cfg||!guild)return;
  if(!cfg.tracking_enabled&&cfg.scan_state!=='RUNNING'&&!(await database().query("SELECT id FROM owo_sessions WHERE guild_id=$1 AND channel_id=$2 AND status='ACTIVE' AND expires_at>now() LIMIT 1",[cfg.guild_id,cfg.channel_id])).rows.length)return;
  const rejected=(await database().query("SELECT * FROM owo_ocr_jobs WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND status='UNSUPPORTED' AND last_error='OWO_OCR_HOST' AND next_try_at<=now() AND expires_at>now() ORDER BY created_at DESC LIMIT 1",[cfg.guild_id,cfg.channel_id,cfg.source_id])).rows[0];
  if(rejected)try{const channel=await allowedChannel(guild,cfg.channel_id,cfg.configured_by),fresh=await channel.messages.fetch(rejected.message_id);if(fresh?.author?.id===cfg.source_id&&sourceImages(fresh).some(url=>{try{approvedOcrUrl(url);return true;}catch{return false;}})){await queueOcr(fresh,cfg);await database().query("UPDATE owo_ocr_jobs SET status='FAILED',last_error='OWO_OCR_REPLACED' WHERE id=$1",[rejected.id]);console.log('OWO_OCR_SOURCE_REPAIRED',JSON.stringify({requeued:1,source:'Discord media'}));}else await database().query("UPDATE owo_ocr_jobs SET next_try_at=now()+interval '1 hour' WHERE id=$1",[rejected.id]);}catch{await database().query("UPDATE owo_ocr_jobs SET next_try_at=now()+interval '1 hour' WHERE id=$1",[rejected.id]);}
  const job=(await database().query("SELECT * FROM owo_ocr_jobs WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND status='NEW' AND next_try_at<=now() AND expires_at>now() ORDER BY created_at DESC LIMIT 1",[cfg.guild_id,cfg.channel_id,cfg.source_id])).rows[0];if(!job)return;
  await allowedChannel(guild,cfg.channel_id,cfg.configured_by);
  const claimed=await database().query("UPDATE owo_ocr_jobs SET status='RUNNING',attempts=attempts+1,next_try_at=now() WHERE id=$1 AND status='NEW'",[job.id]);if(!claimed.rowCount)return;
  try{const result=await readOwoImage(await downloadOwoImage(job.image_url));await ingestOwoMessage(job.payload,true,result);await database().query("UPDATE owo_ocr_jobs SET status='COMPLETE',result=$2,last_error='' WHERE id=$1",[job.id,result]);}
  catch(e){const code=e instanceof DomainError?e.code:'OWO_OCR_FAILED';await database().query("UPDATE owo_ocr_jobs SET status=CASE WHEN attempts>=3 OR $3 THEN 'FAILED' ELSE 'NEW' END,next_try_at=now()+interval '1 minute',last_error=$2 WHERE id=$1",[job.id,code,['OWO_OCR_HOST','OWO_OCR_FORMAT','OWO_OCR_SIZE'].includes(code)]);}
 }finally{ocrRunning=false;}
}
async function resolvePlayer(observation:Observation,cfg:any,created:Date){
 if(observation.playerId&&observation.identity!=='COMMAND_MATCH'||!observation.playerName)return observation;
 const rows=(await database().query("SELECT DISTINCT user_id FROM owo_requests WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND game=$4 AND requested_at BETWEEN $5::timestamptz-interval '90 seconds' AND $5 AND $6=ANY(names) AND expires_at>now()",[cfg.guild_id,cfg.channel_id,cfg.source_id,observation.game,created,normalizeOwoName(observation.playerName)])).rows;
 if(rows.length===1)observation={...observation,playerId:rows[0].user_id,identity:'COMMAND_MATCH'};
 else if(observation.identity==='COMMAND_MATCH')observation={...observation,playerId:null,identity:'UNKNOWN'};
 observation.signature=signatureFor(observation);return observation;
}
async function observeRequest(message:any,cfg:any){
 const command=parseOwoCommand(message.content||''),created=new Date(Number(message.createdTimestamp));
 if(!command||!snowflake.test(message.author.id)||!Number.isFinite(created.getTime()))return false;
 const names=[...new Set([message.author.username,message.author.globalName,message.member?.displayName,message.member?.nickname].filter(Boolean).map(normalizeOwoName))].filter(Boolean);
 await database().query('INSERT INTO owo_requests(guild_id,channel_id,source_id,message_id,user_id,command,game,names,requested_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(guild_id,channel_id,message_id) DO NOTHING',[cfg.guild_id,cfg.channel_id,cfg.source_id,message.id,message.author.id,command.command,command.game,names,created]);
 if(command.game){
  // Backfill source messages whose request was on the previous history page.
  const pending=(await database().query("SELECT message_id,state,source_created_at FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND (player_id IS NULL OR state->>'identity'='COMMAND_MATCH') AND game=$4 AND source_created_at BETWEEN $5 AND $5::timestamptz+interval '90 seconds' AND expires_at>now() LIMIT 100",[cfg.guild_id,cfg.channel_id,cfg.source_id,command.game,created])).rows;
  for(const row of pending){const state=await resolvePlayer(row.state,cfg,new Date(row.source_created_at));if(state.signature!==row.state.signature)await database().query("UPDATE owo_observations SET player_id=$4,state=$5,signature=$6 WHERE guild_id=$1 AND channel_id=$2 AND message_id=$3 AND (player_id IS NULL OR state->>'identity'='COMMAND_MATCH')",[cfg.guild_id,cfg.channel_id,row.message_id,state.playerId,state,state.signature]);}
 }
 return true;
}
export async function configureOwo(i:any,channelId:string,sourceId:string){
 if(!snowflake.test(sourceId)||sourceId===i.client.user.id)throw new DomainError('OWO_SOURCE','Geçerli oyun botunu seç; TurkishPix botu kaynak olamaz.',400);
 await allowedChannel(i.guild,channelId,i.user.id);const source=await i.guild.members.fetch({user:sourceId,force:true});if(!source.user.bot)throw new DomainError('OWO_SOURCE','Kaynak bir bot hesabı olmalı; kullanıcı mesajı oyun sonucu sayılmaz.',400);
 await transaction(async tx=>{await syncUser(tx,i.user);await tx.query("UPDATE owo_sessions SET status='STOPPED',webhook_cipher='' WHERE guild_id=$1 AND status='ACTIVE'",[i.guildId]);await tx.query("INSERT INTO owo_channels(guild_id,channel_id,source_id,configured_by) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,source_id=EXCLUDED.source_id,configured_by=EXCLUDED.configured_by,scan_state='IDLE',cursor_before=NULL,scanned_count=0,scan_started_at=NULL,scan_completed_at=NULL,last_completed_scan_at=NULL,scan_after=NULL,last_error='',updated_at=now()",[i.guildId,channelId,sourceId,i.user.id]);await audit(tx,i.user.id,'OWO_CONFIGURE',channelId,{sourceId});});return settings();
}
export async function ingestOwoMessage(message:any,force=false,ocr?:OcrResult,scanAt?:Date|string){
 if(message.guildId!==config().guildId||!message.author||message.webhookId||!snowflake.test(message.id))return false;
 const cfg=await settings();if(!cfg||message.channelId!==cfg.channel_id)return false;
 if(!force&&!(cfg.tracking_enabled&&new Date(cfg.watch_until).getTime()>Date.now())&&cfg.scan_state!=='RUNNING'&&!(await database().query("SELECT id FROM owo_sessions WHERE guild_id=$1 AND channel_id=$2 AND status='ACTIVE' AND expires_at>now() LIMIT 1",[cfg.guild_id,cfg.channel_id])).rows.length)return false;
 if(!message.author.bot)return observeRequest(message,cfg);
 if(message.author.id!==cfg.source_id)return false;
 let observed=analyzeOwoMessage(message)||await genericObservation(message,cfg);
 if(!observed&&ocr?.trustedText)observed=analyzeOwoMessage({...message,content:(message.content||'')+'\n'+ocr.trustedText});
 if(!observed){if(!ocr)await queueOcr(message,cfg);return false;}
 const created=Number(message.createdTimestamp),edited=Number(message.editedTimestamp||created);if(!Number.isFinite(created)||created<=0||!Number.isFinite(edited)||edited<=0)return false;
 observed=await resolvePlayer(observed,cfg,new Date(created));
 if(ocr){
  const extracted=ocr.trustedText?analyzeOwoMessage({...message,content:(message.content||'')+'\n'+ocr.trustedText}):null;
  if(extracted?.game===observed.game){for(const key of ['bet','cashOut','next','failure','steps','dealer','score','soft'] as const)if(observed[key]===null)(observed as any)[key]=extracted[key];if(observed.phase==='UNKNOWN')observed.phase=extracted.phase;if(observed.payout===null&&observed.phase===extracted.phase){observed.payout=extracted.payout;observed.net=observed.payout!==null&&observed.bet!==null?observed.payout-observed.bet:null;}}
  observed.ocr={status:ocr.status,confidence:ocr.confidence,text:ocr.text,trustedText:ocr.trustedText};if(observed.evidence==='IMAGE_ONLY'&&ocr.trustedText)observed.evidence='OCR';observed.signature=signatureFor(observed);
 }
 const saved=await database().query(`INSERT INTO owo_observations(guild_id,channel_id,source_id,message_id,player_id,game,phase,bet,payout,net,state,signature,source_created_at,source_edited_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
 ON CONFLICT(guild_id,channel_id,message_id) DO UPDATE SET source_id=EXCLUDED.source_id,player_id=EXCLUDED.player_id,game=EXCLUDED.game,phase=EXCLUDED.phase,bet=EXCLUDED.bet,payout=EXCLUDED.payout,net=EXCLUDED.net,state=EXCLUDED.state,signature=EXCLUDED.signature,source_edited_at=EXCLUDED.source_edited_at,observed_at=now()
 WHERE EXCLUDED.source_edited_at>=owo_observations.source_edited_at AND EXCLUDED.signature<>owo_observations.signature`,[cfg.guild_id,cfg.channel_id,cfg.source_id,message.id,observed.playerId,observed.game,observed.phase,observed.bet,observed.payout,observed.net,observed,observed.signature,new Date(created),new Date(edited)]);
 if(scanAt)await database().query('UPDATE owo_observations SET last_scan_at=$4 WHERE guild_id=$1 AND channel_id=$2 AND message_id=$3',[cfg.guild_id,cfg.channel_id,message.id,scanAt]);
 if(saved.rowCount)await database().query('INSERT INTO owo_frames(guild_id,channel_id,source_id,message_id,signature,game,phase,score,soft,state,source_edited_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING',[cfg.guild_id,cfg.channel_id,cfg.source_id,message.id,observed.signature,observed.game,observed.phase,observed.score,observed.soft,observed,new Date(edited)]);
 if(!ocr)await queueOcr(message,cfg);
 if(!force&&saved.rowCount&&observed.playerId)await database().query("UPDATE owo_sessions SET next_update_at=LEAST(next_update_at,now()) WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND user_id=$4 AND status='ACTIVE' AND expires_at>now()",[cfg.guild_id,cfg.channel_id,cfg.source_id,observed.playerId]);
 return true;
}
export async function handleOwoMessageUpdate(message:any){
 if(message.guildId!==config().guildId||message.author?.bot===false)return;
 const cfg=await settings();if(!cfg||message.channelId!==cfg.channel_id)return;
 const full=message.partial?await message.fetch():message;await ingestOwoMessage(full);
}
export async function owoStatistics(userId?:string,scopeConfig?:any){
 const cfg=scopeConfig||await settings();if(!cfg)throw new DomainError('OWO_NOT_CONFIGURED','Önce /owo kanal ile kanal ve kaynak botu seç.',400);
 const scope=[cfg.guild_id,cfg.channel_id,cfg.source_id,userId??null];
 const [totals,users,boards]=await Promise.all([
  database().query("SELECT count(*)::int AS observed,count(*) FILTER(WHERE phase IN ('WIN','LOSS','PUSH'))::int AS completed,count(*) FILTER(WHERE net IS NOT NULL)::int AS money_known,count(*) FILTER(WHERE phase='WIN')::int AS wins,count(*) FILTER(WHERE phase='LOSS')::int AS losses,count(*) FILTER(WHERE phase IN ('WIN','LOSS','PUSH') AND net IS NULL)::int AS money_unknown,COALESCE(sum(net),0)::text AS net,COALESCE(sum(payout),0)::text AS payout FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND ($4::text IS NULL OR player_id=$4) AND expires_at>now()",scope),
  database().query("SELECT player_id,game,count(*)::int AS games,count(*) FILTER(WHERE phase='WIN')::int AS wins,count(*) FILTER(WHERE phase='LOSS')::int AS losses,count(*) FILTER(WHERE net IS NOT NULL)::int AS money_known,COALESCE(sum(net),0)::text AS net,COALESCE(sum(bet) FILTER(WHERE net IS NOT NULL),0)::text AS known_bets FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND ($4::text IS NULL OR player_id=$4) AND phase IN ('WIN','LOSS','PUSH') AND expires_at>now() GROUP BY player_id,game ORDER BY sum(net) DESC NULLS LAST,player_id LIMIT 20001",scope),
  database().query("SELECT message_id,player_id,state FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND ($4::text IS NULL OR player_id=$4) AND game='MINES' AND phase IN ('WIN','LOSS') AND expires_at>now() ORDER BY source_created_at DESC LIMIT 1000",scope)
 ]);
 const heat=Array.from({length:9},(_,index)=>({position:index+1,exposed:0,mines:0,hits:0}));for(const row of boards.rows){const b=row.state.board as string[];if(b?.length!==9)continue;for(let n=0;n<9;n++)if(['SAFE','MINE','HIT'].includes(b[n])){heat[n].exposed++;if(['MINE','HIT'].includes(b[n]))heat[n].mines++;if(b[n]==='HIT')heat[n].hits++;}}
 return {channelId:cfg.channel_id,sourceId:cfg.source_id,scan:{state:cfg.scan_state,scanned:Number(cfg.scanned_count),error:cfg.last_error,completedAt:cfg.scan_completed_at},totals:totals.rows[0],users:users.rows.slice(0,20000),truncated:users.rows.length>20000,boards:boards.rows.map(r=>({messageId:r.message_id,playerId:r.player_id,board:r.state.board,selected:r.state.selected||[],mines:r.state.mines})),heat,notice:'Gözlenen oyun ödemeleri; hesap bakiyesi veya tüm gerçek kazançlar değildir. Bir mesajın güncellemeleri tek oyun sayılır. Konum tablosu en yeni 1000 açıklanan 3×3 tahta örneğidir; sonraki oyunu tahmin etmez. Eksik/okunamayan veriler kesin kazanç sayılmaz. Gözlemler 30 gün saklanır.'};
}
export async function owoObservedReport(userId?:string,scopeConfig?:any,date?:string,game?:string,page=1,allHistory=false){
 const cfg=scopeConfig||await settings();if(!cfg)throw new DomainError('OWO_NOT_CONFIGURED','Önce /owo kanal komutunu kullan.',400);const period=allHistory?{...owoPeriod(),start:new Date(0),end:new Date(Date.now()+86400000),label:'Saklanan kişisel gözlemler'}:owoPeriod(date||new Date()),selected=game&&game!=='TUMU'?game:null;
 const scope=[cfg.guild_id,cfg.channel_id,cfg.source_id,userId??null,period.start,period.end,selected];
 const [ledger,frames,usage,ocr]=await Promise.all([
  database().query("SELECT * FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND ($4::text IS NULL OR player_id=$4) AND source_created_at>=$5 AND source_created_at<$6 AND ($7::text IS NULL OR game=$7) AND expires_at>now() ORDER BY source_created_at DESC LIMIT 5001",scope),
  database().query("SELECT f.message_id,f.phase,f.score,f.soft,f.state,f.source_edited_at,f.recorded_at FROM owo_frames f JOIN owo_observations o ON o.guild_id=f.guild_id AND o.channel_id=f.channel_id AND o.message_id=f.message_id AND o.source_id=f.source_id WHERE o.guild_id=$1 AND o.channel_id=$2 AND o.source_id=$3 AND ($4::text IS NULL OR o.player_id=$4) AND o.source_created_at>=$5 AND o.source_created_at<$6 AND ($7::text IS NULL OR o.game=$7) AND f.expires_at>now() ORDER BY f.source_edited_at ASC,f.recorded_at ASC LIMIT 20001",scope),
  database().query('SELECT command,count(*)::int AS uses FROM owo_requests WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND ($4::text IS NULL OR user_id=$4) AND requested_at>=$5 AND requested_at<$6 AND expires_at>now() GROUP BY command ORDER BY count(*) DESC LIMIT 20',scope.slice(0,6)),
  database().query('SELECT status,count(*)::int AS count FROM owo_ocr_jobs WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND created_at>=$4 AND created_at<$5 AND expires_at>now() GROUP BY status',[cfg.guild_id,cfg.channel_id,cfg.source_id,period.start,period.end])
 ]);
 return {...observedReport(ledger.rows.slice(0,5000),frames.rows.slice(0,20000)),page:Math.max(1,Math.min(100,Math.floor(page)||1)),game:game||'TUMU',period,scope:userId?'Kişisel':'Kanal',userId,usage:usage.rows,categories:[...new Set(usage.rows.map(r=>owoCatalog.entries.find(e=>e.name===r.command)?.category||'other'))].map(category=>({category,uses:usage.rows.filter(r=>(owoCatalog.entries.find(e=>e.name===r.command)?.category||'other')===category).reduce((n,r)=>n+Number(r.uses),0)})),ocr:ocr.rows,truncated:ledger.rows.length>5000||frames.rows.length>20000,scan:{state:cfg.scan_state,scanned:Number(cfg.scanned_count),limit:Number(cfg.scan_limit||700),next:cfg.next_scan_at}};
}
const percent=(n:number|null)=>n===null?'veri yok':'%'+(100*n).toFixed(1);
function bjLines(report:Awaited<ReturnType<typeof owoObservedReport>>){
 const bj=report.blackjack,source=bj.byScore.length?bj.byScore:bj.terminalScores;
 const heading=bj.byScore.length?'Gözlenen ara el → oyun sonucu':'Yalnız son el kaydı (hamle öncesi veri yok)';
 return heading+'\n'+(source.slice((report.page-1)*12,report.page*12).map(r=>r.score+('soft' in r?(r.soft===true?' soft':r.soft===false?' hard':' ?'):'')+': '+percent(r.rate)+' · '+r.wins+'/'+r.games+' kazanım').join('\n')||'Bu dönemde okunmuş el/sonuç çifti yok.')+'\n'+(bj.best?`${bj.best.threshold} ve üstü ${percent(bj.best.above.rate)} (n=${bj.best.above.games}); altı ${percent(bj.best.below.rate)} (n=${bj.best.below.games}). En büyük gözlenen fark; hamle garantisi değil.`:'Eşik karşılaştırmasında her tarafta en az 20 gözlenmiş oyun gerekir.');
}
export async function owoReportBody(report:Awaited<ReturnType<typeof owoObservedReport>>){
 const winner=report.bestGame,known=report.games.reduce((n,g)=>n+g.moneyKnown,0),net=report.games.reduce((n,g)=>n+BigInt(g.net),0n),scoreRows=report.blackjack.byScore.length?report.blackjack.byScore:report.blackjack.terminalScores,bjImage=report.game==='BLACKJACK'||!report.mines.boards&&scoreRows.length>0,filename=bjImage?'owo-blackjack-istatistik.png':'owo-mines-istatistik.png',image=bjImage?await renderBlackjackStatistics(scoreRows.slice((report.page-1)*12,report.page*12),report.period.label,report.scope,report.blackjack.byScore.length?'Gözlenen ara el → sonuç':'Yalnız son el kaydı'):await renderMinesStatistics(report.mines,report.period.label,report.scope),patterns=report.patterns;
 const body={embeds:[{title:'🎮 TurkishPix · Üç Günlük OwO Karnesi',color:0x9b7bff,description:'📅 '+report.period.label+' · İstanbul saati · '+report.scope+'\n'+report.notice+(report.truncated?'\nÖrnek sınırı: son 5000 sonuç / ilk 20000 ara durum.':''),fields:[{name:'🏆 Gözlenen net lideri',value:winner?winner.game+' · '+BigInt(winner.net).toLocaleString('tr-TR')+' cowoncy · '+winner.moneyKnown+' bilinen net'+(winner.profitable?'':'\nPozitif net kazanç yok; en az negatif/sıfır sonuç.'): 'Bu dönemde parasal sonuç okunmadı.'},{name:'📊 Dönemin oyunları',value:report.games.slice((report.page-1)*8,report.page*8).map(g=>g.game+': '+g.games+' sonuç · kazanım '+percent(g.rate)+' · net '+(g.moneyKnown?BigInt(g.net).toLocaleString('tr-TR'):'bilinmiyor')+' · bilinmeyen '+(g.moneyUnknown+g.unknown)).join('\n')||'Tarama/OCR sonuçları bekleniyor.'},{name:'🃏 Blackjack · taranan el oranları',value:bjLines(report).slice(0,1000)},{name:'💎 Mines · tekrar araştırması',value:patterns.completeBoards+' tam açıklanan tahta · '+patterns.distinctLayouts+' farklı yerleşim\n'+(patterns.repeated.map(r=>r.mines+' mayın · ['+r.positions.join(', ')+'] '+r.count+' kez').join('\n')||'Tekrarlanan tam yerleşim gözlenmedi.')+'\nDöndürme/yansıtma grubunda en çok '+patterns.maxGeometricRepeat+' tekrar. '+patterns.evidence+'.\n'+patterns.notice},{name:'🧾 Tarama ve OCR',value:report.scan.scanned+'/'+(report.scan.limit>5000?'tüm geçmiş':report.scan.limit)+' mesaj · '+report.scan.state+'\nOCR: '+(report.ocr.map(r=>r.status+' '+r.count).join(' · ')||'kuyruk boş')+'\nOkunan net toplam '+net.toLocaleString('tr-TR')+' · '+known+' kayıt'},{name:'📚 Kategori/komut etkinliği',value:report.categories.map(r=>r.category+': '+r.uses).join(' · ')+'\n'+(report.usage.slice(0,8).map(r=>r.command+': '+r.uses).join(' · ')||'Tanınan komut kaydı yok.')}],image:{url:'attachment://'+filename},footer:{text:'Tarama verisiyle hesaplanır • Az örnek ve okunamayan sonuçlar gizlenmez'}}],files:[{attachment:image,name:filename}],components:[{type:1,components:['TUMU','MINES','BLACKJACK','COINFLIP'].map((game,n)=>({type:2,style:n===0?1:2,label:{TUMU:'🎮 Tümü',MINES:'💎 Mines',BLACKJACK:'🃏 BJ',COINFLIP:'🪙 CF'}[game],custom_id:'tp-owo:r:'+(report.userId?'me':'channel')+':'+report.period.key+':'+game+':1'}))},{type:1,components:['SLOTS','WSG','BATTLE'].map(game=>({type:2,style:2,label:game,custom_id:'tp-owo:r:'+(report.userId?'me':'channel')+':'+report.period.key+':'+game+':1'}))},{type:1,components:[{type:2,style:2,label:'◀ Önceki',custom_id:'tp-owo:r:'+(report.userId?'me':'channel')+':'+report.period.key+':'+report.game+':'+Math.max(1,report.page-1),disabled:report.page===1},{type:2,style:2,label:'Sonraki ▶',custom_id:'tp-owo:r:'+(report.userId?'me':'channel')+':'+report.period.key+':'+report.game+':'+(report.page+1),disabled:report.page>=Math.max(1,Math.ceil(report.games.length/8),Math.ceil(scoreRows.length/12))}]}],allowedMentions:{parse:[]}};return body;
}
export async function owoPersonalStatistics(userId:string,mines?:number|null,scopeConfig?:any){
 const cfg=scopeConfig||await settings(),stats=await owoStatistics(userId,cfg),scope=[cfg.guild_id,cfg.channel_id,cfg.source_id,userId];
 const [usage,latest]=await Promise.all([
  database().query('SELECT command,count(*)::int AS uses FROM owo_requests WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND user_id=$4 AND expires_at>now() GROUP BY command ORDER BY count(*) DESC,command LIMIT 50',scope),
  database().query("SELECT message_id,game,phase,bet,payout,net,state,source_created_at FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND player_id=$4 AND expires_at>now() ORDER BY source_created_at DESC LIMIT 5000",scope)
 ]);
 const completed=latest.rows.filter(r=>['WIN','LOSS','PUSH'].includes(r.phase)),coin=completed.filter(r=>r.game==='COINFLIP');
 const choiceRates=['HEADS','TAILS'].map(choice=>{const records=coin.filter(r=>r.state.choice===choice);return {choice,games:records.length,wins:records.filter(r=>r.phase==='WIN').length,interval:wilson(records.filter(r=>r.phase==='WIN').length,records.length)};});
 let losingStreak=0;for(const row of completed){if(row.net==null||Number(row.net)>=0)break;losingStreak++;}
 const games=stats.users.map((g:any)=>({...g,roi:Number(g.known_bets)>0?Number(g.net)/Number(g.known_bets):null,winInterval:wilson(Number(g.wins),Number(g.games))}));
 const currentMines=mines??stats.boards.find(b=>Number.isInteger(b.mines))?.mines??null,mineCohorts=[...new Set(stats.boards.map(b=>b.mines).filter(n=>Number.isInteger(n)))].map(n=>mineProfiles(stats.boards,n));
 return {userId,totals:stats.totals,games,usage:usage.rows,losingStreak,choiceRates,mineProfile:mineProfiles(stats.boards,currentMines),mineCohorts,recent:latest.rows.slice(0,10).map(r=>({messageId:r.message_id,game:r.game,phase:r.phase,bet:r.bet,payout:r.payout,net:r.net,at:r.source_created_at})),detailLimit:5000,notice:'Yalnız senin kimlikle ilişkilendirilen gözlemlerin. Genel toplamlar tutulan tüm kayıtlardan; seçim/seri ayrıntıları en yeni 5000 oyun ve 1000 Mines tahtasından. %95 aralıklar betimleyicidir; gelecek sonucu garanti etmez.'};
}
async function currentObservation(session:any){return (await database().query("SELECT state,message_id,source_edited_at FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND player_id=$4 AND expires_at>now() ORDER BY source_created_at DESC LIMIT 1",[session.guild_id,session.channel_id,session.source_id,session.user_id])).rows[0]||null;}
export function owoSessionCard(session:any,observation:Observation|null,closed=false,report?:Awaited<ReturnType<typeof owoObservedReport>>){
 const remaining=Math.max(0,Math.ceil((new Date(session.expires_at).getTime()-Date.now())/1000)),bj=observation?.game==='BLACKJACK'?report?.blackjack.byScore.find(r=>r.score===observation.score&&r.soft===observation.soft):null;
 const analysis=observation?.game==='BLACKJACK'?(bj?'Bu el toplamında taramada '+bj.wins+'/'+bj.games+' kazanım · '+percent(bj.rate):'Bu el toplamında sonuçla eşleşmiş tarama örneği henüz yok.'):observation?.advice||'Güvenilir kaynak mesajı bekleniyor.';
 return {content:'',embeds:[{title:'🔎 TurkishPix · OwO Analiz Oturumu',color:closed?0x6b7280:0x7c5cff,description:closed?'Oturum kapandı. /owo calistir ile yeniden aç.':'Senin oyunların izleniyor. Oranlar taranan OwO mesajlarından hesaplanır.',fields:[{name:'⏱️ Süre',value:closed?'Kapalı':session.panel_message_id&&!Number.isFinite(new Date(session.expires_at).getTime())?'Durdurana kadar':remaining+' saniye',inline:true},{name:'🎮 Son gözlenen oyun',value:observation?observation.game+' · '+observation.phase:'Oyun bekleniyor.',inline:true},{name:'📅 Dönem',value:report?.period.label||'Bu üç günlük dönem',inline:true},{name:'📌 Tarama analizi',value:safe(analysis)},...(report?[{name:'📊 Senin sonuçların',value:report.games.slice(0,6).map(g=>g.game+': '+g.games+' sonuç · '+percent(g.rate)+' kazanım · net '+(g.moneyKnown?g.net:'bilinmiyor')).join('\n')||'Sonuç eşleştirmesi/OCR bekleniyor.'},{name:'🃏 El toplamlarına göre',value:bjLines(report).slice(0,1000)},{name:'💎 Mines örnekleri',value:profileSummary(report.mines)}]:[]),...(observation?.ocr?[{name:'👁️ Görsel OCR',value:observation.ocr.status+' · OCR güveni %'+observation.ocr.confidence.toFixed(1)+'\n'+safe((observation.ocr.trustedText||'Düşük güvenli metin kesin istatistiğe eklenmedi.').slice(0,850))}]:[])],footer:{text:'Geçmiş oranlar gelecekte kesin kazanım değildir • Tarama raporu düğmeleri • /owo tara'}}],components:closed?[]:[{type:1,components:[{type:2,style:2,label:'Durumu yenile',custom_id:'tp-owo:refresh:'+session.id},{type:2,style:4,label:'Oturumu durdur',custom_id:'tp-owo:stop:'+session.id},{type:2,style:1,label:'Kendi raporum',custom_id:'tp-owo:r:me:'+new Date(Date.now()+3*3600000).toISOString().slice(0,10)+':TUMU:1'},{type:2,style:2,label:'OCR',custom_id:'tp-owo:ocr'}]}],allowedMentions:{parse:[]}};
}
async function advisorDataset(row:any){
 const cfg=await settings(),stamp=cfg?.last_completed_scan_at||cfg?.scan_started_at||null,scope=[row.guild_id,row.channel_id,row.source_id,stamp];
 const records=(await database().query('SELECT * FROM owo_observations WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND ($4::timestamptz IS NULL OR last_scan_at>=$4 OR source_created_at>=$4) AND expires_at>now() ORDER BY source_created_at DESC LIMIT 5001',scope)).rows;
 const frames=(await database().query('SELECT message_id,phase,score,soft,state,source_edited_at FROM owo_frames WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND message_id=ANY($4::text[]) AND expires_at>now() ORDER BY source_edited_at DESC LIMIT 20001',[...scope.slice(0,3),records.slice(0,5000).map(r=>r.message_id)])).rows;
 return {records:records.slice(0,5000),frames:frames.slice(0,20000),truncated:records.length>5000||frames.length>20000,stamp};
}
async function sessionReply(row:any,observation:Observation|null,closed=false){
 const report=closed?undefined:await owoObservedReport(row.user_id,row,undefined,undefined,1,true),body:any=owoSessionCard(row,observation,closed,report);
 if(!closed&&observation){const data=await advisorDataset(row);body.embeds[0].fields.find((f:any)=>f.name==='📌 Tarama analizi').value=advisorText(observation,data.records,data.frames).replace(/[@`*_~|<>]/g,'').slice(0,1024);if(data.truncated)body.embeds[0].fields.push({name:'Örnek sınırı',value:'Canlı öneri en yeni 5000 oyun / 20000 gözlenen kare durumuyla sınırlıdır.'});
 if(observation.game==='MINES'){const channelReport=observedReport(data.records,data.frames,observation.mines);body.embeds[0].image={url:'attachment://owo-mines-istatistik.png'};body.files=[{attachment:await renderMinesStatistics(channelReport.mines,'Son tarama + yeni oyunlar','Kanal örnekleri',observation.board),name:'owo-mines-istatistik.png'}];}}
 return body;
}
async function patchSession(row:any,observation:Observation|null,closed=false){
 if(!row.webhook_cipher&&!row.panel_message_id)return;const endpoint=row.panel_message_id?'/channels/'+row.channel_id+'/messages/'+row.panel_message_id:'/webhooks/'+config().clientId+'/'+openOsintSecret<string>(row.webhook_cipher)+'/messages/@original',body=await sessionReply(row,observation,closed),files=body.files||[];
 const payload={...body,files:undefined,allowed_mentions:{parse:[]},allowedMentions:undefined,attachments:files.map((f:any,n:number)=>({id:n,filename:f.name}))};
 if(files.length){const form=new FormData();form.set('payload_json',JSON.stringify(payload));files.forEach((f:any,n:number)=>form.set('files['+n+']',new Blob([new Uint8Array(f.attachment)],{type:'image/png'}),f.name));await discordRequest(endpoint,{method:'PATCH',body:form});}
 else await discordRequest(endpoint,{method:'PATCH',body:JSON.stringify(payload)});
}
export async function handleOwoInteraction(i:any){
 const slash=!!i.isChatInputCommand?.()&&i.commandName==='owo',button=!!i.isButton?.()&&typeof i.customId==='string'&&i.customId.startsWith('tp-owo:');if(!slash&&!button)return false;
 try{
  await i.deferReply(slash&&i.options.getSubcommand()==='calistir'?{}:{flags:MessageFlags.Ephemeral});await assertOwoAccess(i.guild,i.user.id);await rateLimit('owo-command:'+i.user.id,8,60);
  const requested=slash?i.options.getSubcommand():'';if(slash&&!['kanal','tara','calistir'].includes(requested))throw new DomainError('OWO_ACTION','Eski komut kaldırıldı: /owo kanal, /owo tara veya /owo calistir kullan.',400);
  const sub=requested;
  if(sub==='kanal'){const channel=i.options.getChannel('kanal')?.id||i.channelId,source=i.options.getUser('kaynak')?.id||OWO_SOURCE_BOT;await configureOwo(i,channel,source);await i.editReply({content:'✅ Analiz kaynağı ayarlandı: <#'+channel+'> · <@'+source+'>. /owo calistir ile oturum aç; /owo tara ile erişilebilir geçmişi tara.',allowedMentions:{parse:[]}});return true;}
  let cfg=await settings();if(!cfg&&sub==='calistir')cfg=await configureOwo(i,i.channelId,OWO_SOURCE_BOT);if(!cfg)throw new DomainError('OWO_NOT_CONFIGURED','Önce /owo kanal ile kanal ve kaynak botu seç.',400);
  const channel=await allowedChannel(i.guild,cfg.channel_id,i.user.id);
  if(sub==='calistir'){
   if(!channel.permissionsFor(i.guild.members.me)?.has(permissions|PermissionFlagsBits.SendMessages|PermissionFlagsBits.EmbedLinks|PermissionFlagsBits.AttachFiles))throw new DomainError('OWO_BOT_PERMISSION','Canlı panel için botun Mesaj Gönder, Bağlantı Yerleştir ve Dosya Ekle izinleri gerekiyor.',403);
   if(i.channelId!==cfg.channel_id)throw new DomainError('OWO_WRONG_CHANNEL','Oturumu yapılandırılmış kanalda başlat: <#'+cfg.channel_id+'>.',400);
   const minutes=i.options.getInteger('sure')??null;if(minutes!==null&&(!Number.isInteger(minutes)||minutes<1||minutes>1440))throw new DomainError('OWO_DURATION','Süre 1–1440 dakika olabilir; boşsa durdurana kadar çalışır.',400);
   const row=await transaction(async tx=>{await syncUser(tx,i.user);await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['owo-session:'+i.guildId+':'+i.user.id]);await tx.query("UPDATE owo_sessions SET status='STOPPED',webhook_cipher='' WHERE guild_id=$1 AND user_id=$2 AND status='ACTIVE'",[i.guildId,i.user.id]);return (await tx.query("INSERT INTO owo_sessions(id,guild_id,user_id,channel_id,source_id,expires_at,webhook_cipher) VALUES($1,$2,$3,$4,$5,CASE WHEN $6::int IS NULL THEN 'infinity'::timestamptz ELSE now()+$6*interval '1 minute' END,$7) RETURNING *",[randomUUID(),i.guildId,i.user.id,cfg.channel_id,cfg.source_id,minutes,''])).rows[0];});
   const history=await channel.messages.fetch({limit:100});for(const message of [...history.values()].sort((a:any,b:any)=>Number(BigInt(a.id)-BigInt(b.id))))await ingestOwoMessage(message,true);
   const observed=(await currentObservation(row))?.state||null;
   await record(i.user,'OWO_SESSION_START',{channelId:cfg.channel_id,minutes});const message=await i.editReply(await sessionReply({...row,panel_message_id:'pending'},observed));const id=message?.id||(await i.fetchReply?.())?.id;if(!snowflake.test(id||''))throw new DomainError('OWO_PANEL','Canlı panel mesajı alınamadı.',503);await database().query('UPDATE owo_sessions SET panel_message_id=$2 WHERE id=$1',[row.id,id]);return true;
  }
  if(sub==='tara'){
   const date=i.options.getString('tarih')||undefined;let after:Date|null=null;if(date){owoPeriod(date);after=new Date(date+'T00:00:00+03:00');if(after.getTime()>Date.now())throw new DomainError('OWO_DATE','Gelecekteki tarih taranamaz.',400);}const period=owoPeriod();
   await database().query("UPDATE owo_channels SET scan_state='RUNNING',configured_by=$2,cursor_before=NULL,scanned_count=0,scan_limit=2147483647,scan_after=$3,scan_started_at=now(),scan_completed_at=NULL,last_error='',scan_period=$4,next_scan_at=$5,updated_at=now() WHERE guild_id=$1",[i.guildId,i.user.id,after,period.key,period.end]);
   await record(i.user,'OWO_SCAN_START',{channelId:cfg.channel_id,date:date||'oldest'});await i.editReply({embeds:[{title:'🔎 Tarihli tarama başladı',color:0x7c5cff,description:(date?date+' tarihinden itibaren':'Erişilebilir en eski mesaja kadar')+' geçmiş 100 mesajlık sayfalarla okunuyor. Yeniden başlatmada kaldığı yerden sürer; OCR ayrı kuyrukta çalışır.'}],components:[{type:1,components:[{type:2,style:1,label:'Kanal istatistikleri',custom_id:'tp-owo:r:channel:'+new Date(Date.now()+3*3600000).toISOString().slice(0,10)+':TUMU:1'},{type:2,style:2,label:'Görsel okumaları',custom_id:'tp-owo:ocr'}]}],allowedMentions:{parse:[]}});return true;
  }
  if(button&&i.customId.startsWith('tp-owo:r:')){
   const parts=i.customId.split(':'),mine=parts[2]==='me',date=parts[3],game=parts[4];
   if(!['TUMU','MINES','BLACKJACK','COINFLIP','SLOTS','WSG','BATTLE'].includes(game))throw new DomainError('OWO_GAME','Geçerli oyun seç.',400);
   await i.editReply(await owoReportBody(await owoObservedReport(mine?i.user.id:undefined,cfg,date,game,Number(parts[5]||1))));return true;
  }
  if(button&&i.customId==='tp-owo:ocr'){
   const jobs=(await database().query("SELECT status,result,last_error FROM owo_ocr_jobs WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND last_error<>'OWO_OCR_REPLACED' AND expires_at>now() ORDER BY created_at DESC LIMIT 5",[cfg.guild_id,cfg.channel_id,cfg.source_id])).rows;
   await i.editReply({embeds:[{title:'👁️ OwO · Son Görsel Okumaları',color:0x7c5cff,description:'Yalnız yapılandırılmış kaynak görselleri. OCR güveni, sonuç doğruluğu garantisi değildir.',fields:jobs.length?jobs.map((j,n)=>({name:'Görsel '+(n+1)+' · '+j.status,value:j.result?'OCR güveni %'+Number(j.result.confidence).toFixed(1)+'\n'+safe((j.result.text||'Metin bulunamadı.').slice(0,850)):({OWO_OCR_HOST:'Discord medya kopyası alınamadı; kaynak mesaj yeniden kontrol edilecek.',OWO_OCR_FETCH:'Görsel alınamadı; bağlantı veya adresin süresi nedeniyle yeniden denenecek.',OWO_OCR_FORMAT:'Görsel PNG/JPEG/WebP/GIF biçiminde değil.',OWO_OCR_SIZE:'Görsel 8 MB sınırını aşıyor.'} as Record<string,string>)[j.last_error]||(j.last_error?'Görsel işlenemedi; yeniden tara veya yeni kaynak mesajını bekle.':'Kuyrukta işlenmeyi bekliyor.')})):[{name:'Görsel yok',value:'Kaynak mesajında PNG/JPEG/WebP görseli beklenecek.'}]}],allowedMentions:{parse:[]}});return true;
  }
  const parts=button?i.customId.split(':'):[],sessionId=parts[2];if(button&&!uuid.test(sessionId||''))throw new DomainError('OWO_SESSION','Oturum ID geçersiz.',400);
  const row=(await database().query("SELECT * FROM owo_sessions WHERE guild_id=$1 AND user_id=$2 AND "+(button?'id=$3':"status='ACTIVE'")+" ORDER BY created_at DESC LIMIT 1",button?[i.guildId,i.user.id,sessionId]:[i.guildId,i.user.id])).rows[0];
  if(!row)throw new DomainError('OWO_SESSION','Bu oturum sana ait değil veya açık oturumun yok.',403);
  if(row.channel_id!==i.channelId)throw new DomainError('OWO_WRONG_CHANNEL','Oturum başka bir kanala ait.',403);
  if(row.status!=='ACTIVE'||new Date(row.expires_at).getTime()<=Date.now())throw new DomainError('OWO_EXPIRED','Oturumun süresi doldu. /owo calistir ile yeniden başlat.',410);
  if(button&&parts[1]==='stop'){await database().query("UPDATE owo_sessions SET status='STOPPED' WHERE id=$1",[row.id]);await patchSession(row,null,true).catch(()=>{});await database().query("UPDATE owo_sessions SET webhook_cipher='' WHERE id=$1",[row.id]);await record(i.user,'OWO_SESSION_STOP',{sessionId:row.id});await i.editReply({content:'✅ Kendi analiz oturumun kapatıldı.',allowedMentions:{parse:[]}});return true;}
  if(button&&parts[1]==='refresh'){const observation=(await currentObservation(row))?.state||null;if(button){await patchSession(row,observation);await i.editReply({content:'✅ Kendi panelin güncellendi.',allowedMentions:{parse:[]}});}else await i.editReply(await sessionReply(row,observation));return true;}
  throw new DomainError('OWO_ACTION','Bilinmeyen analiz işlemi.',400);
 }catch(e){const code=e instanceof DomainError?e.code:'OWO_FAILED';await record(i.user,'OWO_ACCESS_OR_ACTION_DENIED',{code}).catch(()=>{});const body={content:'⚠️ '+(e instanceof DomainError?e.message:'Analiz işlemi tamamlanamadı. Kanal izinlerini ve kaynak botu kontrol et.'),allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(body).catch(()=>{});else await i.reply({...body,flags:MessageFlags.Ephemeral}).catch(()=>{});}
 return true;
}
/** Read one history page per tick. A persisted cursor resumes after restart. */
export async function owoTick(client:any){
 if(ticking)return;ticking=true;try{
  const guild=client.guilds.cache.get(config().guildId);if(!guild)return;
  if(Date.now()>nextCleanup){nextCleanup=Date.now()+3600000;await database().query('DELETE FROM owo_observations WHERE expires_at<=now()');await database().query('DELETE FROM owo_requests WHERE expires_at<=now()');await database().query('DELETE FROM owo_frames WHERE expires_at<=now()');await database().query('DELETE FROM owo_ocr_jobs WHERE expires_at<=now()');await database().query("DELETE FROM owo_sessions WHERE status<>'ACTIVE' AND created_at<now()-interval '1 day'");}
  let watch=await settings();
  if(watch?.tracking_enabled&&!(new Date(watch.watch_until).getTime()>Date.now())){
   try{await allowedChannel(guild,watch.channel_id,watch.configured_by);await database().query("UPDATE owo_channels SET watch_until=now()+interval '30 seconds' WHERE guild_id=$1 AND channel_id=$2 AND source_id=$3 AND updated_at=$4",[guild.id,watch.channel_id,watch.source_id,watch.revision]);}
   catch{await database().query("UPDATE owo_channels SET tracking_enabled=false,scan_state=CASE WHEN scan_state='RUNNING' THEN 'ERROR' ELSE scan_state END,last_error='OWO_TRACKING_ACCESS',watch_until=now() WHERE guild_id=$1 AND updated_at=$2",[guild.id,watch.revision]);}
   watch=await settings();
  }
  if(watch?.tracking_enabled&&new Date(watch.watch_until).getTime()>Date.now()&&new Date(watch.next_scan_at).getTime()<=Date.now()&&watch.scan_state!=='RUNNING'){
   const period=owoPeriod();await database().query("UPDATE owo_channels SET scan_state='RUNNING',scan_after=NULL,scan_limit=700,cursor_before=NULL,scanned_count=0,scan_started_at=now(),scan_completed_at=NULL,last_error='',scan_period=$2,next_scan_at=$3,updated_at=now() WHERE guild_id=$1 AND updated_at=$4 AND scan_state<>'RUNNING'",[guild.id,period.key,period.end,watch.revision]);
  }
  const sessions=(await database().query("SELECT * FROM owo_sessions WHERE guild_id=$1 AND status='ACTIVE' AND (next_update_at<=now() OR expires_at<=now()) ORDER BY next_update_at LIMIT 50",[guild.id])).rows;
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
   const channel=await allowedChannel(guild,cfg.channel_id,cfg.configured_by),remaining=Math.max(0,Number(cfg.scan_limit)-Number(cfg.scanned_count)),pageSize=Math.min(100,remaining);if(!pageSize){await database().query("UPDATE owo_channels SET scan_state='COMPLETE',scan_completed_at=now(),last_completed_scan_at=scan_started_at WHERE guild_id=$1 AND updated_at=$2",[guild.id,cfg.revision]);return;}const page=await channel.messages.fetch({limit:pageSize,...(cfg.cursor_before?{before:cfg.cursor_before}:{})}),messages=[...page.values()] as any[];
   if(messages.some(m=>!snowflake.test(m.id)||cfg.cursor_before&&BigInt(m.id)>=BigInt(cfg.cursor_before)))throw new DomainError('OWO_CURSOR','Discord geçmiş sayfası sıralaması doğrulanamadı.',503);
   for(const message of messages.filter(m=>!cfg.scan_after||Number(m.createdTimestamp)>=new Date(cfg.scan_after).getTime()).sort((a:any,b:any)=>Number(BigInt(a.id)-BigInt(b.id))))await ingestOwoMessage(message,true,undefined,cfg.scan_started_at);
   const cursor=messages.reduce((min:string|null,m:any)=>!min||BigInt(m.id)<BigInt(min)?m.id:min,cfg.cursor_before||null);
   await database().query("UPDATE owo_channels SET cursor_before=$2,scanned_count=scanned_count+$3,scan_state=CASE WHEN $4 THEN 'COMPLETE' ELSE 'RUNNING' END,scan_completed_at=CASE WHEN $4 THEN now() ELSE NULL END,last_completed_scan_at=CASE WHEN $4 THEN scan_started_at ELSE last_completed_scan_at END,last_error='' WHERE guild_id=$1 AND channel_id=$5 AND source_id=$6 AND scan_state='RUNNING' AND updated_at=$7",[guild.id,cursor,messages.length,messages.length<pageSize||messages.length>=remaining||!!cfg.scan_after&&messages.some(m=>Number(m.createdTimestamp)<new Date(cfg.scan_after).getTime()),cfg.channel_id,cfg.source_id,cfg.revision]);
  }catch(e){await database().query("UPDATE owo_channels SET scan_state='ERROR',last_error=$2 WHERE guild_id=$1 AND channel_id=$3 AND source_id=$4 AND scan_state='RUNNING' AND updated_at=$5",[guild.id,e instanceof DomainError?e.code:'HISTORY_FAILED',cfg.channel_id,cfg.source_id,cfg.revision]);}finally{scanning=false;}
 }finally{ticking=false;}
}
