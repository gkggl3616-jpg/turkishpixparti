import {database,transaction} from './db';
import {config,readiness,setServerSettings,DomainError} from './config';
import {serverSettingsSchema} from './validation';
import {discordRequest,syncUser} from './discord';
import {audit} from './audit';
import {buildRoleCatalog,roleMappings,ROLE_LABELS} from './roles';
import {applicationConnection} from './application';
type Actor={id:string;username:string;avatar?:string|null};
function owner(actor:Actor){if(!config().owners.includes(actor.id))throw new DomainError('FORBIDDEN','Sunucu kurulumu yalnızca owner hesaplarına açık.',403);}
export function botInviteUrl(){return 'https://discord.com/oauth2/authorize?'+new URLSearchParams({client_id:config().clientId,scope:'bot applications.commands',permissions:'268520448',guild_id:config().guildId,disable_guild_select:config().guildId?'true':'false'}).toString();}
export async function loadServerSettings(){
 const row=(await database().query('SELECT settings FROM server_settings WHERE id=1')).rows[0];
 setServerSettings(row?serverSettingsSchema.parse(row.settings):{});
}
export async function saveServerSettings(actor:Actor,input:unknown){
 owner(actor);if(config().demo)throw new DomainError('DEMO_READONLY','Önizlemede ayarlar kaydedilmez.',403);
 if(config().auditKey.length<32)throw new DomainError('NOT_CONFIGURED','Denetim anahtarı henüz hazır değil.',503);
 const data=serverSettingsSchema.parse(input);const c=config();const previous={guildId:c.guildId,voteChannel:c.voteChannel,logChannel:c.logChannel};
 if(data.voteChannel&&data.voteChannel===data.logChannel)throw new DomainError('SAME_CHANNEL','Oylama ve özel owner log kanalı farklı olmalı.');
 await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(1557484055)');await syncUser(tx,actor);
  if(c.guildId&&c.guildId!==data.guildId&&(await tx.query('SELECT id FROM items LIMIT 1')).rows.length)throw new DomainError('SERVER_LOCKED','Kayıt oluşturulduktan sonra sunucu değiştirilemez.');
  if(c.guildId!==data.guildId)await tx.query('UPDATE discord_role_mappings SET role_id=NULL');
  await tx.query('INSERT INTO server_settings(id,settings,updated_by) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings,updated_by=EXCLUDED.updated_by,updated_at=now()',[data,actor.id]);
  await audit(tx,actor.id,'SERVER_SETTINGS_UPDATED',data.guildId,{previous,settings:data});
 });setServerSettings(data);
 return {message:'Sunucu ve kanal ID’leri kaydedildi. Bağlantıyı kontrol ederek izinleri doğrulayın.'};
}
export function effectiveChannelPermissions(base:bigint,roleIds:string[],memberId:string,channel:any,guildId:string){
 if(base&8n)return (1n<<60n)-1n;
 let value=base;const overwrites=channel.permission_overwrites||[];
 const everyone=overwrites.find((o:any)=>o.id===guildId&&Number(o.type)===0);
 if(everyone)value=(value&~BigInt(everyone.deny))|BigInt(everyone.allow);
 let deny=0n,allow=0n;
 for(const o of overwrites)if(Number(o.type)===0&&o.id!==guildId&&roleIds.includes(o.id)){deny|=BigInt(o.deny);allow|=BigInt(o.allow);}
 value=(value&~deny)|allow;
 const own=overwrites.find((o:any)=>Number(o.type)===1&&o.id===memberId);
 if(own)value=(value&~BigInt(own.deny))|BigInt(own.allow);
 return value;
}
function channelChecks(permissions:bigint){return {view:!!(permissions&1024n),send:!!(permissions&2048n),embed:!!(permissions&16384n),history:!!(permissions&65536n)};}
export function buildChannelCatalog(channels:any[],roles:any[],member:{id:string;roles:string[]},guildId:string){
 const base=roles.filter(r=>r.id===guildId||member.roles.includes(r.id)).reduce((n:bigint,r:any)=>n|BigInt(r.permissions),0n);
 return channels.filter(ch=>[0,5,2,13].includes(ch.type)).map(ch=>{
  const checks=channelChecks(effectiveChannelPermissions(base,member.roles,member.id,ch,guildId));
  return {id:ch.id,name:ch.name,type:ch.type,category:channels.find(c=>c.id===ch.parent_id)?.name||'',position:ch.position||0,checks,usable:checks.view&&checks.send};
 }).filter(ch=>ch.checks.view).sort((a,b)=>a.category.localeCompare(b.category,'tr')||a.position-b.position||a.name.localeCompare(b.name,'tr'));
}
export async function listBotChannels(){
 const c=config();if(!c.botToken||!c.guildId)return {channels:[],error:'Bot ve sunucu bağlantısını tamamlayın.'};
 try{
  const self=await discordRequest('/users/@me');
  const [roles,member,channels]=await Promise.all([discordRequest(`/guilds/${c.guildId}/roles`),discordRequest(`/guilds/${c.guildId}/members/${self.id}`),discordRequest(`/guilds/${c.guildId}/channels`)]);
  return {channels:buildChannelCatalog(channels,roles,{...member,id:self.id},c.guildId),error:null};
 }catch{return {channels:[],error:'Kanal listesi alınamadı. Botun sunucuya bağlı olduğunu ve Kanalları Görüntüle iznini kontrol edin.'};}
}
export async function detectConnection(actor:Actor){
 owner(actor);const c=config();const settings={guildId:c.guildId,voteChannel:c.voteChannel,logChannel:c.logChannel};
 const [mappings,heartbeat]=await Promise.all([roleMappings(),database().query("SELECT status,updated_at FROM integration_status WHERE name='discord'")]);
 const application=await applicationConnection();
 const base={application,settings,mappings,labels:ROLE_LABELS,installUrl:botInviteUrl(),redirectUri:c.appUrl+'/api/auth/callback',checks:readiness().checks,heartbeat:heartbeat.rows[0]||null};
 if(!c.botToken)return {...base,bot:{authenticated:false,installed:false,error:'Bot token sunucu değişkenlerine eklenmeli.'},channels:[],roles:[]};
 try{
  const [self,guilds]=await Promise.all([discordRequest('/users/@me'),discordRequest('/users/@me/guilds')]);
  const installed=guilds.some((g:any)=>g.id===c.guildId);
  if(!installed)return {...base,bot:{authenticated:true,installed:false,name:self.username,id:self.id},guilds:guilds.map((g:any)=>({id:g.id,name:g.name})),channels:[],roles:[]};
  const [guild,roles,member,channels]=await Promise.all([discordRequest(`/guilds/${c.guildId}`),discordRequest(`/guilds/${c.guildId}/roles`),discordRequest(`/guilds/${c.guildId}/members/${self.id}`),discordRequest(`/guilds/${c.guildId}/channels`)]);
  const catalog=buildRoleCatalog(roles,self,guild,member);
  const permissions=roles.filter((r:any)=>r.id===c.guildId||member.roles.includes(r.id)).reduce((n:bigint,r:any)=>n|BigInt(r.permissions),0n);
  const textChannels=channels.filter((ch:any)=>[0,5].includes(ch.type)).map((ch:any)=>{
   const checks=channelChecks(effectiveChannelPermissions(permissions,member.roles,self.id,ch,c.guildId));
   return {id:ch.id,name:ch.name,type:ch.type,checks,usable:checks.view&&checks.send&&checks.embed};
  }).sort((a:any,b:any)=>a.name.localeCompare(b.name,'tr'));
  const selected=Object.fromEntries(['voteChannel','logChannel'].map(key=>{const id=settings[key as 'voteChannel'|'logChannel'];const channel=textChannels.find((ch:any)=>ch.id===id);return [key,{id,configured:!!id,exists:!!channel,ready:!!channel?.usable,channel:channel||null}];}));
  return {...base,guild:{id:c.guildId,name:guild.name},bot:{...catalog.bot,authenticated:true,installed:true},channels:textChannels,roles:catalog.roles,selected,ready:Object.values(selected).every((ch:any)=>ch.ready)};
 }catch(e){return {...base,bot:{authenticated:false,installed:false,error:e instanceof DomainError?e.message:'Discord bağlantısı şu anda kurulamadı.'},channels:[],roles:[]};}
}
