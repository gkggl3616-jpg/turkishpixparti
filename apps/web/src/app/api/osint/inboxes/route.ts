import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {session,csrf,rateLimit} from '../../../../../../../packages/core/src/auth';
import {guildMember} from '../../../../../../../packages/core/src/discord';
import {loadServerSettings} from '../../../../../../../packages/core/src/setup';
import {assertOsintAllowed} from '../../../../../../../packages/core/src/osint-access';
import {liveInboxState,liveInboxAction} from '../../../../../../../packages/core/src/osint-live-inbox';
import {DomainError} from '../../../../../../../packages/core/src/config';
export const runtime='nodejs';export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function actor(req:Request){await loadServerSettings();const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yap.',401);await guildMember(me.id);await assertOsintAllowed(me.id);return me;}
const failure=(e:unknown)=>response({error:e instanceof DomainError?e.message:e instanceof ZodError?'Gelen kutusu formunu kontrol et.':'Kutu isteği tamamlanmadı.'},e instanceof DomainError?e.status:e instanceof ZodError?400:500);
export async function GET(req:Request){try{const me=await actor(req);await rateLimit('inbox-ui:'+me.id,150,60);return response(await liveInboxState(me.id));}catch(e){return failure(e);}}
export async function POST(req:Request){try{const me=await actor(req);csrf(req,me);await rateLimit('inbox-actions:'+me.id,20,60);const text=await req.text();if(text.length>1500)throw new DomainError('INVALID_INBOX','İstek fazla uzun.',400);let data:unknown;try{data=JSON.parse(text);}catch{throw new DomainError('INVALID_JSON','Geçerli JSON gerekli.',400);}return response(await liveInboxAction(me,data));}catch(e){return failure(e);}}
