import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {resolve4,resolve6,resolveMx,resolveNs,resolveTxt,reverse} from 'node:dns/promises';
import {z} from 'zod';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {memberProfile} from './features';
import {guildMember,syncUser} from './discord';
import {rateLimit} from './auth';
import {assertOsintAllowed} from './osint-access';
import {lookupRdap,lookupAsn,lookupCve,lookupCt,lookupEmail,lookupHash,lookupProxy,lookupProxyCheck,parseProxyFilters} from './osint-providers';

export const osintTools=[
 {id:'dns',name:'Domain Intelligence',label:'DNS & kayıt sorgusu',enabled:true,icon:'🌐'},
 {id:'ip',name:'IP Intelligence',label:'IP ve ters DNS',enabled:true,icon:'🛰️'},
 {id:'url',name:'URL Analyzer',label:'Pasif URL risk analizi',enabled:true,icon:'🔗'},
 {id:'rdap',name:'RDAP / WHOIS',label:'Alan adı kayıt bilgileri',enabled:true,icon:'📑'},
 {id:'threat',name:'Threat Intelligence',label:'Tehdit itibar sorgusu',enabled:false,icon:'🛡️'},
 {id:'mail',name:'Temp Mail',label:'Geçici e-posta',enabled:false,icon:'✉️'},
 {id:'number',name:'Temp Number',label:'Sağlayıcıyla sanal SMS',enabled:false,icon:'📱'},
 {id:'proxy',name:'Proxy Manager',label:'Yasal proxy havuzu ve kontrolü',enabled:true,icon:'🧩'},
 {id:'malware',name:'Malware Scanner',label:'Dosya ve hash kontrolü',enabled:false,icon:'🦠'},
 {id:'tls',name:'SSL / TLS Inspector',label:'Sertifika zinciri ve süreleri',enabled:true,icon:'🔐'},
 {id:'subdomains',name:'Subdomain Discovery',label:'Pasif alt alan adı keşfi',enabled:true,icon:'🧭'},
 {id:'dns-history',name:'DNS History',label:'Geçmiş DNS kayıtları',enabled:false,icon:'🕓'},
 {id:'asn',name:'ASN / BGP Explorer',label:'Operatör, ASN ve yönlendirme bilgileri',enabled:true,icon:'🌍'},
 {id:'email',name:'Email Intelligence',label:'E-posta alan adı güvenlik kayıtları',enabled:true,icon:'📨'},
 {id:'usernames',name:'Public Username Search',label:'Açık profillerde kullanıcı adı araması',enabled:false,icon:'👤'},
 {id:'github',name:'Repository Intelligence',label:'Açık kaynak depo analizi',enabled:false,icon:'💻'},
 {id:'archives',name:'Web Archive',label:'Geçmiş sayfa anlık görüntüleri',enabled:false,icon:'🗃️'},
 {id:'metadata',name:'File Metadata',label:'Yerel dosya meta veri analizi',enabled:false,icon:'🗂️'},
 {id:'headers',name:'HTTP Header Review',label:'Güvenli yanıt başlığı inceleme',enabled:false,icon:'📃'},
 {id:'ioc',name:'IOC Normalizer',label:'Gösterge doğrulama ve normalizasyon',enabled:false,icon:'🧬'},
 {id:'cve',name:'CVE Intelligence',label:'Açık CVE veritabanı araştırması',enabled:true,icon:'🛠️'},
 {id:'hash',name:'Hash Reputation',label:'Dosya karması itibar karşılaştırma',enabled:!!process.env.VIRUSTOTAL_API_KEY,icon:'🔏'},
 {id:'reports',name:'Research Reports',label:'Araştırma raporu ve dışa aktarma',enabled:false,icon:'📊'},
 {id:'proxy-check',name:'Proxy Validator',label:'Yetkili proxy otomatik ve manuel test',enabled:true,icon:'✅'},
 {id:'geo',name:'GeoIP Explorer',label:'Tahmini bölge/ülke sağlayıcı sorgusu',enabled:false,icon:'📍'}
] as const;

export type OsintKind='dns'|'ip'|'url'|'rdap'|'subdomains'|'tls'|'asn'|'cve'|'email'|'hash'|'proxy'|'proxy-check';
export type OsintActor={id:string;username:string;avatar?:string|null};
export type OsintResult={kind:OsintKind;target:string;title:string;summary:string;items:{name:string;value:string}[];notice:string};
const targetSchema=z.string().trim().min(2).max(250);
const domainPattern=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
export function osintTier(level:number){
 if(level>=40)return {name:'Elite',dailyLimit:150};
 if(level>=20)return {name:'Expert',dailyLimit:75};
 if(level>=10)return {name:'Analyst',dailyLimit:35};
 if(level>=5)return {name:'Researcher',dailyLimit:15};
 return {name:'Starter',dailyLimit:5};
}
export async function osintQuota(userId:string){
 const profile=await memberProfile(userId),tier=osintTier(profile.level);
 const used=Number((await database().query("SELECT count(*)::int AS n FROM osint_usage WHERE guild_id=$1 AND user_id=$2 AND day=(now() AT TIME ZONE 'Europe/Istanbul')::date",[config().guildId,userId])).rows[0]?.n||0);
 return {xp:profile.xp,level:profile.level,tier:tier.name,dailyLimit:tier.dailyLimit,used,remaining:Math.max(0,tier.dailyLimit-used),resetTimezone:'Europe/Istanbul'};
}
function domain(input:string){
 const value=input.toLowerCase().replace(/\.$/,'');
 if(!domainPattern.test(value))throw new DomainError('INVALID_DOMAIN','Geçerli bir alan adı girin (örnek: example.com).',400);
 return value;
}
function clean(value:unknown,max=300){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);}
async function records<T>(work:()=>Promise<T[]>,format:(v:T)=>string,cap=8):Promise<string>{
 try{const values=await work();return values.length?values.slice(0,cap).map(format).join('\n').slice(0,850):'Kayıt bulunamadı';}
 catch(e:any){return ['ENODATA','ENOTFOUND','ENODOMAIN','ENOTIMP'].includes(e?.code)?'Kayıt bulunamadı':'DNS sağlayıcısı yanıt vermedi';}
}
async function dnsInspect(input:string):Promise<OsintResult>{
 const target=domain(input);
 const [a,aaaa,mx,ns,txt]=await Promise.all([
  records(()=>resolve4(target),v=>v),
  records(()=>resolve6(target),v=>v),
  records(()=>resolveMx(target),v=>clean(v.exchange)+' (öncelik '+v.priority+')'),
  records(()=>resolveNs(target),v=>clean(v)),
  records(()=>resolveTxt(target),v=>clean(v.join(''),140),5)
 ]);
 return {kind:'dns',target,title:'Domain Intelligence',summary:'Herkese açık DNS kayıtları çözümlendi.',items:[{name:'A / IPv4',value:a},{name:'AAAA / IPv6',value:aaaa},{name:'MX / E-posta',value:mx},{name:'NS / Sunucu',value:ns},{name:'TXT',value:txt}],notice:'DNS sonuçları zamanla değişebilir; geçmiş kayıt veya WHOIS sorgusu değildir.'};
}
function ipScope(ip:string){
 if(ip.includes(':'))return /^(::1|::|f[c-d][0-9a-f]:|fe[89ab][0-9a-f]:|ff)/i.test(ip)?'Özel/yerel veya ayrılmış IPv6':'IPv6 (genel veya ayrılmış)';
 const [a,b]=ip.split('.').map(Number);
 if(a===10||a===127||a===0||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0||a===198&&b>=18&&b<=19||a===192&&b===0||a===198&&b===51||a===203&&b===0)return 'Özel/yerel/test veya ayrılmış IPv4';
 return 'Genel veya ayrılmış IPv4';
}
async function ipInspect(input:string):Promise<OsintResult>{
 const target=input.trim();if(!isIP(target))throw new DomainError('INVALID_IP','Geçerli bir IPv4 veya IPv6 adresi girin.',400);
 const ptr=await records(()=>reverse(target),v=>clean(v));
 return {kind:'ip',target,title:'IP Intelligence',summary:'IP biçimi, adres sınıfı ve PTR kaydı incelendi.',items:[{name:'Sürüm',value:'IPv'+isIP(target)},{name:'Adres sınıfı',value:ipScope(target)},{name:'PTR / Ters DNS',value:ptr}],notice:'Konum, ASN, operatör ve tehdit puanı için ayrı doğrulanmış sağlayıcı gerekir; bunlar hesaplanmış gibi gösterilmez.'};
}
function urlInspect(input:string):OsintResult{
 let url:URL;
 try{url=new URL(input);}catch{throw new DomainError('INVALID_URL','http:// veya https:// ile başlayan geçerli bir adres girin.',400);}
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new DomainError('INVALID_URL','Yalnızca kullanıcı bilgisi içermeyen HTTP(S) adresleri kabul edilir.',400);
 const host=url.hostname.toLowerCase(),flags:string[]=[];
 if(url.protocol!=='https:')flags.push('HTTPS kullanılmıyor');
 if(host.startsWith('xn--')||host.includes('.xn--'))flags.push('Punycode alan adı, kimlik taklidi açısından incelenmeli');
 if(isIP(host))flags.push('Alan adı yerine doğrudan IP adresi kullanılıyor');
 if(host.split('.').length>4)flags.push('Fazla sayıda alt alan adı');
 if((host.match(/-/g)||[]).length>=4)flags.push('Çok sayıda tire');
 if(url.search.length>350)flags.push('Uzun sorgu parametresi');
 if(input.length>190)flags.push('Alışılmadık derecede uzun URL');
 const risk=flags.length>=3?'İnceleme önerilir':flags.length>0?'Dikkat':'Belirgin biçimsel uyarı yok';
 return {kind:'url',target:host,title:'URL Analyzer',summary:risk,items:[{name:'Protokol',value:url.protocol.slice(0,-1)},{name:'Alan adı',value:host},{name:'Yol',value:clean(url.pathname,120)},{name:'Biçimsel uyarılar',value:flags.join('\n')||'Yok'}],notice:'Bu yalnızca pasif sözdizimi kontrolüdür. Site açılmadı; phishing, virüs veya güvenlik garantisi sağlamaz.'};
}
export function validateOsint(kind:string,target:unknown){
 const type=z.enum(['dns','ip','url','rdap','subdomains','tls','asn','cve','email','hash','proxy','proxy-check']).parse(kind);
 const input=targetSchema.parse(target);
 if(type==='dns')domain(input);
 if(type==='ip'&&!isIP(input))throw new DomainError('INVALID_IP','Geçerli bir IP adresi girin.',400);
 if(type==='url')urlInspect(input);
 if(['rdap','subdomains','tls','email'].includes(type))domain(input);
 if(type==='asn'&&!isIP(input))throw new DomainError('INVALID_IP','Geçerli IP adresi girin.',400);
 if(type==='cve'&&!/^CVE-\d{4}-\d{4,8}$/i.test(input))throw new DomainError('INVALID_CVE','CVE kimliği gerekli.',400);
 if(type==='hash'&&!/^[a-f0-9]{64}$/i.test(input))throw new DomainError('INVALID_HASH','SHA-256 özeti gerekli.',400);
 if(type==='proxy')parseProxyFilters(input);
 if(type==='proxy-check'&&!/^(https?|socks4|socks5):\/\/([0-9.]+|\[[0-9a-f:]+\]):\d{1,5}$/i.test(input))throw new DomainError('INVALID_PROXY','protocol://IP:port biçimi gerekli.',400);
 return {kind:type,target:input};
}
export async function osintRun(actor:OsintActor,kind:string,target:unknown,requestId:string){
 if(config().demo)throw new DomainError('OSINT_DISABLED','Demo modunda araştırma kapalı.',403);
 if(!/^[a-zA-Z0-9:_-]{10,100}$/.test(requestId))throw new DomainError('INVALID_REQUEST','Geçersiz işlem anahtarı.',400);
 const parsed=validateOsint(kind,target);
 await guildMember(actor.id);
 await assertOsintAllowed(actor.id);
 await rateLimit('osint:'+config().guildId+':'+actor.id,8,60);
 const beforeQuota=await osintQuota(actor.id);
 if(beforeQuota.remaining<=0)throw new DomainError('OSINT_QUOTA','Günlük araştırma hakkın doldu. Türkiye saatiyle gece yarısı yenilenir.',429);
 const provided=parsed.kind==='rdap'?await lookupRdap(parsed.target)
  :parsed.kind==='subdomains'||parsed.kind==='tls'?await lookupCt(parsed.target,parsed.kind)
  :parsed.kind==='asn'?await lookupAsn(parsed.target)
  :parsed.kind==='cve'?await lookupCve(parsed.target)
  :parsed.kind==='email'?await lookupEmail(parsed.target)
  :parsed.kind==='hash'?await lookupHash(parsed.target)
  :parsed.kind==='proxy'?await lookupProxy(parsed.target)
  :parsed.kind==='proxy-check'?await lookupProxyCheck(parsed.target):null;
 const result:OsintResult=provided?{...provided,kind:parsed.kind,target:parsed.kind==='proxy'?'Filtreli proxy sorgusu':parsed.target}:parsed.kind==='dns'?await dnsInspect(parsed.target):parsed.kind==='ip'?await ipInspect(parsed.target):urlInspect(parsed.target);
 const profile=await memberProfile(actor.id),tier=osintTier(profile.level);
 const fingerprint=createHash('sha256').update(parsed.kind+':'+parsed.target).digest('hex');
 const billing=await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['osint:'+config().guildId+':'+actor.id]);
  await syncUser(tx,actor);
  const prev=(await tx.query('SELECT request_id,query_kind,target_sha256 FROM osint_usage WHERE guild_id=$1 AND user_id=$2 AND request_id=$3',[config().guildId,actor.id,requestId])).rows[0];
  if(prev&&(prev.query_kind!==parsed.kind||prev.target_sha256!==fingerprint))throw new DomainError('OSINT_REQUEST_REUSED','Bu işlem kodu başka bir sorguyla kullanılmış.',409);
  const used=Number((await tx.query("SELECT count(*)::int AS n FROM osint_usage WHERE guild_id=$1 AND user_id=$2 AND day=(now() AT TIME ZONE 'Europe/Istanbul')::date",[config().guildId,actor.id])).rows[0].n);
  if(prev)return {used,duplicate:true};
  if(used>=tier.dailyLimit)throw new DomainError('OSINT_QUOTA','Günlük araştırma hakkın doldu. Türkiye saatiyle gece yarısı yenilenir.',429);
  await tx.query('INSERT INTO osint_usage(guild_id,user_id,request_id,query_kind,target_sha256) VALUES($1,$2,$3,$4,$5)',[config().guildId,actor.id,requestId,parsed.kind,fingerprint]);
  return {used:used+1,duplicate:false};
 });
 return {result,quota:{xp:profile.xp,level:profile.level,tier:tier.name,dailyLimit:tier.dailyLimit,used:billing.used,remaining:Math.max(0,tier.dailyLimit-billing.used),resetTimezone:'Europe/Istanbul'},duplicate:billing.duplicate};
}
