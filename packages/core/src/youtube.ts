import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {ownerOnly} from './service';
import {syncUser,discordRequest} from './discord';
import {WATCH_TOGETHER_APPLICATION_ID} from './expansion-policy';
import {audit} from './audit';
import {rateLimit} from './auth';
type Actor={id:string;username:string;avatar?:string|null};
export type YouTubeVideo={id:string;title:string;channel:string;url:string;thumbnail:string;duration:string};
const videoIdSchema=z.string().regex(/^[A-Za-z0-9_-]{11}$/);
export function youtubeVideoId(input:string){
 if(videoIdSchema.safeParse(input).success)return input;
 let url:URL;try{url=new URL(input);}catch{throw new DomainError('YOUTUBE_LINK','Bir YouTube video bağlantısı gir.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw new DomainError('YOUTUBE_LINK','Geçerli bir HTTPS YouTube bağlantısı gir.');
 const host=url.hostname.toLowerCase();let id:string|null=null;
 if(host==='youtu.be')id=url.pathname.slice(1);
 else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host))id=url.pathname==='/watch'?url.searchParams.get('v'):/^\/(shorts|live|embed)\/([^/]+)$/.exec(url.pathname)?.[2]||null;
 if(!videoIdSchema.safeParse(id).success)throw new DomainError('YOUTUBE_LINK','Bu bağlantı tek bir YouTube videosuna ait olmalı.');return id!;
}
function keyMaterial(){if(config().auditKey.length<32)throw new DomainError('KEY_NOT_CONFIGURED','Sunucu şifreleme anahtarı eksik.',503);return Buffer.from(hkdfSync('sha256',config().auditKey,'TurkishPix','youtube-provider-secret-v1',32));}
async function youtubeKey(){
 const row=(await database().query("SELECT secret FROM community_integrations WHERE guild_id=$1 AND name='youtube'",[config().guildId])).rows[0]?.secret;
 if(row){if(row.disabled)return '';try{const cipher=createDecipheriv('aes-256-gcm',keyMaterial(),Buffer.from(row.iv,'base64'));cipher.setAuthTag(Buffer.from(row.tag,'base64'));return Buffer.concat([cipher.update(Buffer.from(row.data,'base64')),cipher.final()]).toString('utf8');}catch{throw new DomainError('YOUTUBE_KEY_UNAVAILABLE','YouTube anahtarını panelden yeniden kaydet.',503);}}
 return process.env.YOUTUBE_API_KEY||'';
}
export async function youtubeStatus(){try{return {configured:!!await youtubeKey(),playback:'embedded',watchTogether:true};}catch{return {configured:false,playback:'embedded',watchTogether:true};}}
async function api(endpoint:'search'|'videos',params:Record<string,string>,key?:string){
 const secret=key||await youtubeKey();if(!secret)throw new DomainError('YOUTUBE_KEY_MISSING','YouTube araması için owner, Müzik panelinden YouTube Data API v3 anahtarını eklemeli. /muzik birlikte anahtar gerektirmez.',503);
 let response:Response;try{response=await fetch('https://www.googleapis.com/youtube/v3/'+endpoint+'?'+new URLSearchParams(params),{headers:{'X-Goog-Api-Key':secret},signal:AbortSignal.timeout(12000)});}catch{throw new DomainError('YOUTUBE_UNAVAILABLE','YouTube şu anda yanıt vermiyor.',503);}
 if(!response.ok){const body=await response.json().catch(()=>({}));const reason=body?.error?.errors?.[0]?.reason;if(response.status===429||reason==='quotaExceeded'||reason==='dailyLimitExceeded')throw new DomainError('YOUTUBE_QUOTA','YouTube arama kotası doldu. Video bağlantısı veya /muzik birlikte kullanabilirsin.',429);throw new DomainError('YOUTUBE_UNAVAILABLE','YouTube bağlantısı kurulamadı. API etkinliğini ve anahtar kısıtlamalarını panelden kontrol et.',503);}
 return response.json();
}
export async function saveYouTubeKey(actor:Actor,input:unknown){
 ownerOnly(actor);if(config().demo)throw new DomainError('DEMO_READONLY','Önizlemede anahtar kaydedilmez.',403);
 const {apiKey}=z.object({apiKey:z.string().trim().regex(/^[A-Za-z0-9_-]{20,300}$/)}).parse(input);
 await rateLimit('youtube-key:'+actor.id,3,60);
 // Verify access before replacing a working credential; never save Google's response or the key in the audit.
 await api('videos',{part:'id',id:'M7lc1UVf-VE'},apiKey);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyMaterial(),iv),data=Buffer.concat([cipher.update(apiKey,'utf8'),cipher.final()]);
 await transaction(async tx=>{await syncUser(tx,actor);await tx.query("INSERT INTO community_integrations(guild_id,name,secret) VALUES($1,'youtube',$2) ON CONFLICT(guild_id,name) DO UPDATE SET secret=EXCLUDED.secret,updated_at=now()",[config().guildId,{iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}]);await audit(tx,actor.id,'YOUTUBE_CONNECTED',config().guildId);});cache.clear();return {message:'YouTube Data API bağlantısı doğrulandı. Arama artık hazır.'};
}
const cache=new Map<string,{expires:number;videos:YouTubeVideo[]}>();
function title(value:string){return value.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').slice(0,180);}
function video(item:any):YouTubeVideo{return {id:item.id,title:title(item.snippet?.title||'YouTube videosu'),channel:title(item.snippet?.channelTitle||''),url:'https://www.youtube.com/watch?v='+item.id,thumbnail:'https://i.ytimg.com/vi/'+item.id+'/mqdefault.jpg',duration:item.contentDetails?.duration||''};}
export async function searchYouTube(userId:string,query:string){
 query=z.string().trim().min(2).max(120).parse(query);await rateLimit('youtube-user:'+config().guildId+':'+userId,5,60);
 const key=config().guildId+':'+query.toLocaleLowerCase('tr-TR'),cached=cache.get(key);if(cached&&cached.expires>Date.now())return cached.videos;
 await rateLimit('youtube-search-budget:'+config().guildId,60,86400);
 const result=await api('search',{part:'snippet',q:query,type:'video',maxResults:'5',videoEmbeddable:'true',videoSyndicated:'true',safeSearch:'moderate',regionCode:'TR',relevanceLanguage:'tr'});
 const ids=(result.items||[]).map((x:any)=>x.id?.videoId).filter((x:any)=>videoIdSchema.safeParse(x).success);if(!ids.length)return [];
 const details=await api('videos',{part:'snippet,contentDetails,status',id:ids.join(',')});const videos=(details.items||[]).filter((x:any)=>videoIdSchema.safeParse(x.id).success&&x.status?.embeddable).map(video);
 if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+300000,videos});return videos;
}
export async function youtubeVideo(input:string){
 const id=youtubeVideoId(input);const status=await youtubeStatus();if(!status.configured)return {id,title:'YouTube videosu',channel:'YouTube',url:'https://www.youtube.com/watch?v='+id,thumbnail:'https://i.ytimg.com/vi/'+id+'/mqdefault.jpg',duration:''};
 await rateLimit('youtube-video-budget:'+config().guildId,300,86400);const body=await api('videos',{part:'snippet,contentDetails,status',id});const found=body.items?.[0];if(!found)throw new DomainError('YOUTUBE_NOT_FOUND','Video bulunamadı veya erişime kapalı.');return video(found);
}
export async function saveYouTubeFavourite(actor:Actor,input:string){const v=await youtubeVideo(input);return transaction(async tx=>{await syncUser(tx,actor);await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['youtube-library:'+config().guildId+':'+actor.id]);const old=(await tx.query('SELECT video_id FROM youtube_library WHERE guild_id=$1 AND user_id=$2 AND video_id=$3',[config().guildId,actor.id,v.id])).rows[0];if(old){await tx.query('DELETE FROM youtube_library WHERE guild_id=$1 AND user_id=$2 AND video_id=$3',[config().guildId,actor.id,v.id]);return {saved:false,video:v};}if((await tx.query('SELECT count(*)::int AS n FROM youtube_library WHERE guild_id=$1 AND user_id=$2',[config().guildId,actor.id])).rows[0].n>=100)throw new DomainError('YOUTUBE_LIBRARY_FULL','En fazla 100 favori kaydedebilirsin.');await tx.query('INSERT INTO youtube_library(guild_id,user_id,video_id,title) VALUES($1,$2,$3,$4)',[config().guildId,actor.id,v.id,v.title]);return {saved:true,video:v};});}
export async function youtubeFavourites(userId:string){
 const rows=(await database().query('SELECT video_id,title,metadata_updated_at FROM youtube_library WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 20',[config().guildId,userId])).rows;
 const expired=rows.filter(r=>!r.metadata_updated_at||Date.now()-new Date(r.metadata_updated_at).getTime()>30*86400000);
 if(expired.length){for(const r of expired)r.title='YouTube videosu';if((await youtubeStatus()).configured){try{await rateLimit('youtube-video-budget:'+config().guildId,300,86400);const details=await api('videos',{part:'snippet',id:expired.map(r=>r.video_id).join(',')});for(const r of expired){const current=details.items?.find((v:any)=>v.id===r.video_id);r.title=current?title(current.snippet?.title||'YouTube videosu'):'Video artık erişilebilir değil';await database().query('UPDATE youtube_library SET title=$4,metadata_updated_at=now() WHERE guild_id=$1 AND user_id=$2 AND video_id=$3',[config().guildId,userId,r.video_id,r.title]);}}catch{/* Bookmarks remain usable even when metadata cannot be refreshed. */}}}
 return rows.map(r=>({video_id:r.video_id,title:r.title}));
}
export async function recordYouTubeView(actor:Actor,v:YouTubeVideo){await transaction(async tx=>{await syncUser(tx,actor);await tx.query('INSERT INTO youtube_history(guild_id,user_id,video_id,title) VALUES($1,$2,$3,$4)',[config().guildId,actor.id,v.id,v.title]);});}
export async function youtubeHistory(){return (await database().query('SELECT video_id,title,user_id FROM youtube_history WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 15',[config().guildId])).rows;}
export async function createWatchTogether(channelId:string){z.string().regex(/^\d{17,20}$/).parse(channelId);const ch=await discordRequest('/channels/'+channelId);if(ch.guild_id!==config().guildId||ch.type!==2)throw new DomainError('VOICE_CHANNEL','Bu sunucudan normal bir ses kanalı seç.');try{const invite=await discordRequest('/channels/'+channelId+'/invites',{method:'POST',body:JSON.stringify({max_age:3600,max_uses:0,unique:false,target_type:2,target_application_id:WATCH_TOGETHER_APPLICATION_ID})});if(!/^[A-Za-z0-9_-]{2,100}$/.test(invite?.code||''))throw Error('invalid');return {url:'https://discord.gg/'+invite.code,message:'Watch Together hazır. Herkes bağlantıya basarak aynı YouTube oturumuna katılabilir.'};}catch{throw new DomainError('YOUTUBE_ACTIVITY_UNAVAILABLE','Oturum açılamadı. Botun bu ses kanalında Davet Oluştur iznini aç; Discord’da kanalın Etkinlikler düğmesinden Watch Together da seçebilirsin.',503);}}
