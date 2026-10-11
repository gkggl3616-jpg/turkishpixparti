import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {DomainError,youtubeVideoId} from '@turkishpix/core';
import {openAudio} from './audio-source';
const run=promisify(execFile);
export function youtubeAudioArguments(input:string){
 const id=youtubeVideoId(input);return ['--ignore-config','--no-playlist','--no-warnings','--no-progress','--skip-download','--dump-single-json','--socket-timeout','10','--retries','1','--extractor-retries','1','--js-runtimes','node','-f','bestaudio/best','--','https://www.youtube.com/watch?v='+id];
}
export function youtubeAudioResult(value:any){
 const url=new URL(value.url||'');if(url.protocol!=='https:'||url.username||url.password||url.port||!/(^|\.)googlevideo\.com$/.test(url.hostname))throw new DomainError('YOUTUBE_AUDIO_SOURCE','YouTube bu video için geçerli bir ses akışı vermedi.');
 if(value.is_live||value.live_status==='is_live')throw new DomainError('YOUTUBE_AUDIO_LIVE','Canlı yayın yerine normal bir şarkı veya video seç.');
 return {url:url.href,duration:Number(value.duration)||0};
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
export async function verifyYouTubeAudioSample(input:string){
 const source=await openAudio(input),child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-t','0.1','-vn','-f','s16le','-ar','48000','-ac','2','pipe:1']);let timer:ReturnType<typeof setTimeout>|undefined;
 child.stderr.resume();child.stdin.on('error',()=>{});source.pipe(child.stdin);
 try{await new Promise<void>((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Ses örneği zamanında alınamadı.')),20000);child.once('error',reject);source.once('error',reject);child.stdout.once('data',()=>resolve());child.once('exit',()=>reject(Error('Ses çözümlenemedi.')));});}finally{if(timer)clearTimeout(timer);source.destroy();child.kill('SIGKILL');}
}
/** Read/decode a short public sample; never joins a channel or starts the player. */
export async function reportYouTubeAudioReady(){try{const {stdout}=await run('yt-dlp',['--version'],{timeout:5000});console.log('YOUTUBE_AUDIO_READY',JSON.stringify({version:stdout.trim(),runtime:'node',voicePlayback:true}));const result=await resolveYouTubeAudio('https://www.youtube.com/watch?v=M7lc1UVf-VE',60);await verifyYouTubeAudioSample(result.url);console.log('YOUTUBE_AUDIO_SOURCE_READY',JSON.stringify({sourceResolved:true,audioDecoded:true,duration:result.duration}));}catch(e){console.error('YOUTUBE_AUDIO_PROBE_PENDING',JSON.stringify({code:(e as any)?.code||'AUDIO_RUNTIME'}));}}
