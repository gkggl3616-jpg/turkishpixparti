import {randomUUID} from 'node:crypto';
import {type DB,database,transaction} from './db';
import {config,DomainError,requireOperational} from './config';
import {discordRequest,guildMember,syncUser} from './discord';
import {audit,enqueue} from './audit';
import {roleMappingSchema,roleRequestSchema} from './validation';

export const ROLE_LABELS={TBMM_PRESIDENT:'TBMM başkanı',PARTY_LEADER:'Parti başkanı',MP:'Milletvekili',PARTY_MEMBER:'Parti üyesi'} as const;
export type RoleKey=keyof typeof ROLE_LABELS;
type Actor={id:string;username:string;avatar?:string|null};
type DiscordRole={id:string;name:string;color:number;position:number;managed:boolean;permissions:string};
const ADMIN=8n,MANAGE_GUILD=32n,MANAGE_ROLES=268435456n;
function onlyOwner(actor:Actor){if(!config().owners.includes(actor.id))throw new DomainError('FORBIDDEN','Rol yönetimi yalnızca owner hesaplarına açık.',403);}
function higher(a:DiscordRole,b:DiscordRole){return a.position>b.position||(a.position===b.position&&BigInt(a.id)<BigInt(b.id));}
export async function roleMappings(db:DB=database()){
 const rows=(await db.query('SELECT * FROM discord_role_mappings ORDER BY role_key')).rows;
 return Object.fromEntries(Object.keys(ROLE_LABELS).map(key=>[key,rows.find(r=>r.role_key===key)?.role_id??(rows.some(r=>r.role_key===key)?null:key==='MP'?config().mpRole||null:null)])) as Record<RoleKey,string|null>;
}
export async function discordRoleCatalog(){
 const c=config();
 if(!c.botToken||!c.guildId)throw new DomainError('NOT_CONFIGURED','Rolleri okumak için bot token ve sunucu ID’si gerekli.',503);
 const [roles,self,guild]=await Promise.all([
  discordRequest(`/guilds/${c.guildId}/roles`),discordRequest('/users/@me'),discordRequest(`/guilds/${c.guildId}`)
 ]);
 const botMember=await discordRequest(`/guilds/${c.guildId}/members/${self.id}`);
 return buildRoleCatalog(roles,self,guild,botMember);
}
export function buildRoleCatalog(roles:DiscordRole[],self:any,guild:any,botMember:any){
 const c=config();
 const all=roles as DiscordRole[];
 const owned=all.filter(r=>r.id===c.guildId||botMember.roles.includes(r.id));
 const permissions=owned.reduce((n,r)=>n|BigInt(r.permissions),0n);
 const canManage=!!(permissions&(ADMIN|MANAGE_ROLES));
 const highest=owned.sort((a,b)=>higher(a,b)?-1:1)[0];
 const enriched=all.sort((a,b)=>higher(a,b)?-1:1).map(r=>{
  let blockedReason='';
  if(r.id===c.guildId)blockedReason='@everyone eşleştirilemez.';
  else if(r.managed)blockedReason='Discord veya bir entegrasyon tarafından yönetiliyor.';
  else if(BigInt(r.permissions)&(ADMIN|MANAGE_GUILD|MANAGE_ROLES))blockedReason='Yönetici veya rol yönetimi yetkisi içeren roller siyasi görevlere bağlanamaz.';
  else if(!canManage)blockedReason='Botta Rolleri Yönet yetkisi yok.';
  else if(!highest||!higher(highest,r))blockedReason='Bu rol botun en yüksek rolünün altında olmalı.';
  return {...r,manageable:!blockedReason,blockedReason};
 });
 return {roles:enriched,bot:{id:self.id,name:self.username,canManage,highestRole:highest?.name||'@everyone'},guild:{id:c.guildId,name:guild.name,ownerId:guild.owner_id}};
}
export async function assertManageableRole(roleId:string){
 const catalog=await discordRoleCatalog();const role=catalog.roles.find(r=>r.id===roleId);
 if(!role)throw new DomainError('ROLE_NOT_FOUND','Seçilen rol sunucuda bulunamadı.');
 if(!role.manageable)throw new DomainError('ROLE_NOT_MANAGEABLE',role.blockedReason,403);
 return {catalog,role};
}
export async function automaticRole(db:DB,userId:string,key:RoleKey){
 const sql=key==='MP'?"SELECT d.id FROM deputies d JOIN terms t ON t.id=d.term_id WHERE d.user_id=$1 AND d.revoked_at IS NULL AND t.ends_at IS NULL":key==='PARTY_LEADER'?'SELECT id FROM parties WHERE leader_id=$1':key==='PARTY_MEMBER'?'SELECT user_id FROM party_members WHERE user_id=$1':null;
 return sql?!!(await db.query(sql,[userId])).rows.length:false;
}
export async function desiredRole(db:DB,userId:string,key:RoleKey){
 if(await automaticRole(db,userId,key))return true;
 // Milletvekili yetkisi yalnızca aktif meclis kaydından gelir.
 if(key==='MP')return false;
 const g=(await db.query('SELECT * FROM discord_role_grants WHERE user_id=$1 AND role_key=$2',[userId,key])).rows[0];
 if(!g?.enabled)return false;
 if(key==='TBMM_PRESIDENT')return !!(await db.query('SELECT id FROM terms WHERE id=$1 AND ends_at IS NULL',[g.term_id])).rows.length&&await automaticRole(db,userId,'MP');
 return true;
}
export async function queueRoleSync(tx:DB,userId:string,key:RoleKey,reason:string){
 await enqueue(tx,'ROLE_SYNC',{userId,roleKey:key,reason},`role-sync:${randomUUID()}`);
}
export async function roleManagement(actor:Actor){
 onlyOwner(actor);const catalog=await discordRoleCatalog();
 const [mappings,grants]=await Promise.all([roleMappings(),database().query('SELECT g.*,u.username FROM discord_role_grants g JOIN users u ON u.id=g.user_id WHERE g.enabled ORDER BY g.updated_at DESC LIMIT 200')]);
 return {...catalog,mappings,labels:ROLE_LABELS,grants:grants.rows};
}
export async function memberRoles(actor:Actor,userId=actor.id){
 if(userId!==actor.id)onlyOwner(actor);
 if(!/^\d{17,20}$/.test(userId))throw new DomainError('INVALID_USER','Geçerli bir Discord kullanıcı ID’si girin.');
 const [member,catalog,mappings]=await Promise.all([guildMember(userId),discordRoleCatalog(),roleMappings()]);
 const politicalRoles=Object.keys(ROLE_LABELS).filter(key=>mappings[key as RoleKey]&&member.roles.includes(mappings[key as RoleKey])).map(key=>({key,label:ROLE_LABELS[key as RoleKey]}));
 return {user:{id:userId,username:member.user.username,avatar:member.user.avatar},roles:catalog.roles.filter(r=>member.roles.includes(r.id)).map(r=>({id:r.id,name:r.name,color:r.color})),politicalRoles};
}
export async function saveRoleMappings(actor:Actor,input:unknown){
 onlyOwner(actor);requireOperational();const data=roleMappingSchema.parse(input);const catalog=await discordRoleCatalog();
 const ids=Object.values(data.mappings).filter(Boolean);if(new Set(ids).size!==ids.length)throw new DomainError('DUPLICATE_ROLE','Her siyasi göreve farklı bir Discord rolü bağlayın.');
 for(const id of ids){const role=catalog.roles.find(r=>r.id===id);if(!role?.manageable)throw new DomainError('ROLE_NOT_MANAGEABLE',role?.blockedReason||'Rol sunucuda bulunamadı.',403);}
 return transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(1557484055)');await syncUser(tx,actor);const previous=await roleMappings(tx);
  // Eşleştirme takaslarında UNIQUE çakışmasını önlemek için önce boşalt.
  await tx.query('UPDATE discord_role_mappings SET role_id=NULL');
  for(const key of Object.keys(ROLE_LABELS) as RoleKey[]){
   await tx.query('INSERT INTO discord_role_mappings(role_key,role_id,updated_by) VALUES($1,$2,$3) ON CONFLICT(role_key) DO UPDATE SET role_id=EXCLUDED.role_id,updated_by=EXCLUDED.updated_by,updated_at=now()',[key,data.mappings[key],actor.id]);
  }
  const users=(await tx.query('SELECT id FROM users')).rows;
  for(const key of Object.keys(ROLE_LABELS) as RoleKey[])if(previous[key]!==data.mappings[key]){
   for(const user of users)if(await desiredRole(tx,user.id,key)){
    if(previous[key])await enqueue(tx,'ROLE_UNMAP',{userId:user.id,roleId:previous[key],roleKey:key},`role-unmap:${randomUUID()}`);
    if(data.mappings[key])await queueRoleSync(tx,user.id,key,'Rol eşleştirmesi değişti');
   }
  }
  await audit(tx,actor.id,'ROLE_MAPPINGS_UPDATED',config().guildId,{previous,mappings:data.mappings});
  return {message:'Rol eşleştirmeleri kaydedildi. Mevcut görevler Discord’a eşitleniyor.'};
 });
}
export async function validateRoleRequest(actor:Actor,input:unknown,db:DB=database(),checkDiscord=true){
 onlyOwner(actor);const data=roleRequestSchema.parse(input);const mappings=await roleMappings(db);
 if(!mappings[data.roleKey])throw new DomainError('ROLE_NOT_CONFIGURED','Önce bu görev için bir Discord rolü eşleştirin.');
 if(checkDiscord){
  const {catalog}=await assertManageableRole(mappings[data.roleKey]!);const member=await guildMember(data.userId);
  if(member.user.bot)throw new DomainError('INVALID_TARGET','Bot hesabına siyasi görev atanamaz.');
 }
 if(data.roleKey==='MP'&&data.enabled&&!await automaticRole(db,data.userId,'MP'))throw new DomainError('NO_MP_RECORD','Önce TBMM sayfasından dört owner onaylı milletvekili ataması yapın.');
 if(!data.enabled&&await automaticRole(db,data.userId,data.roleKey))throw new DomainError('ACTIVE_ROLE','Bu rol aktif parti veya meclis kaydına bağlı. Önce ilgili görev veya üyelik sona ermeli.');
 if(data.roleKey==='TBMM_PRESIDENT'&&data.enabled&&!await automaticRole(db,data.userId,'MP'))throw new DomainError('PRESIDENT_MP_ONLY','TBMM başkanı aktif milletvekilleri arasından atanır.');
 return data;
}
export async function applyRoleRequest(tx:DB,item:any,actor:Actor){
 const p=await validateRoleRequest(actor,item.payload,tx,false);
 const term=(await tx.query('SELECT id FROM terms WHERE ends_at IS NULL')).rows[0];
 if(p.roleKey==='TBMM_PRESIDENT'&&p.enabled){
  const old=(await tx.query("UPDATE discord_role_grants SET enabled=false,updated_at=now() WHERE role_key='TBMM_PRESIDENT' AND enabled RETURNING user_id")).rows;
  for(const previous of old)await queueRoleSync(tx,previous.user_id,'TBMM_PRESIDENT','TBMM başkanı değişti');
 }
 await tx.query('INSERT INTO discord_role_grants(user_id,role_key,enabled,term_id,source_item_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,role_key) DO UPDATE SET enabled=EXCLUDED.enabled,term_id=EXCLUDED.term_id,source_item_id=EXCLUDED.source_item_id,updated_at=now()',[p.userId,p.roleKey,p.enabled,p.roleKey==='TBMM_PRESIDENT'?term?.id||null:null,item.id]);
 await queueRoleSync(tx,p.userId,p.roleKey,p.reason);
 await audit(tx,actor.id,'ROLE_ASSIGNMENT_APPROVED',p.userId,{roleKey:p.roleKey,enabled:p.enabled,itemId:item.id,reason:p.reason});
}
export async function reconcileRoles(actor:Actor){
 onlyOwner(actor);requireOperational();
 return transaction(async tx=>{
  const mappings=await roleMappings(tx);const users=(await tx.query('SELECT id FROM users')).rows;let count=0;
  for(const user of users)for(const key of Object.keys(ROLE_LABELS) as RoleKey[])if(mappings[key]){await queueRoleSync(tx,user.id,key,'Owner eşitlemesi');count++;}
  await audit(tx,actor.id,'ROLE_RECONCILE_REQUESTED',config().guildId,{count});
  return {message:`${count} rol kontrolü Discord kuyruğuna eklendi.`};
 });
}
