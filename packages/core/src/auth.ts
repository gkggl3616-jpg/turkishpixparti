import {randomBytes,timingSafeEqual} from 'node:crypto';
import {database,transaction} from './db';
import {config,DomainError} from './config';
import {sha256,audit} from './audit';
import {discordRequest,syncUser,guildMember} from './discord';
import {applicationConnection} from './application';
import {arcadeGames} from './arcade-policy';
export const SESSION_COOKIE='tp_session';export const STATE_COOKIE='tp_oauth_state';
export function cookie(name:string,value:string,hours=24){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(hours*3600)}${config().appUrl.startsWith('https:')?'; Secure':''}`;}
export function cookieValue(req:Request,name:string){return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);}
export async function session(req:Request){const token=cookieValue(req,SESSION_COOKIE);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const row=(await database().query('SELECT u.*,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[sha256(token)])).rows[0];
 return row?{id:row.id,username:row.username,avatar:row.avatar,csrf:row.csrf_token}:null;
}
export function safeEqual(a:string,b:string){return a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function csrf(req:Request,s:{csrf:string}){
 if(req.headers.get('origin')!==config().appUrl||!safeEqual(req.headers.get('x-csrf-token')||'',s.csrf))throw new DomainError('CSRF','İstek doğrulanamadı. Sayfayı yenileyin.',403);
}
export async function oauthStart(returnPath='/'){
 const c=config();if(!c.clientSecret||!c.guildId)throw new DomainError('OAUTH_NOT_CONFIGURED','Discord bağlantısı henüz tamamlanmadı.',503);
 const app=await applicationConnection();
 if(!app.verified)throw new DomainError('APPLICATION_UNAVAILABLE',app.error||'Discord uygulaması doğrulanamadı.',503);
 if(app.redirectRegistered===false)throw new DomainError('OAUTH_REDIRECT_NOT_REGISTERED','Discord Developer Portal’da OAuth yönlendirme adresi kaydedilmeli.',503);
 const state=randomBytes(32).toString('hex');let safePath='/';
 try{const target=new URL(returnPath,c.appUrl);if(target.origin===new URL(c.appUrl).origin&&['/','/secim','/guvenlik','/karsilama','/duyurular','/yapay-zeka','/bot-ayarlari','/eglence','/oyunlar'].includes(target.pathname)){
  const out=new URL(target.pathname,c.appUrl);const view=target.searchParams.get('view'),create=target.searchParams.get('create');
  if(view&&['genel','partiler','basvurular','oylamalar','tbmm','secimler','kayitlar','owner','roller','baglanti','ayarlar','kilavuz'].includes(view))out.searchParams.set('view',view);
  if(create&&['PARTY','BILL'].includes(create))out.searchParams.set('create',create);
  const game=target.searchParams.get('oyun');if(target.pathname==='/oyunlar'&&arcadeGames.some(g=>g.id===game))out.searchParams.set('oyun',game!);
  safePath=out.pathname+out.search;
 }}catch{}
 await database().query('INSERT INTO oauth_states(state_hash,expires_at,return_path) VALUES($1,now()+interval \'10 minutes\',$2)',[sha256(state),safePath]);
 const url=new URL('https://discord.com/oauth2/authorize');url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.appUrl+'/api/auth/callback',response_type:'code',scope:'identify guilds.members.read',state}).toString();
 return {url:url.toString(),state};
}
export async function oauthCallback(req:Request){
 const url=new URL(req.url);const state=url.searchParams.get('state')||'';const stored=cookieValue(req,STATE_COOKIE)||'';
 if(!state||!safeEqual(state,stored))throw new DomainError('INVALID_STATE','Discord giriş isteğinin süresi dolmuş. Yeniden giriş yapın.',403);
 const row=(await database().query('DELETE FROM oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING return_path',[sha256(state)])).rows[0];
 if(!row)throw new DomainError('STATE_EXPIRED','Giriş isteği kullanılmış veya süresi dolmuş.',403);
 const code=url.searchParams.get('code');if(!code)throw new DomainError('OAUTH_CANCELLED','Discord girişine izin verilmedi.');
 const c=config();const response=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,grant_type:'authorization_code',code,redirect_uri:c.appUrl+'/api/auth/callback'}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new DomainError('TOKEN_EXCHANGE','Discord giriş bağlantısı kurulamadı.',503);
 const token=await response.json();
 const user=await discordRequest('/users/@me',{},token.access_token);
 const member=await discordRequest(`/users/@me/guilds/${c.guildId}/member`,{},token.access_token);
 if(member.pending)throw new DomainError('MEMBERSHIP_PENDING','Önce TurkishPix sunucu doğrulamasını tamamlayın.',403);
 const secret=randomBytes(32).toString('hex'),csrfToken=randomBytes(32).toString('hex');
 await transaction(async tx=>{await syncUser(tx,user);await tx.query('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)',[sha256(secret),user.id,csrfToken,new Date(Date.now()+c.sessionHours*3600000).toISOString()]);await audit(tx,user.id,'LOGIN',user.id);});
 return {secret,returnPath:row.return_path};
}
export async function logout(req:Request,actor:any){const token=cookieValue(req,SESSION_COOKIE);if(token)await transaction(async tx=>{await tx.query('DELETE FROM sessions WHERE token_hash=$1',[sha256(token)]);await audit(tx,actor.id,'LOGOUT',actor.id);});}
export async function rateLimit(key:string,limit:number,seconds=60){
 const row=(await database().query("INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.expires_at END RETURNING hits",[key,seconds])).rows[0];
 if(row.hits>limit)throw new DomainError('RATE_LIMIT','Çok hızlı işlem yapıyorsunuz. Biraz sonra tekrar deneyin.',429);
}
