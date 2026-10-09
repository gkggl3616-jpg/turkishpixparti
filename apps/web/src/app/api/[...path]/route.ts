import {saveYouTubeKey,youtubeStatus,searchYouTube,youtubeVideo,recordYouTubeView,saveYouTubeFavourite,youtubeFavourites,createWatchTogether,expansionRoleDirectory,createAdvancedEvent,communityCalendar} from '../../../../../../packages/core/src/index';
import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {config,readiness,RELEASE_VERSION,DomainError,database,session,csrf,oauthStart,oauthCallback,logout,cookie,SESSION_COOKIE,STATE_COOKIE,rateLimit,checkActor,createItem,approveItem,castVote,membership,overview,actionSchema,ownerOnly,verifyAudit,roleManagement,memberRoles,saveRoleMappings,reconcileRoles,loadServerSettings,saveServerSettings,detectConnection,botInviteUrl,applicationConnection,communityOverview,saveCommunitySettings,createAnnouncement,cancelAnnouncement,assistantAnswer,communitySettings,saveAIProvider,reviewModeration,getFeatureRecord,updateFeatureRecord,inspectContent,contentModerationSchema,queueMusicJob,ticketDirectory,ticketSettings,configureTickets,createGiveaway,manageGiveaway,closeTicket} from '../../../../../../packages/core/src/index';
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
   const schemas=await database().query("SELECT version FROM schema_migrations WHERE version IN ('001_initial','003_discord_roles','004_server_setup','005_community','006_voice_presence','007_entertainment','008_chat_moderation','009_community_features','010_music_application_security','011_tickets_giveaways','012_community_expansion','013_level_notifications')");if(schemas.rows.length!==12)return json({status:'migration_required'},503);await loadServerSettings();return json({status:'ok',version:RELEASE_VERSION,ready:readiness().ready,demo:config().demo});
  }
  if(process.env.DATABASE_URL&&!config().demo)await loadServerSettings();
  if(path==='/api/support'){const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);ownerOnly(me);const [directory,tickets,records,users]=await Promise.all([ticketDirectory(me),ticketSettings(),database().query("SELECT r.*,u.username,(SELECT count(*)::int FROM feature_participants p WHERE p.record_id=r.id) AS participants FROM feature_records r JOIN users u ON u.id=r.owner_id WHERE r.guild_id=$1 AND r.kind IN ('TICKET','GIVEAWAY') ORDER BY r.created_at DESC LIMIT 100",[config().guildId]),database().query('SELECT id,username FROM users WHERE id IN (SELECT p.user_id FROM feature_participants p JOIN feature_records r ON r.id=p.record_id WHERE r.guild_id=$1)',[config().guildId])]);return json({...directory,tickets,records:records.rows,users:Object.fromEntries(users.rows.map(u=>[u.id,u.username]))});}
  if(path==='/api/community/directory'){const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);ownerOnly(me);return json(await expansionRoleDirectory());}
  if(path==='/api/community/calendar'){const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);ownerOnly(me);return new Response(await communityCalendar(),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename=turkishpix-etkinlikler.ics','Cache-Control':'no-store'}});}
  if(path==='/api/music'){const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);ownerOnly(me);const live=(await database().query("SELECT status,updated_at FROM integration_status WHERE name='music'")).rows[0]||null;const jobs=(await database().query('SELECT id,action,status,result,created_at FROM music_jobs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 15',[config().guildId])).rows;return json({live,jobs,youtube:await youtubeStatus()});}
  if(path==='/api/community'){const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);return json({...await communityOverview(me),csrf:me.csrf,me});}
  if(path==='/api/setup'){
   const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Discord ile giriş yapın.',401);ownerOnly(me);await rateLimit('setup:'+me.id,15,60);return json(await detectConnection(me));
  }
  if(path==='/api/config'){
   const r=readiness();
   if(!r.demo&&r.checks.database){try{r.checks.database=!!(await database().query("SELECT version FROM schema_migrations WHERE version='001_initial'")).rows.length;}catch{r.checks.database=false;}}
   if(r.demo)r.checks.database=false;
   const application=r.demo?{verified:false,redirectRegistered:null,owner:null}:await applicationConnection();
   r.checks.oauth=r.checks.oauth&&application.verified&&application.redirectRegistered!==false;
   r.ready=Object.values(r.checks).every(Boolean);
   return json({...r,version:RELEASE_VERSION,application,clientId:config().clientId,guildId:config().guildId,installUrl:botInviteUrl(),redirectUri:config().appUrl+'/api/auth/callback',rules:{quorum:config().quorum,ballotHours:config().ballotHours,minVotes:config().minVotes}});
  }
  if(path==='/api/auth/login'){
   try{const {url,state}=await oauthStart(new URL(req.url).searchParams.get('return')||'/');
    return new Response(null,{status:302,headers:{Location:url,'Set-Cookie':cookie(STATE_COOKIE,state,1/6),'Cache-Control':'no-store'}});
   }catch(e){if(e instanceof DomainError)return NextResponse.redirect(new URL('/?view=owner&error='+e.code,config().appUrl));throw e;}
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
  if(process.env.DATABASE_URL&&!config().demo)await loadServerSettings();
  const me=await session(req);if(!me)throw new DomainError('UNAUTHENTICATED','Önce Discord ile giriş yapın.',401);csrf(req,me);
  await rateLimit('action:'+me.id,30,60);
  if(new URL(req.url).pathname==='/api/auth/logout'){await logout(req,me);return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':cookie(SESSION_COOKIE,'',0)}});}
  const endpoint=new URL(req.url).pathname;
  if(['/api/community/settings','/api/community/campaign','/api/community/cancel','/api/community/assistant','/api/community/provider','/api/community/youtube-key','/api/community/youtube','/api/community/event','/api/community/moderation-preview','/api/community/moderation-review','/api/community/feature-review','/api/community/music','/api/community/tickets','/api/community/giveaway','/api/community/support-action'].includes(endpoint)){ownerOnly(me);const raw=await req.text();if(raw.length>120000)throw new DomainError('PAYLOAD_TOO_LARGE','Form boyutu çok büyük.',413);let input;try{input=JSON.parse(raw);}catch{throw new DomainError('INVALID_JSON','Geçersiz form.');}
   if(endpoint.endsWith('/youtube-key'))return json(await saveYouTubeKey(me,input));
   if(endpoint.endsWith('/event'))return json(await createAdvancedEvent(me,input));
   if(endpoint.endsWith('/youtube')){const s=await communitySettings();if(!s.music.enabled)throw new DomainError('MUSIC_DISABLED','Müzik modülü kapalı.');if(input.action==='search')return json({videos:await searchYouTube(me.id,input.query)});if(input.action==='video'){const video=await youtubeVideo(input.url);await recordYouTubeView(me,video);return json({video});}if(input.action==='favourite')return json(await saveYouTubeFavourite(me,input.url));if(input.action==='favourites')return json({videos:await youtubeFavourites(me.id)});if(input.action==='together'){if(s.music.channelIds.length&&!s.music.channelIds.includes(input.channelId))throw new DomainError('MUSIC_CHANNEL','Bu ses kanalı müzik için açık değil.');await rateLimit('youtube-activity:'+me.id,5,60);return json(await createWatchTogether(input.channelId));}throw new DomainError('YOUTUBE_ACTION','Geçerli bir YouTube işlemi seç.');}
   if(endpoint.endsWith('/tickets'))return json(await configureTickets(me,input));
   if(endpoint.endsWith('/giveaway')){const r=await createGiveaway(me,input);return json({id:r.id,message:'Çekiliş başlatıldı. Katılım düğmesi seçilen kanalda hazır.'});}
   if(endpoint.endsWith('/support-action')){if(!['close','end','cancel','reroll'].includes(input.action)||!/^[-0-9a-f]{36}$/.test(input.requestId||''))throw new DomainError('INVALID_ACTION','Geçersiz işlem.');const record=await getFeatureRecord(input.id);if(input.action==='close'){if(record.kind!=='TICKET')throw new DomainError('INVALID_ACTION','Bir bilet seçin.');await closeTicket(me,record.id,true,'panel:'+input.requestId);}else await manageGiveaway(me,record.id,input.action,true,'panel:'+input.requestId);return json({message:'Kayıt ve Discord mesajı güncellendi.'});}
   if(endpoint.endsWith('/music'))return json(await queueMusicJob(me,input));
   if(endpoint.endsWith('/feature-review')){const record=await getFeatureRecord(input.id);if(!['TICKET','SUGGESTION','WARNING','FAQ','ROLE_MENU'].includes(record.kind)||!({TICKET:['CLOSED'],SUGGESTION:['APPROVED','REJECTED'],WARNING:['CANCELLED'],FAQ:['CANCELLED'],ROLE_MENU:['CLOSED']} as any)[record.kind].includes(input.status))throw new DomainError('INVALID_FEATURE_REVIEW','Bu kayıt için işlem geçersiz.');if(record.kind==='TICKET')await closeTicket(me,input.id,true,'panel:'+input.id+':'+input.status);else await updateFeatureRecord(me,input.id,input.status,true,'panel:'+input.id+':'+input.status);return json({message:'Kayıt güncellendi.'});}
   if(endpoint.endsWith('/moderation-review'))return json(await reviewModeration(me,input));
   if(endpoint.endsWith('/moderation-preview')){if(typeof input.text!=='string'||input.text.length>2000)throw new DomainError('INVALID_PREVIEW','En fazla 2000 karakterlik bir metin girin.');return json({decision:inspectContent(input.text,contentModerationSchema.parse(input.settings)),message:'Bot filtre denemesi tamamlandı.'});}
   if(endpoint.endsWith('/provider'))return json(await saveAIProvider(me,input));
   if(endpoint.endsWith('/settings'))return json(await saveCommunitySettings(me,input));
   if(endpoint.endsWith('/campaign'))return json(await createAnnouncement(me,input));
   if(endpoint.endsWith('/cancel'))return json(await cancelAnnouncement(me,input.id));
   if(typeof input.question!=='string')throw new DomainError('AI_INPUT','Bir soru yazın.');return json(await assistantAnswer(me.id,input.question,(await communitySettings()).ai));
  }
  if(new URL(req.url).pathname!=='/api/actions')return json({error:'Sayfa bulunamadı.'},404);
  const raw=await req.text();if(raw.length>800000)throw new DomainError('PAYLOAD_TOO_LARGE','Logo veya form boyutu çok büyük.',413);
  let input;try{input=JSON.parse(raw);}catch{throw new DomainError('INVALID_JSON','Geçersiz form.');}
  const action=actionSchema.parse(input);if(action.action==='serverSettings')return json(await saveServerSettings(me,action.data));await checkActor(me);
  const result=action.action==='create'?await createItem(me,action.data):action.action==='approve'?await approveItem(me,action.data):action.action==='vote'?await castVote(me,action.data):action.action==='join'?await membership(me,action.data.partyId):action.action==='leave'?await membership(me):action.action==='roleMappings'?await saveRoleMappings(me,action.data):await reconcileRoles(me);
  return json(result);
 }catch(e){return error(e);}
}
