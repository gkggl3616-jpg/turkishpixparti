import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {session,csrf,rateLimit} from '../../../../../../../packages/core/src/auth';
import {guildMember} from '../../../../../../../packages/core/src/discord';
import {loadServerSettings} from '../../../../../../../packages/core/src/setup';
import {assertOsintAllowed} from '../../../../../../../packages/core/src/osint-access';
import {aliasState,aliasAction} from '../../../../../../../packages/core/src/osint-aliases';
import {DomainError} from '../../../../../../../packages/core/src/config';
export const runtime='nodejs';export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
const failure=(e:unknown)=>response({error:e instanceof DomainError?e.message:e instanceof ZodError?'Alias formunu kontrol et.':'Alias bağlantısı tamamlanamadı.'},e instanceof DomainError?e.status:e instanceof ZodError?400:500);
async function actor(req:Request){await loadServerSettings();const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yap.',401);await guildMember(me.id);await assertOsintAllowed(me.id);return me;}
export async function GET(req:Request){try{const me=await actor(req);await rateLimit('alias-read:'+me.id,10,60);const page=Number(new URL(req.url).searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>100)throw new DomainError('INVALID_PAGE','Geçerli sayfa gerekli.',400);return response(await aliasState(me.id,page));}catch(e){return failure(e);}}
export async function POST(req:Request){try{const me=await actor(req);csrf(req,me);await rateLimit('alias-write:'+me.id,8,60);const text=await req.text();if(text.length>2048)throw new DomainError('INVALID_ALIAS','İstek fazla uzun.',400);let data:unknown;try{data=JSON.parse(text);}catch{throw new DomainError('INVALID_JSON','Geçerli JSON gerekli.',400);}return response(await aliasAction(me,data));}catch(e){return failure(e);}}
