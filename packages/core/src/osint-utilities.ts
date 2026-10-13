import QRCode from 'qrcode';
import {z} from 'zod';
import {DomainError} from './config';
import {rateLimit} from './auth';
import {providerJson} from './osint-network';
import {repositoryLanguages,repositoryLicenses,type UtilityKind,type RepositoryHit,type RepositorySearch} from './osint-utility-catalog';

const searchSchema=z.object({
 query:z.string().trim().min(2).max(120).regex(/^[\p{L}\p{N} ._+\-]+$/u,'Arama kelimeleri gir; filtreleri ayrı alanlardan seç.'),
 language:z.enum(repositoryLanguages).default('any'),license:z.enum(repositoryLicenses).default('any'),
 minStars:z.number().int().min(0).max(1000000).default(0),sort:z.enum(['stars','updated']).default('stars'),page:z.number().int().min(1).max(50).default(1)
}).strict();
export function parseRepositorySearch(input:string){
 let data:unknown=input.trim().startsWith('{')?null:{query:input};
 if(data===null)try{data=JSON.parse(input);}catch{throw new DomainError('INVALID_SEARCH','Geçerli proje araması gerekli.',400);}
 return searchSchema.parse(data);
}
export function validateUtility(kind:UtilityKind,input:string){
 if(kind==='repository-search')return parseRepositorySearch(input);
 if(!input.trim()||Buffer.byteLength(input,'utf8')>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input))throw new DomainError('INVALID_QR','QR içeriği boş olamaz; en fazla 2000 UTF-8 bayt ve görünür metin kullan.',400);
}
export async function generateQr(input:string){
 validateUtility('qr-code',input);
 const options={errorCorrectionLevel:'M' as const,margin:4,width:1024,color:{dark:'#000000ff',light:'#ffffffff'}};
 const [pngDataUrl,svg]=await Promise.all([QRCode.toDataURL(input,options),QRCode.toString(input,{...options,type:'svg'})]);
 return {title:'QR Kod Üretici',summary:'1024 × 1024 PNG ve ölçeklenebilir SVG hazır.',qr:{pngDataUrl,svg,width:1024},items:[{name:'İçerik',value:input},{name:'Biçim',value:'PNG: 1024 × 1024 · SVG: vektör'},{name:'Kodlama',value:'UTF-8 · M hata düzeltme · 4 modül boş kenar'}],notice:'QR yerel uygulama sunucusunda üretilir; harici QR servisine gönderilmez ve bağlantı açılmaz. QR içine erişim anahtarı/parola koyma. QR, hedefin güvenli olduğunu doğrulamaz.'};
}
const cache=new Map<string,{until:number;result:RepositorySearch}>(),pending=new Map<string,Promise<RepositorySearch>>();
const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
const time=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export async function searchRepositories(input:string){
 const filters=parseRepositorySearch(input),key=JSON.stringify(filters);let result=cache.get(key)?.result;
 if((cache.get(key)?.until||0)>Date.now())result={...result!,cached:true};
 else {
  let work=pending.get(key);
  if(!work){
   work=(async()=>{
    await rateLimit('osint-provider:github-repository-search',8,60);
    const query=filters.query+' in:name,description,readme is:public archived:false fork:false'+(filters.language==='any'?'':' language:'+filters.language)+(filters.license==='any'?'':' license:'+filters.license)+(filters.minStars?' stars:>='+filters.minStars:'');
    const url=new URL('https://api.github.com/search/repositories');url.search=new URLSearchParams({q:query,sort:filters.sort,order:'desc',per_page:'20',page:String(filters.page)}).toString();
    const data=await providerJson('github',url.href,1500000,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    if(!Array.isArray(data.items)||!Number.isSafeInteger(data.total_count)||data.total_count<0)throw new DomainError('PROVIDER_FORMAT','GitHub proje arama yanıtı geçersiz.',503);
    const repositories:RepositoryHit[]=data.items.slice(0,20).flatMap((r:any)=>{
     if(r.private!==false||r.archived||r.fork||typeof r.full_name!=='string'||! /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(r.full_name))return [];
     return [{name:r.full_name,url:'https://github.com/'+r.full_name,description:clean(r.description,500),language:clean(r.language,60)||null,license:r.license?.spdx_id&&r.license.spdx_id!=='NOASSERTION'?clean(r.license.spdx_id,60):null,stars:count(r.stargazers_count),forks:count(r.forks_count),pushedAt:time(r.pushed_at),archived:false,topics:Array.isArray(r.topics)?r.topics.filter((v:unknown)=>typeof v==='string').slice(0,10).map((v:string)=>clean(v,40)):[]}];
    });
    const value:RepositorySearch={query:filters.query,total:data.total_count,page:filters.page,pageSize:20,hasNext:!data.incomplete_results&&filters.page*20<Math.min(data.total_count,1000)&&data.items.length===20,incomplete:!!data.incomplete_results,checkedAt:new Date().toISOString(),cached:false,repositories};
    if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{until:Date.now()+300000,result:value});return value;
   })();pending.set(key,work);
  }
  try{result=await work;}finally{if(pending.get(key)===work)pending.delete(key);}
 }
 return {title:'Açık Kaynak Proje Bulucu',summary:result.repositories.length+' proje gösteriliyor · GitHub eşleşme sayısı: '+result.total+(result.incomplete?' · sonuç eksik':''),repositorySearch:result,items:result.repositories.map(r=>({name:r.name,value:r.url+'\n'+r.description+'\nDil: '+(r.language||'Belirtilmedi')+' · Lisans: '+(r.license||'Algılanmadı; kullanım izni varsayma')+'\nYıldız: '+r.stars+' · Fork: '+r.forks+'\nSon push: '+(r.pushedAt||'Belirtilmedi')})),notice:'GitHub resmî API · '+result.checkedAt+(result.cached?' · 5 dakikalık önbellek':'')+'. Açık depo olması kullanım/dağıtım izni değildir; LICENSE dosyasını ve bağımlılıkları incele. Yıldız sayısı kalite veya güvenlik kanıtı değildir. Kod indirilmez/çalıştırılmaz. Arama en fazla ilk 1000 eşleşmeyle sınırlıdır; hata boş sonuç olarak gösterilmez.'};
}
