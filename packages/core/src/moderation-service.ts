import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {syncUser} from './discord';
import {audit,sha256} from './audit';
import {type ModerationDecision} from './moderation-engine';
import {type ContentModerationSettings} from './moderation-policy';
type Actor={id:string;username:string;avatar?:string|null};
export async function recordModeration(actor:Actor,input:{messageId:string;channelId:string;content:string;source:'CREATE'|'EDIT'|'NATIVE';decision:ModerationDecision;action:string},settings:ContentModerationSettings){return transaction(async tx=>{
 await syncUser(tx,actor);await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['moderation:'+config().guildId+':'+actor.id]);
 const existing=(await tx.query('SELECT * FROM moderation_cases WHERE guild_id=$1 AND message_id=$2 FOR UPDATE',[config().guildId,input.messageId])).rows[0],fingerprint=sha256(input.content),strike=input.decision.mode==='DELETE';
 if(existing&&((existing.fingerprint===fingerprint&&existing.mode===input.decision.mode)||existing.strike||existing.status==='DISMISSED'))return {id:existing.id,duplicate:true,hits:0,shouldTimeout:false};
 const id=existing?.id||randomUUID();
 if(existing)await tx.query("UPDATE moderation_cases SET category=$2,rule_id=$3,mode=$4,source=$5,fingerprint=$6,action=$7,strike=$8,status='OPEN',created_at=CASE WHEN NOT strike AND $8 THEN now() ELSE created_at END,updated_at=now() WHERE id=$1",[id,input.decision.category,input.decision.ruleId,input.decision.mode,input.source,fingerprint,input.action,strike]);
 else await tx.query('INSERT INTO moderation_cases(id,guild_id,message_id,user_id,channel_id,category,rule_id,mode,source,fingerprint,action,strike) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,config().guildId,input.messageId,actor.id,input.channelId,input.decision.category,input.decision.ruleId,input.decision.mode,input.source,fingerprint,input.action,strike]);
 const hits=Number((await tx.query("SELECT count(*)::int AS n FROM moderation_cases WHERE guild_id=$1 AND user_id=$2 AND strike AND status<>'DISMISSED' AND created_at>now()-$3*interval '1 minute'",[config().guildId,actor.id,settings.escalation.windowMinutes])).rows[0].n);
 const metadata={caseId:id,messageId:input.messageId,category:input.decision.category,ruleId:input.decision.ruleId,confidence:input.decision.confidence,source:input.source,obfuscated:input.decision.obfuscated,hits};
 await tx.query('INSERT INTO security_events(id,guild_id,user_id,channel_id,reason,action,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),config().guildId,actor.id,input.channelId,input.decision.category,input.action,metadata]);await audit(tx,actor.id,'CHAT_MODERATION',id,{...metadata,action:input.action});
 return {id,duplicate:false,hits,shouldTimeout:strike&&settings.escalation.enabled&&hits>=settings.escalation.threshold};
});}
export async function moderationAction(id:string,action:string){await transaction(async tx=>{
 const row=(await tx.query('UPDATE moderation_cases SET action=$2,updated_at=now() WHERE id=$1 AND guild_id=$3 RETURNING user_id',[id,action,config().guildId])).rows[0];if(!row)return;
 await tx.query("UPDATE security_events SET action=$2 WHERE metadata->>'caseId'=$1 AND guild_id=$3",[id,action,config().guildId]);await audit(tx,row.user_id,'CHAT_MODERATION_ACTION',id,{action});
});}
export async function moderationOverview(){const guildId=config().guildId;const [cases,stats,native]=await Promise.all([
 database().query('SELECT c.*,u.username FROM moderation_cases c JOIN users u ON u.id=c.user_id WHERE c.guild_id=$1 ORDER BY c.created_at DESC LIMIT 50',[guildId]),
 database().query("SELECT category,count(*)::int AS total,count(*) FILTER(WHERE mode='DELETE')::int AS deleted,count(*) FILTER(WHERE mode='REVIEW' AND status='OPEN')::int AS review FROM moderation_cases WHERE guild_id=$1 AND created_at>now()-interval '24 hours' GROUP BY category",[guildId]),database().query("SELECT status,updated_at FROM integration_status WHERE name='automod'")
 ]);return {cases:cases.rows,stats:stats.rows,native:native.rows[0]||null};}
export async function reviewModeration(actor:Actor,input:unknown){if(!config().owners.includes(actor.id)||config().demo)throw new DomainError('FORBIDDEN','Bu alan yalnızca owner hesaplarına açık.',403);const data=z.object({id:z.uuid(),status:z.enum(['DISMISSED','CONFIRMED'])}).parse(input);
 await transaction(async tx=>{await syncUser(tx,actor);const row=(await tx.query('SELECT * FROM moderation_cases WHERE id=$1 AND guild_id=$2 FOR UPDATE',[data.id,config().guildId])).rows[0];if(!row)throw new DomainError('CASE_NOT_FOUND','Kayıt bulunamadı.',404);if(row.status!=='OPEN')throw new DomainError('CASE_REVIEWED','Bu kayıt zaten değerlendirilmiş.',409);
  await tx.query('UPDATE moderation_cases SET status=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE id=$1',[data.id,data.status,actor.id]);await audit(tx,actor.id,'MODERATION_CASE_REVIEWED',data.id,{status:data.status});
 });return {message:data.status==='DISMISSED'?'Yanlış eşleşme olarak işaretlendi; bu kayıt tekrar ihlal sayısından çıkarıldı.':'Kayıt doğrulandı. Önceden uygulanan Discord işlemleri bu incelemeyle değişmez.'};}
export async function cleanupModeration(settings:ContentModerationSettings){await database().query("DELETE FROM moderation_cases WHERE guild_id=$1 AND created_at<now()-$2*interval '1 day'",[config().guildId,settings.reviewRetentionDays]);}
