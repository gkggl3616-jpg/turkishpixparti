import {randomUUID} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction,type DB} from './db';
import {syncUser} from './discord';
import {rateLimit} from './auth';
import {entertainmentNames} from './entertainment-catalog';
import {isArcadeBoard} from './arcade-policy';
import {advanceGame,type GameState} from './entertainment-games';
export type EntertainmentSettings={enabled:boolean;channelIds:string[];disabledCommands:string[];cooldownSeconds:number};
export const defaultEntertainmentSettings=():EntertainmentSettings=>({enabled:true,channelIds:[],disabledCommands:[],cooldownSeconds:5});
type Actor={id:string;username:string;avatar?:string|null};
export type EntertainmentSession={id:string;guild_id:string;channel_id:string;owner_id:string;kind:string;state:GameState;status:'ACTIVE'|'FINISHED'|'EXPIRED';expires_at:Date|string;message_id:string|null};
export function checkEntertainment(settings:EntertainmentSettings,name:string,channelId:string){if(!entertainmentNames.includes(name)&&!isArcadeBoard(name))throw new DomainError('UNKNOWN_COMMAND','Komut bulunamadı.');if(!settings.enabled||settings.disabledCommands.includes(name))throw new DomainError('ENTERTAINMENT_DISABLED','Bu eğlence komutu sunucuda kapalı.');if(settings.channelIds.length&&!settings.channelIds.includes(channelId))throw new DomainError('ENTERTAINMENT_CHANNEL','Bu komut için panelde seçilmiş bir eğlence kanalını kullan.');}
export async function entertainmentRate(actor:Actor,name:string,settings:EntertainmentSettings){await rateLimit(`fun:all:${config().guildId}:${actor.id}`,12,60);await rateLimit(`fun:${config().guildId}:${actor.id}:${name}`,1,name==='anket'?300:settings.cooldownSeconds);}
export async function startEntertainment(actor:Actor,channelId:string,state:GameState,durationSeconds=300){
 const id=randomUUID();return transaction(async tx=>{await syncUser(tx,actor);await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['fun:'+config().guildId+':'+actor.id]);
  const active=(await tx.query("SELECT count(*)::int AS n FROM entertainment_sessions WHERE guild_id=$1 AND owner_id=$2 AND status='ACTIVE' AND expires_at>now()",[config().guildId,actor.id])).rows[0].n;if(active>=3)throw new DomainError('TOO_MANY_GAMES','Aynı anda en fazla 3 oyun veya anket açık olabilir. Önce birini tamamla.');
  return (await tx.query<EntertainmentSession>("INSERT INTO entertainment_sessions(id,guild_id,channel_id,owner_id,kind,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 second') RETURNING *",[id,config().guildId,channelId,actor.id,state.kind,state,Math.max(30,Math.min(3600,durationSeconds))])).rows[0];
 });
}
function authorize(row:EntertainmentSession|undefined,actor:Actor,channelId:string,revision:number,settings:EntertainmentSettings,ownerOnly=true){
 if(!row||row.guild_id!==config().guildId||row.channel_id!==channelId)throw new DomainError('GAME_NOT_FOUND','Oyun bulunamadı veya başka bir kanala ait.');
 checkEntertainment(settings,row.kind,channelId);
 if(ownerOnly&&row.owner_id!==actor.id)throw new DomainError('GAME_OWNER','Bu oyun onu başlatan üyeye ait. Kendi oyununu komutla başlatabilirsin.');
 if(row.status!=='ACTIVE'||new Date(row.expires_at).getTime()<=Date.now())throw new DomainError('GAME_EXPIRED','Bu oyun tamamlandı veya süresi doldu. Yeni bir oyun başlatabilirsin.');
 if(row.state.revision!==revision)throw new DomainError('STALE_GAME','Oyun ilerledi. Mesajdaki güncel düğmeleri kullan.');return row;
}
export async function getEntertainmentSession(id:string){return (await database().query<EntertainmentSession>('SELECT * FROM entertainment_sessions WHERE id=$1 AND guild_id=$2',[id,config().guildId])).rows[0];}
export async function validateEntertainmentSession(id:string,actor:Actor,channelId:string,revision:number,settings:EntertainmentSettings){return authorize(await getEntertainmentSession(id),actor,channelId,revision,settings);}
export async function attachEntertainmentMessage(id:string,messageId:string){await database().query('UPDATE entertainment_sessions SET message_id=$2 WHERE id=$1 AND guild_id=$3',[id,messageId,config().guildId]);}
async function scoreGame(tx:DB,row:EntertainmentSession,actor:Actor){
 // The owner advisory lock serializes daily point caps across different games.
 await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['fun:'+row.guild_id+':'+actor.id]);
 const used=Number((await tx.query("SELECT coalesce(sum(points),0)::int AS n FROM entertainment_results WHERE guild_id=$1 AND user_id=$2 AND created_at>=date_trunc('day',now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'",[row.guild_id,actor.id])).rows[0].n);
 const award=Math.min(500-used,row.state.result==='WIN'?20:row.state.result==='DRAW'?5:0);row.state.awarded=Math.max(0,award);
 const inserted=await tx.query('INSERT INTO entertainment_results(session_id,guild_id,user_id,points) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING session_id',[row.id,row.guild_id,actor.id,row.state.awarded]);if(!inserted.rows.length)return;
 const reflex=row.kind==='refleks'&&row.state.result==='WIN'?row.state.elapsed:null;
 await tx.query('INSERT INTO entertainment_scores(guild_id,user_id,played,wins,points,best_reflex_ms) VALUES($1,$2,1,$3,$4,$5) ON CONFLICT(guild_id,user_id) DO UPDATE SET played=entertainment_scores.played+1,wins=entertainment_scores.wins+EXCLUDED.wins,points=entertainment_scores.points+EXCLUDED.points,best_reflex_ms=LEAST(entertainment_scores.best_reflex_ms,EXCLUDED.best_reflex_ms),updated_at=now()',[row.guild_id,actor.id,row.state.result==='WIN'?1:0,row.state.awarded,reflex]);
}
export async function playEntertainment(id:string,actor:Actor,channelId:string,revision:number,action:string,value:string,settings:EntertainmentSettings){return transaction(async tx=>{
 const row=authorize((await tx.query<EntertainmentSession>('SELECT * FROM entertainment_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0],actor,channelId,revision,settings);
 if(row.kind==='anket')throw new DomainError('INVALID_GAME','Anket düğmesini kullan.');
 row.state=advanceGame(row.state,action,value);if(row.state.phase==='DONE'){row.status='FINISHED';await scoreGame(tx,row,actor);}
 await tx.query('UPDATE entertainment_sessions SET state=$2,status=$3,updated_at=now() WHERE id=$1',[id,row.state,row.status]);return row;
});}
export async function pollEntertainment(id:string,actor:Actor,channelId:string,revision:number,action:string,settings:EntertainmentSettings){return transaction(async tx=>{
 const row=authorize((await tx.query<EntertainmentSession>('SELECT * FROM entertainment_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0],actor,channelId,revision,settings,false);
 if(row.kind!=='anket')throw new DomainError('INVALID_GAME','Bu mesaj bir anket değil.');
 if(action==='close'){if(row.owner_id!==actor.id&&!config().owners.includes(actor.id))throw new DomainError('POLL_OWNER','Anketi yalnızca başlatan üye veya owner kapatabilir.');row.status='FINISHED';row.state.phase='DONE';row.state.revision++;}
 else{if(!/^[0-4]$/.test(action)||Number(action)>=row.state.choices.length)throw new DomainError('INVALID_VOTE','Geçersiz anket seçeneği.');await syncUser(tx,actor);const vote=await tx.query('INSERT INTO entertainment_votes(session_id,user_id,choice) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING choice',[id,actor.id,Number(action)]);if(!vote.rows.length)throw new DomainError('ALREADY_VOTED','Bu ankette zaten oy kullandın. Her hesap bir kez oy kullanabilir.');}
 const counts=(await tx.query('SELECT choice,count(*)::int AS n FROM entertainment_votes WHERE session_id=$1 GROUP BY choice',[id])).rows;row.state.counts=row.state.choices.map((_:string,i:number)=>counts.find(x=>Number(x.choice)===i)?.n||0);
 await tx.query('UPDATE entertainment_sessions SET state=$2,status=$3,updated_at=now() WHERE id=$1',[id,row.state,row.status]);return row;
});}
export async function entertainmentProfile(userId:string){return (await database().query('SELECT * FROM entertainment_scores WHERE guild_id=$1 AND user_id=$2',[config().guildId,userId])).rows[0]||{played:0,wins:0,points:0,best_reflex_ms:null};}
export async function entertainmentLeaderboard(){return (await database().query('SELECT s.*,u.username FROM entertainment_scores s JOIN users u ON u.id=s.user_id WHERE s.guild_id=$1 ORDER BY s.points DESC,s.wins DESC,s.updated_at ASC,s.user_id ASC LIMIT 10',[config().guildId])).rows;}
export async function expireEntertainmentSessions(){
 const expired=(await database().query<EntertainmentSession>("UPDATE entertainment_sessions SET status='EXPIRED',updated_at=now() WHERE guild_id=$1 AND status='ACTIVE' AND expires_at<=now() RETURNING *",[config().guildId])).rows;
 await database().query("DELETE FROM entertainment_sessions WHERE guild_id=$1 AND status<>'ACTIVE' AND expires_at<now()-interval '7 days'",[config().guildId]);return expired.filter(x=>x.kind==='anket'&&x.message_id);
}
