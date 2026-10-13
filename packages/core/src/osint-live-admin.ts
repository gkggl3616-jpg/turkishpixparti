import {config,DomainError} from './config';
import {database} from './db';
import {discordRequest,guildMember,DiscordAPIError,syncUser} from './discord';
import {assertOsintOwner} from './osint-entitlements';
import {assertOsintAllowed} from './osint-access';
export async function recordOsintActivity(actor:{id:string;username:string}){
 await guildMember(actor.id);await assertOsintAllowed(actor.id);await syncUser(database(),actor);
 await database().query('INSERT INTO osint_portal_memberships(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[actor.id]);
 await database().query('UPDATE osint_portal_memberships SET last_active_at=now() WHERE user_id=$1',[actor.id]);return {active:true,activeWindowSeconds:90};
}
export async function osintActiveUsers(ownerId:string){assertOsintOwner(ownerId);await guildMember(ownerId);
 const [users,total]=await Promise.all([database().query("SELECT u.id,u.username,u.avatar,m.last_active_at FROM osint_portal_memberships m JOIN users u ON u.id=m.user_id WHERE m.last_active_at>now()-interval '90 seconds' ORDER BY m.last_active_at DESC LIMIT 1000"),database().query("SELECT count(*)::int AS n FROM osint_portal_memberships WHERE last_active_at>now()-interval '90 seconds'")]);
 return {users:users.rows,total:Number(total.rows[0]?.n||0),activeWindowSeconds:90,checkedAt:new Date().toISOString(),truncated:users.rows.length<Number(total.rows[0]?.n||0)};
}
type Member={id:string;username:string;displayName:string;avatar:string|null;joinedAt:string|null;roles:string[];bot:boolean;pending:boolean};
type Snapshot={members:Member[];roles:{id:string;name:string}[];checkedAt:string;complete:boolean;stale:boolean;error:string};
let cached:{guild:string;fetch:typeof fetch;until:number;value:Snapshot}|undefined,inflight:{guild:string;fetch:typeof fetch;promise:Promise<Snapshot>}|undefined;
async function membersSnapshot(){const guild=config().guildId;if(!/^\d{17,20}$/.test(guild))throw new DomainError('GUILD_REQUIRED','Sunucu bağlantısı gerekli.',503);
 if(cached?.guild===guild&&cached.fetch===globalThis.fetch&&cached.until>Date.now())return cached.value;
 if(inflight?.guild===guild&&inflight.fetch===globalThis.fetch)return inflight.promise;
 const old=cached?.guild===guild&&cached.fetch===globalThis.fetch?cached.value:undefined,requestFetch=globalThis.fetch;
 const promise=(async()=>{try{let after='0',complete=false;const members:Member[]=[],seen=new Set<string>();
  for(let page=0;page<20;page++){
   const rows=await discordRequest('/guilds/'+guild+'/members?limit=1000&after='+after);if(!Array.isArray(rows))throw new DomainError('DISCORD_FORMAT','Üye listesi doğrulanamadı.',503);
   let highest=BigInt(after);for(const m of rows){const id=m.user?.id;if(!/^\d{17,20}$/.test(id||'')||BigInt(id)<=BigInt(after)||seen.has(id))throw new DomainError('DISCORD_FORMAT','Üye sayfalaması doğrulanamadı.',503);seen.add(id);if(BigInt(id)>highest)highest=BigInt(id);members.push({id,username:String(m.user.username||id).slice(0,100),displayName:String(m.nick||m.user.global_name||m.user.username||id).slice(0,100),avatar:m.user.avatar||null,joinedAt:m.joined_at||null,roles:Array.isArray(m.roles)?m.roles.filter((r:unknown)=>typeof r==='string'&&/^\d{17,20}$/.test(r)):[],bot:m.user.bot===true,pending:m.pending===true});}
   if(rows.length<1000){complete=true;break;}after=highest.toString();
  }
  const rawRoles=await discordRequest('/guilds/'+guild+'/roles');if(!Array.isArray(rawRoles))throw new DomainError('DISCORD_FORMAT','Rol listesi doğrulanamadı.',503);
  const value:Snapshot={members,roles:rawRoles.filter(r=>/^\d{17,20}$/.test(r.id)).map(r=>({id:r.id,name:String(r.name).slice(0,100)})),checkedAt:new Date().toISOString(),complete,stale:false,error:''};cached={guild,fetch:requestFetch,until:Date.now()+30000,value};return value;
 }catch(e){const value:Snapshot={members:old?.members||[],roles:old?.roles||[],checkedAt:old?.checkedAt||'',complete:old?.complete||false,stale:!!old,error:e instanceof DiscordAPIError&&e.responseStatus===403?'MEMBER_INTENT_OR_PERMISSION_REQUIRED':e instanceof DomainError?e.code:'DISCORD_UNAVAILABLE'};cached={guild,fetch:requestFetch,until:Date.now()+30000,value};return value;}})();
 const current={guild,fetch:requestFetch,promise};inflight=current;try{return await promise;}finally{if(inflight===current)inflight=undefined;}
}
export async function osintGuildMembers(ownerId:string,search='',offset=0,kind='all',role=''){
 assertOsintOwner(ownerId);await guildMember(ownerId);
 if(search.length>100||!Number.isSafeInteger(offset)||offset<0||offset>20000||!['all','human','bot'].includes(kind)||role&&!/^\d{17,20}$/.test(role))throw new DomainError('INVALID_FILTER','Geçerli üye filtresi gerekli.',400);
 const data=await membersSnapshot(),q=search.toLocaleLowerCase('tr'),filtered=data.members.filter(m=>(kind==='all'||m.bot===(kind==='bot'))&&(!role||m.roles.includes(role))&&[m.id,m.username,m.displayName].join(' ').toLocaleLowerCase('tr').includes(q));
 return {...data,members:filtered.slice(offset,offset+100),total:filtered.length,guildTotal:data.members.length,offset,pageSize:100,refreshSeconds:30};
}
// Internal worker emits aggregate health only, never the member records.
export async function refreshOsintGuildMembers(){const s=await membersSnapshot();return {state:s.error||'OK',members:s.members.length,complete:s.complete,stale:s.stale,checkedAt:s.checkedAt};}
