import {NextResponse} from 'next/server';
import {session,csrf,rateLimit} from '../../../../../../../packages/core/src/auth';
import {loadServerSettings} from '../../../../../../../packages/core/src/setup';
import {recordOsintActivity} from '../../../../../../../packages/core/src/osint-live-admin';
import {DomainError} from '../../../../../../../packages/core/src/config';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function POST(req:Request){try{await loadServerSettings();const me=await session(req);if(!me)throw new DomainError('LOGIN_REQUIRED','Discord ile giriş gerekli.',401);csrf(req,me);await rateLimit('osint-heartbeat:'+me.id,4,60);return NextResponse.json(await recordOsintActivity(me),{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof DomainError?e.message:'Etkinlik kaydedilemedi.'},{status:e instanceof DomainError?e.status:503,headers:{'Cache-Control':'no-store'}});}}
