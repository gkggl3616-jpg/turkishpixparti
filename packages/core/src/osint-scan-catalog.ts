import {socialCatalog,socialCapabilities} from './osint-social-catalog';
import {multiCatalog} from './osint-multi-catalog';
import {webIntelligenceCatalog} from './osint-web-intelligence-catalog';
// Shared browser-safe research definitions. Every module has an explicit input contract.
export type TargetType='domain'|'ip'|'url'|'email'|'username'|'discord'|'repository'|'hash';
export type ScanModule={id:string;name:string;description:string;category:string;inputs:TargetType[];provider:string;key?:string};
const module=(id:string,name:string,description:string,category:string,inputs:TargetType[],provider:string,key?:string):ScanModule=>({id,name,description,category,inputs,provider,key});
export const scanModules:ScanModule[]=[
 module('web-risks','Web açık izleri','SQL hata, debug, stack trace, form ve politika izleri','Web & Güvenlik',['domain','url'],'Genel HTTPS / OWASP'),
 module('web-authorized','Yetkili sınırlı giriş kontrolü','DNS TXT sahiplik ve açık seçim; en fazla iki GET, tek parametre','Web & Güvenlik',['domain','url'],'Doğrulanmış hedef'),
 ...socialCatalog.filter(t=>t.id==='social-all'||socialCapabilities.some(p=>'social-'+p.id===t.id&&p.implemented)).map(t=>module(t.id,t.name,t.label,'Kimlik & Sosyal',t.id==='social-discord'?['username','discord']:['username'],t.id==='social-all'?'11 sosyal API':'Resmî profil API')),
 ...multiCatalog.filter(t=>t.input!=='panel'&&t.id!=='security-score').map(t=>module(t.id,t.name,t.label,t.input==='domain'?'Domain & DNS':'Tehdit & İtibar',(t.input==='domain'?['domain','url','email']:t.input==='cve'?[]:[t.input]) as TargetType[],'Çoklu API')),
 ...webIntelligenceCatalog.map(t=>module(t.id,t.name,t.label,t.group==='web'?'Web & Güvenlik':t.group==='research'?'Arşiv & Kaynaklar':'Domain & DNS',['domain','url'],t.id==='ssl-labs'?'SSL Labs':t.id==='tranco'?'Tranco':t.id==='certspotter'?'CertSpotter':t.id==='green-web'?'Green Web Foundation':t.id==='hsts-preload'?'Chromium preload':'DNS / HTTPS',t.id==='ssl-labs'?'ssllabs':undefined)),
 module('dns','DNS kayıtları','A / AAAA / CNAME / MX / NS / TXT / SOA / CAA','Domain & DNS',['domain','url','email'],'Cloudflare / Google DNS'),
 module('rdap','WHOIS / RDAP','Kayıt olayları, registrar ve nameserver','Domain & DNS',['domain','url','email'],'RDAP / IANA'),
 module('subdomains','Pasif subdomain','CT ve pasif DNS kayıtlarındaki isimler','Domain & DNS',['domain','url','email'],'crt.sh / HackerTarget'),
 module('tls','Sertifika & TLS','CT geçmişi; HTTPS bağlantısı alternatifi','Domain & DNS',['domain','url'],'crt.sh / HTTPS'),
 ...[['dnssec','DNSSEC','DNSKEY / DS ve AD sinyali'],['dns-mx','MX','E-posta sunucuları'],['dns-ns','NS','Yetkili ad sunucuları'],['dns-soa','SOA','Seri, refresh ve retry'],['dns-caa','CAA','Sertifika otoritesi politikası'],['domain-age','Domain zaman çizelgesi','RDAP tarihleri'],['idn','IDN / Punycode','ASCII ve Unicode biçimi']].map(([id,n,d])=>module(id,n,d,'Domain & DNS',['domain','url','email'],id==='domain-age'?'RDAP':'DNS / yerel')),
 module('dns-history','Pasif DNS geçmişi','Tarihî A kayıt grupları','Domain & DNS',['domain','url','email'],'SecurityTrails','securitytrails'),
 module('ip-rdap','IP tahsis / RDAP','Ağ aralığı, kayıt olayları ve kurum','IP & Ağ',['ip'],'RDAP / IANA'),
 module('asn','ASN / prefix','RIPE RIS duyurulan ağ','IP & Ağ',['ip'],'RIPEstat'),
 module('bgp','BGP yönlendirme','Prefix görünürlüğü ve köken ASN','IP & Ağ',['ip'],'RIPEstat'),
 module('rpki','RPKI doğrulama','Gözlenen prefix / ASN için ROA durumu','IP & Ağ',['ip'],'RIPEstat'),
 module('abuse-contact','Abuse / RIR iletişimi','Kayıtlı ağ abuse irtibatı','IP & Ağ',['ip'],'RIPEstat'),
 module('rdns','Reverse DNS','PTR / reverse DNS gözlemi','IP & Ağ',['ip'],'RIPEstat'),
 module('reverse-ip','Reverse IP','Aynı IP ile ilişkilendirilen açık domain kayıtları','IP & Ağ',['ip'],'HackerTarget'),
 module('geo','GeoIP','Tahmini ülke, bölge ve ağ operatörü','IP & Ağ',['ip'],'IPwho.is'),
 module('geo-consensus','Coğrafi konsensüs','Bağımsız kaynaklarda ülke karşılaştırması','IP & Ağ',['ip'],'IPwho.is / GeoJS / country.is'),
 module('cloud-ip','Bulut / CDN aralığı','AWS, Cloudflare ve Google yayımlanan IP listeleri','IP & Ağ',['ip'],'AWS / Cloudflare / Google'),
 module('internetdb','Açık port & CVE indeksi','Shodan geçmiş port / CPE / CVE verisi','Tehdit & İtibar',['ip'],'Shodan InternetDB'),
 module('threat','IP itibarı','Bağlı sağlayıcıların geçmiş itibar raporu','Tehdit & İtibar',['ip'],'VirusTotal / AbuseIPDB','threat'),
 module('otx','OTX tehdit sinyalleri','Açık pulse ilişkileri ve gösterge meta verisi','Tehdit & İtibar',['ip','domain','url','email'],'AlienVault OTX','otx'),
 module('greynoise','GreyNoise','İnternet tarama / RIOT geçmiş sinyali','Tehdit & İtibar',['ip'],'GreyNoise','greynoise'),
 module('public-breaches','Kamuya açıklanmış ihlaller','Domain için yayımlanan ihlal olayları','Tehdit & İtibar',['domain','url','email'],'Have I Been Pwned'),
 module('hash','Dosya hash itibarı','SHA-256 için geçmiş rapor','Tehdit & İtibar',['hash'],'VirusTotal / MalwareBazaar','hash'),
 module('headers','HTTP & canlı TLS','Başlıklar ve doğrulanan TLS sertifikası','Web & Güvenlik',['domain','url'],'Genel HTTPS'),
 ...[['csp','CSP','Kaynak yönergeleri'],['hsts','HSTS','max-age ve preload beyanı'],['cors','CORS','Origin göndermeden yanıt gözlemi'],['cookies','Cookie nitelikleri','Secure / HttpOnly / SameSite; değerler tutulmaz'],['redirects','Yönlendirme zinciri','Sınırlı HTTP yönlendirmeleri'],['cache-policy','Cache politikası','Cache-Control, ETag ve Vary'],['tech','Teknoloji işaretleri','Server ve HTML framework işaretleri'],['web-meta','Sayfa meta verisi','Başlık, description, Open Graph'],['web-links','Açık bağlantı haritası','Tek sayfada ilk 50 HTTP bağlantısı'],['web-status','HTTP durumu','Durum kodu ve MIME']].map(([id,n,d])=>module(id,n,d,'Web & Güvenlik',['domain','url'],'Genel HTTPS')),
 ...[['email','E-posta politikaları','SPF ve DMARC'],['spf','SPF','TXT gönderici politikası'],['spf-deep','SPF include analizi','Sınırlı include / redirect çözümlemesi'],['dmarc','DMARC','p / sp / pct / rua yönergeleri'],['mta-sts','MTA-STS','DNS ve HTTPS taşıma politikası'],['tls-rpt','TLS raporu','SMTP TLS raporlama politikası']].map(([id,n,d])=>module(id,n,d,'E-posta',['domain','url','email'],'Cloudflare / Google DNS')),
 ...[['archives','Wayback URL havuzu','Tarihî CDX URL kayıtları','Internet Archive'],['commoncrawl','Common Crawl','En güncel açık crawl indeksinden adresler','Common Crawl'],['robots','robots.txt','Genel tarayıcı politikası','Genel HTTPS'],['sitemap','Sitemap','İlk 40 kayıtlı URL','Genel HTTPS'],['security-txt','security.txt','Güvenlik iletişimi ve kapsam','Genel HTTPS'],['humans','humans.txt','Yayımlanan ekip / geliştirici beyanları','Genel HTTPS']].map(([id,n,d,p])=>module(id,n,d,'Arşiv & Kaynaklar',['domain','url'],p)),
 module('url-history','urlscan geçmişi','Yeni tarama göndermeden açık indeks','Arşiv & Kaynaklar',['domain','url'],'urlscan.io'),
 module('search-web','Canlı web araması','Domain ile sınırlandırılmış arama sonuçları','Arşiv & Kaynaklar',['domain','url'],'Brave Search','brave'),
 module('github-mentions','Kod deposu referansları','Domain için açık GitHub kod referansları','Arşiv & Kaynaklar',['domain','url'],'GitHub','github-token'),
 module('usernames','Geniş kullanıcı adı araştırması','696 platformda açık profil gözlemleri','Kimlik & Sosyal',['username'],'Açık profil kaynakları'),
 module('github-keys','GitHub anahtar & Gist','Yayımlanmış SSH anahtar parmak izleri, GPG ve Gist meta verisi','Kimlik & Sosyal',['username'],'GitHub REST'),
 module('gravatar','Gravatar profili','Yayımlanmış Gravatar profil meta verisi','Kimlik & Sosyal',['email'],'Gravatar'),
 module('discord-id','Discord Snowflake','Yerel oluşturulma zamanı çözümlemesi','Kimlik & Sosyal',['discord'],'Yerel çözümleme'),
 module('github','Açık depo analizi','Lisans, dil, yıldız, fork ve push zamanı','Kimlik & Sosyal',['repository'],'GitHub REST')
];
export const comboPresets=[
 {id:'combo-domain',name:'Domain Kombosu',inputs:['domain','url'] as TargetType[],modules:['dns','rdap','subdomains','tls','headers','email','resolved-networks','origin-history','mail-gateway','dns-multi','domain-multi']},
 {id:'combo-ip',name:'IP İstihbarat Kombosu',inputs:['ip'] as TargetType[],modules:['ip-rdap','asn','bgp','rpki','abuse-contact','rdns','geo-consensus','internetdb','cloud-ip','reverse-ip','threat','otx','greynoise','ip-multi','geo-multi']},
 {id:'combo-web',name:'Web Güvenlik Kombosu',inputs:['domain','url'] as TargetType[],modules:['headers','csp','hsts','cors','cookies','redirects','cache-policy','tech','web-meta','web-links','web-inventory','isolation','waf-signals','security-details','hsts-preload','tls']},
 {id:'combo-pentest',name:'Web Sızma Testi Ön Değerlendirmesi',inputs:['domain','url'] as TargetType[],modules:['web-risks','web-authorized','headers','csp','cors','cookies','redirects','web-inventory','isolation','waf-signals','method-hints','security-details','tls','dns-multi','domain-multi']},
 {id:'combo-email',name:'E-posta Güvenlik Kombosu',inputs:['domain','email'] as TargetType[],modules:['dns-mx','spf-deep','dmarc','mta-sts','tls-rpt','dnssec','public-breaches','dns-multi']},
 {id:'combo-archive',name:'Arşiv & İz Kombosu',inputs:['domain','url'] as TargetType[],modules:['archives','commoncrawl','url-history','robots','sitemap','humans','tranco','green-web','search-web','github-mentions']},
 {id:'combo-identity',name:'Açık Profil Kombosu',inputs:['username'] as TargetType[],modules:['social-all','usernames','github-keys']},
 {id:'combo-threat',name:'Tehdit İstihbarat Kombosu',inputs:['ip'] as TargetType[],modules:['internetdb','threat','otx','greynoise','ip-rdap','rdns']},
 {id:'scan',name:'OSINT Konsolu',inputs:['domain','ip','url','email','username','discord','repository','hash'] as TargetType[],modules:[]}
] as const;
export const comboCatalog=comboPresets.filter(p=>!['combo-domain','combo-ip'].includes(p.id)).map(p=>({id:p.id,name:p.name,label:'Seçilebilir modüller, canlı işlem kaydı ve ayrıntılı kaynak raporu',icon:'🔬',enabled:true}));
export type ScanKind=(typeof comboPresets)[number]['id'];
export function detectTarget(raw:string):{type:TargetType;value:string;domain?:string}{
 const v=raw.trim();if(/^\d{17,20}$/.test(v))return {type:'discord',value:v};
 if(/^[a-f0-9]{64}$/i.test(v))return {type:'hash',value:v.toLowerCase()};
 if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)||v.includes(':')&&!/^https?:\/\//i.test(v))return {type:'ip',value:v.replace(/^\[|\]$/g,'')};
 if(/^https?:\/\//i.test(v)){const u=new URL(v);return {type:'url',value:u.href,domain:u.hostname};}
 const email=v.match(/^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,63})$/i);if(email)return {type:'email',value:v,domain:email[1].toLowerCase()};
 if(/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(v))return {type:'domain',value:v.toLowerCase(),domain:v.toLowerCase()};
 if(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(v))return {type:'repository',value:v};
 return {type:'username',value:v.replace(/^@/,'')};
}
export function modulesForTarget(raw:string){try{const d=detectTarget(raw);return scanModules.filter(m=>m.inputs.includes(d.type));}catch{return [];}}
