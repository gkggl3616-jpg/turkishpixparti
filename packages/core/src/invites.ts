import {config} from './config';
import {database,transaction} from './db';
export type InviteSource={inviterId?:string;code?:string;source:'INVITE'|'VANITY'|'UNKNOWN'};
export async function seedInviteMembers(members:{id:string;username:string;joinedAt:string|null}[]){
 await transaction(async tx=>{await tx.query('INSERT INTO invite_tracking(guild_id) VALUES($1) ON CONFLICT DO NOTHING',[config().guildId]);for(const m of members)await tx.query('INSERT INTO invite_members(guild_id,user_id,username,joined_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[config().guildId,m.id,m.username,m.joinedAt]);});
}
export async function recordInviteJoin(member:{id:string;username:string;joinedAt:string},source:InviteSource){
 return transaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['invite-member:'+config().guildId+':'+member.id]);
  await tx.query('INSERT INTO invite_tracking(guild_id) VALUES($1) ON CONFLICT DO NOTHING',[config().guildId]);
  const old=(await tx.query('SELECT * FROM invite_members WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[config().guildId,member.id])).rows[0];
  if(old?.present&&new Date(old.joined_at).getTime()===new Date(member.joinedAt).getTime())return false;
  const key='join:'+member.id+':'+member.joinedAt;
  const inserted=await tx.query("INSERT INTO invite_events(guild_id,user_id,kind,rejoin,inviter_id,invite_code,source,event_key) VALUES($1,$2,'JOIN',$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id",[config().guildId,member.id,!!old,source.inviterId||null,source.code||null,source.source,key]);if(!inserted.rows.length)return false;
  await tx.query('INSERT INTO invite_members(guild_id,user_id,username,joined_at,inviter_id,invite_code) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(guild_id,user_id) DO UPDATE SET username=EXCLUDED.username,joined_at=EXCLUDED.joined_at,present=true,inviter_id=EXCLUDED.inviter_id,invite_code=EXCLUDED.invite_code',[config().guildId,member.id,member.username,member.joinedAt,source.inviterId||null,source.code||null]);return true;
 });
}
export async function recordInviteLeave(member:{id:string;username:string}){
 return transaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['invite-member:'+config().guildId+':'+member.id]);
  await tx.query('INSERT INTO invite_tracking(guild_id) VALUES($1) ON CONFLICT DO NOTHING',[config().guildId]);
  const old=(await tx.query('SELECT * FROM invite_members WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[config().guildId,member.id])).rows[0];if(old&&!old.present)return false;
  const key='leave:'+member.id+':'+(old?.joined_at?new Date(old.joined_at).toISOString():'unknown');
  await tx.query("INSERT INTO invite_events(guild_id,user_id,kind,inviter_id,invite_code,source,event_key) VALUES($1,$2,'LEAVE',$3,$4,'UNKNOWN',$5) ON CONFLICT DO NOTHING",[config().guildId,member.id,old?.inviter_id||null,old?.invite_code||null,key]);
  await tx.query('INSERT INTO invite_members(guild_id,user_id,username,present) VALUES($1,$2,$3,false) ON CONFLICT(guild_id,user_id) DO UPDATE SET present=false,username=EXCLUDED.username',[config().guildId,member.id,member.username]);return true;
 });
}
export async function inviteStatistics(userId:string){
 const [totals,member,leaders,tracking]=await Promise.all([
  database().query("SELECT count(*) FILTER(WHERE kind='JOIN')::int AS joins,count(*) FILTER(WHERE kind='LEAVE')::int AS leaves,count(*) FILTER(WHERE kind='JOIN' AND rejoin)::int AS rejoins,count(*) FILTER(WHERE kind='JOIN' AND inviter_id IS NULL)::int AS unknown FROM invite_events WHERE guild_id=$1",[config().guildId]),
  database().query("SELECT count(*) FILTER(WHERE kind='JOIN')::int AS joins,count(*) FILTER(WHERE kind='LEAVE')::int AS leaves,count(*) FILTER(WHERE kind='JOIN' AND rejoin)::int AS rejoins,(SELECT count(*)::int FROM invite_members WHERE guild_id=$1 AND inviter_id=$2 AND present) AS active FROM invite_events WHERE guild_id=$1 AND inviter_id=$2",[config().guildId,userId]),
  database().query("SELECT inviter_id,count(*) FILTER(WHERE kind='JOIN')::int AS joins,count(*) FILTER(WHERE kind='LEAVE')::int AS leaves,count(*) FILTER(WHERE kind='JOIN' AND rejoin)::int AS rejoins FROM invite_events WHERE guild_id=$1 AND inviter_id IS NOT NULL GROUP BY inviter_id ORDER BY joins DESC,inviter_id LIMIT 10",[config().guildId]),
  database().query('SELECT started_at FROM invite_tracking WHERE guild_id=$1',[config().guildId])]);
 return {totals:totals.rows[0],member:member.rows[0],leaders:leaders.rows,startedAt:tracking.rows[0]?.started_at||null};
}
