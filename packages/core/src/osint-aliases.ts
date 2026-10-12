import {z} from 'zod';
import {DomainError,config} from './config';
import {database} from './db';
import {syncUser} from './discord';
import {providerJson,sealOsintSecret,openOsintSecret} from './osint-network';
const id=z.number().int().positive().max(2147483647);
const keySchema=z.string().trim().min(8).max(512).regex(/^[\x21-\x7e]+$/);
export const aliasActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('connect'),key:keySchema}),z.object({action:z.literal('disconnect')}),
 z.object({action:z.literal('create'),mode:z.enum(['uuid','word','custom']),prefix:z.string().regex(/^[a-z0-9][a-z0-9._-]{0,49}$/).optional(),suffix:z.string().max(150).optional(),mailboxId:id.optional(),note:z.string().max(200).default('')}),
 z.object({action:z.literal('toggle'),aliasId:id}),z.object({action:z.literal('forward'),aliasId:id,mailboxId:id}),
 z.object({action:z.literal('catchall'),domainId:id,enabled:z.boolean()})
]);
const slim=(a:any)=>({id:a.id,email:String(a.email||'').slice(0,200),enabled:a.enabled===true,note:String(a.note||'').slice(0,200),forwards:Number(a.nb_forward||0),blocked:Number(a.nb_block||0),createdAt:a.creation_timestamp,lastActivity:a.latest_activity?{action:a.latest_activity.action,timestamp:a.latest_activity.timestamp}:null});
async function api(key:string,path:string,method='GET',body?:unknown){return providerJson('simplelogin','https://app.simplelogin.io/api/'+path,500000,{method,headers:{Authentication:key,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function connection(userId:string){const row=(await database().query('SELECT key_cipher FROM osint_alias_connections WHERE guild_id=$1 AND user_id=$2',[config().guildId,userId])).rows[0];if(!row)throw new DomainError('ALIAS_CONNECTION_REQUIRED','Kendi SimpleLogin API anahtarını bağla.',409);return openOsintSecret<string>(row.key_cipher);}
export async function aliasState(userId:string,page=0){
 let key:string;try{key=await connection(userId);}catch(e){if(e instanceof DomainError&&e.code==='ALIAS_CONNECTION_REQUIRED')return {connected:false,aliases:[],mailboxes:[],domains:[],suffixes:[],page:0};throw e;}
 const [aliases,mailboxes,domains,options]=await Promise.all([api(key,'v2/aliases?page_id='+page),api(key,'v2/mailboxes'),api(key,'custom_domains'),api(key,'v5/alias/options')]);
 if(!Array.isArray(aliases.aliases)||!Array.isArray(mailboxes.mailboxes))throw new DomainError('ALIAS_FORMAT','Alias sağlayıcı biçimi geçersiz.',503);
 return {connected:true,page,aliases:aliases.aliases.slice(0,20).map(slim),mailboxes:mailboxes.mailboxes.slice(0,30).map((m:any)=>({id:m.id,email:String(m.email).replace(/^(.{2}).*(@.*)$/,'$1***$2'),verified:m.verified===true,default:m.default===true})),domains:Array.isArray(domains)?domains.slice(0,30).map((d:any)=>({id:d.id,name:d.domain_name,verified:d.is_verified===true,catchAll:d.catch_all===true})):[],suffixes:(options.suffixes||[]).slice(0,50).map((s:any)=>({suffix:s.suffix,isCustom:s.is_custom,isPremium:s.is_premium})),canCreate:options.can_create===true};
}
async function verifiedMailbox(key:string,mailboxId:number){const r=await api(key,'v2/mailboxes');const mailbox=r.mailboxes?.find((m:any)=>m.id===mailboxId);if(!mailbox||mailbox.verified!==true)throw new DomainError('MAILBOX_UNVERIFIED','Yönlendirme için sağlayıcının doğruladığı kendi mailbox hedefini seç.',403);}
export async function aliasAction(actor:{id:string;username:string;avatar?:string|null},input:unknown){
 const data=aliasActionSchema.parse(input),guild=config().guildId;
 if(data.action==='disconnect'){await database().query('DELETE FROM osint_alias_connections WHERE guild_id=$1 AND user_id=$2',[guild,actor.id]);return {success:true};}
 if(data.action==='connect'){await api(data.key,'stats');await syncUser(database(),actor);await database().query('INSERT INTO osint_alias_connections(guild_id,user_id,key_cipher) VALUES($1,$2,$3) ON CONFLICT(guild_id,user_id) DO UPDATE SET key_cipher=EXCLUDED.key_cipher,updated_at=now()',[guild,actor.id,sealOsintSecret(data.key)]);return {success:true};}
 const key=await connection(actor.id);
 if(data.action==='create'){
  if(data.mode!=='custom'){const m=await api(key,'v2/mailboxes');if(!m.mailboxes?.some((x:any)=>x.default===true&&x.verified===true))throw new DomainError('MAILBOX_UNVERIFIED','Varsayılan yönlendirme adresini sağlayıcıda doğrula.',403);return {success:true,alias:slim(await api(key,'alias/random/new?mode='+data.mode,'POST',{note:data.note}))};}
  if(!data.prefix||!data.suffix||!data.mailboxId)throw new DomainError('ALIAS_INPUT','Özel prefix, sağlayıcı suffix ve doğrulanmış mailbox gerekli.',400);
  await verifiedMailbox(key,data.mailboxId);const options=await api(key,'v5/alias/options'),suffix=options.suffixes?.find((s:any)=>s.suffix===data.suffix);if(!suffix?.['signed-suffix'])throw new DomainError('ALIAS_SUFFIX','Sağlayıcının izin verdiği suffix gerekli.',400);
  return {success:true,alias:slim(await api(key,'v3/alias/custom/new','POST',{alias_prefix:data.prefix,signed_suffix:suffix['signed-suffix'],mailbox_ids:[data.mailboxId],note:data.note}))};
 }
 if(data.action==='catchall'){const domains=await api(key,'custom_domains'),d=Array.isArray(domains)?domains.find((d:any)=>d.id===data.domainId):null;if(!d||d.is_verified!==true)throw new DomainError('DOMAIN_UNVERIFIED','Catch-all için kendi doğrulanmış custom domainin gerekli.',403);await api(key,'custom_domains/'+data.domainId,'PATCH',{catch_all:data.enabled});return {success:true};}
 // The provider validates the alias against this user's own API account before a write.
 await api(key,'aliases/'+data.aliasId);
 if(data.action==='toggle')return {success:true,alias:await api(key,'aliases/'+data.aliasId+'/toggle','POST')};
 await verifiedMailbox(key,data.mailboxId);await api(key,'aliases/'+data.aliasId,'PATCH',{mailbox_ids:[data.mailboxId]});return {success:true};
}
