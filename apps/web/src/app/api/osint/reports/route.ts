import {NextResponse} from 'next/server';
import {session,rateLimit} from '../../../../../../../packages/core/src/auth';
import {loadServerSettings} from '../../../../../../../packages/core/src/setup';
import {guildMember} from '../../../../../../../packages/core/src/discord';
import {assertOsintAllowed} from '../../../../../../../packages/core/src/osint-access';
import {researchReport,researchReportHistory} from '../../../../../../../packages/core/src/osint-reports';
import {DomainError} from '../../../../../../../packages/core/src/config';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){try{await loadServerSettings();const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yap.',401);await guildMember(me.id);await assertOsintAllowed(me.id);await rateLimit('report-read:'+me.id,60,60);const u=new URL(req.url),id=u.searchParams.get('id');return NextResponse.json(id?await researchReport(me.id,id):await researchReportHistory(me.id,Number(u.searchParams.get('offset')||0)),{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof DomainError?e.message:'Rapor yüklenemedi.'},{status:e instanceof DomainError?e.status:500,headers:{'Cache-Control':'no-store'}});}}
