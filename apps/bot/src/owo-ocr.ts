import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {DomainError} from '../../../packages/core/src/config';
const run=promisify(execFile),maximum=8*1024*1024;
export async function verifyOwoOcr(){
 try{const {stdout}=await run('tesseract',['--list-langs'],{timeout:3000,maxBuffer:10000});return {ready:/^eng\s*$/m.test(stdout),engine:'Tesseract',language:'eng'};}catch{return {ready:false,engine:'Tesseract',language:'eng'};}
}
export type OcrLine={text:string;confidence:number;minimum:number};
export type OcrResult={status:'SUCCESS'|'PARTIAL'|'LOW_CONFIDENCE'|'EMPTY';text:string;trustedText:string;confidence:number;lines:OcrLine[];engine:string};
export function approvedOcrUrl(value:string){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['cdn.discordapp.com','media.discordapp.net','cdn.owobot.com'].includes(u.hostname))throw 0;return u.toString();}catch{throw new DomainError('OWO_OCR_HOST','OCR görselinin kaynağı desteklenmiyor.',400);}
}
export function ocrLines(tsv:string):OcrResult{
 const groups=new Map<string,{words:string[];confidence:number[];trusted:boolean[]}>();
 for(const raw of tsv.split('\n').slice(1,10000)){const columns=raw.split('\t');if(columns[0]!=='5'||columns.length<12)continue;const confidence=Number(columns[10]),text=columns.slice(11).join(' ').trim();if(!text||!Number.isFinite(confidence)||confidence<0||confidence>100)continue;const key=columns.slice(1,5).join(':'),row=groups.get(key)||{words:[],confidence:[],trusted:[]};row.words.push(text);row.trusted.push(!/[A-Za-z0-9]/.test(text)||confidence>=75);if(/[A-Za-z0-9]/.test(text))row.confidence.push(confidence);groups.set(key,row);}
 const lines=[...groups.values()].filter(row=>row.confidence.length).slice(0,200).map(row=>({text:row.words.join(' ').slice(0,500),confidence:row.confidence.reduce((a,b)=>a+b,0)/row.confidence.length,minimum:Math.min(...row.confidence)}));
 const text=lines.map(row=>row.text).join('\n').slice(0,6000),trustedText=[...groups.values()].filter(row=>row.words.some((w,n)=>/[A-Za-z0-9]/.test(w)&&row.trusted[n])).map(row=>row.words.map((w,n)=>row.trusted[n]?w:'[?]').join(' ')).join('\n').slice(0,6000),confidence=lines.length?lines.reduce((n,row)=>n+row.confidence,0)/lines.length:0;
 return {status:!text?'EMPTY':trustedText?(confidence<75||trustedText.includes('[?]')?'PARTIAL':'SUCCESS'):'LOW_CONFIDENCE',text,trustedText,confidence,lines,engine:'Tesseract eng / TSV'};
}
export async function readOwoImage(bytes:Buffer):Promise<OcrResult>{
 if(bytes.length>maximum)throw new DomainError('OWO_OCR_SIZE','OCR görseli boyut sınırını aşıyor.',400);
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!png&&!jpeg&&!webp)throw new DomainError('OWO_OCR_FORMAT','OCR PNG, JPEG veya WebP bekliyor.',400);
 const dir=await mkdtemp(join(tmpdir(),'tp-owo-ocr-'));
 try{
  const meta=await sharp(bytes,{limitInputPixels:12000000}).metadata();if(!meta.width||!meta.height)throw new DomainError('OWO_OCR_IMAGE','Görsel okunamadı.',400);
  const width=Math.min(2000,Math.max(900,meta.width*2)),prepared=await sharp(bytes,{limitInputPixels:12000000}).rotate().flatten({background:'#ffffff'}).resize({width,height:2500,fit:'inside'}).grayscale().normalize().png().toBuffer();
  const input=join(dir,'image.png');await writeFile(input,prepared);
  const {stdout}=await run('tesseract',[input,'stdout','-l','eng','--psm','11','tsv'],{timeout:12000,maxBuffer:1500000,env:{...process.env,OMP_THREAD_LIMIT:'1'}});
  return ocrLines(stdout);
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function downloadOwoImage(url:string){
 const approved=approvedOcrUrl(url),response=await fetch(approved,{redirect:'error',signal:AbortSignal.timeout(9000),headers:{Accept:'image/png,image/jpeg,image/webp','User-Agent':'TurkishPix-OwO-ReadOnly-OCR'}});
 if(!response.ok||!response.body)throw new DomainError('OWO_OCR_FETCH','OCR görseli alınamadı.',502);
 if(Number(response.headers.get('content-length')||0)>maximum){await response.body.cancel();throw new DomainError('OWO_OCR_SIZE','OCR görseli çok büyük.',400);}
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>maximum)throw new DomainError('OWO_OCR_SIZE','OCR görseli çok büyük.',400);chunks.push(result.value);}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks,size);
}
export function sourceImages(message:any){
 const list=(v:any):any[]=>Array.isArray(v)?v:v?.values?[...v.values()]:[],urls=[...list(message.attachments).filter(a=>!a.contentType||/^image\/(png|jpe?g|webp)/i.test(a.contentType)).map(a=>a.url),...list(message.embeds).map(e=>(e.toJSON?.()||e).image?.url)].filter((u):u is string=>typeof u==='string');
 return [...new Set(urls)].slice(0,2);
}
export function snapshotMessage(message:any){
 const list=(v:any):any[]=>Array.isArray(v)?v:v?.values?[...v.values()]:[];
 return {id:message.id,guildId:message.guildId,channelId:message.channelId,author:{id:message.author.id,bot:true},createdTimestamp:message.createdTimestamp,editedTimestamp:message.editedTimestamp||message.createdTimestamp,content:(message.content||'').slice(0,6000),embeds:list(message.embeds).slice(0,3).map(e=>e.toJSON?.()||e),components:list(message.components).slice(0,5).map(r=>({components:list(r.components).map(b=>({type:b.type,style:b.style,label:b.label,emoji:b.emoji}))})),attachments:[],reference:message.reference?{messageId:message.reference.messageId||message.reference.message_id}:undefined};
}
