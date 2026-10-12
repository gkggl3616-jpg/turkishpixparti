import {randomBytes} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {sha256} from './audit';
import {oauthStart,safeLoginPath} from './auth';

export const HANDOFF_COOKIE='tp_oauth_handoff';
const nonce=()=>randomBytes(32).toString('hex');
const validNonce=(value:string)=>/^[a-f0-9]{64}$/.test(value);
function origin(value:string){
 try{
  const url=new URL(value);
  if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)return url.origin;
 }catch{}
 throw new DomainError('AUTH_BROKER_CONFIG','Discord giriş bağlantısı yapılandırılamadı.',503);
}
export function authBrokerOrigin(){
 const value=process.env.AUTH_BROKER_URL;
 if(!value)return null;
 const target=origin(value);
 return target===new URL(config().appUrl).origin?null:target;
}
function allowedTarget(target:string){
 const allowed=(process.env.AUTH_HANDOFF_ORIGINS||'').split(',').filter(Boolean).map(value=>origin(value.trim()));
 if(!allowed.includes(target))throw new DomainError('AUTH_HANDOFF_FORBIDDEN','Bu site için Discord giriş aktarımı açık değil.',403);
}
export async function createLoginHandoff(returnPath:string){
 const broker=authBrokerOrigin();
 if(!broker)throw new DomainError('AUTH_BROKER_CONFIG','Discord giriş aktarımı yapılandırılmadı.',503);
 const request=nonce(),verifier=nonce(),target=origin(config().appUrl);
 await database().query('DELETE FROM oauth_handoffs WHERE expires_at<=now()');
 await database().query('INSERT INTO oauth_handoffs(request_hash,verifier_hash,target_origin,return_path) VALUES($1,$2,$3,$4)',[sha256(request),sha256(verifier),target,safeLoginPath(returnPath)]);
 return {url:broker+'/api/auth/bridge?request='+request,verifier};
}
export async function startLoginHandoff(request:string){
 if(!validNonce(request))throw new DomainError('AUTH_HANDOFF_INVALID','Discord giriş isteği geçersiz.',403);
 const hash=sha256(request);
 const row=(await database().query('SELECT target_origin FROM oauth_handoffs WHERE request_hash=$1 AND expires_at>now() AND user_id IS NULL',[hash])).rows[0];
 if(!row)throw new DomainError('AUTH_HANDOFF_EXPIRED','Giriş isteğinin süresi doldu. OSINT sayfasından tekrar giriş yap.',403);
 allowedTarget(row.target_origin);
 const start=await oauthStart('/');
 await database().query('UPDATE oauth_states SET handoff_hash=$1 WHERE state_hash=$2',[hash,sha256(start.state)]);
 return start;
}
export async function completeLoginHandoff(hash:string,userId:string){
 const pending=(await database().query('SELECT target_origin FROM oauth_handoffs WHERE request_hash=$1',[hash])).rows[0];
 if(!pending)throw new DomainError('AUTH_HANDOFF_EXPIRED','Giriş isteği artık geçerli değil.',403);
 allowedTarget(pending.target_origin);
 const ticket=nonce();
 const row=(await database().query('UPDATE oauth_handoffs SET user_id=$1,ticket_hash=$2 WHERE request_hash=$3 AND user_id IS NULL AND expires_at>now() RETURNING target_origin',[userId,sha256(ticket),hash])).rows[0];
 if(!row)throw new DomainError('AUTH_HANDOFF_EXPIRED','Giriş isteği kullanılmış veya süresi dolmuş.',403);
 return row.target_origin+'/api/auth/bridge/callback?ticket='+ticket;
}
export async function redeemLoginHandoff(ticket:string,verifier:string){
 if(!validNonce(ticket)||!validNonce(verifier))throw new DomainError('AUTH_HANDOFF_INVALID','Giriş doğrulanamadı. Aynı tarayıcıdan tekrar giriş yap.',403);
 return transaction(async tx=>{
  const row=(await tx.query('DELETE FROM oauth_handoffs WHERE ticket_hash=$1 AND verifier_hash=$2 AND target_origin=$3 AND expires_at>now() AND user_id IS NOT NULL RETURNING user_id,return_path',[sha256(ticket),sha256(verifier),origin(config().appUrl)])).rows[0];
  if(!row)throw new DomainError('AUTH_HANDOFF_EXPIRED','Giriş bağlantısı kullanılmış veya süresi dolmuş. Tekrar giriş yap.',403);
  const secret=nonce(),csrf=nonce();
  await tx.query('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)',[sha256(secret),row.user_id,csrf,new Date(Date.now()+config().sessionHours*3600000).toISOString()]);
  return {secret,returnPath:safeLoginPath(row.return_path)};
 });
}
