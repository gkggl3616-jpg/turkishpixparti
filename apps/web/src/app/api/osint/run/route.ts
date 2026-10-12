import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {session,csrf,osintRun,DomainError} from '../../../../../../../packages/core/src/index';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req:Request){
 try{
  const me=await session(req);
  if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);
  csrf(req,me);
  const raw=await req.text();
  if(raw.length>1024)throw new DomainError('PAYLOAD_TOO_LARGE','İstek çok uzun.',413);
  let body:any;try{body=JSON.parse(raw);}catch{throw new DomainError('BAD_JSON','Geçersiz araştırma isteği.',400);}
  const result=await osintRun(me,body?.kind,body?.target,body?.requestId);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  const status=e instanceof DomainError?e.status:e instanceof ZodError?400:500;
  if(status===500)console.error('OSINT_RUN_ERROR',e instanceof Error?e.name:'INTERNAL');
  return NextResponse.json({error:e instanceof DomainError?e.message:e instanceof ZodError?e.issues[0]?.message:'Araştırma şu anda tamamlanamadı.',code:e instanceof DomainError?e.code:'OSINT_ERROR'},{status,headers:{'Cache-Control':'no-store'}});
 }
}
