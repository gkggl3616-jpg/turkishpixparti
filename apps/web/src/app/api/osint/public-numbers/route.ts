import {NextResponse} from 'next/server';
import {publicNumberLists} from '../../../../../../../packages/core/src/osint-public-numbers';
import {DomainError} from '../../../../../../../packages/core/src/config';
export const dynamic='force-dynamic';export const runtime='nodejs';
// Fixed public sources only, process-wide caching/inflight deduplication and three upstream requests at most.
export async function GET(req:Request){try{return NextResponse.json(await publicNumberLists(new URL(req.url).searchParams.get('provider')||'all'),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return NextResponse.json({error:e instanceof DomainError?e.message:'Numara kaynakları alınamadı.'},{status:e instanceof DomainError?e.status:503,headers:{'Cache-Control':'no-store'}});}}
