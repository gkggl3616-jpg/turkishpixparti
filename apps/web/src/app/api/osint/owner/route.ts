import {loadServerSettings} from '../../../../../../../packages/core/src/setup';
import {NextResponse} from 'next/server';
import {session,csrf,DomainError,osintAdminState,osintSetBlocked,purgeOldOsintLogs,osintGrant,revokeOsintGrant,setOsintProviderKey,testOsintProvider,osintAuditExport,osintMemberDetails,rateLimit,assertOsintOwner,ownedSmsNumbers,smsAssignments,assignSmsNumber,revokeSmsNumber} from '../../../../../../../packages/core/src/index';
export const dynamic='force-dynamic';export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
function failure(e:unknown){return NextResponse.json({error:e instanceof DomainError?e.message:'Owner işlemi tamamlanamadı.'},{status:e instanceof DomainError?e.status:500,headers});}
export async function GET(req:Request){try{
 await loadServerSettings();
 const me=await session(req);if(!me)throw new DomainError('LOGIN_REQUIRED','Discord ile giriş gerekli.',401);
 const url=new URL(req.url),search=url.searchParams.get('q')||'',offset=Number(url.searchParams.get('offset')||0);
 if(url.searchParams.get('sms')==='1')return NextResponse.json({...(await ownedSmsNumbers(me.id)),assignments:await smsAssignments(me.id)},{headers});
 if(url.searchParams.get('member'))return NextResponse.json(await osintMemberDetails(me.id,url.searchParams.get('member')!),{headers});
 if(url.searchParams.get('export')==='1'){const data=await osintAuditExport(me.id,search,offset);return NextResponse.json(data,{headers:{...headers,'Content-Disposition':'attachment; filename="turkishpix-osint-audit.json"'}});}
 assertOsintOwner(me.id);await purgeOldOsintLogs();const data=await osintAdminState(me.id,search,offset);return NextResponse.json({...data,csrf:me.csrf},{headers});
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 await loadServerSettings();
 const me=await session(req);if(!me)throw new DomainError('LOGIN_REQUIRED','Discord ile giriş gerekli.',401);csrf(req,me);
 const raw=await req.text();if(raw.length>2000)throw new DomainError('BAD_REQUEST','İstek fazla büyük.',413);
 let d:any;try{d=JSON.parse(raw);}catch{throw new DomainError('BAD_REQUEST','Geçerli JSON gerekli.',400);}
 let result:any;
 if(d?.action==='sms-assign')result=await assignSmsNumber(me,d.userId,d.phone,d.expiresAt);
 else if(d?.action==='sms-revoke')result=await revokeSmsNumber(me,d.id);
 else if(d?.action==='grant')result=await osintGrant(me,d.userId,d.credits,d.expiresAt);
 else if(d?.action==='revoke')result=await revokeOsintGrant(me,d.id);
 else if(d?.action==='provider-key'&&typeof d.provider==='string'&&typeof d.key==='string')result=await setOsintProviderKey(me,d.provider,d.key);
 else if(d?.action==='provider-test'&&typeof d.provider==='string'){await rateLimit('osint-provider-test:'+me.id,6,60);result=await testOsintProvider(me.id,d.provider);}
 else if(typeof d?.userId==='string'&&typeof d?.blocked==='boolean'&&typeof d?.reason==='string')result=await osintSetBlocked(me,d.userId,d.blocked,d.reason);
 else throw new DomainError('BAD_REQUEST','Geçerli owner işlemi gerekli.',400);
 return NextResponse.json(result,{headers});
}catch(e){return failure(e);}}
