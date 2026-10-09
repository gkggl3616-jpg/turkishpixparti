import {config,DomainError} from './config';
import {randomUUID} from 'node:crypto';
export class DiscordAPIError extends DomainError {
 constructor(public responseStatus:number,public discordCode:number|null,public method:string,public route:string,public retryAfter=0){
  const message=discordCode===10007?'Bu üye artık sunucuda bulunmuyor.':discordCode===10008?'Bu Discord mesajı silinmiş veya artık bulunamıyor.':discordCode===10003?'Seçilen Discord kanalı silinmiş veya artık erişilemiyor. Kanalı yeniden seç.':responseStatus===403?'Botun bu işlem için Discord izni eksik. Kanal ve rol izinlerini kontrol et.':responseStatus===401?'Botun Discord bağlantısı doğrulanamadı.':responseStatus===429?'Discord kısa süreli hız sınırı uyguluyor. İşlem kaydı korunur; biraz sonra yeniden dene.':responseStatus===404?'Seçilen Discord kaydı artık bulunamıyor. Kanalı veya mesajı yeniden seç.':'Discord bağlantısı geçici olarak yanıt vermedi.';
  super('DISCORD_ERROR',message+` (${responseStatus}).`,[401,403,404].includes(responseStatus)?403:503);
 }
}
export function isDiscordMissing(error:unknown,...codes:number[]){return error instanceof DiscordAPIError&&error.responseStatus===404&&(!error.discordCode||!codes.length||codes.includes(error.discordCode));}
export function discordErrorDetails(error:any){return {code:typeof error?.code==='number'||typeof error?.code==='string'?error.code:'INTERNAL',...(error instanceof DiscordAPIError?{http:error.responseStatus,discordCode:error.discordCode,method:error.method,route:error.route}:{})};}
const reads=new Map<string,Promise<any>>();let readFetch=globalThis.fetch;
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function routeName(path:string){return path.split('?')[0].replace(/(\/webhooks\/\d+)\/[^/]+/,'$1/:token').replace(/\d{17,20}/g,':id');}
async function request(path:string,init:RequestInit,bearer?:string){
 const method=(init.method||'GET').toUpperCase(),deadline=Date.now()+10000,headers=new Headers(init.headers);if(!headers.has('Content-Type'))headers.set('Content-Type','application/json');if(!headers.has('Authorization'))headers.set('Authorization',bearer?`Bearer ${bearer}`:`Bot ${config().botToken}`);
 for(let attempt=0;;attempt++){
  let response:Response;
  try{response=await fetch('https://discord.com/api/v10'+path,{...init,headers,signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))});}
  catch{if(method==='GET'&&attempt===0&&Date.now()+250<deadline){await wait(200);continue;}throw new DomainError('DISCORD_NETWORK','Discord bağlantısı zamanında yanıt vermedi. İşlem kaydedilmiş olabilir; listeyi kontrol ederek yeniden dene.',503);}
  if(response.ok)return response.status===204?null:response.json();
  const body=await response.json().catch(()=>null),retryAfter=Number(response.headers.get('Retry-After')||body?.retry_after||0),discordCode=typeof body?.code==='number'?body.code:null;
  // Discord explicitly rejected a 429; repeating it cannot duplicate a write.
  if(response.status===429&&attempt<2&&Number.isFinite(retryAfter)&&retryAfter>=0&&Date.now()+retryAfter*1000+250<deadline){await wait(Math.max(50,retryAfter*1000));continue;}
  // Ambiguous POST failures are left to durable, nonce-protected application jobs.
  if(response.status>=500&&method==='GET'&&attempt===0&&Date.now()+250<deadline){await wait(200);continue;}
  throw new DiscordAPIError(response.status,discordCode,method,routeName(path),retryAfter);
 }
}
export async function discordRequest(path:string,init:RequestInit={},bearer?:string){
 if((init.method||'GET').toUpperCase()!=='GET')return request(path,init,bearer);
 if(readFetch!==globalThis.fetch){reads.clear();readFetch=globalThis.fetch;}
 const key=JSON.stringify([bearer||config().botToken,path,new Headers(init.headers).get('Authorization')]);let pending=reads.get(key);
 if(!pending){pending=request(path,init,bearer);reads.set(key,pending);}
 try{return structuredClone(await pending);}finally{if(reads.get(key)===pending)reads.delete(key);}
}
let identity:{token:string;fetch:typeof fetch;until:number;value:any}|undefined;
export async function discordBotIdentity(){const token=config().botToken;if(identity?.token===token&&identity.fetch===globalThis.fetch&&identity.until>Date.now())return {...identity.value};const value=await discordRequest('/users/@me');identity={token,fetch:globalThis.fetch,until:Date.now()+5*60000,value};return {...value};}
export async function guildMember(userId:string){
 const c=config();const member=await discordRequest(`/guilds/${c.guildId}/members/${userId}`);
 if(!member||member.pending)throw new DomainError('NOT_MEMBER','TurkishPix üyeliğini ve sunucu doğrulamasını tamamlayın.',403);
 if(c.minMemberAge&&Date.now()-new Date(member.joined_at).getTime()<c.minMemberAge*3600000)throw new DomainError('MEMBER_TOO_NEW',`Oy kullanmak için ${c.minMemberAge} saatlik sunucu üyeliği gerekiyor.`,403);
 return member;
}
export async function syncUser(tx:any,user:any){await tx.query('INSERT INTO users(id,username,avatar) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,avatar=EXCLUDED.avatar,last_seen_at=now()',[user.id,user.username,user.avatar||null]);}
