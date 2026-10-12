import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {session,guildMember,osintQuota,osintTools,DomainError,assertOsintAllowed,osintLog,observedIp,config,osintFirstAccess,osintRank,osintXpProgress,osintRanks} from '../../../../../../packages/core/src/index';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{
  const me=await session(req);
  if(!me)return NextResponse.json({authenticated:false,tools:osintTools,ranks:osintRanks,loginUrl:'/api/auth/login?return=%2Fosint'},{headers:{'Cache-Control':'no-store'}});
  const member=await guildMember(me.id);
  await assertOsintAllowed(me.id);
  await osintLog(me.id,'VISIT','WEB','','',observedIp(req));
  const [osintSince,quota]=await Promise.all([osintFirstAccess(me.id),osintQuota(me.id)]);
  const rank=osintRank(quota.level);
  const progress=osintXpProgress(quota.xp);
  const avatar=typeof me.avatar==='string'&&/^(a_)?[a-f0-9]{16,64}$/i.test(me.avatar)?'https://cdn.discordapp.com/avatars/'+me.id+'/'+me.avatar+(me.avatar.startsWith('a_')?'.gif':'.png')+'?size=256':null;
  const discordCreated=new Date(Number(BigInt(me.id)>>22n)+1420070400000).toISOString();
  return NextResponse.json({authenticated:true,me:{id:me.id,username:me.username,displayName:member.nick||member.user?.global_name||me.username,avatarUrl:avatar,discordCreated,serverJoined:member.joined_at||null,osintSince},rank,progress,ranks:osintRanks,csrf:me.csrf,owner:config().owners.includes(me.id),quota,tools:osintTools},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  const status=e instanceof DomainError?e.status:e instanceof ZodError?400:500;
  return NextResponse.json({error:e instanceof DomainError?e.message:'Araştırma profili yüklenemedi.',authenticated:false},{status,headers:{'Cache-Control':'no-store'}});
 }
}
