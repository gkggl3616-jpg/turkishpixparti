import {randomBytes} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {providerJson,boundedProviderText,sealOsintSecret,openOsintSecret} from './osint-network';
import {rateLimit} from './auth';
import type {ProviderResult} from './osint-providers';
type Credentials={token?:string;accountId:string;password?:string;address?:string};
async function mailApi(path:string,init:RequestInit={}){await rateLimit('mailtm-upstream',7,1);return providerJson('mailtm','https://api.mail.tm'+path,400000,init);}
const clean=(v:unknown,n=3000)=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,' ').slice(0,n);
export async function temporaryMailbox(userId:string):Promise<ProviderResult>{
 const mailbox=await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['osint-mail:'+config().guildId+':'+userId]);
  const current=(await tx.query('SELECT address,expires_at,credentials_cipher FROM osint_mailboxes WHERE guild_id=$1 AND user_id=$2 AND expires_at>now()',[config().guildId,userId])).rows[0];if(current)return current;
  const domains=await mailApi('/domains'),available=(Array.isArray(domains)?domains:domains['hydra:member']||domains.member||[]).find((x:any)=>x.isActive&&!x.isPrivate&&/^[a-z0-9.-]+$/i.test(x.domain));
  if(!available)throw new DomainError('MAIL_DOMAIN_MISSING','Mail.tm aktif e-posta alan adı vermedi.',503);
  const address='tp'+randomBytes(10).toString('hex')+'@'+available.domain,password=randomBytes(32).toString('base64url'),body=JSON.stringify({address,password});
  const account=await mailApi('/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body});
  if(typeof account.id!=='string')throw new DomainError('MAIL_FORMAT','Mail.tm hesap yanıtı geçersiz.',503);
  const stored=(await tx.query('INSERT INTO osint_mailboxes(guild_id,user_id,address,credentials_cipher) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id) DO UPDATE SET address=EXCLUDED.address,credentials_cipher=EXCLUDED.credentials_cipher,expires_at=now()+interval \'24 hours\',created_at=now() RETURNING address,expires_at,credentials_cipher',[config().guildId,userId,address,sealOsintSecret({password,accountId:account.id,address})])).rows[0];return stored;
 });
 const credentials=openOsintSecret<Credentials>(mailbox.credentials_cipher);
 if(!credentials.token){const auth=await mailApi('/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:credentials.address,password:credentials.password})});if(typeof auth.token!=='string')throw new DomainError('MAIL_AUTH_FAILED','Mail.tm hesabı hazır fakat oturum alınamadı; yeniden deneyin.',503);await database().query('UPDATE osint_mailboxes SET credentials_cipher=$3 WHERE guild_id=$1 AND user_id=$2 AND credentials_cipher=$4',[config().guildId,userId,sealOsintSecret({accountId:credentials.accountId,token:auth.token}),mailbox.credentials_cipher]);}
 return {title:'Geçici E-Posta',summary:'Mail.tm hesabın hazır; aynı süre içinde aynı adres kullanılır.',items:[{name:'E-posta adresin',value:mailbox.address},{name:'Platform erişim süresi',value:new Date(mailbox.expires_at).toISOString()},{name:'Gelen kutusu',value:'Discord panelindeki Gelen Kutusu düğmesine bas veya web üzerinde Temp Mail / Gelen Kutusu seç.'}],notice:'Sağlayıcı: Mail.tm — https://mail.tm. Hesaplar geçicidir; önemli hesapların kurtarması için kullanmayın. Platform kimlik bilgilerini 24 saat sonra siler. Sağlayıcının kendi veri saklama politikası geçerlidir.'};
}
export async function temporaryInbox(userId:string):Promise<ProviderResult>{
 const mailbox=(await database().query('SELECT address,credentials_cipher,expires_at FROM osint_mailboxes WHERE guild_id=$1 AND user_id=$2 AND expires_at>now()',[config().guildId,userId])).rows[0];if(!mailbox)throw new DomainError('MAILBOX_MISSING','Önce E-Posta Al düğmesinden adres oluştur; platform erişimi 24 saattir.',404);
 const credentials=openOsintSecret<Credentials>(mailbox.credentials_cipher);if(!credentials.token)throw new DomainError('MAIL_AUTH_PENDING','E-Posta Al düğmesinden hesabın oturumunu yeniden oluştur.',503);const headers={Authorization:'Bearer '+credentials.token};
 const d=await mailApi('/messages',{headers}),messages=(Array.isArray(d)?d:d['hydra:member']||d.member||[]).slice(0,10);
 const detail=await Promise.allSettled(messages.map(async(m:any)=>{if(typeof m.id!=='string'||!/^[a-z0-9-]{1,100}$/i.test(m.id))throw new DomainError('MAIL_FORMAT','Mesaj kimliği geçersiz.',503);return mailApi('/messages/'+encodeURIComponent(m.id),{headers});}));
 return {title:'Geçici E-Posta / Gelen Kutusu',summary:messages.length+' son mesaj · '+mailbox.address,items:[{name:'Adres',value:mailbox.address},...messages.map((m:any,i:number)=>({name:clean(m.subject||'Konu yok',120)+' · '+clean(m.createdAt,40),value:detail[i].status==='fulfilled'?'Gönderen: '+clean(detail[i].value.from?.address,200)+'\n'+clean(detail[i].value.text||detail[i].value.intro||'Düz metin bulunamadı; HTML çalıştırılmadı.'):clean(m.intro||'Mesaj ayrıntısı alınamadı')}))],notice:'Yalnızca kendi geçici gelen kutun. HTML ve ekler çalıştırılmaz/indirilmez. Sağlayıcı: Mail.tm — https://mail.tm. Platform admin paneli gelen kutusu içeriğini göstermez.'};
}
export async function purgeExpiredMailboxes(){
 const rows=(await database().query('SELECT guild_id,user_id,credentials_cipher FROM osint_mailboxes WHERE expires_at<=now() LIMIT 5')).rows;
 for(const row of rows){try{const c=openOsintSecret<Credentials>(row.credentials_cipher);if(/^[a-z0-9-]{1,100}$/i.test(c.accountId)){await rateLimit('mailtm-upstream',7,1);await boundedProviderText('mailtm','https://api.mail.tm/accounts/'+c.accountId,10000,{method:'DELETE',headers:{Authorization:'Bearer '+c.token}});}}catch{/* Expired local credentials are removed even if the provider is unavailable. */}await database().query('DELETE FROM osint_mailboxes WHERE guild_id=$1 AND user_id=$2 AND expires_at<=now()',[row.guild_id,row.user_id]);}
}
