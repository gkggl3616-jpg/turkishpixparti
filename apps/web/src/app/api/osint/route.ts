import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {session,guildMember,osintQuota,osintTools,DomainError,assertOsintAllowed,osintLog,observedIp,config,database} from '../../../../../../packages/core/src/index';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{
  const me=await session(req);
  if(!me)return NextResponse.json({authenticated:false,tools:osintTools,loginUrl:'/api/auth/login?return=%2Fosint'},{headers:{'Cache-Control':'no-store'}});
  const member=await guildMember(me.id);
  await assertOsintAllowed(me.id);
  const first=await database().query('INSERT INTO osint_portal_memberships(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING RETURNING joined_at',[me.id]);
  const siteJoinedAt=first.rows[0]?.joined_at||(await database().query('SELECT joined_at FROM osint_portal_memberships WHERE user_id=$1',[me.id])).rows[0]?.joined_at||null;
  await osintLog(me.id,'VISIT','WEB','','',observedIp(req));
  return NextResponse.json({authenticated:true,me:{id:me.id,username:me.username,avatar:me.avatar,displayName:member.nick||member.user?.global_name||member.user?.username||me.username,discordJoinedAt:member.joined_at||null,siteJoinedAt},csrf:me.csrf,owner:config().owners.includes(me.id),quota:await osintQuota(me.id),tools:osintTools},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  const status=e instanceof DomainError?e.status:e instanceof ZodError?400:500;
  return NextResponse.json({error:e instanceof DomainError?e.message:'Araştırma profili yüklenemedi.',authenticated:false},{status,headers:{'Cache-Control':'no-store'}});
 }
}
