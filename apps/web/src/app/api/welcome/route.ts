import {NextResponse} from 'next/server';
import {session,welcomeComposer,DomainError} from '../../../../../../packages/core/src/index';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function GET(req:Request){try{const me=await session(req);if(!me)throw new DomainError('LOGIN_REQUIRED','Discord ile giriş gerekli.',401);return NextResponse.json(await welcomeComposer(me.id,new URL(req.url).searchParams.get('event')||''),{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof DomainError?e.message:'Karşılama kartı alınamadı.'},{status:e instanceof DomainError?e.status:500,headers:{'Cache-Control':'no-store'}});}}
