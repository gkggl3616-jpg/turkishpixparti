import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {database,DomainError,RELEASE_VERSION} from '@turkishpix/core';
import {verifyYouTubeAudioSample} from './youtube-audio';
const run=promisify(execFile);
export type SoundCloudTrack={id:string;url:string;title:string;artist:string;duration:number;thumbnail?:string};
/** Only public single-track links enter the extractor; never accept arbitrary sites or secret links. */
export function soundCloudURL(input:string){
 let url:URL;try{url=new URL(input);}catch{throw new DomainError('SOUNDCLOUD_LINK','Tek bir SoundCloud şarkısının bağlantısını gir.');}
 const parts=url.pathname.split('/').filter(Boolean);
 if(url.protocol!=='https:'||url.username||url.password||url.port||!['soundcloud.com','www.soundcloud.com'].includes(url.hostname)||parts.length!==2||parts.some(x=>!/^[a-zA-Z0-9_-]+$/.test(x))||['sets','tracks','likes','reposts'].includes(parts[1])||url.searchParams.has('secret_token'))throw new DomainError('SOUNDCLOUD_LINK','Herkese açık tek bir SoundCloud şarkısının HTTPS bağlantısını gir.');
 return 'https://soundcloud.com/'+parts.join('/');
}
const commonArguments=['--ignore-config','--no-warnings','--no-progress','--socket-timeout','10','--retries','1','--extractor-retries','1'];
export function soundCloudSearchArguments(query:string){
 const text=query.trim().replace(/\s+/g,' ');if(text.length<2||text.length>120)throw new DomainError('MUSIC_QUERY','Şarkı veya sanatçı adı 2–120 karakter olmalı.');
 return [...commonArguments,'--flat-playlist','--skip-download','--dump-single-json','--playlist-end','5','--','scsearch5:'+text];
}
export function soundCloudAudioArguments(input:string){return [...commonArguments,'--no-playlist','--skip-download','--dump-single-json','-f','bestaudio[protocol^=http][format_id!*=preview]','--',soundCloudURL(input)];}
export function soundCloudSearchResult(value:any,maxMinutes:number){
 const tracks:SoundCloudTrack[]=[];
 for(const entry of value?.entries||[])try{
  const url=soundCloudURL(entry.webpage_url||entry.url),duration=Number(entry.duration);
  if(!/^\d+$/.test(String(entry.id))||!entry.title||!Number.isFinite(duration)||duration<=0||duration>maxMinutes*60||tracks.some(t=>t.id===String(entry.id)))continue;
  const image=entry.thumbnail||entry.thumbnails?.at(-1)?.url;let thumbnail:string|undefined;
  if(image){const parsed=new URL(image);if(parsed.protocol==='https:'&&/(^|\.)sndcdn\.com$/.test(parsed.hostname))thumbnail=parsed.href;}
  tracks.push({id:String(entry.id),url,title:String(entry.title).slice(0,240),artist:String(entry.uploader||entry.artists?.join(', ')||'SoundCloud').slice(0,120),duration,thumbnail});if(tracks.length===5)break;
 }catch{}
 return tracks;
}
export function soundCloudAudioResult(value:any,maxMinutes:number){
 let url:URL;try{url=new URL(value.url);}catch{throw new DomainError('SOUNDCLOUD_SOURCE','Bu şarkı için ses akışı bulunamadı.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!/(^|\.)(sndcdn\.com|media-streaming\.soundcloud\.cloud)$/.test(url.hostname)||!/^https?$/.test(String(value.protocol))||/preview/i.test(String(value.format_id)))throw new DomainError('SOUNDCLOUD_SOURCE','Bu şarkının tam ses akışı kullanılamıyor. Başka bir sonuç seç.');
 const duration=Number(value.duration);if(!Number.isFinite(duration)||duration<=0||duration>maxMinutes*60)throw new DomainError('MUSIC_DURATION','Bu şarkı parça süresi sınırını aşıyor veya süresi doğrulanamadı.');
 return {url:url.href,duration,protocol:'https',headers:{},title:String(value.title||'SoundCloud şarkısı').slice(0,240)};
}
function sourceError(e:any){
 if(e instanceof DomainError)return e;
 const code=e.code==='ENOENT'?'SOUNDCLOUD_RUNTIME':e.killed?'SOUNDCLOUD_TIMEOUT':'SOUNDCLOUD_UNAVAILABLE';console.error('MUSIC_SOURCE_FAILED',JSON.stringify({source:'soundcloud',code}));
 return new DomainError(code,e.killed?'Şarkı kaynağı zamanında yanıt vermedi. Yeniden dene.':'SoundCloud bu şarkının sesini açamadı. Başka bir sonuç seç veya Radyo düğmesini kullan.');
}
export async function searchSoundCloud(query:string,maxMinutes:number){
 try{const {stdout}=await run('yt-dlp',soundCloudSearchArguments(query),{timeout:30000,maxBuffer:2*1024*1024,killSignal:'SIGKILL'});return soundCloudSearchResult(JSON.parse(stdout),maxMinutes);}catch(e){throw sourceError(e);}
}
export async function resolveSoundCloudAudio(input:string,maxMinutes:number){
 try{const {stdout}=await run('yt-dlp',soundCloudAudioArguments(input),{timeout:30000,maxBuffer:2*1024*1024,killSignal:'SIGKILL'});return soundCloudAudioResult(JSON.parse(stdout),maxMinutes);}catch(e){throw sourceError(e);}
}
/** Verify search and actual decoded audio without entering any Discord voice channel. */
export async function reportSoundCloudReady(){
 const status:any={version:RELEASE_VERSION,ready:false,searchReady:false,results:0};
 try{const tracks=await searchSoundCloud('Forss Flickermood',60);status.searchReady=tracks.length>0;status.results=tracks.length;const source=await resolveSoundCloudAudio('https://soundcloud.com/forss/flickermood',60);await verifyYouTubeAudioSample(source.url);status.ready=status.searchReady;}catch(e:any){status.code=e.code||'AUDIO_DECODE';}
 await database().query("INSERT INTO integration_status(name,status) VALUES('soundcloud-audio',$1) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",[status]).catch(()=>{});
 console.log(status.ready?'SOUNDCLOUD_AUDIO_SOURCE_READY':'SOUNDCLOUD_AUDIO_PROBE_PENDING',JSON.stringify(status));return status;
}
