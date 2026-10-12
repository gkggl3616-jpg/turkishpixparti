import sources from './osint-profile-sources.json';
import {DomainError} from './config';
import {rateLimit} from './auth';
import {providerHealth} from './osint-network';
export type ProfileStatus='FOUND'|'NOT_FOUND'|'CANDIDATE'|'UNVERIFIABLE'|'INVALID_FORMAT'|'NOT_CHECKED';
export type ProfileObservation={platform:string;url:string;source:string;status:ProfileStatus;evidence:string;checkedAt:string};
export type ProfileSource={name:string;url:string;probe:string;method:string;missing:string|string[];regex?:string;claimed?:string;category?:string;match?:string;successCode?:number;missingCode?:number;dataset?:string;protection?:string[]};
const profileSources=sources as ProfileSource[];
type Source=ProfileSource;
export const usernameSources=profileSources;
export const profileProviderId=(name:string)=>'profile:'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();
const adapters:Record<string,{url:string;proof:(d:any,u:string)=>boolean}>={
 GitHub:{url:'https://api.github.com/users/{}',proof:(d,u)=>!!d.id&&same(d.login,u)},
 GitLab:{url:'https://gitlab.com/api/v4/users?username={}',proof:(d,u)=>Array.isArray(d)&&d.some(x=>x.id&&same(x.username,u))},
 Codeberg:{url:'https://codeberg.org/api/v1/users/{}',proof:(d,u)=>!!d.id&&same(d.login,u)},
 BitBucket:{url:'https://api.bitbucket.org/2.0/users/{}',proof:(d,u)=>!!d.uuid&&(same(d.username,u)||same(d.nickname,u))},
 'DEV Community':{url:'https://dev.to/api/users/by_username?url={}',proof:(d,u)=>!!d.id&&same(d.username,u)},
 'Docker Hub':{url:'https://hub.docker.com/v2/users/{}/',proof:(d,u)=>!!(d.id||d.date_joined)&&same(d.username,u)},
 'Hugging Face':{url:'https://huggingface.co/api/users/{}/overview',proof:(d,u)=>!!d._id&&same(d.name,u)},
 Codewars:{url:'https://www.codewars.com/api/v1/users/{}',proof:(d,u)=>!!d.id&&same(d.username,u)},
 Lichess:{url:'https://lichess.org/api/user/{}',proof:(d,u)=>!!d.id&&same(d.username,u)},
 Chess:{url:'https://api.chess.com/pub/player/{}',proof:(d,u)=>!!d.player_id&&same(d.username,u)},
 Bluesky:{url:'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={}.bsky.social',proof:(d,u)=>/^did:/.test(d.did||'')&&same(d.handle,u+'.bsky.social')},
 Scratch:{url:'https://api.scratch.mit.edu/users/{}',proof:(d,u)=>!!d.id&&same(d.username,u)},
 HackerNews:{url:'https://hacker-news.firebaseio.com/v0/user/{}.json',proof:(d,u)=>typeof d?.created==='number'&&d.id===u},
 Keybase:{url:'https://keybase.io/_/api/1.0/user/lookup.json?usernames={}',proof:(d,u)=>d.status?.code===0&&d.them?.some((x:any)=>x.id&&same(x.basics?.username,u))},
 ArtStation:{url:'https://www.artstation.com/users/{}.json',proof:(d,u)=>!!d.id&&same(d.username,u)},
 ...Object.fromEntries(['mastodon.social','mastodon.cloud','mstdn.social'].map(host=>[host,{url:'https://'+host+'/api/v1/accounts/lookup?acct={}',proof:(d:any,u:string)=>!!d.id&&same(d.acct,u)}]))
};
const blocked=/just a moment|checking your browser|verify (?:you are|you're) human|cf-chl-|captcha|access denied|too many requests|temporarily blocked/i;
export function classifyProfile(s:Source,u:string,status:number,body:string,url:string):{status:ProfileStatus;evidence:string}{
 if([401,403,429,451].includes(status)||status>=500||blocked.test(body))return {status:'UNVERIFIABLE',evidence:'Erişim engeli / HTTP '+status};
 if([404,410].includes(status)||s.missingCode===status&&status!==200)return {status:'NOT_FOUND',evidence:'Kaynak HTTP '+status+' döndürdü'};
 if(status<200||status>=300)return {status:'UNVERIFIABLE',evidence:'Yönlendirme / HTTP '+status};
 if(/\/(login|signin|sign_in|auth)([/?#]|$)/i.test(new URL(url).pathname))return {status:'UNVERIFIABLE',evidence:'Giriş sayfasına yönlendirildi'};
 if(s.name==='Anilist'){try{const d=JSON.parse(body);if(d.data?.User?.id)return {status:'FOUND',evidence:'Açık GraphQL User.id'};if(d.errors?.some((x:any)=>x.status===404))return {status:'NOT_FOUND',evidence:'GraphQL kullanıcı bulunamadı'};}catch{}return {status:'UNVERIFIABLE',evidence:'Beklenen GraphQL alanı doğrulanmadı'};}
 const api=adapters[s.name];if(api){try{const d=JSON.parse(body);if(api.proof(d,u))return {status:'FOUND',evidence:'Açık API kimliği ve nick eşleşti'};if(d===null||Array.isArray(d)&&!d.length)return {status:'NOT_FOUND',evidence:'Açık API boş kullanıcı sonucu'};}catch{}return {status:'UNVERIFIABLE',evidence:'API yanıtında tam kullanıcı eşleşmesi yok'};}
 const missing=Array.isArray(s.missing)?s.missing:[s.missing];if(missing.some(m=>m&&body.includes(m)))return {status:'NOT_FOUND',evidence:'Kaynağın kullanıcı bulunamadı işareti'};
 if(s.match&&status===(s.successCode||200)&&body.includes(s.match)&&body.toLowerCase().includes(u.toLowerCase()))return {status:'FOUND',evidence:'WhatsMyName pozitif sayfa işareti ve nick gözlendi; kişi kimliği doğrulanmaz'};
 return {status:'CANDIDATE',evidence:'HTTP 200; profil kimliği ayrıca doğrulanmalı'};
}
const cooldown=new Map<string,number>();
async function boundedBody(r:Response){const reader=r.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let body='',size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>300000)throw Error('RESPONSE_SIZE');body+=decoder.decode(value,{stream:true});}return body+decoder.decode();}finally{await reader.cancel().catch(()=>{});}}
export async function checkUsernameSource(s:Source,u:string):Promise<ProfileObservation>{
 const encoded=encodeURIComponent(u),id=profileProviderId(s.name),started=Date.now(),base={platform:s.name,url:s.url.replaceAll('{}',encoded),source:new URL(adapters[s.name]?.url||s.probe).hostname,checkedAt:new Date().toISOString()};
 if(typeof s.regex==='string'&&s.regex&&!new RegExp(s.regex).test(u))return {...base,status:'INVALID_FORMAT',evidence:'Platformun nick biçimiyle uyumsuz'};
 if((cooldown.get(id)||0)>Date.now())return {...base,status:'UNVERIFIABLE',evidence:'Sağlayıcının bekleme süresi devam ediyor'};
 try{
  await rateLimit('osint-profile:'+id,s.name==='GitHub'?30:12,60);if(s.name==='GitHub')await rateLimit('osint-provider:github-hour',60,3600);
  const init:RequestInit={redirect:'manual',signal:AbortSignal.timeout(4500),headers:{Accept:adapters[s.name]?'application/json':'text/html,application/json;q=0.9','User-Agent':'TurkishPix-Research/2.21 (+https://turkish-osint.up.railway.app)'}};
  let endpoint=(adapters[s.name]?.url||s.probe).replaceAll('{}',encoded);
  if(s.name==='Anilist'){init.method='POST';init.headers={...init.headers,'Content-Type':'application/json'};init.body=JSON.stringify({query:'query($name:String){User(name:$name){id}}',variables:{name:u}});}else if(s.method!=='GET')return {...base,status:'NOT_CHECKED',evidence:'Salt okunur adaptör yok'};
  let r=await fetch(endpoint,init);
  if([301,302,303,307,308].includes(r.status)&&r.headers.get('location')){const next=new URL(r.headers.get('location')!,endpoint);if(next.protocol==='https:'&&next.hostname===new URL(endpoint).hostname&&!next.username&&!next.password){await r.body?.cancel();endpoint=next.href;r=await fetch(endpoint,init);}}
  if(r.status===429||r.status===403&&r.headers.get('x-ratelimit-remaining')==='0'){const raw=r.headers.get('retry-after'),seconds=Number(raw),reset=Number(r.headers.get('x-ratelimit-reset')),delay=raw?Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-Date.now():reset?reset*1000-Date.now():60000;cooldown.set(id,Date.now()+Math.max(1000,Number.isFinite(delay)?delay:60000));}
  const result=classifyProfile(s,u,r.status,await boundedBody(r),endpoint);await providerHealth(id,result.status!=='UNVERIFIABLE',result.status,Date.now()-started);return {...base,...result};
 }catch(e){const code=e instanceof DomainError?e.code:e instanceof Error?e.message:'NETWORK';await providerHealth(id,false,code,Date.now()-started);return {...base,status:'UNVERIFIABLE',evidence:'Kontrol tamamlanamadı: '+code.slice(0,80)};}
}
type WideResult=Awaited<ReturnType<typeof runWide>>;
const cache=new Map<string,{until:number;result:WideResult}>(),inFlight=new Map<string,Promise<WideResult>>();let fetchIdentity=globalThis.fetch;
async function runWide(u:string,onProgress?:(event:any)=>void){
 const profiles:ProfileObservation[]=new Array(profileSources.length);let cursor=0,completed=0;
 await Promise.all(Array.from({length:12},async()=>{for(;;){const i=cursor++;if(i>=profileSources.length)return;const s=profileSources[i];profiles[i]=await checkUsernameSource(s,u);onProgress?.({type:'source-complete',name:s.name,status:profiles[i].status,completed:++completed,total:profileSources.length,at:new Date().toISOString()});}}));
 const count=(s:ProfileStatus)=>profiles.filter(p=>p.status===s).length;
 const searchLinks=[['Google','https://www.google.com/search?q='],['Bing','https://www.bing.com/search?q='],['DuckDuckGo','https://duckduckgo.com/?q='],['Brave','https://search.brave.com/search?q='],['Yandex','https://yandex.com/search/?text=']].map(([name,url])=>({name,url:url+encodeURIComponent('"'+u+'"')}));
 const labels:Record<ProfileStatus,string>={FOUND:'DOĞRULANAN PROFİL',NOT_FOUND:'BULUNAMADI',CANDIDATE:'ADAY BAĞLANTI',UNVERIFIABLE:'DOĞRULANAMADI',INVALID_FORMAT:'BİÇİM UYMUYOR',NOT_CHECKED:'KONTROL EDİLMEDİ'};
 return {title:'Geniş Nick Araştırması',summary:profileSources.length+' platform · '+count('FOUND')+' doğrulanan profil · '+count('CANDIDATE')+' aday · '+count('UNVERIFIABLE')+' erişilemeyen',profiles,searchLinks,items:profiles.map(p=>({name:p.platform+' / '+labels[p.status],value:p.url+'\n'+p.evidence+'\nKaynak: '+p.source+' · '+p.checkedAt})),notice:'Aynı nick aynı kişi demek değildir. Doğrulama yalnızca açık API hesabını gösterir; kişi kimliği doğrulanmaz. HTTP 200 sayfalar adaydır. CAPTCHA ve giriş engelleri aşılmaz. Bütün seçili kaynaklar sorgulanır; 12 eşzamanlı kontrol, 10 dakika önbellek. Arama motoru bağlantıları ek araştırma içindir; sonuçları sunucu tarafından taranmadı. Veri kümesi: WhatsMyName / Micah Hoffman ve katkıda bulunanlar — https://github.com/WebBreacher/WhatsMyName — CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ .' };
}
export async function lookupWideUsername(u:string,onProgress?:(event:any)=>void){
 if(!/^[a-z0-9][a-z0-9_.-]{0,38}$/i.test(u))throw new DomainError('INVALID_USERNAME','Harf, sayı, nokta, tire veya alt çizgi içeren nick gir.',400);
 if(fetchIdentity!==globalThis.fetch){cache.clear();inFlight.clear();cooldown.clear();fetchIdentity=globalThis.fetch;}
 const old=cache.get(u);if(old&&old.until>Date.now())return {...old.result,summary:old.result.summary+' · 10 dk önbelleği'};
 let pending=inFlight.get(u);if(!pending){pending=runWide(u,onProgress).then(result=>{if(cache.size>=120)cache.delete(cache.keys().next().value!);cache.set(u,{until:Date.now()+600000,result});return result;});inFlight.set(u,pending);}try{return await pending;}finally{if(inFlight.get(u)===pending)inFlight.delete(u);}
}
