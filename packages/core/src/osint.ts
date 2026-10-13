import {parseApiSearch,searchApiDirectory} from './osint-api-directory';
import {parseMinecraftTarget,validateRobloxName,robloxUsername,minecraftStatus} from './osint-game-tools';
import {utilityCatalog,type UtilityKind,type QrArtifact,type RepositorySearch,type ApiDirectory} from './osint-utility-catalog';
import {validateUtility,generateQr,searchRepositories} from './osint-utilities';
import {socialCatalog,type SocialKind,type SocialProfile} from './osint-social-catalog';
import {socialResearch,validateSocial} from './osint-social';
import {webRiskReport} from './osint-web-risks';
import {saveResearchReport} from './osint-reports';
import {multiCatalog,type MultiKind} from './osint-multi-catalog';
import {multiResearch,validateMulti} from './osint-multi';
import {assessDomainSecurity,securityReport,type SecurityAssessment} from './osint-security';
import {parseLiveProxy,liveProxyReport} from './osint-proxy-live';
import {webIntelligenceCatalog,webIntelligenceResearch,type WebIntelligenceKind} from './osint-web-intelligence';
import {comboCatalog,comboPresets,type ScanKind} from './osint-scan-catalog';
import {runScan,parseScan,type ScanEvent} from './osint-scan';
import {intelligenceCatalog,intelligenceResearch,validateIntelligence,type IntelligenceKind} from './osint-intelligence';
import {lookupDns,domainCombo,ipCombo,lookupHeaders,lookupGeo,passiveSubdomains,emailConfiguration,lookupUsername,lookupRepository,lookupArchives,normalizeIoc,lookupThreat,researchUrl,lookupUrlHistory,lookupDnsHistory,lookupMalwareHash,lookupTls} from './osint-research';
import {temporaryMailbox,temporaryInbox} from './osint-mail';
import {lookupWideUsername,type ProfileObservation} from './osint-usernames';
import {extraCatalog,type ExtraOsintKind} from './osint-extra-catalog';
import {advancedResearch,validateAdvanced} from './osint-advanced';
import {temporaryNumber,temporarySmsInbox} from './osint-sms';
import {osintProviderStatus} from './osint-network';
import {entitlement,consumeOsintCredit} from './osint-entitlements';
import {loadServerSettings} from './setup';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {memberProfile} from './features';
import {guildMember,syncUser} from './discord';
import {rateLimit} from './auth';
import {assertOsintAllowed} from './osint-access';
import {lookupRdap,lookupAsn,lookupCve,lookupCt,lookupProxy,lookupProxyCheck,parseProxyFilters} from './osint-providers';

export const osintTools=[
 ...utilityCatalog,
 {id:'aliases',name:'Personal Mail Aliases',label:'Kendi sağlayıcında alias ve doğrulanmış yönlendirme',enabled:true,icon:'📮'},
 {id:'combo-domain',name:'Domain Kombosu',label:'DNS, IP, subdomain, TLS ve yapılandırma raporu',enabled:true,icon:'🌐'},
 {id:'combo-ip',name:'IP Kombosu',label:'ASN, ağ, tahmini konum ve bağlı itibar kaynakları',enabled:true,icon:'🛰️'},
 {id:'mail-inbox',name:'Temp Mail Inbox',label:'Kendi geçici gelen kutun',enabled:true,icon:'📥'},
 {id:'dns',name:'Domain Intelligence',label:'DNS & kayıt sorgusu',enabled:true,icon:'🌐'},
 {id:'ip',name:'IP Intelligence',label:'IP, ASN ve tahmini ağ konumu',enabled:true,icon:'🛰️'},
 {id:'url',name:'URL Analyzer',label:'Pasif URL risk analizi',enabled:true,icon:'🔗'},
 {id:'rdap',name:'RDAP / WHOIS',label:'Alan adı kayıt bilgileri',enabled:true,icon:'📑'},
 {id:'threat',name:'Threat Intelligence',label:'Tehdit itibar sorgusu',enabled:true,icon:'🛡️'},
 {id:'mail',name:'Temp Mail',label:'Geçici e-posta',enabled:true,icon:'✉️'},
 {id:'number',name:'Temp Number',label:'Sana atanmış sağlayıcı numarası',enabled:false,icon:'📱'},
 {id:'sms-inbox',name:'Private SMS Inbox',label:'Kendi numaranın gelen SMS kutusu',enabled:false,icon:'📲'},
 {id:'proxy',name:'Proxy Manager',label:'Yasal proxy havuzu ve kontrolü',enabled:true,icon:'🧩'},
 {id:'malware',name:'Malware Hash Report',label:'SHA-256 ile geçmiş örnek meta verisi',enabled:false,icon:'🦠'},
 {id:'tls',name:'SSL / TLS Inspector',label:'Sertifika geçmişi / canlı TLS alternatifi',enabled:true,icon:'🔐'},
 {id:'subdomains',name:'Subdomain Discovery',label:'Pasif alt alan adı keşfi',enabled:true,icon:'🧭'},
 {id:'dns-history',name:'DNS History',label:'Geçmiş DNS kayıtları',enabled:false,icon:'🕓'},
 {id:'asn',name:'ASN / BGP Explorer',label:'Operatör, ASN ve yönlendirme bilgileri',enabled:true,icon:'🌍'},
 {id:'email',name:'Email Intelligence',label:'E-posta alan adı güvenlik kayıtları',enabled:true,icon:'📨'},
 {id:'usernames',name:'Public Username Search',label:'Açık profillerde kullanıcı adı araması',enabled:true,icon:'👤'},
 {id:'github',name:'Repository Intelligence',label:'Açık kaynak depo analizi',enabled:true,icon:'💻'},
 {id:'archives',name:'Web Archive',label:'Geçmiş sayfa anlık görüntüleri',enabled:true,icon:'🗃️'},
 {id:'metadata',name:'File Metadata',label:'Yerel SHA-256, boyut ve dosya imzası',enabled:true,icon:'🗂️'},
 {id:'headers',name:'HTTP Header Review',label:'Güvenli yanıt başlığı inceleme',enabled:true,icon:'📃'},
 {id:'ioc',name:'IOC Normalizer',label:'Gösterge doğrulama ve normalizasyon',enabled:true,icon:'🧬'},
 {id:'cve',name:'CVE Intelligence',label:'Açık CVE veritabanı araştırması',enabled:true,icon:'🛠️'},
 {id:'hash',name:'Hash Reputation',label:'Dosya karması itibar karşılaştırma',enabled:!!process.env.VIRUSTOTAL_API_KEY,icon:'🔏'},
 {id:'reports',name:'Research Reports',label:'Domain araştırma raporu ve TXT dışa aktarma',enabled:true,icon:'📊'},
 {id:'proxy-check',name:'Proxy Validator',label:'Yetkili proxy otomatik ve manuel test',enabled:true,icon:'✅'},
 {id:'geo',name:'GeoIP Explorer',label:'Tahmini bölge/ülke sağlayıcı sorgusu',enabled:true,icon:'📍'},...extraCatalog,...intelligenceCatalog,...webIntelligenceCatalog,...comboCatalog,...multiCatalog,...socialCatalog,{id:'web-risks',name:'Web Açık İzleri',label:'SQL hata, debug, form ve politika kanıtları',enabled:true,icon:'🔬'}
] as const;

export type OsintKind=UtilityKind|SocialKind|'web-risks'|MultiKind|'aliases'|ExtraOsintKind|WebIntelligenceKind|IntelligenceKind|ScanKind|'number'|'sms-inbox'|'dns'|'ip'|'url'|'rdap'|'subdomains'|'tls'|'asn'|'cve'|'email'|'hash'|'proxy'|'proxy-check'|'combo-domain'|'combo-ip'|'headers'|'geo'|'usernames'|'github'|'ioc'|'archives'|'mail'|'mail-inbox'|'threat'|'dns-history'|'malware'|'reports'|'metadata';
export type OsintActor={id:string;username:string;avatar?:string|null};
export type OsintResult={qr?:QrArtifact;repositorySearch?:RepositorySearch;apiDirectory?:ApiDirectory;socialProfiles?:SocialProfile[];security?:SecurityAssessment;kind:OsintKind;target:string;title:string;summary:string;items:{name:string;value:string}[];notice:string;profiles?:ProfileObservation[];searchLinks?:{name:string;url:string}[]};
const targetSchema=z.string().trim().min(2).max(250);
const domainPattern=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
export function osintTier(level:number){
 if(level>=40)return {name:'Elite',dailyLimit:150};
 if(level>=20)return {name:'Expert',dailyLimit:75};
 if(level>=10)return {name:'Analyst',dailyLimit:35};
 if(level>=5)return {name:'Researcher',dailyLimit:15};
 return {name:'Starter',dailyLimit:5};
}
export function boosterDailyBonus(m:{premium_since?:string|null}){return m.premium_since&&Number.isFinite(Date.parse(m.premium_since))&&Date.parse(m.premium_since)<=Date.now()?20:0;}
export async function osintQuota(userId:string,verifiedMember?:{premium_since?:string|null}){
 await loadServerSettings();
 const profile=await memberProfile(userId),tier=osintTier(profile.level);
 const boosterBonus=boosterDailyBonus(verifiedMember||await guildMember(userId)),access=await entitlement(userId,tier.dailyLimit+boosterBonus);
 return {xp:profile.xp,level:profile.level,profileFound:profile.profileFound,levelSource:'TurkishPix XP',proxyResultLimit:access.unlimited?null:proxyResultLimit(profile.level),tier:access.unlimited?'Owner':tier.name,...access,baseDailyLimit:tier.dailyLimit,boosterBonus,isBooster:boosterBonus>0,resetTimezone:'Europe/Istanbul'};
}
function domain(input:string){
 const value=input.toLowerCase().replace(/\.$/,'');
 if(!domainPattern.test(value))throw new DomainError('INVALID_DOMAIN','Geçerli bir alan adı girin (örnek: example.com).',400);
 return value;
}
function clean(value:unknown,max=300){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);}
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
 const type=z.enum(osintTools.map(t=>t.id) as [OsintKind,...OsintKind[]]).parse(kind);
 const input=utilityCatalog.some(t=>t.id===type)?z.string().trim().min(type==='qr-code'?1:2).max(1800).parse(target):type==='proxy-live'?z.string().trim().min(2).max(64000).parse(target):comboPresets.some(p=>p.id===type)?z.string().trim().min(2).max(12000).parse(target):type==='metadata'?z.string().trim().min(2).max(700).parse(target):targetSchema.parse(target);
 if(type==='qr-code'||type==='repository-search')validateUtility(type,input);
 if(type==='api-directory')parseApiSearch(input);
 if(type==='minecraft-status')parseMinecraftTarget(input);
 if(type==='roblox-username')validateRobloxName(input);
 if(socialCatalog.some(t=>t.id===type))validateSocial(type as SocialKind,input);
 if(type==='web-risks')researchUrl(input);
 if(multiCatalog.some(t=>t.id===type))validateMulti(type as MultiKind,input);
 if(comboPresets.some(p=>p.id===type))parseScan(type as ScanKind,input);
 const webTool=webIntelligenceCatalog.find(t=>t.id===type);if(webTool){if(webTool.input==='url')researchUrl(input);else domain(input);}
 if(intelligenceCatalog.some(t=>t.id===type))validateIntelligence(type as IntelligenceKind,input);
 if(type==='metadata')metadataInspect(input);
 if(extraCatalog.some(t=>t.id===type))validateAdvanced(type as ExtraOsintKind,input);
 if(type==='dns')domain(input);
 if(type==='ip'&&!isIP(input))throw new DomainError('INVALID_IP','Geçerli bir IP adresi girin.',400);
 if(type==='url')urlInspect(input);
 if(['rdap','subdomains','tls','email','archives','dns-history','reports'].includes(type))domain(input);
 if(['asn','geo','threat'].includes(type)&&!isIP(input))throw new DomainError('INVALID_IP','Geçerli IP adresi girin.',400);
 if(type==='cve'&&!/^CVE-\d{4}-\d{4,8}$/i.test(input))throw new DomainError('INVALID_CVE','CVE kimliği gerekli.',400);
 if(['hash','malware'].includes(type)&&!/^[a-f0-9]{64}$/i.test(input))throw new DomainError('INVALID_HASH','SHA-256 özeti gerekli.',400);
 if(type==='headers')researchUrl(input);
 if(type==='usernames'&&!/^[a-z0-9][a-z0-9_.-]{0,38}$/i.test(input))throw new DomainError('INVALID_USERNAME','Geçerli kullanıcı adı gerekli.',400);
 if(type==='proxy')parseProxyFilters(input);
 if(type==='proxy-check'&&!/^(https?|socks4|socks5):\/\/([0-9.]+|\[[0-9a-f:]+\]):\d{1,5}$/i.test(input))throw new DomainError('INVALID_PROXY','protocol://IP:port biçimi gerekli.',400);
 return {kind:type,target:input};
}
export async function osintRun(actor:OsintActor,kind:string,target:unknown,requestId:string,onProgress?:(event:ScanEvent)=>void,delivery:'WEB'|'DISCORD'='DISCORD'){
 await loadServerSettings();
 if(config().demo)throw new DomainError('OSINT_DISABLED','Demo modunda araştırma kapalı.',403);
 if(!/^[a-zA-Z0-9:_-]{10,100}$/.test(requestId))throw new DomainError('INVALID_REQUEST','Geçersiz işlem anahtarı.',400);
 const parsed=validateOsint(kind,target);if(parsed.kind==='aliases')throw new DomainError('ALIAS_PANEL','Alias işlemleri kişisel alias panelinden yapılır.',400);
 const member=await guildMember(actor.id);
 await assertOsintAllowed(actor.id);
 if(!config().owners.includes(actor.id))await rateLimit('osint:'+config().guildId+':'+actor.id,8,60);
 const beforeQuota=await osintQuota(actor.id,member);
 if(!beforeQuota.unlimited&&beforeQuota.remaining!<=0)throw new DomainError('OSINT_QUOTA','Araştırma hakkın doldu. Günlük hak 00:00’da yenilenir; ek hak için owner ile iletişime geç.',429);
 if(['mail','mail-inbox'].includes(parsed.kind))await syncUser(database(),actor);
 const provided=parsed.kind==='qr-code'?await generateQr(parsed.target)
  :parsed.kind==='repository-search'?await searchRepositories(parsed.target)
  :parsed.kind==='api-directory'?await searchApiDirectory(parsed.target)
  :parsed.kind==='roblox-username'?await robloxUsername(parsed.target)
  :parsed.kind==='minecraft-status'?await minecraftStatus(parsed.target)
  :parsed.kind==='proxy-live'?await liveProxyReport(parsed.target,beforeQuota.unlimited?null:10)
  :socialCatalog.some(t=>t.id===parsed.kind)?await socialResearch(parsed.kind as SocialKind,parsed.target)
  :parsed.kind==='web-risks'?await webRiskReport(parsed.target)
  :multiCatalog.some(t=>t.id===parsed.kind)?await multiResearch(parsed.kind as MultiKind,parsed.target)
  :comboPresets.some(p=>p.id===parsed.kind)?await runScan(parsed.kind as ScanKind,parsed.target,onProgress,actor.id)
  :webIntelligenceCatalog.some(t=>t.id===parsed.kind)?await webIntelligenceResearch(parsed.kind as WebIntelligenceKind,parsed.target)
  :intelligenceCatalog.some(t=>t.id===parsed.kind)?await intelligenceResearch(parsed.kind as IntelligenceKind,parsed.target)
  :extraCatalog.some(t=>t.id===parsed.kind)?await advancedResearch(parsed.kind as ExtraOsintKind,parsed.target)
  :parsed.kind==='number'?await temporaryNumber(actor.id)
  :parsed.kind==='sms-inbox'?await temporarySmsInbox(actor.id)
  :parsed.kind==='metadata'?metadataInspect(parsed.target)
  :parsed.kind==='dns-history'?await lookupDnsHistory(parsed.target)
  :parsed.kind==='reports'?await domainCombo(parsed.target)
  :parsed.kind==='url'?await lookupUrlHistory(parsed.target,urlInspect(parsed.target))
  :parsed.kind==='ip'?await ipCombo(parsed.target)
  :parsed.kind==='dns'?await lookupDns(parsed.target)
  :parsed.kind==='headers'?await lookupHeaders(parsed.target)
  :parsed.kind==='geo'?await lookupGeo(parsed.target)
  :parsed.kind==='usernames'?await lookupWideUsername(parsed.target,onProgress)
  :parsed.kind==='github'?await lookupRepository(parsed.target)
  :parsed.kind==='archives'?await lookupArchives(parsed.target)
  :parsed.kind==='ioc'?normalizeIoc(parsed.target)
  :parsed.kind==='threat'?await lookupThreat(parsed.target)
  :parsed.kind==='mail'?await temporaryMailbox(actor.id,parsed.target)
  :parsed.kind==='mail-inbox'?await temporaryInbox(actor.id)
  :parsed.kind==='rdap'?await lookupRdap(parsed.target)
  :parsed.kind==='subdomains'?await passiveSubdomains(parsed.target)
  :parsed.kind==='tls'?await lookupTls(parsed.target)
  :parsed.kind==='asn'?await lookupAsn(parsed.target)
  :parsed.kind==='cve'?await lookupCve(parsed.target)
  :parsed.kind==='email'?await emailConfiguration(parsed.target)
  :['hash','malware'].includes(parsed.kind)?await lookupMalwareHash(parsed.target)
  :parsed.kind==='proxy'?await lookupProxy(parsed.target,beforeQuota.proxyResultLimit)
  :parsed.kind==='proxy-check'?await lookupProxyCheck(parsed.target):null;
 const result:OsintResult=provided?{...provided,kind:parsed.kind,target:parsed.kind==='qr-code'?'[QR içeriği]':comboPresets.some(p=>p.id===parsed.kind)?parseScan(parsed.kind as ScanKind,parsed.target).target.value:parsed.kind==='proxy'?'Filtreli proxy sorgusu':parsed.kind==='metadata'?'Yerel dosya meta verisi':parsed.kind==='mail'||parsed.kind==='mail-inbox'?'Kişisel geçici e-posta':parsed.target}:urlInspect(parsed.target);
 if(!('security' in result)&&['dns','email','headers','reports','spf','dmarc','dnssec','domain-multi','dns-multi'].includes(parsed.kind)){const host=parsed.kind==='headers'?new URL(parsed.target).hostname:parsed.target;const security=await assessDomainSecurity(host,{web:['headers','reports','domain-multi'].includes(parsed.kind),dns:true,url:parsed.kind==='headers'?parsed.target:undefined});Object.assign(result,{security});result.items.unshift(...securityReport(security).items);}
 if(provided&&'billable' in provided&&provided.billable===false){const reportId=delivery==='WEB'?await transaction(async tx=>{await syncUser(tx,actor);return saveResearchReport(tx,actor.id,requestId,result);}):undefined;return {result,reportId,quota:await osintQuota(actor.id),duplicate:false};}
 const profile=await memberProfile(actor.id),tier=osintTier(profile.level),billingMember=await guildMember(actor.id);
 const fingerprint=createHash('sha256').update(parsed.kind+':'+parsed.target).digest('hex');
 const billing=await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['osint:'+config().guildId+':'+actor.id]);
  await syncUser(tx,actor);
  const consumed=await consumeOsintCredit(tx,actor.id,requestId,parsed.kind,fingerprint,tier.dailyLimit+boosterDailyBonus(billingMember));const reportId=delivery==='WEB'?await saveResearchReport(tx,actor.id,requestId,result):undefined;return {...consumed,reportId};
 });
 return {result,reportId:billing.reportId,quota:await osintQuota(actor.id),duplicate:billing.duplicate};
}
export function proxyResultLimit(level:number){return 10+5*(Number.isSafeInteger(level)&&level>=0?level:0);}

export async function osintCatalog(){const providers=await osintProviderStatus();const keyBindings:Record<string,string>={otx:'otx',greynoise:'greynoise','search-web':'brave','github-mentions':'github-token','ssl-labs':'ssllabs'};return osintTools.map(t=>({...t,enabled:keyBindings[t.id]?providers.some(p=>p.id===keyBindings[t.id]&&p.configured):['number','sms-inbox'].includes(t.id)?providers.some(p=>p.id==='twilio'&&p.configured):['hash','malware'].includes(t.id)?providers.some(p=>['virustotal','malwarebazaar'].includes(p.id)&&p.configured):t.id==='threat'?providers.some(p=>['virustotal','abuseipdb'].includes(p.id)&&p.configured):t.id==='dns-history'?providers.some(p=>p.id==='securitytrails'&&p.configured):t.enabled}));}

function metadataInspect(input:string){
 let raw:unknown;try{raw=JSON.parse(input);}catch{throw new DomainError('INVALID_METADATA','Geçerli dosya meta verisi gerekli.',400);}
 const d=z.object({name:z.string().max(120),size:z.number().int().min(0).max(25*1024*1024),mime:z.string().max(100),sha256:z.string().regex(/^[a-f0-9]{64}$/),magic:z.string().regex(/^[a-f0-9]{0,32}$/),lastModified:z.number().int().min(0).max(8640000000000000)}).parse(raw);
 const signature=d.magic.startsWith('89504e470d0a1a0a')?'PNG':d.magic.startsWith('ffd8ff')?'JPEG':d.magic.startsWith('255044462d')?'PDF':d.magic.startsWith('504b0304')?'ZIP / ZIP tabanlı biçim':d.magic.startsWith('7f454c46')?'ELF':d.magic.startsWith('4d5a')?'MZ / PE adayı':d.magic.startsWith('47494638')?'GIF':'Tanınmış temel imza yok';
 return {title:'Yerel Dosya Meta Verisi',summary:'Dosya tarayıcıda işlendi; sunucuya içerik yüklenmedi.',items:[{name:'Dosya adı',value:d.name},{name:'Boyut',value:d.size+' bayt'},{name:'Tarayıcı MIME beyanı',value:d.mime||'Yok'},{name:'Başlangıç imzası',value:signature+' · '+d.magic},{name:'SHA-256',value:d.sha256},{name:'Yerel değiştirme zamanı',value:new Date(d.lastModified).toISOString()}],notice:'Bu meta veriler tarayıcıdan bildirilir; sunucu içerik doğrulaması veya virüs taraması değildir. Dosya içeriği ve EXIF/GPS verisi sağlayıcılara gönderilmez. Hash raporunu ayrı araçtan araştırabilirsiniz.'};
}
