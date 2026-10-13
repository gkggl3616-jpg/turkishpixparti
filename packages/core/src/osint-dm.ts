import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {discordRequest,DiscordAPIError,syncUser,guildMember} from './discord';
import {assertOsintAllowed} from './osint-access';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import type {OsintResult,OsintActor} from './osint';

export type OsintDmPayload={content:string;embeds?:any[];file?:{name:string;text:string;base64?:string;contentType?:string}};
export type DeliveryOutcome={id:string;delivered:boolean;error?:string};
const safe=(s:string)=>s.replace(/[@`*_~|<>]/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
export function formatOsintDm(r:OsintResult,remaining:number|null):string{
 return ('🛰️ **TURKISHPİX · '+safe(r.title)+'**\n'+safe(r.summary)+'\n\n📎 **Sonuç dosyan ektedir.**\n📊 Kalan sorgu hakkı: **'+(remaining===null?'Sınırsız (Owner)':remaining)+'**\n-# '+safe(r.notice)).slice(0,1850);
}
export function osintDmPayload(r:OsintResult,remaining:number|null):OsintDmPayload{
 const proxies=r.kind==='proxy'?r.items.filter(item=>/^\d+ · /.test(item.name)).map(item=>item.value.split(' · ')[0]):null;
 const full=r.title+'\n'+r.summary+'\nHedef: '+r.target+'\n\n'+r.items.map(x=>x.name+'\n'+x.value).join('\n\n')+'\n\n'+r.notice+'\n';
 return {
  content:formatOsintDm(r,remaining),
  embeds:[{title:'✦ '+safe(r.title),description:r.items.slice(0,4).map(x=>'**'+safe(x.name)+'**\n'+safe(x.value).slice(0,240)).join('\n\n').slice(0,1600)||'Filtrene uyan kayıt bulunamadı.',color:0x5865f2,...(r.qr?{image:{url:'attachment://turkishpix-qr.png'}}:{}),footer:{text:'TurkishPix • Sonuç yalnızca sana gönderilir'}}],
  file:r.qr?{name:'turkishpix-qr.png',text:'',base64:r.qr.pngDataUrl.split(',')[1],contentType:'image/png'}:{name:proxies?'turkishpix-proxy-'+proxies.length+'.txt':'turkishpix-'+r.kind+'-sonuc.txt',text:proxies?proxies.join('\n')+'\n':full}
 };
}
function key(){
 if(config().auditKey.length<32)throw new DomainError('DM_KEY_MISSING','Özel sonuç teslimi için sunucu anahtarı eksik.',503);
 return createHash('sha256').update('turkishpix-osint-dm-v1:').update(config().auditKey).digest();
}
function encrypt(payload:OsintDmPayload){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),body=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
function decrypt(value:string):OsintDmPayload{
 const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key(),data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));
 return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8'));
}
async function postDm(userId:string,payload:OsintDmPayload,nonce?:string){
 const dm=await discordRequest('/users/@me/channels',{method:'POST',body:JSON.stringify({recipient_id:userId})});
 const message:any={content:payload.content.slice(0,1950),embeds:payload.embeds,allowed_mentions:{parse:[]},...(nonce?{nonce,enforce_nonce:true}:{})};
 let body:string|FormData;
 if(payload.file){
  message.attachments=[{id:0,filename:payload.file.name}];
  const form=new FormData();form.set('payload_json',JSON.stringify(message));form.set('files[0]',new Blob([payload.file.base64?Uint8Array.from(Buffer.from(payload.file.base64,'base64')):payload.file.text],{type:payload.file.contentType||'text/plain;charset=utf-8'}),payload.file.name);body=form;
 }else body=JSON.stringify(message);
 return discordRequest('/channels/'+dm.id+'/messages',{method:'POST',body});
}
// Research results are durable, encrypted and delivered only to the initiating user's DM.
export async function deliverOsintDm(userId:string,content:string):Promise<boolean>{
 try{await postDm(userId,{content});return true;}catch{return false;}
}
export async function queueOsintDm(actor:OsintActor,requestId:string,payload:OsintDmPayload):Promise<DeliveryOutcome>{
 const id=randomUUID(),cipher=encrypt(payload);
 const stored=await transaction(async tx=>{
  await syncUser(tx,actor);
  await tx.query('INSERT INTO osint_dm_deliveries(id,guild_id,user_id,request_id,payload_cipher) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,user_id,request_id) DO NOTHING',[id,config().guildId,actor.id,requestId,cipher]);
  return (await tx.query('SELECT id FROM osint_dm_deliveries WHERE guild_id=$1 AND user_id=$2 AND request_id=$3',[config().guildId,actor.id,requestId])).rows[0].id as string;
 });
 return retryOsintDelivery(stored,actor.id);
}
export async function sendOsintResult(actor:OsintActor,result:OsintResult,remaining:number|null,requestId:string){return queueOsintDm(actor,requestId,osintDmPayload(result,remaining));}
export async function retryOsintDelivery(id:string,userId:string,manual=false):Promise<DeliveryOutcome>{
 const g=config().guildId;
 const previous=(await database().query('SELECT status,expires_at,last_error FROM osint_dm_deliveries WHERE id=$1 AND guild_id=$2 AND user_id=$3',[id,g,userId])).rows[0];
 if(!previous)throw new DomainError('DM_NOT_FOUND','Bu özel sonuç sana ait değil veya artık bulunamıyor.',404);
 if(previous.status==='SENT')return {id,delivered:true};
 if(new Date(previous.expires_at).getTime()<=Date.now()||previous.status==='EXPIRED')throw new DomainError('DM_EXPIRED','Sonuç için 24 saatlik teslim süresi doldu. Yeni sorgu başlat.',410);
 const row=(await database().query("UPDATE osint_dm_deliveries SET status='SENDING',attempts=attempts+1,available_at=now()+interval '45 seconds' WHERE id=$1 AND guild_id=$2 AND user_id=$3 AND expires_at>now() AND ((status='PENDING' AND ($4 OR available_at<=now())) OR (status='SENDING' AND available_at<=now())) RETURNING payload_cipher",[id,g,userId,manual])).rows[0];
 if(!row)return {id,delivered:false,error:previous.last_error||'DM_PENDING'};
 try{
  await guildMember(userId);await assertOsintAllowed(userId);
  await postDm(userId,decrypt(row.payload_cipher),id.replaceAll('-','').slice(0,24));
  await database().query("UPDATE osint_dm_deliveries SET status='SENT',payload_cipher=NULL,last_error='',delivered_at=now() WHERE id=$1",[id]);
  return {id,delivered:true};
 }catch(e){
  const error=e instanceof DiscordAPIError&&e.discordCode===50007?'DM_CLOSED':e instanceof DomainError?e.code:'DM_NETWORK';
  await database().query("UPDATE osint_dm_deliveries SET status='PENDING',last_error=$2,available_at=now()+interval '60 seconds' WHERE id=$1",[id,error]);
  return {id,delivered:false,error};
 }
}
export async function retryPendingOsintDeliveries(){
 await database().query("UPDATE osint_dm_deliveries SET status='EXPIRED',payload_cipher=NULL WHERE expires_at<=now() AND status IN ('PENDING','SENDING')");
 await database().query("DELETE FROM osint_dm_deliveries WHERE expires_at<now()-interval '1 day'");
 const rows=(await database().query("SELECT id,user_id FROM osint_dm_deliveries WHERE guild_id=$1 AND expires_at>now() AND available_at<=now() AND ((status='PENDING' AND last_error<>'DM_CLOSED' AND attempts<3) OR status='SENDING') ORDER BY available_at LIMIT 5",[config().guildId])).rows;
 for(const row of rows)await retryOsintDelivery(row.id,row.user_id);
}
