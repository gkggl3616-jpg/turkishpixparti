import {DomainError} from './config';
// Only target-based lookups split input; free-form text, filters and mailbox secrets do not.
export const bulkKinds=new Set(['roblox-username','minecraft-status','dns','ip','rdap','tls','subdomains','asn','geo','threat','email','headers','url','usernames','github','archives','cve','hash','malware','ioc','proxy-check','reports','web-risks']);
export function bulkTargets(kind:string,input:string){
 if(!(bulkKinds.has(kind)||kind.startsWith('social-'))||input.trim().startsWith('{'))return [input.trim()];
 const seen=new Set<string>();
 const entries=input.replace(/^\uFEFF/,'').split(/[,\r\n]+/).map(s=>s.trim()).filter(Boolean),unique=entries.filter(s=>{const key=s.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
 const limit=kind==='roblox-username'?100:20;
 if(!unique.length||unique.length>limit)throw new DomainError('BULK_LIMIT','Bu araçta 1–'+limit+' farklı hedef gir; virgül veya yeni satırla ayır.',400);
 return unique;
}
export async function readTargetAttachment(file:{name:string;url:string;size:number}){
 if(!/\.txt$/i.test(file.name)||file.size>24000||file.size<1)throw new DomainError('BULK_FILE','UTF-8 TXT dosyası yükle (en fazla 24 KB).',400);
 const u=new URL(file.url);if(u.protocol!=='https:'||u.username||u.password||u.port||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)||!u.pathname.startsWith('/attachments/'))throw new DomainError('BULK_FILE_URL','Discord dosya adresi doğrulanamadı.',400);
 const response=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok||!response.body)throw new DomainError('BULK_FILE_FETCH','TXT dosyası alınamadı; tekrar yükle.',502);
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>24000)throw new DomainError('BULK_FILE','TXT dosyası 24 KB sınırını aşıyor.',400);chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});}
 try{const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size));if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw 0;return text;}catch{throw new DomainError('BULK_FILE_ENCODING','Dosyayı UTF-8 düz metin olarak kaydet.',400);}
}
