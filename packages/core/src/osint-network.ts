import {rateLimit} from './auth';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {assertOsintOwner} from './osint-entitlements';
import {syncUser,guildMember} from './discord';
import {audit} from './audit';
export const providerDefinitions=[
 {id:'cloudflare',name:'Cloudflare DNS',key:false},{id:'google-dns',name:'Google DNS (alternatif)',key:false},
 {id:'rdap',name:'RDAP.org',key:false},{id:'iana-rdap',name:'IANA / kayıt operatörü (alternatif)',key:false},
 {id:'ripe',name:'RIPEstat ASN/BGP',key:false},{id:'ipwho',name:'IPwho.is GeoIP',key:false},
 {id:'crtsh',name:'crt.sh CT',key:false},{id:'hackertarget',name:'HackerTarget pasif alt alan adları (alternatif)',key:false},
 {id:'nvd',name:'NVD CVE',key:false},{id:'mitre',name:'CVE.org / MITRE (alternatif)',key:false},
 {id:'proxyscrape-origin',name:'ProxyScrape doğrudan depo (alternatif)',key:false},
 {id:'proxyscrape',name:'ProxyScrape havuzu',key:false},{id:'github',name:'GitHub açık profiller/depolar',key:false},
 {id:'gitlab',name:'GitLab açık profiller (alternatif)',key:false},{id:'wayback',name:'Internet Archive CDX',key:false},
 {id:'mailtm',name:'Mail.tm e-posta / gelen kutusu',key:false},
 {id:'virustotal',name:'VirusTotal hash / IP itibarı',key:true,env:'VIRUSTOTAL_API_KEY'},
 {id:'abuseipdb',name:'AbuseIPDB IP itibarı (alternatif)',key:true,env:'ABUSEIPDB_API_KEY'},
 {id:'securitytrails',name:'SecurityTrails DNS geçmişi',key:true,env:'SECURITYTRAILS_API_KEY'},
 {id:'malwarebazaar',name:'MalwareBazaar hash (alternatif)',key:true,env:'MALWAREBAZAAR_AUTH_KEY'},
 {id:'urlscan',name:'urlscan.io geçmiş araştırma',key:true,env:'URLSCAN_API_KEY'}
] as const;
function vaultKey(){if(config().auditKey.length<32)throw new DomainError('KEY_MISSING','Sunucu şifreleme anahtarı eksik.',503);return createHash('sha256').update('turkishpix-osint-vault-v1:').update(config().auditKey).digest();}
export function sealOsintSecret(value:unknown){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',vaultKey(),iv),b=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64');}
export function openOsintSecret<T=any>(value:string):T{const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',vaultKey(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8'));}
export async function providerKey(id:string):Promise<string|null>{
 const def=providerDefinitions.find(x=>x.id===id);if(!def||!def.key)return null;
 const row=(await database().query('SELECT key_cipher FROM osint_provider_keys WHERE provider=$1',[id])).rows[0];
 return row?openOsintSecret<string>(row.key_cipher):process.env[def.env]||null;
}
export async function setOsintProviderKey(owner:{id:string;username:string},id:string,value:string){
 assertOsintOwner(owner.id);await guildMember(owner.id);
 if(!providerDefinitions.some(x=>x.id===id&&x.key)||value.length>512||value&&(!/^[\x21-\x7e]+$/.test(value)||value.length<8))throw new DomainError('INVALID_PROVIDER_KEY','Desteklenen sağlayıcı ve geçerli API anahtarı gerekli.',400);
 await transaction(async tx=>{await syncUser(tx,owner);if(value)await tx.query('INSERT INTO osint_provider_keys(provider,key_cipher,updated_by) VALUES($1,$2,$3) ON CONFLICT(provider) DO UPDATE SET key_cipher=EXCLUDED.key_cipher,updated_by=EXCLUDED.updated_by,updated_at=now()',[id,sealOsintSecret(value),owner.id]);else await tx.query('DELETE FROM osint_provider_keys WHERE provider=$1',[id]);await audit(tx,owner.id,'OSINT_PROVIDER_KEY',id,{configured:!!value});});return {success:true};
}
export async function osintProviderStatus(){
 const rows=(await database().query('SELECT provider,state,checked_at,last_success_at,code,latency_ms FROM osint_provider_health')).rows;
 const keys=(await database().query('SELECT provider FROM osint_provider_keys')).rows.map(x=>x.provider);
 return providerDefinitions.map(p=>{const h=rows.find(x=>x.provider===p.id);return {...p,env:undefined,configured:!p.key||keys.includes(p.id)||!!process.env[p.env],state:p.key&&!keys.includes(p.id)&&!process.env[p.env]?'KEY_REQUIRED':h?.state||'NOT_TESTED',checkedAt:h?.checked_at,lastSuccessAt:h?.last_success_at,code:h?.code,latencyMs:h?.latency_ms};});
}
const cooldown=new Map<string,number>();
export async function providerHealth(id:string,ok:boolean,code:string,ms:number){
 try{await database().query("INSERT INTO osint_provider_health(provider,state,checked_at,last_success_at,code,latency_ms) VALUES($1,$2,now(),CASE WHEN $2='OK' THEN now() ELSE NULL END,$3,$4) ON CONFLICT(provider) DO UPDATE SET state=EXCLUDED.state,checked_at=now(),last_success_at=CASE WHEN EXCLUDED.state='OK' THEN now() ELSE osint_provider_health.last_success_at END,code=EXCLUDED.code,latency_ms=EXCLUDED.latency_ms",[id,ok?'OK':'ERROR',code.slice(0,60),Math.max(0,Math.round(ms))]);}catch{/* A telemetry failure never fabricates or suppresses a research response. */}
}
export async function boundedProviderText(id:string,url:string,maximum=3000000,init:RequestInit={}):Promise<string>{
 if((cooldown.get(id)||0)>Date.now())throw new DomainError('PROVIDER_COOLDOWN','Sağlayıcının hız sınırı nedeniyle bekleniyor: '+id,503);
 const limits:Record<string,number>={cloudflare:600,'google-dns':600,rdap:25,'iana-rdap':25,ripe:120,ipwho:16,crtsh:8,hackertarget:5,nvd:5,mitre:30,github:30,gitlab:30,wayback:8,virustotal:4,abuseipdb:20,urlscan:20,securitytrails:10,malwarebazaar:20,proxyscrape:20,'proxyscrape-origin':20};
 if(id!=='mailtm'){await rateLimit('osint-provider:'+id,limits[id]||60,60);if(id==='ipwho')await rateLimit('osint-provider:ipwho-day',1000,86400);if(id==='github')await rateLimit('osint-provider:github-hour',60,3600);}
 const started=Date.now();
 try{
  const r=await fetch(url,{...init,signal:AbortSignal.timeout(9000),headers:{Accept:'application/json',...init.headers},cache:'no-store'});
  if(!r.ok){
   if(r.status===429||r.status===403&&r.headers.get('x-ratelimit-remaining')==='0'){const raw=r.headers.get('retry-after'),seconds=Number(raw),reset=Number(r.headers.get('x-ratelimit-reset')),delay=raw&&Number.isFinite(seconds)?seconds*1000:raw?Math.max(0,Date.parse(raw)-Date.now()):reset?Math.max(1000,reset*1000-Date.now()):60000;cooldown.set(id,Date.now()+Math.max(1000,delay||60000));}
   throw new DomainError(r.status===404?'PROVIDER_NOT_FOUND':'PROVIDER_UNAVAILABLE','Sağlayıcı '+id+' yanıtı: '+r.status,r.status===404?404:503);
  }
  if(Number(r.headers.get('content-length'))>maximum)throw new DomainError('PROVIDER_SIZE','Sağlayıcı yanıtı sınırı aştı.',503);
  let body='';if(r.body){const reader=r.body.getReader();const decoder=new TextDecoder();let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum)throw new DomainError('PROVIDER_SIZE','Sağlayıcı yanıtı sınırı aştı.',503);body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}}else{body=await r.text();if(Buffer.byteLength(body)>maximum)throw new DomainError('PROVIDER_SIZE','Sağlayıcı yanıtı sınırı aştı.',503);}
  await providerHealth(id,true,'',Date.now()-started);return body;
 }catch(e){await providerHealth(id,e instanceof DomainError&&e.status===404,e instanceof DomainError?e.code:'NETWORK',Date.now()-started);throw e instanceof DomainError?e:new DomainError('PROVIDER_UNAVAILABLE','Sağlayıcı '+id+' bağlantısı tamamlanamadı.',503);}
}
export async function providerJson(id:string,url:string,maximum=3000000,init:RequestInit={}){
 const text=await boundedProviderText(id,url,maximum,init);let d:any;
 try{d=JSON.parse(text);}catch{await providerHealth(id,false,'FORMAT',0);throw new DomainError('PROVIDER_FORMAT','Sağlayıcının JSON biçimi geçersiz.',503);}
 const bad=(['cloudflare','google-dns'].includes(id)&&(!Number.isInteger(d.Status)||![0,3].includes(d.Status)))||(id==='ipwho'&&d.success===false)||(id.startsWith('proxyscrape')&&!Array.isArray(d))||(id==='malwarebazaar'&&!['ok','hash_not_found'].includes(d.query_status))||(id==='urlscan'&&!Array.isArray(d.results))||(id==='securitytrails'&&!!d.message&&d.message!=='pong');
 if(bad){await providerHealth(id,false,'API_RESPONSE',0);throw new DomainError('PROVIDER_RESPONSE','Sağlayıcı '+id+' geçerli bir araştırma yanıtı vermedi.',503);}
 return d;
}
export async function providerFallback<T>(primary:()=>Promise<T>,alternative:()=>Promise<T>):Promise<T>{try{return await primary();}catch{return alternative();}}
