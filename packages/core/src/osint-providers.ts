import {providerJson,providerFallback,providerKey} from './osint-network';
import {isIP} from 'node:net';
import {resolveTxt} from 'node:dns/promises';
import {DomainError} from './config';

type Row={name:string;value:string};
export type ProviderResult={title:string;summary:string;items:Row[];notice:string};
const pattern=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const clean=(s:unknown,max=300)=>String(s??'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);
function domain(value:string){const d=value.trim().toLowerCase();if(!pattern.test(d))throw new DomainError('BAD_DOMAIN','Geçerli bir alan adı girin.');return d;}
function ip(value:string){if(!isIP(value))throw new DomainError('BAD_IP','Geçerli bir IP girin.');return value;}
export async function fixedJson(url:string,maximum=3000000){
 const host=new URL(url).hostname;
 const id=host==='rdap.org'?'rdap':host==='stat.ripe.net'?'ripe':host==='services.nvd.nist.gov'?'nvd':host==='crt.sh'?'crtsh':host==='cdn.jsdelivr.net'?'proxyscrape':host;
 return providerJson(id,url,maximum);
}
const put=(name:string,value:unknown):Row=>({name,value:clean(value,1200)||'Kayıt yok'});
export async function lookupRdap(target:string):Promise<ProviderResult>{
 const name=domain(target);
 const d=await providerFallback(()=>fixedJson('https://rdap.org/domain/'+encodeURIComponent(name),500000),async()=>{
  const bootstrap=await providerJson('iana-rdap','https://data.iana.org/rdap/dns.json',500000);
  const tld=name.split('.').at(-1),service=bootstrap.services?.find((s:any)=>s[0]?.includes(tld))?.[1]?.[0];
  if(typeof service!=='string'||!service.startsWith('https://')||new URL(service).username||new URL(service).password)throw new DomainError('RDAP_MISSING','Bu alan adı için RDAP operatörü bulunamadı.',404);
  // Operator URLs come only from IANA's official bootstrap, never client input.
  return providerJson('iana-rdap',new URL('domain/'+encodeURIComponent(name),service.endsWith('/')?service:service+'/').href,500000);
 });
 const events=Array.isArray(d.events)?d.events:[];
 return {title:'RDAP · WHOIS',summary:'Kayıt operatöründen gelen RDAP verisi.',items:[put('Alan adı',d.ldhName||name),put('Durum',Array.isArray(d.status)?d.status.join(', '):'-'),put('Kayıt tarihleri',events.slice(0,6).map((e:any)=>clean(e.eventAction)+': '+clean(e.eventDate)).join('\n')),put('Ad sunucuları',Array.isArray(d.nameservers)?d.nameservers.slice(0,8).map((x:any)=>clean(x.ldhName)).join('\n'):'-')],notice:'Sahiplik bilgileri mevzuat gereği gizlenmiş olabilir. Kaynak: RDAP.org/IANA.'};
}
export async function lookupAsn(target:string):Promise<ProviderResult>{
 const address=ip(target);
 const d=await fixedJson('https://stat.ripe.net/data/network-info/data.json?resource='+encodeURIComponent(address),120000);
 return {title:'ASN / BGP Explorer',summary:'RIPE RIS kamuya açık yönlendirme verisi.',items:[put('IP',address),put('Duyurulan prefix',d.data?.prefix),put('ASN',Array.isArray(d.data?.asns)?d.data.asns.join(', '):'-')],notice:'Ağ yönlendirme gözlemi; IP fiziksel konumu değildir. Kaynak: RIPEstat.'};
}
export async function lookupCve(target:string):Promise<ProviderResult>{
 const id=target.toUpperCase();if(!/^CVE-\d{4}-\d{4,8}$/.test(id))throw new DomainError('BAD_CVE','CVE-2024-12345 biçiminde bir kimlik girin.');
 let d:any;try{d=await fixedJson('https://services.nvd.nist.gov/rest/json/cves/2.0?cveId='+id,900000);if(!d.vulnerabilities?.[0]?.cve)throw new DomainError('CVE_MISSING','NVD kaydı bulunamadı.',404);}catch{
  const record=await providerJson('mitre','https://cveawg.mitre.org/api/cve/'+id,900000),cna=record.containers?.cna;
  return {title:'CVE Intelligence',summary:'CVE.org / MITRE alternatif resmî kaydı.',items:[put('CVE',id),put('Durum',record.cveMetadata?.state),put('CVSS',cna?.metrics?.[0]?.cvssV3_1?.baseScore??cna?.metrics?.[0]?.cvssV4_0?.baseScore??'Henüz yok'),put('Yayımlanma',record.cveMetadata?.datePublished),put('Açıklama',cna?.descriptions?.find((x:any)=>x.lang==='en')?.value||'')],notice:'CVE kaydı hedefte zafiyet kanıtı değildir. Kaynak: CVE.org / MITRE; NVD yanıt vermedi.'};
 }
 const c=d.vulnerabilities?.[0]?.cve;if(!c)throw new DomainError('CVE_MISSING','Bu CVE kaydı NVD üzerinde bulunamadı.',404);
 const desc=c.descriptions?.find((x:any)=>x.lang==='en')?.value||'';
 const metrics=c.metrics?.cvssMetricV31||c.metrics?.cvssMetricV30||c.metrics?.cvssMetricV40||[];
 return {title:'CVE Intelligence',summary:'NVD resmî zafiyet kaydı.',items:[put('CVE',id),put('Durum',c.vulnStatus),put('CVSS',metrics[0]?.cvssData?.baseScore??'Henüz yok'),put('Yayımlanma',c.published),put('Açıklama',desc.slice(0,700))],notice:'Bir CVE kaydı, hedef sistemde zafiyet bulunduğunun kanıtı değildir. Kaynak: NVD/NIST.'};
}
export async function lookupCt(target:string,mode:'subdomains'|'tls'):Promise<ProviderResult>{
 const name=domain(target);const q=mode==='subdomains'?'%.'+name:name;
 const d=await fixedJson('https://crt.sh/?q='+encodeURIComponent(q)+'&output=json',4200000);
 if(!Array.isArray(d))throw new DomainError('CT_FORMAT','Sertifika kayıtlarının biçimi desteklenmiyor.',503);
 if(mode==='subdomains'){
  const names=new Set<string>();for(const c of d.slice(0,2000))for(const n of String(c.name_value||'').toLowerCase().split('\n'))if(n.endsWith('.'+name)&&pattern.test(n))names.add(n);
  return {title:'Pasif Subdomain Discovery',summary:names.size+' benzersiz sertifika adı bulundu.',items:[put('Alan adı',name),...([...names].sort().slice(0,300).map((n,i)=>put(String(i+1).padStart(3,'0')+' · CT alt alan adı',n))),...(names.size?[]:[put('CT alt alan adları','Kayıt bulunamadı')])],notice:'En fazla 300 benzersiz ad gösterilir. CT kayıtları tarihî olabilir ve alan adlarının aktif olduğunu göstermez. Kaynak: crt.sh.'};
 }
 const top=d.slice(0,10);
 return {title:'Certificate Transparency',summary:d.length+' sertifika kaydı listelendi.',items:[put('Alan adı',name),put('Sertifika kayıtları',top.map((x:any)=>clean(x.issuer_name,80)+' · '+clean(x.not_before)+' → '+clean(x.not_after)).join('\n')||'Kayıt bulunamadı')],notice:'Bu canlı SSL el sıkışması değil, sertifika şeffaflık geçmişidir. Kaynak: crt.sh.'};
}
export async function lookupEmail(target:string):Promise<ProviderResult>{
 const name=domain(target);
 const get=async(host:string)=>{try{return (await resolveTxt(host)).map(parts=>parts.join('')).slice(0,12);}catch{return [];}};
 const [root,dmarc]=await Promise.all([get(name),get('_dmarc.'+name)]);
 return {title:'Email Security',summary:'Alan adının herkese açık e-posta doğrulama TXT kayıtları.',items:[put('SPF',root.filter(x=>x.startsWith('v=spf1')).join('\n')||'SPF bulunamadı'),put('DMARC',dmarc.filter(x=>x.startsWith('v=DMARC1')).join('\n')||'DMARC bulunamadı')],notice:'SPF/DMARC varlığı tek başına e-posta güvenliğini doğrulamaz.'};
}
export async function lookupHash(target:string):Promise<ProviderResult>{
 if(!/^[a-f0-9]{64}$/i.test(target))throw new DomainError('BAD_HASH','SHA-256 dosya özeti gerekli.');
 const key=await providerKey('virustotal');
 if(!key)throw new DomainError('PROVIDER_KEY_REQUIRED','VirusTotal anahtarı henüz sunucuda yapılandırılmadı.',503);
 let json:any;try{json=await providerJson('virustotal','https://www.virustotal.com/api/v3/files/'+target.toLowerCase(),500000,{headers:{'x-apikey':key}});}catch(e){if(e instanceof DomainError&&e.status===404)return {title:'Hash Reputation',summary:'Dosya özeti bilinmiyor.',items:[put('SHA-256',target)],notice:'Bilinen rapor bulunmaması güvenli olduğu anlamına gelmez.'};throw e;}
 const stats=json.data?.attributes?.last_analysis_stats||{};
 return {title:'Hash Reputation',summary:'VirusTotal geçmiş algılama sonuçları.',items:[put('SHA-256',target),put('Zararlı olarak işaretleyenler',stats.malicious??0),put('Şüpheli',stats.suspicious??0),put('Zararsız',stats.harmless??0)],notice:'Bu dosyanın yüklenerek taranması değildir. VirusTotal şartları ve kota limitleri geçerlidir.'};
}
type Proxy={protocol:string;ip:string;port:number;country_code?:string;anonymity?:string;latency_ms?:number;uptime_percent?:number;last_checked?:number};
let snapshot:{at:number;rows:Proxy[]}|null=null;let pending:Promise<Proxy[]>|null=null;
export async function proxySnapshot(force=false):Promise<Proxy[]>{
 if(!force&&snapshot&&Date.now()-snapshot.at<300000)return snapshot.rows;
 if(pending)return pending;
 pending=(async()=>{
  const d=await providerFallback(()=>fixedJson('https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/all/data.json',6000000),()=>providerJson('proxyscrape-origin','https://raw.githubusercontent.com/proxyscrape/free-proxy-list/main/proxies/all/data.json',6000000));
  if(!Array.isArray(d))throw new DomainError('PROXY_FORMAT','Proxy sağlayıcı listesi beklenen formatta değil.',503);
  const rows=d.filter((p:any)=>p&&['http','https','socks4','socks5'].includes(p.protocol)&&isIP(p.ip)&&Number.isInteger(p.port)&&p.port>0&&p.port<65536);
  snapshot={at:Date.now(),rows};return rows;
 })();
 try{return await pending;}finally{pending=null;}
}
export type ProxyFilters={protocol?:string;country?:string;anonymity?:string;maxLatency?:number;minUptime?:number;limit?:number};
export function parseProxyFilters(input:string):ProxyFilters{
 let data:any;try{data=JSON.parse(input);}catch{throw new DomainError('PROXY_FILTER','Proxy filtreleri geçersiz.');}
 if(typeof data!=='object'||!data||Array.isArray(data))throw new DomainError('PROXY_FILTER','Proxy filtreleri geçersiz.');
 const protocol=String(data.protocol||'all').toLowerCase(),country=String(data.country||'').toUpperCase(),anonymity=String(data.anonymity||'all').toLowerCase();
 if(!['all','http','https','socks4','socks5'].includes(protocol)||country&&!/^[A-Z]{2}$/.test(country)||!['all','elite','anonymous','transparent'].includes(anonymity))throw new DomainError('PROXY_FILTER','Bilinmeyen proxy filtresi.');
 const maxLatency=Number(data.maxLatency??3000),minUptime=Number(data.minUptime??0),limit=Number(data.limit??10);
 if(!Number.isFinite(maxLatency)||maxLatency<100||maxLatency>30000||!Number.isFinite(minUptime)||minUptime<0||minUptime>100||!Number.isInteger(limit)||limit<1||limit>40000)throw new DomainError('PROXY_FILTER','Filtre değerleri sınır dışında.');
 return {protocol,country,anonymity,maxLatency,minUptime,limit};
}
export async function lookupProxy(target:string,levelLimit?:number|null):Promise<ProviderResult>{
 const f=parseProxyFilters(target),list=await proxySnapshot();
 const seen=new Set<string>();
 const entries=list.filter(x=>{
  const key=x.protocol+':'+x.ip+':'+x.port;
  if(seen.has(key))return false;
  const matches=(f.protocol==='all'||x.protocol===f.protocol)&&(!f.country||x.country_code===f.country)&&(f.anonymity==='all'||x.anonymity===f.anonymity)&&Number.isFinite(x.latency_ms)&&Number(x.latency_ms)<=f.maxLatency!&&Number(x.uptime_percent||0)>=f.minUptime!;
  if(matches)seen.add(key);return matches;
 }).sort((a,b)=>Number(a.latency_ms)-Number(b.latency_ms));
 const wanted=levelLimit===null?entries.length:levelLimit??f.limit!,selected=entries.slice(0,wanted);
 return {title:'Proxy Generator',summary:selected.length+' proxy · '+entries.length+' eşleşen kayıt'+(levelLimit===null?' · Owner: sayı sınırı yok':levelLimit!==undefined?' · level hakkın '+wanted:''),items:selected.map((p,i)=>put(String(i+1).padStart(2,'0')+' · '+(p.country_code||'—')+' · '+(p.anonymity||'—'),p.protocol+'://'+(isIP(p.ip)===6?'['+p.ip+']':p.ip)+':'+p.port+' · '+p.latency_ms+'ms · uptime %'+(p.uptime_percent??0))).concat([put('Sağlayıcı listesi',list.length+' kayıt')]),notice:(selected.length<wanted?'Filtrene uyan yeterli kayıt yok; '+wanted+' yerine '+selected.length+' gerçek kayıt gönderildi. ':'')+'Kaynak: ProxyScrape. Durum ve gecikme sağlayıcının son kontrolüne dayanır.'};
}
export async function lookupProxyCheck(target:string):Promise<ProviderResult>{
 const pattern=/^(https?|socks4|socks5):\/\/(\[[0-9a-f:]+\]|[0-9.]+):(\d{1,5})$/i;
 const m=pattern.exec(target);if(!m)throw new DomainError('PROXY_FORMAT','protocol://IP:port biçimi gerekli.');
 const addr=m[2].replace(/^\[|\]$/g,'');if(!isIP(addr)||Number(m[3])<1||Number(m[3])>65535)throw new DomainError('PROXY_FORMAT','Geçersiz IP veya port.');
 const list=await proxySnapshot(true),p=list.find(x=>x.ip===addr&&x.port===Number(m[3])&&x.protocol===m[1].toLowerCase());
 return {title:'Proxy Checker · Sağlayıcı Durumu',summary:p?'Sağlayıcının güncel listesinde bulundu.':'Sağlayıcının güncel listesinde bulunamadı.',items:[put('Proxy',target),put('Sağlayıcı durumu',p?'Güncel listede':'Doğrulanamadı'),put('Ülke',p?.country_code||'-'),put('Gecikme (sağlayıcı)',p?.latency_ms??'-'),put('Son kontrol (sağlayıcı)',p?.last_checked?new Date(p.last_checked*1000).toISOString():'-')],notice:'Yalnızca ProxyScrape havuzuyla karşılaştırma yapılır. Sistem hedef proxyye trafik göndermez; listede yokluğu bozukluk, listede oluşu kesin çalışırlık kanıtı değildir.'};
}
