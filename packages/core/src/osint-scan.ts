import {webIntelligenceCatalog,webIntelligenceResearch,type WebIntelligenceKind} from './osint-web-intelligence';
import {isIP} from 'node:net';
import {z} from 'zod';
import {DomainError} from './config';
import {scanModules,detectTarget,comboPresets,type ScanKind,type ScanModule,type TargetType} from './osint-scan-catalog';
import {intelligenceCatalog,intelligenceResearch,type IntelligenceKind} from './osint-intelligence';
import {advancedResearch} from './osint-advanced';
import {extraCatalog,type ExtraOsintKind} from './osint-extra-catalog';
import {lookupDns,researchDomain,researchUrl,publicResearchIp,lookupHeaders,lookupTls,passiveSubdomains,emailConfiguration,lookupGeo,lookupThreat,lookupArchives,lookupDnsHistory,lookupRepository,lookupMalwareHash,publicWeb,headersReport} from './osint-research';
import {lookupRdap,lookupAsn,type ProviderResult} from './osint-providers';
import {lookupWideUsername} from './osint-usernames';
import {osintProviderStatus} from './osint-network';
export type ScanEvent={type:'start'|'module-start'|'module-complete';id?:string;name?:string;total?:number;completed?:number;status?:string;durationMs?:number;code?:string;at:string};
export type ScanSection={id:string;name:string;provider:string;status:'OK'|'ERROR'|'KEY_REQUIRED'|'BUDGET';durationMs:number;checkedAt:string;result?:ProviderResult;error?:string;code?:string};
const schema=z.object({target:z.string().trim().min(2).max(250),modules:z.array(z.string().max(50)).min(1).max(64).optional(),profile:z.enum(['quick','balanced','deep']).default('balanced')}).strict();
export function parseScan(kind:ScanKind,input:string){
 let raw:unknown;try{raw=input.trim().startsWith('{')?JSON.parse(input):{target:input};}catch{throw new DomainError('INVALID_SCAN','Tarama ayarları geçersiz.',400);}
 const parsed=schema.parse(raw),target=detectTarget(parsed.target),preset=comboPresets.find(p=>p.id===kind);if(!preset)throw new DomainError('INVALID_SCAN','Kombo tanımlı değil.',400);
 if(!(preset.inputs as readonly TargetType[]).includes(target.type))throw new DomainError('SCAN_TARGET_TYPE','Bu kombo için '+preset.inputs.join(' / ')+' hedefi gerekli.',400);
 if(target.type==='ip'&&(!isIP(target.value)||!publicResearchIp(target.value)))throw new DomainError('INVALID_PUBLIC_IP','Genel IP gerekli.',400);
 if(['domain','email'].includes(target.type))researchDomain(target.domain!);if(target.type==='url')researchUrl(target.value);
 if(target.type==='username'&&!/^[a-z0-9][a-z0-9_.-]{0,38}$/i.test(target.value))throw new DomainError('INVALID_USERNAME','Geçerli kullanıcı adı gerekli.',400);
 const available=scanModules.filter(m=>m.inputs.includes(target.type));
 const defaults=(preset.modules as readonly string[]).filter(id=>available.some(m=>m.id===id));
 const selected=[...new Set(parsed.modules||((kind==='scan'||!defaults.length)?available.map(m=>m.id):defaults))];
 if(!selected.length||selected.some(id=>!available.some(m=>m.id===id)))throw new DomainError('SCAN_MODULE_MISMATCH','Hedefe uygun araştırma modüllerini seç.',400);
 return {target,selected,profile:parsed.profile,preset};
}
export async function executeModule(m:ScanModule,detected:ReturnType<typeof detectTarget>,context?:{head?:Promise<Awaited<ReturnType<typeof publicWeb>>>}):Promise<ProviderResult>{
 const d=detected.domain||detected.value,u=detected.type==='url'?detected.value:'https://'+d,ip=detected.value;
 const webTool=webIntelligenceCatalog.find(t=>t.id===m.id);if(webTool)return webIntelligenceResearch(m.id as WebIntelligenceKind,webTool.input==='url'?u:d,webTool.input==='url'?context?.head:undefined);
 if(extraCatalog.some(t=>t.id===m.id)){const def=extraCatalog.find(t=>t.id===m.id)!;if(def.input==='url'&&context?.head&&['csp','hsts','cors','cookies','redirects','cache-policy','tech','web-meta','web-links','web-status'].includes(m.id)){const {analyzeWeb}=await import('./osint-advanced');return analyzeWeb(m.id as ExtraOsintKind,await context.head);}return advancedResearch(m.id as ExtraOsintKind,def.input==='url'?u:d);}
 if(intelligenceCatalog.some(t=>t.id===m.id))return intelligenceResearch(m.id as IntelligenceKind,['gravatar','github-keys','discord-id'].includes(m.id)?detected.value:['otx','url-history','search-web','github-mentions','public-breaches','humans','spf-deep'].includes(m.id)?d:ip);
 switch(m.id){case 'dns':return lookupDns(d);case 'rdap':return lookupRdap(d);case 'subdomains':return passiveSubdomains(d);case 'tls':return lookupTls(d);case 'headers':return context?.head?headersReport(await context.head):lookupHeaders(u);case 'email':return emailConfiguration(d);case 'dns-history':return lookupDnsHistory(d);case 'asn':return lookupAsn(ip);case 'geo':return lookupGeo(ip);case 'threat':return lookupThreat(ip);case 'archives':return lookupArchives(d);case 'usernames':return lookupWideUsername(detected.value);case 'github':return lookupRepository(detected.value);case 'hash':return lookupMalwareHash(detected.value);default:throw new DomainError('UNKNOWN_MODULE','Araştırma modülü tanımlı değil.',400);}
}
export async function runScan(kind:ScanKind,input:string,onProgress?:(event:ScanEvent)=>void){
 const p=parseScan(kind,input),started=Date.now(),budget=p.profile==='quick'?20000:p.profile==='deep'?55000:40000,providers=await osintProviderStatus(),available=(id:string)=>providers.some(s=>s.id===id&&s.configured),configured=(id:string)=>id==='threat'?available('virustotal')||available('abuseipdb'):id==='hash'?available('virustotal')||available('malwarebazaar'):available(id);
 const sections:ScanSection[]=new Array(p.selected.length),emit=(event:Omit<ScanEvent,'at'>)=>onProgress?.({...event,at:new Date().toISOString()});let cursor=0,completed=0;
 emit({type:'start',total:p.selected.length});
 const webModules=['headers','csp','hsts','cors','cookies','redirects','cache-policy','tech','web-meta','web-links','web-status','web-inventory','isolation','waf-signals','method-hints'];
 const context:{head?:Promise<Awaited<ReturnType<typeof publicWeb>>>}={};
 // One shared, bounded public page observation serves all HTTP modules.
 if(p.selected.some(id=>webModules.includes(id))){const useBody=p.selected.some(id=>['tech','web-meta','web-links','web-inventory','waf-signals'].includes(id));context.head=publicWeb(p.target.type==='url'?p.target.value:'https://'+p.target.domain,useBody?'GET':'HEAD');context.head.catch(()=>{});}
 await Promise.all(Array.from({length:4},async()=>{for(;;){const i=cursor++;if(i>=p.selected.length)return;const m=scanModules.find(m=>m.id===p.selected[i])!,t=Date.now();emit({type:'module-start',id:m.id,name:m.name});let section:ScanSection={id:m.id,name:m.name,provider:m.provider,status:'OK',durationMs:0,checkedAt:new Date().toISOString()};
  if(Date.now()-started>=budget)section={...section,status:'BUDGET',error:'Toplam süre bütçesi; bu kaynak sorgulanmadı.',code:'SCAN_BUDGET'};
  else if(m.key&&!configured(m.key))section={...section,status:'KEY_REQUIRED',error:m.provider+' API anahtarı bağlı değil.',code:'PROVIDER_KEY_REQUIRED'};
  else try{section.result=await executeModule(m,p.target,context);}catch(e){section={...section,status:'ERROR',error:e instanceof DomainError?e.message:'Kaynak bağlantısı tamamlanamadı.',code:e instanceof DomainError?e.code:'NETWORK'};}
  section.durationMs=Date.now()-t;sections[i]=section;completed++;emit({type:'module-complete',id:m.id,name:m.name,status:section.status,completed,total:p.selected.length,durationMs:section.durationMs,code:section.code});
 }}));
 const ok=sections.filter(s=>s.status==='OK');if(!ok.length)throw new DomainError('COMBO_UNAVAILABLE','Seçilen kaynaklar sonuç vermedi; sorgu hakkı harcanmadı.',503);
 const items=sections.flatMap(s=>s.result?[{name:s.name+' / Özet',value:s.result.summary},...s.result.items.map(r=>({name:s.name+' / '+r.name,value:r.value})),{name:s.name+' / Kaynak',value:s.result.notice}]:[{name:s.name+' / Durum',value:s.error||s.status}]);
 const target=p.target.type==='email'?p.target.domain!:p.target.value;
 return {title:p.preset.name+' · '+target,summary:ok.length+'/'+sections.length+' modül tamamlandı · '+((Date.now()-started)/1000).toFixed(1)+' sn',items,sections,targetType:p.target.type,generatedAt:new Date().toISOString(),durationMs:Date.now()-started,stats:{completed:ok.length,failed:sections.filter(s=>s.status==='ERROR').length,keyRequired:sections.filter(s=>s.status==='KEY_REQUIRED').length,notChecked:sections.filter(s=>s.status==='BUDGET').length,total:sections.length},notice:'Her kombo tek sorgu hakkı kullanır. Hata veya eksik anahtar boş / güvenli sonuç anlamına gelmez. DNS IP’leri CDN veya ortak barındırma olabilir; gerçek origin doğrulanmadı. Tarihî port / CVE eşleşmeleri sömürülebilir zafiyet kanıtı değildir. Web sorguları yalnızca webde gösterilir. Rapor tarayıcıya kaydedildiğinde cihazı kullanan kişilerce erişilebilir.'};
}
