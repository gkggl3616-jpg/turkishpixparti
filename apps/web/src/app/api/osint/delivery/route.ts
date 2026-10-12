import {loadServerSettings} from '../../../../../../../packages/core/src/setup';
import {NextResponse} from 'next/server';
import {session,csrf,rateLimit} from '../../../../../../../packages/core/src/auth';
import {guildMember} from '../../../../../../../packages/core/src/discord';
import {assertOsintAllowed} from '../../../../../../../packages/core/src/osint-access';
import {retryOsintDelivery} from '../../../../../../../packages/core/src/osint-dm';
import {DomainError} from '../../../../../../../packages/core/src/config';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req:Request){
 try{
  await loadServerSettings();
  const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yap.',401);
  csrf(req,me);await guildMember(me.id);await assertOsintAllowed(me.id);
  const raw=await req.text();if(raw.length>256)throw new DomainError('INVALID_DELIVERY','Geçersiz teslim kaydı.',400);
  let body:any;try{body=JSON.parse(raw);}catch{throw new DomainError('INVALID_DELIVERY','Geçersiz teslim kaydı.',400);}
  if(typeof body?.deliveryId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.deliveryId))throw new DomainError('INVALID_DELIVERY','Geçersiz teslim kaydı.',400);
  await rateLimit('osint-dm-retry:'+me.id,4,60);
  const delivery=await retryOsintDelivery(body.deliveryId,me.id,true);
  return NextResponse.json({dmDelivered:delivery.delivered,deliveryId:delivery.id},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof DomainError?e.message:'Özel mesaj gönderilemedi.'},{status:e instanceof DomainError?e.status:500,headers:{'Cache-Control':'no-store'}});}
}
