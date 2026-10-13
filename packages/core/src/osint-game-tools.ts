import {lookup} from 'node:dns/promises';
import {Socket,isIP} from 'node:net';
import {z} from 'zod';
import {DomainError} from './config';
import {rateLimit} from './auth';
import {providerJson} from './osint-network';
import {publicResearchIp} from './osint-research';

export function validateRobloxName(input:string){if(!/^[a-z0-9](?:[a-z0-9_]{1,18})[a-z0-9]$/i.test(input)||input.includes('__')||(input.match(/_/g)||[]).length>1)throw new DomainError('ROBLOX_USERNAME','3–20 karakter; harf, rakam ve ortada en fazla bir alt çizgi kullan.',400);}
export async function robloxUsername(input:string){
 validateRobloxName(input);
 const data=await providerJson('roblox-users','https://users.roblox.com/v1/usernames/users',150000,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usernames:[input],excludeBannedUsers:false})});
 if(!Array.isArray(data.data))throw new DomainError('PROVIDER_FORMAT','Roblox kullanıcı yanıtı geçersiz.',503);
 const match=data.data.find((r:any)=>typeof r.name==='string'&&r.name.toLowerCase()===input.toLowerCase()&&Number.isSafeInteger(r.id)&&r.id>0);
 return {title:'Roblox Kullanıcı Adı Kontrolü',summary:match?'Tam kullanıcı adıyla açık hesap bulundu.':'Resmî API’de tam eşleşme bulunamadı.',items:[{name:'Aranan ad',value:input},{name:'Durum',value:match?'Kayıtlı açık profil':'Eşleşme yok; kayıt için müsaitlik garantisi değildir'},...(match?[{name:'Kullanıcı ID',value:String(match.id)},{name:'Görünen ad',value:String(match.displayName||match.name).slice(0,100)},{name:'Profil',value:'https://www.roblox.com/users/'+match.id+'/profile'}]:[])],notice:'Roblox Users resmî API · '+new Date().toISOString()+'. Yalnız kullanıcı adıyla yayımlanan hesap eşleşmesi. E-posta, telefon, parola veya özel hesap verisi sorgulanmaz. Eşleşme olmaması adı kaydedebileceğin anlamına gelmez; rezervasyon/moderasyon kuralları farklıdır.'};
}
const minecraftSchema=z.object({host:z.string().trim().min(1).max(253),port:z.number().int().min(1).max(65535).default(25565)}).strict();
export function parseMinecraftTarget(input:string){
 let data:unknown;
 if(input.startsWith('{'))try{data=JSON.parse(input);}catch{throw new DomainError('MC_TARGET','Geçerli sunucu adresi gerekli.',400);}
 else{const bracket=/^\[([\da-f:]+)\](?::(\d+))?$/i.exec(input),pair=/^([^:]+):(\d+)$/.exec(input);data=bracket?{host:bracket[1],port:bracket[2]?Number(bracket[2]):25565}:pair?{host:pair[1],port:Number(pair[2])}:{host:input};}
 const d=minecraftSchema.parse(data),host=d.host.toLowerCase();
 if(isIP(host)?!publicResearchIp(host):!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host))throw new DomainError('MC_PUBLIC_HOST','Yalnız genel internet IP/alan adı kabul edilir; URL veya özel ağ adresi girme.',400);
 return {...d,host};
}
function varint(value:number){const bytes:number[]=[];do{let b=value&127;value>>>=7;if(value)b|=128;bytes.push(b);}while(value);return Buffer.from(bytes);}
function readVarint(data:Buffer,offset=0){let value=0;for(let i=0;i<5;i++){if(offset+i>=data.length)return null;const b=data[offset+i];value|=(b&127)<<(i*7);if(!(b&128))return {value:value>>>0,bytes:i+1};}throw new DomainError('MC_FORMAT','Minecraft paket boyutu geçersiz.',503);}
export function readMinecraftStatus(data:Buffer){
 const frame=readVarint(data);if(!frame)return null;if(frame.value>65536)throw new DomainError('MC_SIZE','Minecraft durum paketi sınırı aştı.',503);if(data.length<frame.bytes+frame.value)return null;
 const body=data.subarray(frame.bytes,frame.bytes+frame.value),id=readVarint(body);if(!id||id.value!==0)throw new DomainError('MC_FORMAT','Beklenmeyen Minecraft paket türü.',503);
 const size=readVarint(body,id.bytes);if(!size||size.value>32767||id.bytes+size.bytes+size.value!==body.length)throw new DomainError('MC_FORMAT','Minecraft JSON uzunluğu geçersiz.',503);
 try{const status=JSON.parse(body.subarray(id.bytes+size.bytes).toString('utf8'));if(typeof status.version?.name!=='string'||!Number.isInteger(status.players?.online)||status.players.online<0||!Number.isInteger(status.players?.max)||status.players.max<0)throw Error('shape');return {version:status.version.name.slice(0,100),online:status.players.online,max:status.players.max};}catch{throw new DomainError('MC_FORMAT','Minecraft durum JSON yanıtı geçersiz.',503);}
}
const cache=new Map<string,{until:number;result:Awaited<ReturnType<typeof pingMinecraft>>}>();let running=0;
async function pingMinecraft(host:string,port:number,address:string,family:number){
 const start=Date.now();return new Promise<{version:string;online:number;max:number;latencyMs:number;checkedAt:string}>((resolve,reject)=>{
  const socket=new Socket();let data=Buffer.alloc(0),settled=false;const timer=setTimeout(()=>finish(new DomainError('MC_TIMEOUT','Sunucu durum ping’ine 5 saniyede yanıt vermedi. Kapalı/filtreli olabilir; çevrimdışı olduğu kanıtlanmadı.',503)),5000);
  const finish=(error?:Error,status?:{version:string;online:number;max:number})=>{if(settled)return;settled=true;clearTimeout(timer);socket.destroy();if(error)reject(error);else resolve({...status!,latencyMs:Date.now()-start,checkedAt:new Date().toISOString()});};
  socket.on('error',()=>finish(new DomainError('MC_UNREACHABLE','Sunucuya Minecraft bağlantısı kurulamadı. Adres/port veya ağ filtresini kontrol et.',503)));socket.on('end',()=>finish(new DomainError('MC_CLOSED','Sunucu durum yanıtı tamamlanmadan bağlantıyı kapattı.',503)));
  socket.on('data',chunk=>{try{if(data.length+chunk.length>65541)throw new DomainError('MC_SIZE','Minecraft yanıtı sınırı aştı.',503);data=Buffer.concat([data,chunk]);const status=readMinecraftStatus(data);if(status)finish(undefined,status);}catch(e){finish(e instanceof Error?e:new Error('MC_FORMAT'));}});
  socket.connect({host:address,port,family},()=>{const name=Buffer.from(host),portBytes=Buffer.alloc(2);portBytes.writeUInt16BE(port);const handshake=Buffer.concat([varint(0),varint(-1),varint(name.length),name,portBytes,varint(1)]);socket.write(Buffer.concat([varint(handshake.length),handshake,Buffer.from([1,0])]));});
 });
}
export async function minecraftStatus(input:string){
 const target=parseMinecraftTarget(input),key=target.host+':'+target.port;const old=cache.get(key);let result=old&&old.until>Date.now()?old.result:null,cached=!!result;
 if(!result){
  await rateLimit('osint-minecraft-target:'+key,1,15);await rateLimit('osint-minecraft-global',12,60);
  if(running>=2)throw new DomainError('MC_BUSY','Minecraft durum sorguları dolu; kısa süre sonra yeniden dene.',503);running++;
  try{
   let addresses:{address:string;family:number}[];const dnsTimer=AbortSignal.timeout(5000);
   try{addresses=isIP(target.host)?[{address:target.host,family:isIP(target.host)}]:await Promise.race([lookup(target.host,{all:true}),new Promise<never>((_,reject)=>dnsTimer.addEventListener('abort',()=>reject(Error('timeout')),{once:true}))]);}catch{throw new DomainError('MC_DNS','Minecraft sunucusunun DNS çözümlemesi tamamlanamadı.',503);}
   if(!addresses.length||addresses.some(a=>!publicResearchIp(a.address)))throw new DomainError('MC_PUBLIC_HOST','Sunucu özel/ayrılmış IP’ye çözümlendi; bağlantı engellendi.',400);
   const pinned=addresses[0];result=await pingMinecraft(target.host,target.port,pinned.address,pinned.family);if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{until:Date.now()+60000,result});
  }finally{running--;}
 }
 return {title:'Minecraft Java Durumu',summary:'Sunucu durum yanıtı verdi · '+result.online+'/'+result.max+' oyuncu',items:[{name:'Hedef',value:key},{name:'Durum',value:'Çevrimiçi durum yanıtı alındı'},{name:'Oyuncular',value:result.online+' / '+result.max},{name:'Sürüm (sunucu beyanı)',value:result.version},{name:'Durum yanıt süresi',value:result.latencyMs+' ms'},{name:'Gözlem zamanı',value:result.checkedAt+(cached?' · 60 saniyelik önbellek':'')}],notice:'Java Server List Ping; tek bağlantı, 5 saniye, özel ağ engeli ve DNS IP sabitlemesi. Oyuncu adları/UUID örnekleri tutulmaz. Varsayılan port 25565; SRV/Bedrock desteklenmez. Sürüm sunucu beyanıdır; bir sonraki anın durumunu garanti etmez. Sunucuya katılım/bot oyuncu/AFK işlemi yapılmaz.'};
}
