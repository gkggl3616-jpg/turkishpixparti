import {loadServerSettings} from '../../../../../../../packages/core/src/setup';
import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {session,csrf,osintRun,DomainError,osintLog,observedIp} from '../../../../../../../packages/core/src/index';
import {comboPresets} from '../../../../../../../packages/core/src/osint-scan-catalog';
export const runtime='nodejs';export const dynamic='force-dynamic';
const failure=(e:unknown)=>({error:e instanceof DomainError?e.message:e instanceof ZodError?e.issues[0]?.message:'Araştırma şu anda tamamlanamadı.',code:e instanceof DomainError?e.code:'OSINT_ERROR'});
export async function POST(req:Request){
 let actor:any=null,input:any=null;
 try{
  await loadServerSettings();const me=await session(req);actor=me;
  if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);csrf(req,me);
  const raw=await req.text();if(raw.length>8192)throw new DomainError('PAYLOAD_TOO_LARGE','İstek çok uzun.',413);
  let body:any;try{body=JSON.parse(raw);input=body;}catch{throw new DomainError('BAD_JSON','Geçersiz araştırma isteği.',400);}
  const observed=observedIp(req),logTarget=()=>{if(!comboPresets.some(p=>p.id===body?.kind))return body?.target;try{return JSON.parse(body.target).target;}catch{return body?.target;}};
  if(req.headers.get('accept')?.includes('application/x-ndjson')&&comboPresets.some(p=>p.id===body?.kind)){
   const encoder=new TextEncoder();let closed=false;
   const stream=new ReadableStream<Uint8Array>({async start(controller){
    const emit=(data:unknown)=>{if(!closed)try{controller.enqueue(encoder.encode(JSON.stringify(data)+'\n'));}catch{closed=true;}};
    try{const result=await osintRun(me,body.kind,body.target,body.requestId,emit);await osintLog(me.id,'QUERY','WEB',body.kind,logTarget(),observed);emit({type:'result',...result,delivery:'WEB'});}
    catch(e){await osintLog(me.id,'DENIED','WEB',body.kind,logTarget(),observed,e instanceof DomainError?e.code:'ERROR').catch(()=>{});emit({type:'error',...failure(e)});}
    finally{if(!closed){closed=true;controller.close();}}
   },cancel(){closed=true;}});
   return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  const result=await osintRun(me,body?.kind,body?.target,body?.requestId);await osintLog(me.id,'QUERY','WEB',body?.kind,logTarget(),observed);
  return NextResponse.json({...result,delivery:'WEB'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(actor)await osintLog(actor.id,'DENIED','WEB',typeof input?.kind==='string'?input.kind:'',input?.target,observedIp(req),e instanceof DomainError?e.code:'INVALID').catch(()=>{});
  const status=e instanceof DomainError?e.status:e instanceof ZodError?400:500;
  if(status===500)console.error('OSINT_RUN_ERROR',e instanceof Error?e.name:'INTERNAL');
  return NextResponse.json(failure(e),{status,headers:{'Cache-Control':'no-store'}});
 }
}
