import {database} from './db';
import {config} from './config';
export async function osintFirstAccess(userId:string){
 // Preserve earlier OSINT VISIT events for people who used the service before this tracking table existed.
 const r=await database().query("INSERT INTO osint_member_accounts(guild_id,user_id,created_at) VALUES($1,$2,COALESCE((SELECT min(created_at) FROM osint_access_events WHERE guild_id=$1 AND user_id=$2 AND event_type='VISIT'),now())) ON CONFLICT(guild_id,user_id) DO UPDATE SET created_at=osint_member_accounts.created_at RETURNING created_at",[config().guildId,userId]);
 return new Date(r.rows[0].created_at).toISOString();
}
