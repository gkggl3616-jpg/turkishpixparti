import {isIP,BlockList} from 'node:net';
import {lookup} from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import {DomainError} from './config';
import {providerJson,providerFallback,boundedProviderText,providerKey,providerHealth} from './osint-network';
import {lookupRdap,lookupAsn,lookupCt,type ProviderResult} from './osint-providers';
const domainPattern=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
export function researchDomain(input:string){const d=input.toLowerCase().trim().replace(/\.$/,'');if(!domainPattern.test(d))throw new DomainError('INVALID_DOMAIN','Geçerli alan adı gerekli (example.com).',400);return d;}
const clean=(v:unknown,n=1600)=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,' ').slice(0,n);
const row=(name:string,value:unknown)=>({name,value:clean(value)||'Kayıt yok'});
export const dnsTypes={A:1,AAAA:28,CNAME:5,MX:15,NS:2,TXT:16,SOA:6,CAA:257} as const;
type DnsRecord={name:string;type:number;TTL:number;data:string};
export type DnsAnswer={status:number;ad:boolean;records:DnsRecord[];provider:string};
const dnsCache=new Map<string,{expires:number;value:DnsAnswer}>();
export async function dnsQuery(name:string,type:keyof typeof dnsTypes):Promise<DnsAnswer>{
 if(!domainPattern.test(name.replace(/^_dmarc\./,'')))throw new DomainError('INVALID_DOMAIN','DNS hedefi geçersiz.',400);
 const key=name+':'+type,old=dnsCache.get(key);if(old&&old.expires>Date.now())return old.value;
 const fetchRecord=async(id:string,url:string)=>{const d=await providerJson(id,url,150000,{headers:{Accept:'application/dns-json'}});if(!Number.isInteger(d.Status)||![0,3].includes(d.Status))throw new DomainError('DNS_FAILED','DNS çözümleyici başarısız yanıt verdi.',503);return {status:d.Status,ad:d.AD===true,records:Array.isArray(d.Answer)?d.Answer.slice(0,80).filter((r:any)=>typeof r.data==='string'&&Number.isInteger(r.type)).map((r:any)=>({name:clean(r.name,253),type:r.type,TTL:Number(r.TTL)||0,data:clean(r.data,1600)})):[],provider:id};};
 const params='name='+encodeURIComponent(name)+'&type='+dnsTypes[type];
 const value=await providerFallback(()=>fetchRecord('cloudflare','https://cloudflare-dns.com/dns-query?'+params),()=>fetchRecord('google-dns','https://dns.google/resolve?'+params));
 if(dnsCache.size>=256)dnsCache.delete(dnsCache.keys().next().value!);dnsCache.set(key,{expires:Date.now()+60000,value});return value;
}
export async function lookupDns(target:string):Promise<ProviderResult>{
 const name=researchDomain(target),types=Object.keys(dnsTypes) as (keyof typeof dnsTypes)[];
 const results=await Promise.allSettled(types.map(t=>dnsQuery(name,t)));
 if(!results.some(r=>r.status==='fulfilled'))throw new DomainError('DNS_FAILED','İki DNS sağlayıcısı da yanıt vermedi.',503);
 const items=types.map((type,i)=>{const r=results[i];return row(type,r.status==='fulfilled'?(r.value.records.filter(x=>x.type===dnsTypes[type]).map(x=>x.data+' · TTL '+x.TTL).join('\n')||(r.value.status===3?'NXDOMAIN — alan adı bulunamadı':'Kayıt yok'))+'\nKaynak: '+r.value.provider:'Çözümlenemedi: '+(r.reason instanceof DomainError?r.reason.code:'NETWORK'));});
 const configured=(t:keyof typeof dnsTypes)=>{const r=results[types.indexOf(t)];return r.status==='fulfilled'?r.value.records.filter(v=>v.type===dnsTypes[t]):null;};
 const warnings:string[]=[];
 if(configured('CAA')?.length===0)warnings.push('CAA gözlenmedi: sertifika otoritesi kısıtı isteğe bağlıdır; eksikliği tek başına zafiyet değildir.');
 if(configured('NS')?.length===1)warnings.push('Tek NS kaydı gözlendi: ad sunucusu yedekliliği incelenebilir. Subdomain delegasyonu farklı olabilir.');
 const ttl=results.flatMap(r=>r.status==='fulfilled'?r.value.records:[]).filter(r=>r.TTL>0&&r.TTL<30);if(ttl.length)warnings.push('30 saniyeden düşük TTL: çözümleyici/otorite yükünü artırabilir; güvenlik açığı değildir.');
 if(configured('A')?.length===0&&configured('AAAA')?.length===0)warnings.push('A/AAAA yanıtında doğrudan IP kaydı gözlenmedi. Web erişimi/alias yapılandırmasını inceleyin.');
 items.push(row('DNS yapılandırma gözlemleri',warnings.join('\n')||'İncelenen kayıtlarda belirgin yapılandırma uyarısı gözlenmedi.'));
 const a=results[0];items.push(row('DNSSEC / doğrulama',a.status==='fulfilled'&&a.value.ad?'Çözümleyici AD=true; bu yanıt doğrulanmış olarak bildirildi.':'AD doğrulaması gözlenmedi; DNSSEC yapılandırmasının eksik olduğuna tek başına kanıt değildir.'));
 return {title:'DNS Intelligence',summary:'A, AAAA, CNAME, MX, NS, TXT, SOA, CAA · alternatif çözümleyicili DNS raporu.',items,notice:'Cloudflare / Google DNS. Kayıt yok, NXDOMAIN ve sağlayıcı hatası ayrı gösterilir. Zaman: '+new Date().toISOString()};
}
const privateV4=new BlockList();for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)privateV4.addSubnet(ip,bits);
const globalV6=new BlockList();globalV6.addSubnet('2000::',3,'ipv6');const reservedV6=new BlockList();for(const [ip,bits] of [['2001:db8::',32],['2001::',32],['2002::',16]] as const)reservedV6.addSubnet(ip,bits,'ipv6');
export function publicResearchIp(ip:string){return isIP(ip)===4?!privateV4.check(ip):isIP(ip)===6?globalV6.check(ip,'ipv6')&&!reservedV6.check(ip,'ipv6'):false;}
export function researchUrl(input:string){let u:URL;try{u=new URL(input);}catch{throw new DomainError('INVALID_URL','HTTP(S) adresi gerekli.',400);}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&u.port!==(u.protocol==='https:'?'443':'80'))throw new DomainError('UNSAFE_URL','Yalnızca kimlik bilgisi içermeyen 80/443 HTTP(S) adresleri kabul edilir.',400);const h=u.hostname.replace(/^\[|\]$/g,'');if(isIP(h)?!publicResearchIp(h):!domainPattern.test(h))throw new DomainError('UNSAFE_URL','Yalnızca genel internet hedefleri kabul edilir.',400);u.hash='';return u;}
export type HeadObservation={url:string;status:number;headers:http.IncomingHttpHeaders;certificate?:{issuer:string;subject:string;validFrom:string;validTo:string;fingerprint:string}};
export async function publicHead(input:string,redirects=0):Promise<HeadObservation>{
 const url=researchUrl(input),host=url.hostname.replace(/^\[|\]$/g,'');
 let addresses:{address:string;family:number}[];
 try{addresses=isIP(host)?[{address:host,family:isIP(host)}]:await Promise.race([lookup(host,{all:true}),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new DomainError('DNS_TIMEOUT','Hedef DNS çözümlemesi zaman aşımına uğradı.',503)),6000);timer.unref();})]);}catch(e){throw e instanceof DomainError?e:new DomainError('PUBLIC_DNS_FAILED','Genel HTTP hedefinin DNS çözümlemesi tamamlanamadı.',503);}
 if(!addresses.length||addresses.some(x=>!publicResearchIp(x.address)))throw new DomainError('UNSAFE_URL','Özel/ayrılmış ağa çözümlenen hedef engellendi.',400);
 const pinned=addresses[0];
 const observed=await new Promise<HeadObservation>((resolve,reject)=>{
  const request=(url.protocol==='https:'?https:http).request(url,{method:'HEAD',family:pinned.family,lookup:((_h:any,_o:any,cb:any)=>cb(null,pinned.address,pinned.family)) as any,signal:AbortSignal.timeout(8000),headers:{'User-Agent':'TurkishPix-Research/2.18 (+https://turkish-osint.up.railway.app)','Accept':'text/html,*/*;q=0.5'}},r=>{
   const c=url.protocol==='https:'?(r.socket as any).getPeerCertificate?.():null;
   const headers: http.IncomingHttpHeaders={};for(const k of ['location','content-type','server','x-powered-by','strict-transport-security','content-security-policy','x-content-type-options','x-frame-options','referrer-policy','permissions-policy','access-control-allow-origin','via','cf-ray','x-cache'])if(r.headers[k]!==undefined)headers[k]=r.headers[k];
   resolve({url:url.href,status:r.statusCode||0,headers,...(c?.valid_to?{certificate:{issuer:clean(c.issuer?.O||c.issuer?.CN),subject:clean(c.subject?.CN),validFrom:clean(c.valid_from),validTo:clean(c.valid_to),fingerprint:clean(c.fingerprint256)}}:{})});r.destroy();
  });request.on('error',()=>reject(new DomainError('HEAD_FAILED','Hedefin genel HTTP(S) başlık bağlantısı tamamlanamadı.',503)));request.end();
 });
 if([301,302,303,307,308].includes(observed.status)&&observed.headers.location){if(redirects>=2)throw new DomainError('TOO_MANY_REDIRECTS','Yönlendirme sınırı aşıldı.',503);return publicHead(new URL(observed.headers.location,observed.url).href,redirects+1);}
 return observed;
}
export function headersReport(head:HeadObservation):ProviderResult{
 const warnings:string[]=[],h=head.headers;
 if(head.url.startsWith('https:')&&!h['strict-transport-security'])warnings.push('HSTS başlığı gözlenmedi.');
 if(String(h['content-type']||'').includes('text/html')&&!h['content-security-policy'])warnings.push('HTML yanıtında CSP gözlenmedi.');
 if(h['x-content-type-options']!=='nosniff')warnings.push('X-Content-Type-Options: nosniff gözlenmedi.');
 if(!h['x-frame-options']&&!/frame-ancestors/i.test(String(h['content-security-policy']||'')))warnings.push('Clickjacking için frame kısıtlaması gözlenmedi.');
 if(head.status>=400)warnings.push('Hedef HTTP '+head.status+' döndürdü; uygulama/engelleme sayfası başlıkları olabilir.');
 return {title:'HTTP / TLS Yapılandırması',summary:'Genel HTTP HEAD yanıtı incelendi; içerik indirilmedi.',items:[row('Son adres',head.url),row('HTTP durum',head.status),row('Sunucu beyanı',h.server),...Object.entries(h).filter(([k])=>!['location','server'].includes(k)).map(([k,v])=>row(k,v)),row('Yapılandırma gözlemleri',warnings.join('\n')||'İncelenen başlıklarda belirgin eksik gözlenmedi.'),...(head.certificate?[row('Canlı TLS sertifikası',head.certificate.subject+' · '+head.certificate.issuer),row('TLS geçerlilik',head.certificate.validFrom+' → '+head.certificate.validTo),row('TLS SHA-256',head.certificate.fingerprint)]:[])],notice:'Başlık eksikliği tek başına sömürülebilir zafiyet veya CVE kanıtı değildir. TLS sertifikası HTTPS bağlantısında doğrulanır. Zaman: '+new Date().toISOString()};
}
export async function lookupHeaders(input:string){return headersReport(await publicHead(input));}
export async function lookupGeo(ip:string):Promise<ProviderResult>{
 if(!isIP(ip))throw new DomainError('INVALID_IP','Geçerli IP gerekli.',400);
 const d=await providerJson('ipwho','https://ipwho.is/'+encodeURIComponent(ip),100000);
 if(d.success===false)throw new DomainError('GEO_MISSING','Bu IP için GeoIP bilgisi bulunamadı.',404);
 return {title:'GeoIP / Operatör',summary:'IPwho.is ağ ve tahmini ülke/bölge kaydı.',items:[row('IP',ip),row('Ülke / bölge',[d.country,d.region,d.city].filter(Boolean).join(' / ')),row('ASN',d.connection?.asn),row('Operatör',d.connection?.isp),row('Ağ organizasyonu',d.connection?.org),row('Saat dilimi',d.timezone?.id)],notice:'IP coğrafi tahmindir; kişinin adresi veya kimliği değildir. VPN/CDN/ağ geçitleri sonucu etkiler. Kaynak: IPwho.is.'};
}
export async function passiveSubdomains(target:string):Promise<ProviderResult>{
 const name=researchDomain(target);
 return providerFallback(()=>lookupCt(name,'subdomains'),async()=>{
  const text=await boundedProviderText('hackertarget','https://api.hackertarget.com/hostsearch/?q='+encodeURIComponent(name),300000);
  if(/API count exceeded|error|API key/i.test(text)){await providerHealth('hackertarget',false,'API_RESPONSE',0);throw new DomainError('SUBDOMAIN_LIMIT','Alternatif alt alan adı sağlayıcısı kota/hata bildirdi.',503);}
  const names=[...new Set(text.split('\n').map(l=>l.split(',')[0].trim().toLowerCase()).filter(n=>domainPattern.test(n)&&(n===name||n.endsWith('.'+name))))];
  return {title:'Pasif Alt Alan Adları',summary:names.length+' kayıt · alternatif sağlayıcı.',items:[row('Alt alan adları',names.slice(0,100).join('\n')||'Kayıt bulunamadı')],notice:'Kaynak: HackerTarget pasif DNS hostsearch. Kayıtların güncel/aktif olması garanti değildir; DNS brute force yapılmaz.'};
 });
}
export async function lookupThreat(ip:string):Promise<ProviderResult>{
 if(!isIP(ip))throw new DomainError('INVALID_IP','Geçerli IP gerekli.',400);
 const vt=await providerKey('virustotal'),abuse=await providerKey('abuseipdb');if(!vt&&!abuse)throw new DomainError('PROVIDER_KEY_REQUIRED','VirusTotal veya AbuseIPDB API anahtarını owner panelinden bağlayın.',503);
 const first=async()=>{if(!vt)throw new DomainError('KEY_REQUIRED','VirusTotal anahtarı yok.',503);const d=await providerJson('virustotal','https://www.virustotal.com/api/v3/ip_addresses/'+encodeURIComponent(ip),500000,{headers:{'x-apikey':vt}}),s=d.data?.attributes?.last_analysis_stats;return {title:'IP Threat Intelligence',summary:'VirusTotal geçmiş itibar raporu.',items:[row('IP',ip),row('Zararlı / şüpheli',String(s?.malicious??0)+' / '+String(s?.suspicious??0)),row('Zararsız / değerlendirilmemiş',String(s?.harmless??0)+' / '+String(s?.undetected??0))],notice:'Geçmiş itibar sonucu kesin güvenlik kararı değildir. Kaynak: VirusTotal.'};};
 return providerFallback(first,async()=>{if(!abuse)throw new DomainError('PROVIDER_UNAVAILABLE','VirusTotal yanıt vermedi; AbuseIPDB alternatif anahtarı eksik.',503);const d=await providerJson('abuseipdb','https://api.abuseipdb.com/api/v2/check?ipAddress='+encodeURIComponent(ip)+'&maxAgeInDays=30',300000,{headers:{Key:abuse}});return {title:'IP Threat Intelligence',summary:'AbuseIPDB alternatif topluluk bildirimleri.',items:[row('IP',ip),row('Abuse confidence',d.data?.abuseConfidenceScore),row('Bildirimler (30 gün)',d.data?.totalReports),row('Son bildirim',d.data?.lastReportedAt)],notice:'Bildirimlerden hesaplanan puan; suç, kimlik veya zararlılık kanıtı değildir. Kaynak: AbuseIPDB.'};});
}
export function combineResearch(title:string,sections:{name:string;result:PromiseSettledResult<ProviderResult>}[]):ProviderResult{
 const available=sections.filter(s=>s.result.status==='fulfilled');
 if(!available.length)throw new DomainError('COMBO_UNAVAILABLE','Araştırma kaynaklarının hiçbiri yanıt vermedi; hak harcanmadı.',503);
 return {title,summary:available.length+'/'+sections.length+' bölüm tamamlandı · '+new Date().toISOString(),items:sections.flatMap(s=>s.result.status==='fulfilled'?[row(s.name+' / Özet',s.result.value.summary),...s.result.value.items.map(r=>({name:s.name+' / '+r.name,value:r.value})),row(s.name+' / Kaynak ve sınırlar',s.result.value.notice)]:[row(s.name+' / Sağlayıcı durumu',s.result.reason instanceof DomainError?s.result.reason.message:'Bağlantı tamamlanamadı')]),notice:'Kısmi sonuçlar kaynak ve UTC gözlem zamanı ile gösterilir. Görünen IP CDN/paylaşımlı hosting olabilir; gerçek backend/origin IP doğrulanmış sayılmaz. Başlık/DNS yapılandırma bulguları, doğrulanmış sömürülebilir zafiyet değildir.'};
}
export async function domainCombo(input:string):Promise<ProviderResult>{
 const name=researchDomain(input);
 const works=[lookupDns(name),lookupRdap(name),passiveSubdomains(name),lookupCt(name,'tls'),lookupHeaders('https://'+name),emailConfiguration(name)];
 const names=['DNS','RDAP','Alt alan adları','Sertifika geçmişi','HTTP / canlı TLS','E-posta güvenliği'];
 if(await providerKey('securitytrails')){works.push(lookupDnsHistory(name));names.push('DNS geçmişi');}
 const results=await Promise.allSettled(works);
 const addresses=await Promise.allSettled([dnsQuery(name,'A'),dnsQuery(name,'AAAA')]);
 const ips=[...new Set(addresses.flatMap(a=>a.status==='fulfilled'?a.value.records.filter(r=>[1,28].includes(r.type)&&isIP(r.data)).map(r=>r.data):[]))].slice(0,3);
 const networks=await Promise.allSettled(ips.map(async ip=>combineResearch(ip,[{name:'ASN',result:(await Promise.allSettled([lookupAsn(ip)]))[0]},{name:'GeoIP',result:(await Promise.allSettled([lookupGeo(ip)]))[0]}])));
 const report=combineResearch('Domain Kombosu · '+name,[...names.map((n,i)=>({name:n,result:results[i]})),...ips.map((ip,i)=>({name:'Görünen IP '+ip,result:networks[i]}))]);
 const head=results[4],cdn=head.status==='fulfilled'?head.value.items.filter(r=>['cf-ray','via','x-cache','Sunucu beyanı'].includes(r.name)&&/cloudflare|cloudfront|akamai|fastly|cdn|cache/i.test(r.value)).map(r=>r.name+': '+r.value):[];
 report.items.unshift(row('Backend / origin IP','Doğrulanmadı. DNS IP’leri CDN/paylaşımlı barındırmaya ait olabilir.'),row('CDN göstergeleri',cdn.length?cdn.join('\n'):'Kesin CDN göstergesi gözlenmedi; bu origin IP tespiti değildir.'));return report;
}
export async function ipCombo(ip:string){if(!isIP(ip))throw new DomainError('INVALID_IP','Geçerli IP gerekli.',400);const jobs=[lookupAsn(ip),lookupGeo(ip)];const names=['ASN / BGP','GeoIP'];if(await providerKey('virustotal')||await providerKey('abuseipdb')){jobs.push(lookupThreat(ip));names.push('İtibar');}const results=await Promise.allSettled(jobs);return combineResearch('IP Kombosu · '+ip,names.map((name,i)=>({name,result:results[i]})));}
export async function emailConfiguration(input:string):Promise<ProviderResult>{
 const name=researchDomain(input),results=await Promise.allSettled([dnsQuery(name,'TXT'),dnsQuery('_dmarc.'+name,'TXT')]);
 const get=(i:number,prefix:string)=>{const r=results[i];return r.status==='fulfilled'?r.value.records.filter(t=>t.type===16).map(t=>t.data.replace(/"/g,'')).filter(t=>t.startsWith(prefix)):null;};
 const spf=get(0,'v=spf1'),dmarc=get(1,'v=DMARC1'),warnings:string[]=[];
 if(spf!==null){if(!spf.length)warnings.push('SPF kaydı gözlenmedi.');if(spf.length>1)warnings.push('Birden fazla SPF kaydı; SPF değerlendirmesinde permerror riski.');if(spf.some(v=>/(?:^|\s)\+all(?:\s|$)/.test(v)))warnings.push('SPF +all herkese izin veriyor.');}
 if(dmarc!==null){if(!dmarc.length)warnings.push('DMARC kaydı gözlenmedi.');if(dmarc.some(v=>/p\s*=\s*none/i.test(v)))warnings.push('DMARC p=none izleme politikası; karantina/reddetme istemez.');}
 if(spf===null&&dmarc===null)throw new DomainError('EMAIL_DNS_FAILED','SPF/DMARC DNS sağlayıcıları yanıt vermedi.',503);
 return {title:'SPF / DMARC',summary:'Açık DNS e-posta doğrulama yapılandırması.',items:[row('SPF',spf===null?'Sağlayıcı hatası':spf.join('\n')||'Kayıt yok'),row('DMARC',dmarc===null?'Sağlayıcı hatası':dmarc.join('\n')||'Kayıt yok'),row('Yapılandırma gözlemleri',warnings.join('\n')||'Belirgin yapılandırma uyarısı gözlenmedi.')],notice:'SPF/DMARC kontrolü gönderici kimliği veya hesap sahipliği araştırması değildir. DKIM selector verilmeden DKIM yok denemez. Kaynak: Cloudflare / Google DNS.'};
}
export async function lookupUsername(username:string):Promise<ProviderResult>{
 if(!/^[a-z0-9][a-z0-9_-]{0,38}$/i.test(username))throw new DomainError('INVALID_USERNAME','Geçerli açık profil kullanıcı adı gerekli.',400);
 const jobs=await Promise.allSettled([providerJson('github','https://api.github.com/users/'+encodeURIComponent(username),200000),providerJson('gitlab','https://gitlab.com/api/v4/users?username='+encodeURIComponent(username),200000)]);
 if(jobs.every(r=>r.status==='rejected'&&!(r.reason instanceof DomainError&&r.reason.status===404)))throw new DomainError('USERNAME_PROVIDERS_UNAVAILABLE','Açık profil sağlayıcıları yanıt vermedi; hak harcanmadı.',503);
 const items=jobs.flatMap((r,i)=>{const platform=i?'GitLab':'GitHub';if(r.status==='rejected')return [row(platform,r.reason instanceof DomainError&&r.reason.status===404?'Açık profil bulunamadı':'Sağlayıcı yanıt vermedi')];const u=i?r.value?.[0]:r.value;return u?[row(platform+' / Profil',u.html_url||u.web_url),row(platform+' / Açık ad',u.name),row(platform+' / Bio',u.bio),row(platform+' / Açık depolar',u.public_repos??'Sağlayıcı vermedi')]:[row(platform,'Açık profil bulunamadı')];});
 return {title:'Açık Kullanıcı Adı Araştırması',summary:'GitHub ve GitLab herkese açık profilleri.',items,notice:'Aynı kullanıcı adı hesapların aynı kişiye ait olduğunu kanıtlamaz. Özel profil, e-posta sızıntısı veya hesap erişimi sorgulanmaz.'};
}
export async function lookupRepository(target:string):Promise<ProviderResult>{
 const name=target.replace(/^https:\/\/github\.com\//,'').replace(/\/$/,'');if(!/^[a-z0-9_.-]{1,100}\/[a-z0-9_.-]{1,100}$/i.test(name)||name.split('/').some(v=>/^\.+$/.test(v)))throw new DomainError('INVALID_REPO','GitHub owner/repo biçimi gerekli.',400);
 const d=await providerJson('github','https://api.github.com/repos/'+name,400000);if(d.private)throw new DomainError('PRIVATE_REPO','Yalnızca açık depolar incelenir.',403);
 return {title:'Repository Intelligence',summary:'GitHub açık depo meta verisi.',items:[row('Depo',d.html_url),row('Açıklama',d.description),row('Dil',d.language),row('Lisans',d.license?.spdx_id),row('Yıldız / fork',d.stargazers_count+' / '+d.forks_count),row('Son push',d.pushed_at),row('Arşivlenmiş',d.archived?'Evet':'Hayır'),row('Açık issue/PR',d.open_issues_count)],notice:'Kaynak: GitHub REST. Kod indirilmedi, sır taraması veya zafiyet doğrulaması yapılmadı.'};
}
export async function lookupArchives(target:string):Promise<ProviderResult>{
 const name=researchDomain(target),d=await providerJson('wayback','https://web.archive.org/cdx/search/cdx?url='+encodeURIComponent(name)+'&matchType=domain&output=json&filter=statuscode:200&collapse=urlkey&fl=timestamp,original,statuscode&limit=30',300000);
 if(!Array.isArray(d))throw new DomainError('ARCHIVE_FORMAT','Arşiv sağlayıcı biçimi beklenmiyor.',503);
 return {title:'Web Archive',summary:'Internet Archive CDX geçmiş indeks kayıtları.',items:d.slice(1,31).map((r:any)=>row(clean(r[0],14),clean(r[1],500))),notice:'Kaynak: Internet Archive. Arşiv indeksidir; eski içerik açılmadı. Tarihî adreslerin hâlen kullanılabildiği garanti değildir.'};
}
export function normalizeIoc(input:string):ProviderResult{
 const value=input.trim().replace(/hxxps/gi,'https').replace(/hxxp/gi,'http').replace(/\[\.\]/g,'.');
 let type='',canonical=value;
 if(isIP(value))type='IP';else if(/^[a-f0-9]{64}$/i.test(value)){type='SHA-256';canonical=value.toLowerCase();}else if(/^[a-f0-9]{40}$/i.test(value)){type='SHA-1';canonical=value.toLowerCase();}else if(/^[a-f0-9]{32}$/i.test(value)){type='MD5';canonical=value.toLowerCase();}else if(domainPattern.test(value)){type='Domain';canonical=value.toLowerCase();}else {const u=researchUrl(value);type='URL';canonical=u.href;}
 return {title:'IOC Normalizer',summary:'Gösterge biçimi doğrulandı ve normalize edildi.',items:[row('Tür',type),row('Normalize gösterge',canonical)],notice:'Yerel sözdizimi kontrolüdür. İtibar/güvenlik değerlendirmesi yapılmadı; hedef açılmadı.'};
}
export async function lookupUrlHistory(input:string,base:ProviderResult):Promise<ProviderResult>{
 const key=await providerKey('urlscan');if(!key)return base;
 const u=new URL(input),hostname=u.hostname.toLowerCase();if(!domainPattern.test(hostname))return base;
 const results=await Promise.allSettled([providerJson('urlscan','https://urlscan.io/api/v1/search/?q='+encodeURIComponent('domain:'+hostname)+'&size=10',600000,{headers:{'api-key':key}})]);
 const result=results[0];const section:PromiseSettledResult<ProviderResult>=result.status==='fulfilled'?{status:'fulfilled',value:{title:'urlscan geçmişi',summary:'Mevcut kamuya açık tarama indeksinden '+(result.value.results?.length||0)+' kayıt.',items:(result.value.results||[]).slice(0,10).map((r:any)=>row(clean(r.task?.time,50),clean(r.page?.domain,253)+' · IP '+clean(r.page?.ip,60)+' · '+clean(r.result,300))),notice:'Kaynak: urlscan.io. Yeni tarama gönderilmedi; mevcut açık indeks okundu. Hedefe ait içerik/kimlik veya güvenlik garantisi değildir.'}}:result;
 return combineResearch('URL Intelligence',[{name:'Biçimsel analiz',result:{status:'fulfilled',value:base}},{name:'urlscan / geçmiş',result:section}]);
}
export async function lookupDnsHistory(input:string):Promise<ProviderResult>{
 const domain=researchDomain(input),key=await providerKey('securitytrails');if(!key)throw new DomainError('PROVIDER_KEY_REQUIRED','DNS geçmişi için SecurityTrails API anahtarını yapılandırın.',503);
 const d=await providerJson('securitytrails','https://api.securitytrails.com/v1/history/'+domain+'/dns/a',500000,{headers:{APIKEY:key}});
 const records=Array.isArray(d.records)?d.records:[];
 return {title:'DNS History / A',summary:records.length+' tarihî A kayıt grubu (ilk sayfa).',items:records.slice(0,30).map((r:any)=>row(clean(r.first_seen,50)+' → '+clean(r.last_seen,50),Array.isArray(r.values)?r.values.map((v:any)=>clean(v.ip||v.ipv6||v.host,253)).join('\n'):'Kayıt biçimi desteklenmiyor')),notice:'Kaynak: SecurityTrails. Tarihî IP’ler mevcut backend/origin IP kanıtı değildir; CDN/paylaşımlı hosting değişmiş olabilir. İlk sayfa, en fazla 30 grup gösterilir.'};
}
export async function lookupMalwareHash(hash:string):Promise<ProviderResult>{
 if(!/^[a-f0-9]{64}$/i.test(hash))throw new DomainError('INVALID_HASH','SHA-256 özeti gerekli.',400);
 const {lookupHash}=await import('./osint-providers');
 return providerFallback(()=>lookupHash(hash),async()=>{
  const key=await providerKey('malwarebazaar');if(!key)throw new DomainError('PROVIDER_KEY_REQUIRED','VirusTotal veya MalwareBazaar anahtarı gerekli.',503);
  const d=await providerJson('malwarebazaar','https://mb-api.abuse.ch/api/v1/',500000,{method:'POST',headers:{'Auth-Key':key,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({query:'get_info',hash:hash.toLowerCase()}).toString()});
  if(!['ok','hash_not_found'].includes(d.query_status))throw new DomainError('MALWARE_API_ERROR','MalwareBazaar sorguyu kabul etmedi.',503);
  const r=d.data?.[0];return {title:'Hash Intelligence',summary:r?'MalwareBazaar geçmiş örnek kaydı bulundu.':'MalwareBazaar bilinen örnek kaydı bulunamadı.',items:[row('SHA-256',hash),row('İmza / aile',r?.signature),row('Dosya türü',r?.file_type),row('İlk / son gözlem',(r?.first_seen||'—')+' / '+(r?.last_seen||'—')),row('Etiketler',r?.tags?.join(', '))],notice:'Kaynak: MalwareBazaar / abuse.ch. Örnek indirilmez, yüklenmez veya çalıştırılmaz; yalnızca hash meta verisi. Kayıt yokluğu güvenli olduğu anlamına gelmez.'};
 });
}

export async function lookupTls(input:string){const name=researchDomain(input);return providerFallback(()=>lookupCt(name,'tls'),async()=>{const report=await lookupHeaders('https://'+name);return {...report,title:'Canlı TLS / HTTP · alternatif',notice:'CT geçmişi yanıt vermedi; genel HTTPS HEAD yanıtındaki canlı TLS/başlık gözlemi gösterilir. '+report.notice};});}
