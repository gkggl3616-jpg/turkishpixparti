import {spawn,spawnSync} from 'node:child_process';
import {createAudioResource,StreamType} from '@discordjs/voice';
import {Readable} from 'node:stream';
import {radioStations} from '@turkishpix/core';
import {openAudio} from './audio-source';
export async function verifyAudioEncoding(){
 const pcm=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','0.1','-f','s16le','pipe:1'],{timeout:10000});
 if(pcm.status!==0||!pcm.stdout.length)throw Error('FFmpeg PCM üretemedi.');
 const resource=createAudioResource(Readable.from([pcm.stdout]),{inputType:StreamType.Raw,inlineVolume:true});let packets=0;
 for await(const packet of resource.playStream){if(packet.length)packets++;}
 if(!packets)throw Error('Opus paketleri üretilemedi.');return {pcmBytes:pcm.stdout.length,opusPackets:packets};
}
/** Startup smoke check decodes a short sample locally; it never joins a Discord channel. */
export async function verifyRadioSources(){
 return Promise.all(radioStations.map(async station=>{let input:any,child:any;try{
  input=await openAudio(station.url);
  child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-t','0.1','-vn','-f','s16le','-ar','48000','-ac','2','pipe:1']);child.stderr.resume();child.stdin.on('error',()=>{});input.pipe(child.stdin);
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Ses örneği alınamadı.')),20000);child.once('error',reject);input.once('error',reject);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('exit',(code:number)=>{clearTimeout(timer);if(code!==0)reject(Error('Radyo ses örneği çözümlenemedi.'));});});
  return {station:station.id,ready:true};
 }catch{return {station:station.id,ready:false};}finally{input?.destroy();child?.kill('SIGKILL');}}));
}
