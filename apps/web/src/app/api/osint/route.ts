import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {session,guildMember,osintQuota,osintTools,DomainError} from '../../../../../../packages/core/src/index';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{
  const me=await session(req);
  if(!me)return NextResponse.json({authenticated:false,tools:osintTools,loginUrl:'/api/auth/login?return=%2Fosint'},{headers:{'Cache-Control':'no-store'}});
  await guildMember(me.id);
  return NextResponse.json({authenticated:true,me:{id:me.id,username:me.username,avatar:me.avatar},csrf:me.csrf,quota:await osintQuota(me.id),tools:osintTools},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  const status=e instanceof DomainError?e.status:e instanceof ZodError?400:500;
  return NextResponse.json({error:e instanceof DomainError?e.message:'Araştırma profili yüklenemedi.',authenticated:false},{status,headers:{'Cache-Control':'no-store'}});
 }
}
