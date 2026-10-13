import {createHash} from 'node:crypto';
import {DomainError} from './config';
import {providerJson,providerKey} from './osint-network';
import type {InboxMessage} from './osint-live-inbox';
const address=(v:unknown)=>typeof v==='string'&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(v)&&v.length<=254?v.toLowerCase():null;
const clean=(v:unknown,max=6000)=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,' ').slice(0,max);
const plain=(v:unknown)=>clean(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ');
async function ioHeaders(){const key=await providerKey('temp-mail-io');if(!key)throw new DomainError('PROVIDER_KEY_REQUIRED','Temp-Mail.io premium API anahtarı owner panelinden bağlanmalı.',503);return {'X-API-Key':key};}
export async function createAdditionalMail(provider:'temp-mail-io'|'tempmail-lol'){
 const io=provider==='temp-mail-io',d=io?await providerJson(provider,'https://api.temp-mail.io/v1/emails',100000,{method:'POST',headers:await ioHeaders(),redirect:'error'}):await providerJson(provider,'https://api.tempmail.lol/v2/inbox/create',100000,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({community:false}),redirect:'error'});
 const email=address(io?d.email:d.address);if(!email||!io&&(typeof d.token!=='string'||d.token.length<8||d.token.length>512))throw new DomainError('MAIL_FORMAT','Yeni kutunun adresi/oturum yanıtı doğrulanamadı.',503);
 const ttl=io?Number(d.ttl):3600;if(!Number.isFinite(ttl)||ttl<1)throw new DomainError('MAIL_TTL','Sağlayıcının kutu süresi doğrulanmadı.',503);
 return {address:email,expiresAt:new Date(Date.now()+Math.min(ttl,86400)*1000).toISOString(),credential:io?{}:{token:d.token}};
}
export async function additionalMailMessages(provider:string,email:string,token?:string):Promise<InboxMessage[]>{
 if(!address(email))throw new DomainError('MAIL_SCOPE','Kişisel adres geçersiz.',403);
 if(provider==='temp-mail-io'){const d=await providerJson(provider,'https://api.temp-mail.io/v1/emails/'+encodeURIComponent(email)+'/messages',350000,{headers:await ioHeaders(),redirect:'error'});if(!Array.isArray(d.messages))throw new DomainError('MAIL_FORMAT','Temp-Mail.io mesaj listesi doğrulanmadı.',503);return d.messages.slice(0,30).filter((m:any)=>typeof m.id==='string'&&/^[a-z0-9-]{1,100}$/i.test(m.id)).map((m:any)=>({id:m.id,from:clean(m.from,200),subject:clean(m.subject,200),text:'Düz metni açarak mesajı oku.',receivedAt:clean(m.created_at,60)}));}
 if(provider!=='tempmail-lol'||!token||token.length>512)throw new DomainError('MAIL_SESSION','Kişisel kutu tokenı gerekli.',403);
 const d=await providerJson(provider,'https://api.tempmail.lol/v2/inbox?token='+encodeURIComponent(token),350000,{redirect:'error'});if(d.expired===true)throw new DomainError('MAIL_SESSION_EXPIRED','Sağlayıcı kutu süresinin bittiğini bildirdi.',410);if(!Array.isArray(d.emails))throw new DomainError('MAIL_FORMAT','TempMail.lol mesaj listesi doğrulanmadı.',503);
 return d.emails.filter((m:any)=>address(m.to)===email.toLowerCase()).slice(0,30).map((m:any)=>({id:createHash('sha256').update(JSON.stringify([m.from,m.to,m.subject,m.date,m.body])).digest('hex').slice(0,32),from:clean(m.from,200),subject:clean(m.subject,200),text:typeof m.body==='string'&&m.body?clean(m.body):plain(m.html),receivedAt:Number.isFinite(Number(m.date))?new Date(Number(m.date)).toISOString():''}));
}
export async function readAdditionalMail(email:string,id:string){if(!/^[a-z0-9-]{1,100}$/i.test(id))throw new DomainError('INVALID_MESSAGE','Mesaj kimliği geçersiz.',400);const d=await providerJson('temp-mail-io','https://api.temp-mail.io/v1/messages/'+encodeURIComponent(id),350000,{headers:await ioHeaders(),redirect:'error'});if(d.id!==id||address(d.to)!==email.toLowerCase())throw new DomainError('MESSAGE_SCOPE','Mesaj kendi kutunla eşleşmedi.',403);return typeof d.body_text==='string'?clean(d.body_text):plain(d.body_html);}
