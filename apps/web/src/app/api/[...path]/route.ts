import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {config,readiness,DomainError,database,session,csrf,oauthStart,oauthCallback,logout,cookie,SESSION_COOKIE,STATE_COOKIE,rateLimit,checkActor,createItem,approveItem,castVote,membership,overview,actionSchema,ownerOnly,verifyAudit,roleManagement,memberRoles,saveRoleMappings,reconcileRoles} from '../../../../../../packages/core/src/index';
export const runtime='nodejs';export const dynamic='force-dynamic';
function json(data:any,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});}
function error(e:unknown){
 if(e instanceof ZodError)return json({error:e.issues[0]?.message||'Formu kontrol edin.',code:'VALIDATION'},400);
 if(e instanceof DomainError)return json({error:e.message,code:e.code},e.status);
 if((e as any)?.code==='23505')return json({error:'Bu kayıt zaten mevcut. Aynı başvuru, karar veya oy ikinci kez kaydedilemez.',code:'DUPLICATE'},409);
 console.error('API_ERROR',{name:e instanceof Error?e.name:'Unknown',code:(e as any)?.code||'INTERNAL'});
 return json({error:'İşlem tamamlanamadı. Biraz sonra tekrar deneyin.',code:'INTERNAL'},500);
}
export async function GET(req:Request){
 const path=new URL(req.url).pathname;
 try{
  if(path==='/api/health'){
   if(!process.env.DATABASE_URL)return json({status:config().demo?'preview':'database_missing'},config().demo?200:503);
   const schemas=await database().query("SELECT version FROM schema_migrations WHERE version IN ('001_initial','003_discord_roles')");if(schemas.rows.length!==2)return json({status:'migration_required'},503);return json({status:'ok',ready:readiness().ready,demo:config().demo});
  }
  if(path==='/api/config'){
   const r=readiness();
   if(!r.demo&&r.checks.database){try{r.checks.database=!!(await database().query("SELECT version FROM schema_migrations WHERE version='001_initial'")).rows.length;}catch{r.checks.database=false;}}
   if(r.demo)r.checks.database=false;
   r.ready=Object.values(r.checks).every(Boolean);
   return json({...r,clientId:config().clientId,guildId:config().guildId,rules:{quorum:config().quorum,ballotHours:config().ballotHours,minVotes:config().minVotes}});
  }
  if(path==='/api/auth/login'){
   const {url,state}=await oauthStart(new URL(req.url).searchParams.get('return')||'/');
   return new Response(null,{status:302,headers:{Location:url,'Set-Cookie':cookie(STATE_COOKIE,state,1/6),'Cache-Control':'no-store'}});
  }
  if(path==='/api/auth/callback'){
   try{const result=await oauthCallback(req);const res=NextResponse.redirect(new URL(result.returnPath,config().appUrl));res.headers.append('Set-Cookie',cookie(SESSION_COOKIE,result.secret,config().sessionHours));res.headers.append('Set-Cookie',cookie(STATE_COOKIE,'',0));return res;}
   catch(e){const code=e instanceof DomainError?e.code:'LOGIN_FAILED';return NextResponse.redirect(new URL('/?error='+code,config().appUrl));}
  }
  if(path==='/api/overview'){
   if(config().demo)return json({demo:true});
   const me=await session(req);return json({...await overview(me||undefined),csrf:me?.csrf});
  }
  if(path==='/api/audit'){
   const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);ownerOnly(me);
   const limit=Math.min(500,Math.max(1,Number(new URL(req.url).searchParams.get('limit')||100)));
   const before=Number(new URL(req.url).searchParams.get('before')||Number.MAX_SAFE_INTEGER);
   if(!Number.isSafeInteger(before)||!Number.isInteger(limit))throw new DomainError('INVALID_PAGINATION','Geçersiz sayfa.');
   const events=(await database().query('SELECT a.*,u.username FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE a.seq<$1 ORDER BY a.seq DESC LIMIT $2',[before,limit])).rows;
   return json({events,next:events.length===limit?Number(events.at(-1).seq):null});
  }
  if(path==='/api/audit/verify'){
   const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);ownerOnly(me);await rateLimit('verify:'+me.id,2,60);return json(await verifyAudit());
  }
  if(path==='/api/queue'){
   const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);ownerOnly(me);
   return json({jobs:(await database().query('SELECT id,kind,status,attempts,last_error,available_at FROM outbox ORDER BY created_at DESC LIMIT 100')).rows});
  }
  if(path==='/api/roles'||path==='/api/roles/member'||path==='/api/me/roles'){
   const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);
   if(path!=='/api/me/roles')ownerOnly(me);
   await rateLimit('roles:'+me.id,20,60);
   return json(path==='/api/roles'?await roleManagement(me):await memberRoles(me,path==='/api/me/roles'?me.id:new URL(req.url).searchParams.get('id')||me.id));
  }
  return json({error:'Sayfa bulunamadı.'},404);
 }catch(e){return error(e);}
}
export async function POST(req:Request){
 try{
  const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Önce Discord ile giriş yapın.',401);csrf(req,me);
  await rateLimit('action:'+me.id,30,60);
  if(new URL(req.url).pathname==='/api/auth/logout'){await logout(req,me);return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':cookie(SESSION_COOKIE,'',0)}});}
  if(new URL(req.url).pathname!=='/api/actions')return json({error:'Sayfa bulunamadı.'},404);
  const raw=await req.text();if(raw.length>800000)throw new DomainError('PAYLOAD_TOO_LARGE','Logo veya form boyutu çok büyük.',413);
  let input;try{input=JSON.parse(raw);}catch{throw new DomainError('INVALID_JSON','Geçersiz form.');}
  const action=actionSchema.parse(input);await checkActor(me);
  const result=action.action==='create'?await createItem(me,action.data):action.action==='approve'?await approveItem(me,action.data):action.action==='vote'?await castVote(me,action.data):action.action==='join'?await membership(me,action.data.partyId):action.action==='leave'?await membership(me):action.action==='roleMappings'?await saveRoleMappings(me,action.data):await reconcileRoles(me);
  return json(result);
 }catch(e){return error(e);}
}
