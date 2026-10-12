import {NextResponse} from 'next/server';
import {session,csrf,DomainError,osintOwnerList,osintSetBlocked,purgeOldOsintLogs} from '../../../../../../../packages/core/src/index';
export const dynamic='force-dynamic';export const runtime='nodejs';
function failure(e:unknown){return NextResponse.json({error:e instanceof DomainError?e.message:'Owner işlemi tamamlanamadı.'},{status:e instanceof DomainError?e.status:500,headers:{'Cache-Control':'no-store'}});}
export async function GET(req:Request){
 try{
  const me=await session(req);if(!me)throw new DomainError('LOGIN_REQUIRED','Discord ile giriş gerekli.',401);
  const data=await osintOwnerList(me.id,120);
  await purgeOldOsintLogs();
  return NextResponse.json({...data,csrf:me.csrf},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
export async function POST(req:Request){
 try{
  const me=await session(req);if(!me)throw new DomainError('LOGIN_REQUIRED','Discord ile giriş gerekli.',401);
  csrf(req,me);
  if((req.headers.get('content-length')&&Number(req.headers.get('content-length'))>1000))throw new DomainError('BAD_REQUEST','İstek fazla büyük.',413);
  const data=await req.json();
  if(typeof data?.userId!=='string'||typeof data?.blocked!=='boolean'||typeof data?.reason!=='string')throw new DomainError('BAD_REQUEST','Üye, işlem ve gerekçe gerekli.',400);
  const result=await osintSetBlocked(me,data.userId,data.blocked,data.reason);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
