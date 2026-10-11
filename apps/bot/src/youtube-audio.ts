import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {PassThrough,type Readable} from 'node:stream';
import {DomainError,youtubeVideoId,RELEASE_VERSION,database} from '@turkishpix/core';
import {openAudio} from './audio-source';
const run=promisify(execFile);
export function youtubeAudioArguments(input:string){
 const id=youtubeVideoId(input);return ['--ignore-config','--no-playlist','--no-warnings','--no-progress','--no-cache-dir','--skip-download','--dump-single-json','--socket-timeout','10','--retries','1','--extractor-retries','1','--js-runtimes','node','-f','bestaudio/best','--','https://www.youtube.com/watch?v='+id];
}
export function youtubeAudioResult(value:any){
 const url=new URL(value.url||'');if(url.protocol!=='https:'||url.username||url.password||url.port||!/(^|\.)googlevideo\.com$/.test(url.hostname))throw new DomainError('YOUTUBE_AUDIO_SOURCE','YouTube bu video için geçerli bir ses akışı vermedi.');
 if(value.is_live||value.live_status==='is_live')throw new DomainError('YOUTUBE_AUDIO_LIVE','Canlı yayın yerine normal bir şarkı veya video seç.');
 const headers:Record<string,string>={};for(const name of ['User-Agent','Referer','Origin']){const header=value.http_headers?.[name];if(typeof header==='string'&&header.length<=1024&&!/[\r\n]/.test(header))headers[name]=header;}
 return {url:url.href,duration:Number(value.duration)||0,protocol:String(value.protocol||'https'),headers};
}
export const fragmentedYouTubeAudio=(source:{protocol:string})=>/m3u8|dash|segments/i.test(source.protocol);
/** yt-dlp's native fragment downloader handles HLS/DASH; FFmpeg receives media, not a playlist. */
export function openYouTubeFragments(input:string,maxMinutes:number):Readable{
 const args=youtubeAudioArguments(input).filter(x=>!['--skip-download','--dump-single-json'].includes(x));const end=args.indexOf('--');args.splice(end,0,'--quiet','--no-part','--output','-','--match-filter',`!is_live & duration <= ${maxMinutes*60}`);
 const child=spawn('yt-dlp',args,{stdio:['ignore','pipe','pipe']}),output=new PassThrough();let timer:ReturnType<typeof setTimeout>|undefined,started=false,stderr='';
 child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-4096);});
 child.stdout.once('data',()=>{started=true;if(timer)clearTimeout(timer);});child.stdout.pipe(output);
 const fail=()=>output.destroy(new DomainError('YOUTUBE_FRAGMENT_FAILED',/sign in|confirm.*bot|403|429/i.test(stderr)?'YouTube bu parçanın ses erişimini reddetti. Başka bir şarkı seç.':'YouTube ses parçaları alınamadı. Yeniden dene.'));
 child.once('error',fail);child.once('close',code=>{if(code!==0||!started)fail();});
 timer=setTimeout(()=>{if(!started){child.kill('SIGKILL');output.destroy(new DomainError('YOUTUBE_AUDIO_TIMEOUT','YouTube ses akışı zamanında başlamadı.'));}},30000);timer.unref();
 output.once('close',()=>{if(timer)clearTimeout(timer);child.kill('SIGKILL');});return output;
}
export async function resolveYouTubeAudio(input:string,maxMinutes:number){
 try{
  const {stdout}=await run('yt-dlp',youtubeAudioArguments(input),{timeout:30000,maxBuffer:2*1024*1024,killSignal:'SIGKILL',env:{...process.env,PYTHONUNBUFFERED:'1'}});
  const result=youtubeAudioResult(JSON.parse(stdout));if(result.duration>maxMinutes*60)throw new DomainError('MUSIC_DURATION','Bu video parça süresi sınırını aşıyor. Daha kısa bir şarkı seç.');return result;
 }catch(e){
  if(e instanceof DomainError)throw e;
  const error=e as any,detail=String(error.stderr||'');
  const code=error.code==='ENOENT'?'YOUTUBE_AUDIO_UNAVAILABLE':/sign in|confirm.*bot|403|429/i.test(detail)?'YOUTUBE_AUDIO_BLOCKED':error.killed?'YOUTUBE_AUDIO_TIMEOUT':'YOUTUBE_AUDIO_FAILED';
  const reason=/confirm.*(?:bot|human)|not a bot/i.test(detail)?'BOT_VERIFICATION':/sign in|login|account/i.test(detail)?'ACCOUNT_REQUIRED':/429|too many requests/i.test(detail)?'RATE_LIMIT':/403|forbidden/i.test(detail)?'HTTP_FORBIDDEN':error.code==='ENOENT'?'RUNTIME_MISSING':error.killed?'TIMEOUT':'EXTRACTION_FAILED';
  console.error('MUSIC_SOURCE_FAILED',JSON.stringify({source:'youtube',code,reason}));
  throw new DomainError(code,code==='YOUTUBE_AUDIO_BLOCKED'?'YouTube sunucudan ses erişimini şu anda reddediyor. Başka video veya /muzik radyo dene.':code==='YOUTUBE_AUDIO_TIMEOUT'?'Şarkı kaynağı zamanında yanıt vermedi. Yeniden dene.':'YouTube ses kaynağı açılamadı. Başka şarkı dene.');
 }
}
export async function verifyYouTubeAudioSample(input:string,headers:Record<string,string>={},fragments?:{video:string;maxMinutes:number}){
 const source=fragments?openYouTubeFragments(fragments.video,fragments.maxMinutes):await openAudio(input,0,headers),child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-t','0.1','-vn','-f','s16le','-ar','48000','-ac','2','pipe:1']);let timer:ReturnType<typeof setTimeout>|undefined;
 child.stderr.resume();child.stdin.on('error',()=>{});source.pipe(child.stdin);
 try{await new Promise<void>((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Ses örneği zamanında alınamadı.')),fragments?40000:20000);child.once('error',reject);source.once('error',reject);child.stdout.once('data',()=>resolve());child.once('exit',()=>reject(Error('Ses çözümlenemedi.')));});}finally{if(timer)clearTimeout(timer);source.destroy();child.kill('SIGKILL');}
}
/** Read/decode a short public sample; never joins a channel or starts the player. */
export async function reportYouTubeAudioReady(){
 const samples:Array<{id:string;ready:boolean;code?:string;protocol?:string}>=[];let runtime='unavailable';
 try{const {stdout}=await run('yt-dlp',['--version'],{timeout:5000});runtime=stdout.trim();console.log('YOUTUBE_AUDIO_READY',JSON.stringify({version:runtime,runtime:'node',voicePlayback:true}));
  for(const id of ['M7lc1UVf-VE','9bZkp7q19f0']){const video='https://www.youtube.com/watch?v='+id;try{const result=await resolveYouTubeAudio(video,60);await verifyYouTubeAudioSample(result.url,result.headers,fragmentedYouTubeAudio(result)?{video,maxMinutes:60}:undefined);samples.push({id,ready:true,protocol:result.protocol});}catch(e:any){samples.push({id,ready:false,code:e.code||'AUDIO_DECODE'});}}
 }catch{samples.push({id:'runtime',ready:false,code:'AUDIO_RUNTIME'});}
 const ready=samples.length===2&&samples.every(s=>s.ready),status={version:RELEASE_VERSION,runtime,ready,samples};
 await database().query("INSERT INTO integration_status(name,status) VALUES('youtube-audio',$1) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",[status]).catch(()=>{});
 console.log(ready?'YOUTUBE_AUDIO_SOURCE_READY':'YOUTUBE_AUDIO_PROBE_PENDING',JSON.stringify(status));return status;
}
