import {audit} from './audit';
import {loadServerSettings} from './setup';
import {isIP} from 'node:net';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {guildMember,syncUser} from './discord';

export function observedIp(req:Request):string|null{
 // Railway app ingress sets X-Forwarded-For; it is still only an observed network address,
 // not proof of a person's physical identity. Never accept arbitrary IPs from user input.
 if(!process.env.RAILWAY_ENVIRONMENT)return null;
 const raw=req.headers.get('x-forwarded-for')||'';
 const candidates=raw.split(',').map(x=>x.trim()).filter(x=>isIP(x));
 return candidates.length?candidates[candidates.length-1]:null;
}
export function eventPreview(kind:string,target:unknown):string{
 const value=typeof target==='string'?target.trim().slice(0,250):'';
 if(['url','headers'].includes(kind)){
  try{const u=new URL(value);return (u.protocol+'//'+u.host+u.pathname).slice(0,140);}catch{return '[geçersiz URL]';}
 }
 if(['proxy'].includes(kind))return '[proxy filtreleri]';
 if(['proxy-check'].includes(kind))return '[proxy adresi]';
 if(kind==='metadata')return '[yerel dosya meta verisi]';
 if(['mail','mail-inbox'].includes(kind))return '[kişisel geçici e-posta]';
 return value.slice(0,140).replace(/[\x00-\x1f\x7f]/g,'');
}
let lastPrune=0;
export async function osintLog(userId:string,type:'VISIT'|'QUERY'|'DENIED'|'BLOCK'|'UNBLOCK',source:'WEB'|'DISCORD'|'OWNER',kind='',target:unknown='',ip:string|null=null,code=''){
 await database().query("INSERT INTO osint_access_events(guild_id,user_id,event_type,source,query_kind,target_preview,observed_ip,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[config().guildId,userId,type,source,kind,eventPreview(kind,target),ip,code.slice(0,60)]);
}
export async function assertOsintAllowed(id:string){
 const row=(await database().query('SELECT reason FROM osint_access_blocks WHERE guild_id=$1 AND user_id=$2',[config().guildId,id])).rows[0];
 if(row)throw new DomainError('OSINT_BLOCKED','OSINT araştırma erişimin owner tarafından kapatılmış.',403);
}
export async function osintOwnerList(ownerId:string,limit=100){
 await loadServerSettings();
 if(!config().owners.includes(ownerId))throw new DomainError('FORBIDDEN','Bu panel yalnızca owner hesabına açıktır.',403);
 const [events,blocks]=await Promise.all([
  database().query("SELECT e.id,e.user_id,u.username,e.event_type,e.source,e.query_kind,e.target_preview,e.observed_ip,e.error_code,e.created_at FROM osint_access_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.guild_id=$1 AND e.created_at>now()-interval '14 days' ORDER BY e.created_at DESC LIMIT $2",[config().guildId,Math.max(1,Math.min(250,limit))]),
  database().query('SELECT b.*,u.username FROM osint_access_blocks b LEFT JOIN users u ON u.id=b.user_id WHERE b.guild_id=$1 ORDER BY b.created_at DESC LIMIT 250',[config().guildId])
 ]);
 return {events:events.rows,blocks:blocks.rows,retentionDays:14,ipNotice:'IP ağ gözlemidir; VPN/proxy ve ağ geçitleri nedeniyle kesin kullanıcı konumu veya kimliği değildir.'};
}
export async function osintSetBlocked(owner:{id:string;username:string},targetId:string,blocked:boolean,reason:string){
 await loadServerSettings();
 if(!config().owners.includes(owner.id))throw new DomainError('FORBIDDEN','Yalnızca owner erişimi değiştirebilir.',403);
 if(!/^\d{17,20}$/.test(targetId))throw new DomainError('INVALID_USER','Geçerli Discord üye ID gerekli.',400);
 if(config().owners.includes(targetId))throw new DomainError('OWNER_PROTECTED','Owner hesabı bu panelden engellenemez.',403);
 if(reason.length>250)throw new DomainError('INVALID_REASON','Gerekçe fazla uzun.',400);
 await guildMember(owner.id);
 await transaction(async tx=>{
  await syncUser(tx,owner);
  const exists=await tx.query('SELECT id FROM users WHERE id=$1',[targetId]);
  if(!exists.rows.length)throw new DomainError('USER_UNKNOWN','Kullanıcı daha önce sistemde tanımlanmamış.',404);
  if(blocked)await tx.query("INSERT INTO osint_access_blocks(guild_id,user_id,blocked_by,reason) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id) DO UPDATE SET blocked_by=EXCLUDED.blocked_by,reason=EXCLUDED.reason,created_at=now()",[config().guildId,targetId,owner.id,reason]);
  else await tx.query('DELETE FROM osint_access_blocks WHERE guild_id=$1 AND user_id=$2',[config().guildId,targetId]);
  await audit(tx,owner.id,blocked?'OSINT_BLOCK':'OSINT_UNBLOCK',targetId,{reason});
  await tx.query("INSERT INTO osint_access_events(guild_id,user_id,event_type,source,target_preview) VALUES($1,$2,$3,'OWNER',$4)",[config().guildId,targetId,blocked?'BLOCK':'UNBLOCK',reason.slice(0,140)]);
 });
 return {success:true,blocked,userId:targetId};
}
export async function purgeOldOsintLogs(){
 await database().query("DELETE FROM osint_access_events WHERE created_at<now()-interval '14 days'");
}

export async function osintCommandChannel(){
 const row=(await database().query('SELECT channel_id FROM osint_channel_settings WHERE guild_id=$1',[config().guildId])).rows[0];
 return row?.channel_id||process.env.OSINT_CHANNEL_ID||'';
}
export async function setOsintCommandChannel(actor:{id:string;username:string},channelId:string){
 if(!config().owners.includes(actor.id))throw new DomainError('FORBIDDEN','Bu ayar yalnızca owner hesaplarına açık.',403);
 if(!/^\d{17,20}$/.test(channelId))throw new DomainError('INVALID_CHANNEL','Geçerli kanal ID gerekli.',400);
 await transaction(async tx=>{
  await syncUser(tx,actor);
  await tx.query('INSERT INTO osint_channel_settings(guild_id,channel_id,updated_by) VALUES($1,$2,$3) ON CONFLICT(guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,updated_by=EXCLUDED.updated_by,updated_at=now()',[config().guildId,channelId,actor.id]);
 });
 return channelId;
}
