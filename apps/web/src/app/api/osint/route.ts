import {socialSourceStatus} from '../../../../../../packages/core/src/osint-social';
import {loadServerSettings} from '../../../../../../packages/core/src/setup';
import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {session,guildMember,osintQuota,osintTools,osintCatalog,DomainError,assertOsintAllowed,osintLog,observedIp,config,database,osintProviderStatus} from '../../../../../../packages/core/src/index';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{
  await loadServerSettings();
  if(new URL(req.url).searchParams.get('status')==='1'){const providers=await osintProviderStatus();return NextResponse.json({scope:'OSINT',socialSources:await socialSourceStatus(),apiSources:providers.filter(p=>!['username','catalog'].includes(p.category||'')).length,catalogSources:providers.filter(p=>p.category==='catalog').length,profileSources:providers.filter(p=>p.category==='username').length,providers:providers.map(p=>({id:p.id,name:p.name,kind:p.category==='username'?'PUBLIC_PROFILE':p.category==='catalog'?'PUBLIC_API_CATALOG':'API_DATA_SOURCE',configured:p.configured,state:p.state,checkedAt:p.checkedAt,code:p.code,latencyMs:p.latencyMs}))},{headers:{'Cache-Control':'no-store'}});}
  const me=await session(req);
  if(!me)return NextResponse.json({authenticated:false,tools:await osintCatalog(),loginUrl:'/api/auth/login?return=%2Fosint'},{headers:{'Cache-Control':'no-store'}});
  const member=await guildMember(me.id);
  await assertOsintAllowed(me.id);
  const first=await database().query('INSERT INTO osint_portal_memberships(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING RETURNING joined_at',[me.id]);
  const siteJoinedAt=first.rows[0]?.joined_at||(await database().query('SELECT joined_at FROM osint_portal_memberships WHERE user_id=$1',[me.id])).rows[0]?.joined_at||null;
  await osintLog(me.id,'VISIT','WEB','','',observedIp(req));
  return NextResponse.json({authenticated:true,me:{id:me.id,username:me.username,avatar:me.avatar,displayName:member.nick||member.user?.global_name||member.user?.username||me.username,discordJoinedAt:member.joined_at||null,siteJoinedAt},csrf:me.csrf,owner:config().owners.includes(me.id),quota:await osintQuota(me.id),tools:await osintCatalog()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  const status=e instanceof DomainError?e.status:e instanceof ZodError?400:500;
  return NextResponse.json({error:e instanceof DomainError?e.message:'Araştırma profili yüklenemedi.',authenticated:false},{status,headers:{'Cache-Control':'no-store'}});
 }
}
