import {z} from 'zod';
import {DomainError} from './config';
import {boundedProviderText,providerJson,providerHealth} from './osint-network';
import type {ApiEntry,ApiDirectory} from './osint-utility-catalog';
const source='https://github.com/public-apis/public-apis',raw='https://raw.githubusercontent.com/public-apis/public-apis/master/README.md';
const schema=z.object({category:z.string().trim().max(100).default('all'),query:z.string().trim().max(120).default(''),noAuth:z.boolean().default(false),httpsOnly:z.boolean().default(true),page:z.number().int().min(1).max(200).default(1)}).strict();
const aliases:Record<string,string>={ai:'Machine Learning','yapay zeka':'Machine Learning',finans:'Finance',oyun:'Games & Comics','hava durumu':'Weather','all':'all','tümü':'all'};
export function parseApiSearch(input:string){let data:unknown={category:input};if(input.trim().startsWith('{'))try{data=JSON.parse(input);}catch{throw new DomainError('INVALID_API_SEARCH','Geçerli kategori araması gerekli.',400);}const d=schema.parse(data);return {...d,category:aliases[d.category.toLocaleLowerCase('tr-TR')]||d.category};}
const text=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/`/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
const shellQuote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
const examples:Record<string,string>={
 'open-meteo.com':'https://api.open-meteo.com/v1/forecast?latitude=41.01&longitude=28.97&current=temperature_2m',
 'open.er-api.com':'https://open.er-api.com/v6/latest/TRY',
 'pokeapi.co':'https://pokeapi.co/api/v2/pokemon/pikachu',
 'api.github.com':'https://api.github.com/users/octocat',
 'jsonplaceholder.typicode.com':'https://jsonplaceholder.typicode.com/posts/1'
};
export function parsePublicApiReadme(markdown:string):ApiEntry[]{
 let category='';const rows:ApiEntry[]=[],seen=new Set<string>();
 for(const line of markdown.split(/\r?\n/)){
  const heading=/^###\s+(.+?)\s*$/.exec(line);if(heading){category=text(heading[1]);continue;}
  if(!category||!line.startsWith('|'))continue;
  const columns=line.replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(v=>v.trim());if(columns.length<5)continue;
  const link=/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(columns[0]);if(!link)continue;
  let url:URL;try{url=new URL(link[2]);}catch{continue;}if(url.username||url.password||url.port)continue;
  const key=category+'|'+url.href;if(seen.has(key))continue;seen.add(key);
  const endpoint=examples[url.hostname],curlUrl=endpoint||url.href;
  rows.push({name:text(link[1]).slice(0,150),description:text(columns[1]).slice(0,500),category:category.slice(0,100),url:url.href,auth:text(columns[2]).slice(0,80)||'No',https:/^yes$/i.test(columns[3]),cors:text(columns[4]).slice(0,40),curl:curlUrl.startsWith('https:')?"curl --fail --show-error --location --proto '=https' --proto-redir '=https' "+shellQuote(curlUrl):'HTTPS örneği belgelerden seçilmeli.',curlKind:endpoint?'api':'docs'});
  if(rows.length>=5000)break;
 }
 return rows;
}
let cache:{entries:ApiEntry[];until:number;checkedAt:string}|undefined,pending:Promise<typeof cache>|undefined;
async function catalog(){
 if(cache&&cache.until>Date.now())return {...cache,cached:true};
 if(!pending)pending=(async()=>{
  const started=Date.now();let markdown:string;
  try{markdown=await boundedProviderText('public-api-catalog',raw,1500000,{headers:{Accept:'text/plain'}});}
  catch{const d=await providerJson('github','https://api.github.com/repos/public-apis/public-apis/contents/README.md?ref=master',2000000,{headers:{'X-GitHub-Api-Version':'2022-11-28'}});if(d.encoding!=='base64'||typeof d.content!=='string'||d.content.length>2000000)throw new DomainError('API_CATALOG_FORMAT','GitHub katalog içeriği geçersiz.',503);markdown=Buffer.from(d.content,'base64').toString('utf8');}
  const entries=parsePublicApiReadme(markdown);if(!entries.length){await providerHealth('public-api-catalog',false,'FORMAT',Date.now()-started);throw new DomainError('API_CATALOG_FORMAT','API kataloğunun tablo biçimi değişmiş; boş sonuç üretilmedi.',503);}await providerHealth('public-api-catalog',true,'',Date.now()-started);return cache={entries,until:Date.now()+21600000,checkedAt:new Date().toISOString()};
 })();
 const work=pending;try{const value=await work;return {...value!,cached:false};}finally{if(pending===work)pending=undefined;}
}
export async function searchApiDirectory(input:string){
 const filters=parseApiSearch(input),data=await catalog(),categories=[...new Set(data.entries.map(x=>x.category))].sort(),category=categories.find(x=>x.toLocaleLowerCase('tr-TR')===filters.category.toLocaleLowerCase('tr-TR'));
 if(filters.category!=='all'&&!category)throw new DomainError('API_CATEGORY','Kategori bulunamadı. Tümü / AI / Finans / Oyun / Hava Durumu veya katalogdaki kategori adını seç.',400);
 const query=filters.query.toLocaleLowerCase('tr-TR'),entries=data.entries.filter(e=>(!category||e.category===category)&&(!filters.httpsOnly||e.https&&e.url.startsWith('https:'))&&(!filters.noAuth||e.auth.toLowerCase()==='no')&&(!query||(e.name+' '+e.description).toLocaleLowerCase('tr-TR').includes(query))),offset=(filters.page-1)*20;
 const apiDirectory:ApiDirectory={entries:entries.slice(offset,offset+20),categories,total:entries.length,page:filters.page,hasNext:offset+20<entries.length,source,checkedAt:data.checkedAt,cached:data.cached};
 return {title:'Ücretsiz API Kataloğu',summary:entries.length+' katalog kaydı · '+(category||'Tüm kategoriler'),apiDirectory,items:apiDirectory.entries.map(e=>({name:e.name+' · '+e.category,value:e.description+'\nBelge: '+e.url+'\nKimlik: '+e.auth+' · HTTPS: '+e.https+' · CORS: '+e.cors+'\ncURL ('+(e.curlKind==='api'?'örnek API isteği':'belge sayfasını okur; API çağrısı değildir')+'):\n'+e.curl})),notice:'Kaynak: '+source+' (MIT) · '+data.checkedAt+(data.cached?' · 6 saatlik önbellek':'')+'. Katalog kaydı, API’nin çalıştığı veya tamamen ücretsiz olduğu anlamına gelmez. Kayıt/anahtar, ücretsiz plan kotası ve kullanım koşullarını belge sayfasından kontrol et. Uç noktası bilinmeyen kayıtta cURL yalnız belge sayfasını okur. Katalogdaki API’ler sisteme otomatik bağlı sayılmaz.'};
}
