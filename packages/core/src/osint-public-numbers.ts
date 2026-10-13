import {DomainError} from './config';
import {publicNumberSources,type PublicNumber,type PublicNumberSourceId,type PublicNumberSnapshot} from './osint-public-number-catalog';
const MAX_BYTES=1500000,MAX_NUMBERS=500,TTL=120000;
const rules:Record<PublicNumberSourceId,RegExp>={
 'sms-receive-online.com':/^\/message\/([1-9]\d{7,14})\.html$/,
 'receive-sms.io':/^\/temporary-numbers\/[a-z-]+\/([1-9]\d{7,14})\/$/,
 'sms24.me':/^\/en\/numbers\/([1-9]\d{7,14})\/?$/,
 'anonymsms.com':/^\/number\/([1-9]\d{7,14})\/$/,
 'receive-smss.com':/^\/sms\/([1-9]\d{7,14})\/$/,
 'freephonenum.com':/^\/[a-z]{2}\/receive-sms\/([1-9]\d{6,14})\/?$/,
 'sms-online.co':/^\/receive-free-sms\/([1-9]\d{7,14})\/?$/,
 'receive-sms.cc':/^\/[A-Za-z-]+-Phone-Number\/([1-9]\d{7,14})\/?$/,
 'receive-sms-online.info':/^\/([1-9]\d{7,14})-[A-Za-z-]+\/?$/,
 'receive-sms-free.cc':/^\/Free-[A-Za-z-]+-Phone-Number\/([1-9]\d{7,14})\/$/
};
const callingCodes:Record<string,string>={us:'1',ca:'1',be:'32',nl:'31',gb:'44',uk:'44',fi:'358',se:'46',fr:'33',de:'49',au:'61',pl:'48',es:'34',pt:'351',it:'39',tr:'90',in:'91',cn:'86',ph:'63',ru:'7',id:'62',dk:'45',si:'386',hr:'385',ee:'372',lt:'370',lv:'371',no:'47',at:'43',ch:'41',ie:'353',il:'972',ge:'995',ar:'54',br:'55',mx:'52'};
const prefixes:Record<string,string>={'995':'Gürcistan','972':'İsrail','386':'Slovenya','385':'Hırvatistan','372':'Estonya','371':'Letonya','370':'Litvanya','358':'Finlandiya','353':'İrlanda','351':'Portekiz','90':'Türkiye','91':'Hindistan','86':'Çin','63':'Filipinler','62':'Endonezya','61':'Avustralya','60':'Malezya','55':'Brezilya','54':'Arjantin','52':'Meksika','49':'Almanya','48':'Polonya','47':'Norveç','46':'İsveç','45':'Danimarka','44':'Birleşik Krallık','43':'Avusturya','41':'İsviçre','39':'İtalya','34':'İspanya','33':'Fransa','32':'Belçika','31':'Hollanda','7':'Rusya / Kazakistan','1':'ABD / Kanada / NANP'};
const countryNames=new Intl.DisplayNames(['tr'],{type:'region'});
/** Extract only allowlisted number links. Never read anchor text, JSON scripts, or SMS bodies. */
export function parsePublicNumbers(id:PublicNumberSourceId,html:string){
 const source=publicNumberSources.find(s=>s.id===id);if(!source)throw new DomainError('INVALID_PROVIDER','Desteklenen numara kaynağını seç.',400);
 const base=new URL(source.url),numbers:PublicNumber[]=[],seen=new Set<string>();let truncated=false;
 const markup=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 for(const m of markup.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s"'<>`]+))/gi)){
  const raw=m[1]??m[2]??m[3];if(raw.length>400)continue;
  let url:URL;try{url=new URL(raw.replace(/&amp;/g,'&'),base);}catch{continue;}
  if(url.protocol!=='https:'||url.hostname!==base.hostname||url.username||url.password||url.port||url.search||url.hash)continue;
  const match=url.pathname.match(rules[id]);if(!match)continue;let digits=match[1],country='';
  if(id==='freephonenum.com'){
   const iso=url.pathname.split('/')[1],prefix=callingCodes[iso];if(!prefix)continue;
   // This site's paths use national numbers, including Belgium's 9-digit format.
   if(['us','ca'].includes(iso)&&digits.length===10||iso==='be'&&digits.length===9)digits=prefix+digits;
   else if(!digits.startsWith(prefix))continue;
   country=countryNames.of((iso==='uk'?'gb':iso).toUpperCase())||'';
  }
  if(!/^[1-9]\d{7,14}$/.test(digits)||seen.has(digits))continue;
  if(numbers.length>=MAX_NUMBERS){truncated=true;break;}
  seen.add(digits);country||=Object.entries(prefixes).sort((a,b)=>b[0].length-a[0].length).find(([prefix])=>digits.startsWith(prefix))?.[1]||'Ülke belirlenemedi';
  numbers.push({number:'+'+digits,url:url.href,country,source:id});
 }
 return {numbers,truncated};
}
const cache=new Map<PublicNumberSourceId,PublicNumberSnapshot>(),pending=new Map<PublicNumberSourceId,Promise<PublicNumberSnapshot>>();
let active=0;const queue:(()=>void)[]=[];
async function slot<T>(fn:()=>Promise<T>){if(active>=3)await new Promise<void>(resolve=>queue.push(resolve));else active++;try{return await fn();}finally{const next=queue.shift();if(next)next();else active--;}}
async function readPage(url:string){
 const signal=AbortSignal.timeout(10000);let target=url;const allowedHost=new URL(url).hostname;
 for(let redirect=0;redirect<=2;redirect++){
  const r=await fetch(target,{method:'GET',redirect:'manual',signal,headers:{Accept:'text/html','User-Agent':'TurkishPix-OSINT/2.23 (+https://turkish-osint.up.railway.app)'},cache:'no-store'});
  if([301,302,303,307,308].includes(r.status)){
   const location=r.headers.get('location');await r.body?.cancel();let next:URL;try{next=new URL(location||'',target);}catch{throw new DomainError('REDIRECT','Kaynak yönlendirmesi doğrulanamadı.',503);}
   if(!location||next.protocol!=='https:'||next.hostname!==allowedHost||next.username||next.password||next.port||next.search||next.hash||next.pathname.replace(/\/$/,'')!==new URL(url).pathname.replace(/\/$/,''))throw new DomainError('REDIRECT','Kaynak başka bir adrese yönlendirdi.',503);target=next.href;continue;
  }
  if(!r.ok){await r.body?.cancel();throw new DomainError(r.status===403?'BLOCKED':r.status===429?'RATE_LIMITED':'HTTP_'+r.status,'Kaynak yanıtı alınamadı.',503);}
  if(!/\btext\/html\b/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw new DomainError('FORMAT','Kaynak HTML listesi vermedi.',503);}
  if(Number(r.headers.get('content-length'))>MAX_BYTES){await r.body?.cancel();throw new DomainError('SIZE','Kaynak yanıtı fazla büyük.',503);}
  const reader=r.body?.getReader();if(!reader)throw new DomainError('EMPTY_BODY','Kaynak yanıtı boş.',503);
  const decoder=new TextDecoder();let html='',size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new DomainError('SIZE','Kaynak yanıtı fazla büyük.',503);html+=decoder.decode(value,{stream:true});}return html+decoder.decode();}finally{await reader.cancel().catch(()=>{});}
 }
 throw new DomainError('REDIRECT','Kaynak yönlendirme sınırı aşıldı.',503);
}
export async function publicNumberList(id:string):Promise<PublicNumberSnapshot>{
 const source=publicNumberSources.find(s=>s.id===id);if(!source)throw new DomainError('INVALID_PROVIDER','Desteklenen numara kaynağını seç.',400);
 const old=cache.get(source.id);if(old&&Date.parse(old.nextCheckAt)>Date.now())return old;
 const inflight=pending.get(source.id);if(inflight)return inflight;
 const task=slot(async()=>{
  const started=Date.now();let result:PublicNumberSnapshot;
  try{
   const html=await readPage(source.url);if(/cf-chl-|challenge-platform|<title>\s*(?:Just a moment|Access denied)/i.test(html))throw new DomainError('BLOCKED','Kaynak erişim doğrulaması istiyor.',503);
   const parsed=parsePublicNumbers(source.id,html);
   const checkedAt=new Date().toISOString();result={...source,...parsed,state:parsed.numbers.length?'OK':'EMPTY',code:parsed.numbers.length?'':'NO_NUMBER_LINKS',checkedAt,nextCheckAt:new Date(Date.now()+TTL).toISOString(),latencyMs:Date.now()-started,stale:false,...(parsed.numbers.length?{lastSuccessAt:checkedAt}:{})};
  }catch(e){
   const code=e instanceof DomainError?e.code:'NETWORK';result={...source,state:['BLOCKED','RATE_LIMITED'].includes(code)?'BLOCKED':'ERROR',code,checkedAt:new Date().toISOString(),nextCheckAt:new Date(Date.now()+300000).toISOString(),latencyMs:Date.now()-started,numbers:old?.numbers||[],stale:!!old?.numbers.length,truncated:old?.truncated||false,lastSuccessAt:old?.lastSuccessAt};
  }
  cache.set(source.id,result);return result;
 });pending.set(source.id,task);try{return await task;}finally{pending.delete(source.id);}
}
export async function publicNumberLists(id='all'){
 const sources=id==='all'?await Promise.all(publicNumberSources.map(s=>publicNumberList(s.id))):[await publicNumberList(id)];
 return {sources,refreshSeconds:120,notice:'Herkese açık numara listeleri. Numara sana özel atanmaz; listelenmesi SMS teslimini doğrulamaz. SMS ve doğrulama kodları uygulamaya aktarılmaz.'};
}
