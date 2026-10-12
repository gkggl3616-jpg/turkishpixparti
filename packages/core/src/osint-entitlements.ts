import {randomUUID} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction,type DB} from './db';
import {guildMember,syncUser} from './discord';
import {loadServerSettings} from './setup';
import {audit} from './audit';
export function assertOsintOwner(id:string){if(!config().owners.includes(id))throw new DomainError('FORBIDDEN','Bu işlem yalnızca tanımlı owner hesaplarına açık.',403);}
export async function entitlement(userId:string,dailyLimit:number,tx:DB=database()){
 const used=Number((await tx.query("SELECT count(*)::int AS n FROM osint_usage WHERE guild_id=$1 AND user_id=$2 AND billing_source='DAILY' AND day=(now() AT TIME ZONE 'Europe/Istanbul')::date",[config().guildId,userId])).rows[0]?.n||0);
 const grants=(await tx.query('SELECT id,credits,used,expires_at FROM osint_grants WHERE guild_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() AND used<credits ORDER BY expires_at,id',[config().guildId,userId])).rows;
 const extraCredits=grants.reduce((n,g)=>Math.min(Number.MAX_SAFE_INTEGER,n+Number(g.credits)-Number(g.used)),0);
 const unlimited=config().owners.includes(userId);
 return {unlimited,dailyLimit:unlimited?null:dailyLimit,used,extraCredits,remaining:unlimited?null:Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,dailyLimit-used)+extraCredits),grants:grants.map(g=>({id:g.id,remaining:Number(g.credits)-Number(g.used),expiresAt:g.expires_at}))};
}
export async function consumeOsintCredit(tx:DB,userId:string,requestId:string,kind:string,fingerprint:string,dailyLimit:number){
 await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['osint:'+config().guildId+':'+userId]);
 const previous=(await tx.query('SELECT request_id,query_kind,target_sha256 FROM osint_usage WHERE guild_id=$1 AND user_id=$2 AND request_id=$3',[config().guildId,userId,requestId])).rows[0];
 if(previous){if(previous.query_kind!==kind||previous.target_sha256!==fingerprint)throw new DomainError('OSINT_REQUEST_REUSED','Bu işlem kodu başka bir sorguyla kullanılmış.',409);return {duplicate:true};}
 const q=await entitlement(userId,dailyLimit,tx);
 let source='DAILY',grantId:string|null=null;
 if(q.unlimited)source='OWNER';
 else if(q.used>=dailyLimit){
  const grant=q.grants[0];if(!grant)throw new DomainError('OSINT_QUOTA','Araştırma hakkın doldu. Günlük hak 00:00’da yenilenir; ek hak için owner ile iletişime geç.',429);
  const updated=await tx.query('UPDATE osint_grants SET used=used+1 WHERE id=$1 AND guild_id=$2 AND user_id=$3 AND revoked_at IS NULL AND expires_at>now() AND used<credits RETURNING id',[grant.id,config().guildId,userId]);
  if(!updated.rows.length)throw new DomainError('OSINT_QUOTA','Ek hakkın doldu veya süresi sona erdi.',429);
  source='GRANT';grantId=grant.id;
 }
 await tx.query('INSERT INTO osint_usage(guild_id,user_id,request_id,query_kind,target_sha256,billing_source,grant_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[config().guildId,userId,requestId,kind,fingerprint,source,grantId]);
 return {duplicate:false};
}
export async function osintGrant(owner:{id:string;username:string},userId:string,credits:unknown,expiresAt:unknown){
 await loadServerSettings();assertOsintOwner(owner.id);
 if(!/^\d{17,20}$/.test(userId)||typeof credits!=='number'||!Number.isSafeInteger(credits)||credits<1||typeof expiresAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(expiresAt))throw new DomainError('INVALID_GRANT','Geçerli kullanıcı, pozitif tam sayı hak ve saat dilimi içeren bitiş tarihi gerekli.',400);
 const expiry=new Date(expiresAt);if(!Number.isFinite(expiry.getTime())||expiry.getTime()<=Date.now())throw new DomainError('INVALID_EXPIRY','Gelecekte bir bitiş tarihi seç.',400);
 await guildMember(owner.id);const member=await guildMember(userId);
 return transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['osint:'+config().guildId+':'+userId]);
  await syncUser(tx,owner);await syncUser(tx,{id:userId,username:member.user?.username||userId,avatar:member.user?.avatar});
  const id=randomUUID();await tx.query('INSERT INTO osint_grants(id,guild_id,user_id,assigned_by,credits,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[id,config().guildId,userId,owner.id,credits,expiry.toISOString()]);
  await audit(tx,owner.id,'OSINT_GRANT',id,{userId,credits,expiresAt:expiry.toISOString()});return {id,userId,credits,expiresAt:expiry.toISOString()};
 });
}
export async function revokeOsintGrant(owner:{id:string;username:string},id:string){
 await loadServerSettings();assertOsintOwner(owner.id);await guildMember(owner.id);
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new DomainError('INVALID_GRANT','Geçerli hak kaydı gerekli.',400);
 return transaction(async tx=>{
  const row=(await tx.query('SELECT user_id FROM osint_grants WHERE id=$1 AND guild_id=$2',[id,config().guildId])).rows[0];if(!row)throw new DomainError('GRANT_MISSING','Hak kaydı bulunamadı.',404);
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['osint:'+config().guildId+':'+row.user_id]);
  await tx.query('UPDATE osint_grants SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND guild_id=$2',[id,config().guildId]);await audit(tx,owner.id,'OSINT_GRANT_REVOKED',id,{userId:row.user_id});return {success:true};
 });
}
