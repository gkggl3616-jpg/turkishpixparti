import {z} from 'zod';
import {randomBytes} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {providerJson,boundedProviderText,sealOsintSecret,openOsintSecret} from './osint-network';
import {rateLimit} from './auth';
import type {ProviderResult} from './osint-providers';
type MailProvider='mailtm'|'mailgw';
const hosts={mailtm:'https://api.mail.tm',mailgw:'https://api.mail.gw'};
type Credentials={provider?:MailProvider;token?:string;accountId:string;password?:string;address?:string};
async function mailApi(path:string,init:RequestInit={},provider:MailProvider='mailtm'){await rateLimit(provider+'-upstream',7,1);return providerJson(provider,hosts[provider]+path,400000,init);}
const clean=(v:unknown,n=3000)=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,' ').slice(0,n);
export function parseMailChoice(input='account'){
 let value:any={};if(input!=='account'){try{value=JSON.parse(input);}catch{const [localPart,domain,...rest]=input.split('@');if(rest.length)throw new DomainError('INVALID_MAIL','Geçerli geçici e-posta adı gir.',400);value={localPart,domain};}}
 const c=z.object({localPart:z.string().trim().toLowerCase().max(40).default(''),domain:z.string().trim().toLowerCase().max(150).optional(),provider:z.enum(['mailtm','mailgw']).optional(),replace:z.boolean().default(false)}).strict().parse(value);
 if(c.localPart&&(!/^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/.test(c.localPart)||c.localPart.includes('..')))throw new DomainError('INVALID_MAIL','Adres adı 3–40 karakter olmalı; harf, sayı, nokta, tire veya alt çizgi kullan.',400);return c;
}
let domainCache:{fetch:typeof fetch;until:number;rows:{domain:string;provider:MailProvider}[]}|undefined;
export async function temporaryMailDomains(){
 if(domainCache&&domainCache.fetch===globalThis.fetch&&domainCache.until>Date.now())return domainCache.rows;
 const rs=await Promise.allSettled((['mailtm','mailgw'] as const).map(async provider=>{const d=await mailApi('/domains',{},provider);return (Array.isArray(d)?d:d['hydra:member']||d.member||[]).filter((x:any)=>x.isActive&&!x.isPrivate&&/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(x.domain)).slice(0,30).map((x:any)=>({domain:x.domain.toLowerCase(),provider}));}));
 const rows=rs.flatMap(r=>r.status==='fulfilled'?r.value:[]);if(!rows.length)throw new DomainError('MAIL_DOMAIN_MISSING','Geçici e-posta sağlayıcıları aktif domain vermedi.',503);domainCache={rows,until:Date.now()+120000,fetch:globalThis.fetch};return rows;
}
export async function temporaryMailbox(userId:string,input='account'):Promise<ProviderResult>{
 const choice=parseMailChoice(input);
 const mailbox=await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['osint-mail:'+config().guildId+':'+userId]);
  const current=(await tx.query('SELECT address,expires_at,credentials_cipher FROM osint_mailboxes WHERE guild_id=$1 AND user_id=$2 AND expires_at>now()',[config().guildId,userId])).rows[0];
  const matches=(row:any)=>(!choice.localPart||row.address.startsWith(choice.localPart+'@'))&&(!choice.domain||row.address.endsWith('@'+choice.domain))&&(!choice.provider||(openOsintSecret<Credentials>(row.credentials_cipher).provider||'mailtm')===choice.provider);
  if(current&&matches(current))return {...current,pending:false};
  if(current&&!choice.replace)throw new DomainError('MAILBOX_ACTIVE','Aktif adresin var. Farklı adres için Mevcut adresi değiştir seçeneğini işaretle. Yeni adres hazır olunca eski kutuya erişim sona erer.',409);
  const pending=(await tx.query('SELECT address,expires_at,credentials_cipher FROM osint_mail_pending WHERE guild_id=$1 AND user_id=$2 AND expires_at>now()',[config().guildId,userId])).rows[0];if(pending){if(!matches(pending))throw new DomainError('MAIL_PENDING','Bekleyen adresin kurulumu sürüyor; aynı adres adını yeniden dene.',409);return {...pending,pending:true};}
  const available=(await temporaryMailDomains()).find(x=>(!choice.domain||x.domain===choice.domain)&&(!choice.provider||x.provider===choice.provider));if(!available)throw new DomainError('MAIL_DOMAIN_MISSING','Seçilen domain sağlayıcının aktif listesinde yok. Gmail/kişisel domain seçilemez.',400);
  const address=(choice.localPart||'tp'+randomBytes(10).toString('hex'))+'@'+available.domain,password=randomBytes(32).toString('base64url');
  let account:any;try{account=await mailApi('/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address,password})},available.provider);}catch{throw new DomainError('MAIL_CREATE_FAILED','Adres oluşturulamadı; ad alınmış veya sağlayıcı geçici olarak kapalı olabilir. Başka adla dene. Aktif kutun korunur.',503);}
  if(typeof account.id!=='string')throw new DomainError('MAIL_FORMAT','Sağlayıcı hesap yanıtı geçersiz.',503);
  const table=current?'osint_mail_pending':'osint_mailboxes',expiry=new Date(Date.now()+(available.provider==='mailgw'?600000:86400000)).toISOString();
  const row=(await tx.query(`INSERT INTO ${table}(guild_id,user_id,address,credentials_cipher,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,user_id) DO UPDATE SET address=EXCLUDED.address,credentials_cipher=EXCLUDED.credentials_cipher,expires_at=EXCLUDED.expires_at,created_at=now() RETURNING address,expires_at,credentials_cipher`,[config().guildId,userId,address,sealOsintSecret({password,address,accountId:account.id,provider:available.provider}),expiry])).rows[0];return {...row,pending:!!current};
 });
 const c=openOsintSecret<Credentials>(mailbox.credentials_cipher),provider=c.provider||'mailtm';
 if(!c.token){const auth=await mailApi('/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:c.address,password:c.password})},provider);if(typeof auth.token!=='string')throw new DomainError('MAIL_AUTH_FAILED','Hesap hazır fakat oturum alınamadı; aynı adı yeniden dene.',503);const cipher=sealOsintSecret({accountId:c.accountId,token:auth.token,provider});
  await transaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['osint-mail:'+config().guildId+':'+userId]);if(mailbox.pending){const row=(await tx.query('DELETE FROM osint_mail_pending WHERE guild_id=$1 AND user_id=$2 AND credentials_cipher=$3 AND expires_at>now() RETURNING address,expires_at',[config().guildId,userId,mailbox.credentials_cipher])).rows[0];if(row)await tx.query('INSERT INTO osint_mailboxes(guild_id,user_id,address,credentials_cipher,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,user_id) DO UPDATE SET address=EXCLUDED.address,credentials_cipher=EXCLUDED.credentials_cipher,expires_at=EXCLUDED.expires_at,created_at=now()',[config().guildId,userId,row.address,cipher,row.expires_at]);}else await tx.query('UPDATE osint_mailboxes SET credentials_cipher=$3 WHERE guild_id=$1 AND user_id=$2 AND credentials_cipher=$4',[config().guildId,userId,cipher,mailbox.credentials_cipher]);});
 }
 return {title:'Geçici E-Posta',summary:(provider==='mailgw'?'Mail.gw · 10 dakika':'Mail.tm · 24 saat platform erişimi')+' hesabın hazır.',items:[{name:'E-posta adresin',value:mailbox.address},{name:'Platform erişim süresi',value:new Date(mailbox.expires_at).toISOString()},{name:'Gelen kutusu',value:'Temp Mail / Gelen Kutusu aracını aç.'}],notice:'Sağlayıcı: '+(provider==='mailgw'?'Mail.gw — https://mail.gw':'Mail.tm — https://mail.tm')+'. Yalnızca aktif sağlayıcı domainlerinden adres seçilir. Önemli hesapların kurtarması için kullanmayın. Sağlayıcının kendi saklama politikası geçerlidir.'};
}
export async function temporaryInbox(userId:string):Promise<ProviderResult>{
 const mailbox=(await database().query('SELECT address,credentials_cipher,expires_at FROM osint_mailboxes WHERE guild_id=$1 AND user_id=$2 AND expires_at>now()',[config().guildId,userId])).rows[0];if(!mailbox)throw new DomainError('MAILBOX_MISSING','Önce E-Posta Al düğmesinden adres oluştur; platform erişimi 24 saattir.',404);
 const credentials=openOsintSecret<Credentials>(mailbox.credentials_cipher);if(!credentials.token)throw new DomainError('MAIL_AUTH_PENDING','E-Posta Al düğmesinden hesabın oturumunu yeniden oluştur.',503);const headers={Authorization:'Bearer '+credentials.token};
 const d=await mailApi('/messages',{headers},credentials.provider||'mailtm'),messages=(Array.isArray(d)?d:d['hydra:member']||d.member||[]).slice(0,6);
 const detail=await Promise.allSettled(messages.map(async(m:any)=>{if(typeof m.id!=='string'||!/^[a-z0-9-]{1,100}$/i.test(m.id))throw new DomainError('MAIL_FORMAT','Mesaj kimliği geçersiz.',503);return mailApi('/messages/'+encodeURIComponent(m.id),{headers},credentials.provider||'mailtm');}));
 return {title:'Geçici E-Posta / Gelen Kutusu',summary:messages.length+' son mesaj · '+mailbox.address,items:[{name:'Adres',value:mailbox.address},...messages.map((m:any,i:number)=>({name:clean(m.subject||'Konu yok',120)+' · '+clean(m.createdAt,40),value:detail[i].status==='fulfilled'?'Gönderen: '+clean(detail[i].value.from?.address,200)+'\n'+clean(detail[i].value.text||detail[i].value.intro||'Düz metin bulunamadı; HTML çalıştırılmadı.'):clean(m.intro||'Mesaj ayrıntısı alınamadı')}))],notice:'Yalnızca kendi geçici gelen kutun. HTML ve ekler çalıştırılmaz/indirilmez. Sağlayıcı: Mail.tm / Mail.gw — https://mail.tm / https://mail.gw. Admin paneli gelen kutusu içeriğini göstermez.'};
}
export async function purgeExpiredMailboxes(){
 await database().query('DELETE FROM osint_mail_pending WHERE expires_at<=now()');
 const rows=(await database().query('SELECT guild_id,user_id,credentials_cipher FROM osint_mailboxes WHERE expires_at<=now() LIMIT 5')).rows;
 for(const row of rows){try{const c=openOsintSecret<Credentials>(row.credentials_cipher);if(/^[a-z0-9-]{1,100}$/i.test(c.accountId)){await rateLimit((c.provider||'mailtm')+'-upstream',7,1);await boundedProviderText(c.provider||'mailtm',hosts[c.provider||'mailtm']+'/accounts/'+c.accountId,10000,{method:'DELETE',headers:{Authorization:'Bearer '+c.token}});}}catch{/* Expired local credentials are removed even if the provider is unavailable. */}await database().query('DELETE FROM osint_mailboxes WHERE guild_id=$1 AND user_id=$2 AND expires_at<=now()',[row.guild_id,row.user_id]);}
}
