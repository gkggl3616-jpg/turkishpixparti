'use client';

import OsintSocialProfiles,{SocialCapabilities} from './OsintSocialProfiles';
import {socialCatalog,type SocialProfile} from '../../../../packages/core/src/osint-social-catalog';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {webIntelligenceCatalog} from '../../../../packages/core/src/osint-web-intelligence-catalog';
import OsintReportHistory from './OsintReportHistory';
import OsintLiveInbox from './OsintLiveInbox';
import OsintSecurityReport from './OsintSecurityReport';
import type {SecurityAssessment} from '../../../../packages/core/src/osint-security';
import {multiCatalog} from '../../../../packages/core/src/osint-multi-catalog';
import OsintAliases from './OsintAliases';
import OsintProxyWorkbench from './OsintProxyWorkbench';
import OsintWorkbench from './OsintWorkbench';
import {comboPresets} from '../../../../packages/core/src/osint-scan-catalog';
import {intelligenceCatalog} from '../../../../packages/core/src/osint-intelligence-catalog';
import {OSINT_VERSION} from '../../../../packages/core/src/osint-releases';
import '../app/osint/workbench.css';
import ReleaseNotice from './ReleaseNotice';
import UsernameResults from './UsernameResults';
import {extraCatalog} from '../../../../packages/core/src/osint-extra-catalog';
import {RANKS,rankOf,levelProgress} from './osint-levels';
import type {LucideIcon} from 'lucide-react';
import {
 Activity,ArrowRight,ArrowUpRight,Ban,BookOpen,Check,ChevronDown,ChevronRight,
 CircleHelp,Clock3,Copy,Database,ExternalLink,FileSearch,Filter,Fingerprint,
 FolderOpen,Globe2,HardDrive,Hash,Home,KeyRound,Layers3,LockKeyhole,Mail,
 Menu,Network,PanelLeftClose,PanelLeftOpen,Phone,Radio,RefreshCw,Search,
 Server,Shield,ShieldAlert,ShieldCheck,SlidersHorizontal,Terminal,UserRound,
 Wifi,X
} from 'lucide-react';

type Tool={id:string;name:string;label:string;enabled:boolean;icon:string};
type Quota={boosterBonus:number;baseDailyLimit:number;isBooster:boolean;xp:number;level:number;profileFound:boolean;levelSource:string;proxyResultLimit:number|null;tier:string;dailyLimit:number|null;used:number;unlimited:boolean;extraCredits:number;grants:{id:string;remaining:number;expiresAt:string}[];remaining:number|null;resetTimezone:string};
type Member={username:string;id:string;avatar?:string|null;displayName?:string;discordJoinedAt?:string|null;siteJoinedAt?:string|null};
type Result={socialProfiles?:SocialProfile[];security?:SecurityAssessment;profiles?:{platform:string;url:string;source:string;status:string;evidence:string;checkedAt:string}[];searchLinks?:{name:string;url:string}[];kind:string;target:string;title:string;summary:string;notice:string;items:{name:string;value:string}[]};
type Data={authenticated:boolean;me?:Member;csrf?:string;quota?:Quota;tools:Tool[];owner?:boolean;loginUrl?:string;error?:string};

const GROUPS:{id:string;label:string;caption:string;icon:LucideIcon;tools:string[]}[]=[
 {id:'proxy',label:'Proxy & Network',caption:'01 / ROUTING',icon:Network,tools:['proxy','proxy-check']},
 {id:'infrastructure',label:'Altyapı Analizi',caption:'02 / INFRASTRUCTURE',icon:Globe2,tools:['combo-domain','combo-ip','dns','ip','rdap','tls','subdomains','dns-history','asn','email','headers','geo']},
 {id:'threats',label:'Tehdit Araştırması',caption:'03 / INTELLIGENCE',icon:ShieldAlert,tools:['threat','malware','url','cve','hash','ioc']},
 {id:'communication',label:'İletişim & Kimlik',caption:'04 / IDENTITY',icon:Fingerprint,tools:['inbox-hub','mail','mail-inbox','aliases','number','sms-inbox','usernames']},
 {id:'research',label:'Araştırma & Dosyalar',caption:'05 / INVESTIGATION',icon:FolderOpen,tools:['github','archives','metadata','reports']}
];
GROUPS.forEach(g=>g.tools.push(...extraCatalog.filter(t=>t.group===g.id).map(t=>t.id),...intelligenceCatalog.filter(t=>t.group===g.id).map(t=>t.id),...webIntelligenceCatalog.filter(t=>t.group===g.id).map(t=>t.id)));
GROUPS.push({id:'social',label:'Sosyal Profil Araçları',caption:'07 / PUBLIC PROFILES',icon:UserRound,tools:socialCatalog.map(t=>t.id)});
GROUPS.unshift({id:'combos',label:'OSINT Konsolu & Kombolar',caption:'00 / MODULAR RESEARCH',icon:Layers3,tools:comboPresets.map(p=>p.id)});
GROUPS.find(g=>g.id==='infrastructure')!.tools=GROUPS.find(g=>g.id==='infrastructure')!.tools.filter(id=>!['combo-domain','combo-ip'].includes(id));
GROUPS.push({id:'web',label:'Web & Yapılandırma',caption:'06 / WEB OBSERVATION',icon:FileSearch,tools:['web-risks',...extraCatalog.filter(t=>t.group==='web').map(t=>t.id),...webIntelligenceCatalog.filter(t=>t.group==='web').map(t=>t.id)]});
const TOOL_ICONS:Record<string,LucideIcon>={'combo-domain':Globe2,'combo-ip':Radio,'mail-inbox':Mail,dns:Globe2,ip:Radio,url:ShieldCheck,rdap:BookOpen,threat:ShieldAlert,mail:Mail,number:Phone,proxy:Network,malware:Shield, tls:KeyRound,subdomains:Layers3,'dns-history':Clock3,asn:Server,email:Mail,usernames:UserRound,github:Database,archives:FolderOpen,metadata:HardDrive,headers:FileSearch,ioc:Fingerprint,cve:ShieldAlert,hash:Hash,reports:BookOpen,'proxy-check':Wifi,geo:Globe2};
const PLACEHOLDERS:Record<string,string>={
 'dns-history':'example.com',reports:'example.com',malware:'SHA-256 — 64 haneli dosya özeti','combo-domain':'example.com','combo-ip':'1.1.1.1',headers:'https://example.com',geo:'1.1.1.1',threat:'1.1.1.1',usernames:'octocat',github:'owner/repo',archives:'example.com',ioc:'example[.]com',
 dns:'example.com',ip:'8.8.8.8',url:'https://example.com',rdap:'example.com',subdomains:'example.com',
 tls:'example.com',asn:'8.8.8.8',email:'example.com',cve:'CVE-2024-12345',hash:'SHA-256 hash — 64 karakter',
 'proxy-check':'http://1.2.3.4:8080'
};
extraCatalog.forEach(t=>PLACEHOLDERS[t.id]=t.input==='url'?'https://example.com':t.input==='ip'?'1.1.1.1':t.input==='dkim'?'example.com selector':'example.com');
const LABELS:Record<string,string>={
 'combo-domain':'Domain Kombosu','combo-ip':'IP Kombosu','mail-inbox':'Geçici Gelen Kutusu',proxy:'Proxy Generator','proxy-check':'Proxy Checker',dns:'DNS Intelligence',ip:'IP Intelligence',
 rdap:'RDAP / WHOIS',tls:'SSL / Sertifika',subdomains:'Subdomain Discovery','dns-history':'DNS History',
 asn:'ASN / BGP',email:'E-posta Güvenliği',headers:'HTTP Headers',geo:'GeoIP',
 threat:'Threat Intelligence',malware:'Malware Hash Report',url:'URL Analyzer',cve:'CVE Intelligence',
 hash:'Hash Reputation',ioc:'IOC Normalizer',mail:'Temp Mail',number:'Temp Number',
 usernames:'Username Research',github:'GitHub Intelligence',archives:'Web Archives',
 metadata:'File Metadata',reports:'Research Reports'
};
extraCatalog.forEach(t=>LABELS[t.id]=t.name);
webIntelligenceCatalog.forEach(t=>{LABELS[t.id]=t.name;PLACEHOLDERS[t.id]=t.input==='url'?'https://example.com':'example.com';});
intelligenceCatalog.forEach(t=>{LABELS[t.id]=t.name;PLACEHOLDERS[t.id]=t.input==='domain'?'example.com':t.input==='ip'||t.input==='indicator'?'8.8.8.8':t.input==='username'?'octocat':t.input==='email'?'ad@example.com':t.input==='discord'?'1557484052133707896':'İşletme veya yer adı';});
comboPresets.forEach(p=>LABELS[p.id]=p.name);
socialCatalog.forEach(t=>{LABELS[t.id]=t.name;PLACEHOLDERS[t.id]=t.id==='social-discord'?'Snowflake ID veya ortak sunucuda tam kullanıcı adı':t.id==='social-bluesky'?'ad.bsky.social veya did:plc:…':t.id==='social-whatsapp'?'+905xxxxxxxxx':'Kullanıcı adı · destekleniyorsa id:123';});
PLACEHOLDERS['social-bitbucket']='UUID veya Atlassian account_id';
LABELS['web-risks']='Web Açık İzleri';PLACEHOLDERS['web-risks']='https://example.com';
LABELS.aliases='Alias & Yönlendirme';
multiCatalog.forEach(t=>{LABELS[t.id]=t.name;PLACEHOLDERS[t.id]=t.input==='ip'?'8.8.8.8':t.input==='url'?'https://example.com':t.input==='cve'?'CVE-2024-3094':t.input==='hash'?'SHA-256':'example.com';const group=GROUPS.find(g=>g.id===(t.input==='panel'?'communication':t.input==='domain'?'infrastructure':'threats'));if(group&&!group.tools.includes(t.id))group.tools.push(t.id);});
LABELS['sms-inbox']='Kişisel SMS Kutusu';
const dateText=(value?:string|null)=>{if(!value)return 'Kayıt bulunamadı';const d=new Date(value);return Number.isNaN(d.getTime())?'Kayıt bulunamadı':new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'long',year:'numeric',timeZone:'Europe/Istanbul'}).format(d);};
const durationText=(value?:string|null)=>{if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const days=Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));return days===0?'Bugünden beri':days+' gündür';};
const memberAvatar=(m?:Member)=>m?.id&&/^\d{17,20}$/.test(m.id)&&m?.avatar&&/^a?_[a-f0-9]{12,}$|^[a-f0-9]{12,}$/i.test(m.avatar)?'https://cdn.discordapp.com/avatars/'+m.id+'/'+m.avatar+(m.avatar.startsWith('a_')?'.gif':'.png')+'?size=256':null;

function IconOf({id,size=17}:{id:string;size?:number}){const Icon=TOOL_ICONS[id]||Database;return <Icon size={size} strokeWidth={1.7}/>;}

export default function OsintDashboard(){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[page,setPage]=useState('overview');
 const [groups,setGroups]=useState<string[]>(['proxy','infrastructure']),[sidebarCollapsed,setSidebarCollapsed]=useState(false);
 const [mobileOpen,setMobileOpen]=useState(false),[search,setSearch]=useState('');
 const [sourceProgress,setSourceProgress]=useState('');
 const [target,setTarget]=useState(''),[result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [mailName,setMailName]=useState(''),[mailDomain,setMailDomain]=useState(''),[mailReplace,setMailReplace]=useState(false),[mailDomains,setMailDomains]=useState<{domain:string;provider:string}[]>([]);
 const [metadataFile,setMetadataFile]=useState<File|null>(null);
 const [loginError,setLoginError]=useState('');
 const [country,setCountry]=useState(''),[protocol,setProtocol]=useState('all'),[anonymity,setAnonymity]=useState('all'),[latency,setLatency]=useState('3000'),[uptime,setUptime]=useState('0');

 async function load(){
  try{
   const r=await fetch('/api/osint',{cache:'no-store'}),body=await r.json();
   if(!r.ok)throw Error(body.error||'Hesap verileri alınamadı.');
   setData(body);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Sunucuya bağlanılamadı.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{
  const code=new URLSearchParams(window.location.search).get('error');
  if(code){setLoginError(code==='OAUTH_CANCELLED'?'Discord girişini iptal ettin. Yeniden deneyebilirsin.':code==='MEMBERSHIP_PENDING'?'Önce TurkishPix sunucu doğrulamasını tamamla.':'Discord girişi tamamlanamadı. Aynı tarayıcıdan yeniden giriş yap.');}
  const initial=new URLSearchParams(window.location.search).get('tool');if(initial&&['aliases','usernames','proxy','mail','number','combo-domain','web-risks',...socialCatalog.map(t=>t.id),...multiCatalog.map(t=>t.id),...extraCatalog.map(t=>t.id),...intelligenceCatalog.map(t=>t.id),...webIntelligenceCatalog.map(t=>t.id),...comboPresets.map(p=>p.id)].includes(initial))setPage(initial);
  void load();
 },[]);
 useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden&&!busy)void load();},30000);return()=>clearInterval(timer);},[busy]);
 useEffect(()=>{if(page==='mail'&&data?.authenticated)void fetch('/api/osint/mail-domains',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setMailDomains(d.domains);}).catch(e=>setError(e.message));},[page,data?.authenticated]);
 const catalog=data?.tools||[];
 const tool=useMemo(()=>catalog.find(t=>t.id===page),[catalog,page]);
 const toolGroup=GROUPS.find(g=>g.tools.includes(page));
 const rank=rankOf(data?.quota?.level||0);
 const nextRank=RANKS.find(x=>x.level>(data?.quota?.level||0));
 const profile=data?.me;
 const avatar=memberAvatar(profile);
 const xp=data?.quota?.xp||0,level=data?.quota?.level||0;
 const proxyLimit=data?.quota?.unlimited?null:data?.quota?.proxyResultLimit??10+5*level;
 const {nextXp,percent:levelPct}=levelProgress(xp,level);
 const usedPct=data?.quota?Math.min(100,data.quota.unlimited?0:data.quota.used/Math.max(1,data.quota.dailyLimit||1)*100):0;

 const matching=useMemo(()=>catalog.filter(x=>((LABELS[x.id]||x.name)+' '+x.label).toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR').trim())),[catalog,search]);
 function openTool(id:string){setPage(id);setMetadataFile(null);setTarget('');setResult(null);setError('');setMobileOpen(false);window.scrollTo({top:0,behavior:'smooth'});}
 function home(){setPage('overview');setResult(null);setError('');setMobileOpen(false);window.scrollTo({top:0,behavior:'smooth'});}
 function toggleGroup(id:string){setGroups(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
 async function run(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(!data?.authenticated||!data.csrf||!tool?.enabled||busy||(!data.quota?.unlimited&&!data.quota?.remaining))return;
  setBusy(true);setError('');setResult(null);setSourceProgress('');
  try{
   let input=page==='proxy'?JSON.stringify({protocol,country,anonymity,maxLatency:Number(latency),minUptime:Number(uptime),limit:proxyLimit??40000}):page==='mail'?JSON.stringify({localPart:mailName,domain:mailDomain?mailDomain.split('|')[1]:undefined,provider:mailDomain?mailDomain.split('|')[0]:undefined,replace:mailReplace}):['mail-inbox','number','sms-inbox'].includes(page)?'inbox':target;
   if(page==='metadata'){if(!metadataFile)throw Error('Dosya seç.');if(metadataFile.size>25*1024*1024)throw Error('Yerel dosya sınırı 25 MB.');const buffer=await metadataFile.arrayBuffer(),bytes=new Uint8Array(buffer),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');input=JSON.stringify({name:metadataFile.name.slice(0,120),size:metadataFile.size,mime:metadataFile.type.slice(0,100),sha256,magic:[...bytes.slice(0,16)].map(b=>b.toString(16).padStart(2,'0')).join(''),lastModified:metadataFile.lastModified});}
   const r=await fetch('/api/osint/run',{method:'POST',headers:{'Content-Type':'application/json',Accept:page==='usernames'?'application/x-ndjson':'application/json','x-csrf-token':data.csrf},body:JSON.stringify({kind:page,target:input,requestId:crypto.randomUUID()})});
   if(r.ok&&r.headers.get('content-type')?.includes('ndjson')){if(!r.body)throw Error('Kaynak akışı açılamadı.');const reader=r.body.getReader(),decoder=new TextDecoder();let pending='',complete=false;const consume=(line:string)=>{if(!line.trim())return;const d=JSON.parse(line);if(d.type==='error')throw Error(d.error);if(d.type==='result'){setResult(d.result);setData(previous=>previous?{...previous,quota:d.quota}:previous);complete=true;}else if(d.type==='source-complete')setSourceProgress(d.name+' · '+d.status+' · '+d.completed+'/'+d.total);};try{for(;;){const {done,value}=await reader.read();if(done){pending+=decoder.decode();if(pending.trim())consume(pending);break;}pending+=decoder.decode(value,{stream:true});const lines=pending.split('\n');pending=lines.pop()||'';lines.forEach(consume);}}finally{reader.releaseLock();}if(!complete)throw Error('Akış tamamlandı ancak rapor alınamadı.');}else{const body=await r.json();if(!r.ok)throw Error(body.error||'Araştırma tamamlanamadı.');setResult(body.result);setData(previous=>previous?{...previous,quota:body.quota}:previous);}
  }catch(e){setError(e instanceof Error?e.message:'İşlem başarısız.');}
  finally{setBusy(false);}
 }
 const activeCount=catalog.filter(t=>t.enabled).length;
 const resultText=result?result.title+'\n'+result.items.map(x=>x.name+': '+x.value).join('\n')+'\n'+result.notice:'';

 return <div className={'osint-portal'+(sidebarCollapsed?' is-collapsed':'')}>
  {mobileOpen&&<button className="os-mobile-overlay" aria-label="Menüyü kapat" onClick={()=>setMobileOpen(false)}/>}
  <aside className={'os-sidebar'+(mobileOpen?' is-mobile-open':'')}>
   <div className="os-brand">
    <button className="os-brand-mark" onClick={home} title="NEXUS OSINT ana sayfa" aria-label="Ana sayfa"><Network size={24} strokeWidth={1.5}/></button>
    <div className="os-brand-name"><strong>NEXUS<span> / OSINT</span></strong><small>TURKISHPIX INTELLIGENCE</small></div>
    <button className="os-mobile-close" aria-label="Menüyü kapat" onClick={()=>setMobileOpen(false)}><X size={18}/></button>
   </div>

   <div className="os-sidebar-scroll">
    <div className="os-sidebar-label">WORKSPACE</div>
    <button className={'os-nav-home'+(page==='overview'?' is-active':'')} onClick={home} title="Genel Bakış"><Home size={18}/><span>Genel Bakış</span><span className="os-key-index">01</span></button>
    <div className="os-sidebar-label os-nav-label">INTELLIGENCE MODULES</div>
    <div className="os-sidebar-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Araç veya kategori ara" aria-label="Araç ara"/></div>
    <div className="os-nav-groups">{GROUPS.map(g=>{
     const visible=matching.filter(t=>g.tools.includes(t.id));
     if(search.trim()&&!visible.length&&!g.label.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))return null;
     const open=Boolean(search.trim())||groups.includes(g.id);
     const CategoryIcon=g.icon;
     return <section className="os-nav-group" key={g.id}>
      <button className={'os-group-trigger'+(toolGroup?.id===g.id?' has-active':'')} onClick={()=>toggleGroup(g.id)} aria-expanded={open} title={g.label}>
       <CategoryIcon size={18} strokeWidth={1.6}/><span className="os-group-name">{g.label}</span><span className="os-category-count">{visible.length}</span><ChevronDown size={14} className={'os-group-chevron'+(open?' expanded':'')}/>
      </button>
      {open&&<div className="os-group-items">{(search.trim()?visible:catalog.filter(t=>g.tools.includes(t.id))).map(t=>
       <button key={t.id} onClick={()=>openTool(t.id)} className={'os-group-item'+(page===t.id?' is-active':'')} title={LABELS[t.id]||t.name}>
        <span className="os-tool-dot"/><span className="os-group-item-label">{LABELS[t.id]||t.name}</span>{t.enabled?<span className="os-tool-live"/>:<LockKeyhole size={11} className="os-muted-icon"/>}
       </button>)}</div>}
     </section>;
    })}</div>
   </div>
   <div className="os-sidebar-bottom">
    <div className="os-sidebar-rule"/>
    {data?.owner&&<Link className="os-sidebar-action" href="/osint/owner"><Shield size={17}/><span>Owner Denetim Paneli</span><ArrowUpRight size={13}/></Link>}
    <a className="os-sidebar-action" href="https://discord.gg/turkishpix" target="_blank" rel="noreferrer"><ExternalLink size={17}/><span>TurkishPix Discord</span><ArrowUpRight size={13}/></a>
    <div className="os-sidebar-foot"><span className="os-online-dot"/> OSINT CORE <span>v{OSINT_VERSION}</span></div>
   </div>
  </aside>

  <div className="os-main">
   <header className="os-topbar">
    <div className="os-top-left">
     <button className="os-mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Menüyü aç"><Menu size={19}/></button>
     <button className="os-sidebar-toggle" onClick={()=>setSidebarCollapsed(x=>!x)} aria-label={sidebarCollapsed?'Sol menüyü genişlet':'Sol menüyü daralt'}>{sidebarCollapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button>
     <div className="os-breadcrumb"><span>WORKSPACE</span><ChevronRight size={13}/><strong>{page==='overview'?'Genel Bakış':LABELS[page]||tool?.name||'Araç'}</strong></div>
    </div>
    <div className="os-top-right"><span className="os-header-status"><span className="os-online-dot"/> {activeCount} AKTİF MODÜL</span>
     {profile?<button className="os-top-account" onClick={home} aria-label="Operatör profiline dön"><span className="os-top-avatar">{avatar?<img src={avatar} alt=""/>:profile.username.charAt(0).toUpperCase()}</span><span>{profile.displayName||profile.username}</span><ChevronDown size={13}/></button>:<a href="/api/auth/login?return=%2Fosint" className="os-top-signin">Discord ile giriş <ArrowUpRight size={14}/></a>}
    </div>
   </header>

   <div className="os-page-content">
    {loginError&&<div className="os-error" role="alert"><ShieldAlert size={17}/>{loginError}</div>}
    {page==='overview'?<>
     <ReleaseNotice scope="osint"/>

     <section className="os-hero">
      <div className="os-hero-art"><img src="/osint-assets/network-constellation.svg" alt="" aria-hidden="true"/></div>
      <div className="os-hero-content"><span className="os-eyebrow"><span className="os-eyebrow-line"/> INTELLIGENCE OPERATIONS CENTER / 2026</span>
       <h1>Kontrol.<br/><span>Görünürlük.</span> İstihbarat.</h1>
       <p>Halka açık veriyi bağlama dönüştüren araştırma çalışma alanı. Altyapı, ağ, tehdit ve kimlik araştırmalarını tek konsolda yönet.</p>
       <button className="os-primary-action" onClick={()=>openTool('proxy')}><Network size={17}/> Proxy araçlarını aç <ArrowUpRight size={16}/></button>
      </div><div className="os-hero-caption">FIG 01 — DISTRIBUTED SIGNAL MAP</div>
     </section>

     {!data?.authenticated&&!loading&&<section className="os-login-banner"><span className="os-login-icon"><LockKeyhole size={21}/></span><div><strong>Operatör oturumu gerekiyor</strong><p>Discord hesabınla bağlanarak kişisel profilini, XP unvanını ve araştırma konsolunu etkinleştir.</p></div><a href={data?.loginUrl||'/api/auth/login?return=%2Fosint'}>Discord ile giriş <ArrowRight size={16}/></a></section>}

     <div className="os-section-heading"><div><span className="os-kicker">ACCESS CREDENTIALS</span><h2>Operatör profili</h2></div><span className="os-section-note">Kimlik bilgileri Discord hesabınla eşleştirilir</span></div>
     <div className="os-profile-layout">
      <section className="os-profile-card">
       <div className="os-profile-heading"><span><UserRound size={15}/> OPERATOR IDENTITY</span><span className="os-outline-tag">{data?.authenticated?'VERIFIED':'NOT CONNECTED'}</span></div>
       <div className="os-profile-identity">
        <div className="os-avatar">{avatar?<img src={avatar} alt="Discord profil görseli"/>:<UserRound size={42} strokeWidth={1.1}/>}<span className="os-avatar-online"/></div>
        <div className="os-person"><span>DISCORD DISPLAY NAME</span><h3>{loading?'Yükleniyor':profile?.displayName||profile?.username||'Konuk operatör'}</h3><p>{profile?'@'+profile.username:'Henüz oturum açılmadı'}</p><small>ID / {profile?.id||'—'}</small></div>
       </div>
       <div className="os-profile-details">
        <div><span>OSINT SİTESİNE İLK GİRİŞ</span><strong>{dateText(profile?.siteJoinedAt)}</strong><small>{durationText(profile?.siteJoinedAt)||'İlk giriş tarihi doğrulanmadı'}</small></div>
        <div><span>DISCORD SUNUCUSUNA KATILIM</span><strong>{dateText(profile?.discordJoinedAt)}</strong><small>{durationText(profile?.discordJoinedAt)||'Sunucu üyeliği bekleniyor'}</small></div>
       </div>
       <div className="os-profile-note"><ShieldCheck size={15}/> Site üyelik tarihi ilk doğrulanmış OSINT girişinden itibaren tutulur.</div>
      </section>
      <section className="os-rank-card">
       <div className="os-profile-heading"><span><Shield size={15}/> CLEARANCE LEVEL</span><span className="os-outline-tag">XP SYNCED</span></div>
       <div className="os-rank-overview"><div className="os-rank-emblem"><span className="os-rank-diamond"><Shield size={32} strokeWidth={1.15}/></span><span className="os-rank-emblem-number">{level.toString().padStart(2,'0')}</span></div><div><span className="os-kicker">{rank.code} / RANK DESIGNATION</span><h3>{data?.quota?rank.name:'—'}</h3><p>Seviye {data?.quota?.level??'—'} · {xp.toLocaleString('tr-TR')} XP</p></div></div>
       <div className="os-rank-progress-header"><span>BİR SONRAKİ SEVİYE</span><strong>{data?.quota?Math.max(0,nextXp-xp).toLocaleString('tr-TR')+' XP kaldı':'—'}</strong></div>
       <div className="os-track"><div style={{width:(data?.quota?levelPct:0)+'%'}}/></div>
       <div className="os-rank-progress-footer"><span>LVL {level.toString().padStart(2,'0')}</span><span>{data?.quota?xp.toLocaleString('tr-TR')+' / '+nextXp.toLocaleString('tr-TR')+' XP':'Oturum açılmadı'}</span><span>LVL {(level+1).toString().padStart(2,'0')}</span></div>
       <div className="os-next-rank"><span>SONRAKİ UNVAN</span><strong>{nextRank?nextRank.name+' / Seviye '+nextRank.level:'Maksimum unvan: Elit'}</strong></div>
      </section>
     </div>

     <div className="os-section-heading os-ranks-title"><div><span className="os-kicker">OPERATOR PROGRESSION</span><h2>Seviye unvanları</h2></div></div>
     <div className="os-ranks-grid">{RANKS.map((r,i)=><div key={r.level} className={'os-rank-tile'+(rank.level===r.level&&data?.quota?' is-current':'')+(level>=r.level&&data?.quota?' is-reached':'')}>
      <span className="os-rank-tile-index">0{i+1} / {r.code}</span><div className="os-rank-tile-mark"><Shield size={21-i%3} strokeWidth={1.2}/><span>{i+1}</span></div><strong>{r.name}</strong><small>Seviye {r.level}+</small>{rank.level===r.level&&data?.quota&&<span className="os-current-rank">MEVCUT UNVAN</span>}
     </div>)}</div>

     <div className="os-section-heading"><div><span className="os-kicker">DAILY OPERATING QUOTA</span><h2>İşlem kapasitesi</h2></div><span className="os-section-note">Türkiye saatiyle her gün 00:00'da yenilenir</span></div>
     <div className="os-stats-row">
      <div className="os-stat"><span>GÜNLÜK SORGU HAKKI</span><strong>{data?.quota?.unlimited?'Sınırsız':data?.quota?.dailyLimit??'—'}</strong><small>{data?.quota?.unlimited?'Tanımlı owner hesabı':data?.quota?.boosterBonus?'XP kotası +20 booster bonusu':'XP seviyene göre tanımlanır'}</small><div className="os-stat-mark"><Activity size={19}/></div></div>
      <div className="os-stat"><span>KALAN SORGU</span><strong>{data?.quota?.unlimited?'Sınırsız':data?.quota?.remaining??'—'}</strong><small>{data?.quota?data.quota.used+' günlük sorgu · '+data.quota.extraCredits+' ek hak':'Oturum gerekli'}</small><div className="os-stat-mark"><Database size={19}/></div></div>
      <div className="os-stat"><span>SORGUYA AÇIK ARAÇLAR</span><strong>{activeCount.toString().padStart(2,'0')} <em>/ {catalog.length.toString().padStart(2,'0')}</em></strong><small>Bağlantı durumu owner panelinde</small><div className="os-stat-mark"><Layers3 size={19}/></div></div>
      <div className="os-stat"><span>ERİŞİM SINIFI</span><strong className="os-stat-rank">{data?.quota?rank.name:'—'}</strong><small>{data?.quota?.tier||'Discord doğrulaması gerekli'}</small><div className="os-stat-mark"><KeyRound size={19}/></div></div>
     </div>
     <div className="os-quota-track"><span>KULLANIM ORANI</span><div className="os-track"><div style={{width:usedPct+'%'}}/></div><strong>%{Math.round(usedPct)}</strong></div>

     <div className="os-section-heading"><div><span className="os-kicker">DIRECT ACCESS</span><h2>Araştırma merkezleri</h2></div><span className="os-section-note">Modülü seçerek konsolu aç</span></div>
     <div className="os-centers">
      <button className="os-center-card" onClick={()=>openTool('proxy')}><img src="/osint-assets/proxy-mesh.svg" alt="" aria-hidden="true"/><div className="os-center-content"><span>01 / NETWORK ROUTING</span><h3>Proxy Intelligence</h3><p>Proxy generator, filtreleme, son kontrol kayıtları ve ağ altyapısı.</p><div className="os-center-open">Modüle git <ArrowUpRight size={15}/></div></div></button>
      <button className="os-center-card" onClick={()=>openTool('combo-domain')}><img src="/osint-assets/network-constellation.svg" alt="" aria-hidden="true"/><div className="os-center-content"><span>02 / INFRASTRUCTURE</span><h3>Domain & Network</h3><p>DNS, IP, RDAP, ASN, sertifika geçmişi ve pasif alan adı araştırmaları.</p><div className="os-center-open">Modüle git <ArrowUpRight size={15}/></div></div></button>
      <button className="os-center-card" onClick={()=>openTool('cve')}><img src="/osint-assets/threat-matrix.svg" alt="" aria-hidden="true"/><div className="os-center-content"><span>03 / THREAT RESEARCH</span><h3>Threat Intelligence</h3><p>CVE, hash itibarı, URL incelemesi ve güvenlik araştırması.</p><div className="os-center-open">Modüle git <ArrowUpRight size={15}/></div></div></button>
     </div>

     <footer className="os-page-footer">NEXUS OSINT / TURKISHPIX · by@frizz2025 <span>Açık kaynak araştırması ve yetkili genel başlık incelemesi · Sorgu meta verileri 14 güne kadar saklanır.</span></footer>
    </>:
    <section className="os-tool-page">
     <div className="os-tool-banner">
      <img src={toolGroup?.id==='proxy'?'/osint-assets/proxy-mesh.svg':toolGroup?.id==='threats'?'/osint-assets/threat-matrix.svg':'/osint-assets/network-constellation.svg'} alt="" aria-hidden="true"/>
      <div className="os-tool-banner-content"><span className="os-eyebrow"><span className="os-eyebrow-line"/> {toolGroup?.caption||'INTELLIGENCE MODULE'}</span><div className="os-module-icon"><IconOf id={page} size={23}/></div>
       <h1>{LABELS[page]||tool?.name||'Araştırma aracı'}</h1><p>{tool?.label||'Araştırma modülü'} · {tool?.enabled?'Kaynak bağlantısı sorgu sırasında doğrulanır.':'Sağlayıcı anahtarı veya entegrasyon gerekli.'}</p>
       <span className={'os-tool-status'+(tool?.enabled?' is-enabled':'')}>{tool?.enabled?<><span className="os-online-dot"/> SORGUYA AÇIK</>:<><LockKeyhole size={13}/> API GEREKLİ</>}</span>
      </div>
     </div>
     <div className="os-tool-layout">
      <section className="os-query-panel">
       <div className="os-panel-header"><div><span className="os-kicker">SECURE QUERY WORKBENCH</span><h2>Araştırma konsolu</h2></div><Terminal size={20}/></div>
       {page==='report-history'?<OsintReportHistory authenticated={!!data?.authenticated}/>:page==='inbox-hub'?<OsintLiveInbox csrf={data?.csrf} authenticated={!!data?.authenticated}/>:page==='aliases'?<OsintAliases csrf={data?.csrf} authenticated={!!data?.authenticated}/>:page==='proxy-live'?<OsintProxyWorkbench csrf={data?.csrf} authenticated={!!data?.authenticated} remaining={data?.quota?.remaining} unlimited={data?.quota?.unlimited} onQuota={quota=>setData(old=>old?{...old,quota}:old)}/>:comboPresets.some(p=>p.id===page)?<OsintWorkbench key={page} kind={page} csrf={data?.csrf} authenticated={!!data?.authenticated} userId={data?.me?.id} quota={data?.quota} onQuota={quota=>setData(old=>old?{...old,quota}:old)}/>:!tool?.enabled?<div className="os-query-disabled"><LockKeyhole size={31}/><h3>{['number','sms-inbox'].includes(page)?'Numara sağlayıcısını bağla':'Sağlayıcı bağlantısı gerekiyor'}</h3><p>{['number','sms-inbox'].includes(page)?'Owner, Twilio hesabındaki mevcut SMS numarasını üyeye bitiş tarihiyle atar. Yalnızca kendi atama dönemindeki gelen SMS görünür. Numara satın alınmaz; sağlayıcı hesabının ücretleri geçerlidir.':'API anahtarı owner panelinden bağlandığında bu araç açılır. Bağlantı testinin gerçek sonucu ayrıca gösterilir.'}</p>{data?.owner&&<Link href='/osint/owner'>API bağlantı merkezini aç ↗</Link>}<button onClick={home}>Genel bakışa dön <ArrowRight size={15}/></button></div>:
       <form onSubmit={run} className="os-query-form">
        <label htmlFor="os-query-target">{page==='proxy'?'PROXY LİSTE KRİTERLERİ':'ARAŞTIRMA HEDEFİ'}</label>
        {page==='proxy'?<div className="os-proxy-fields">
         <div><label htmlFor="os-protocol">Protokol</label><select id="os-protocol" value={protocol} onChange={e=>setProtocol(e.target.value)}>{['all','http','https','socks4','socks5'].map(x=><option key={x} value={x}>{x==='all'?'Tüm protokoller':x.toUpperCase()}</option>)}</select></div>
         <div><label htmlFor="os-country">Ülke kodu</label><input id="os-country" value={country} placeholder="TR, DE, US..." maxLength={2} onChange={e=>setCountry(e.target.value.toUpperCase())}/></div>
         <div><label htmlFor="os-anon">Anonimlik</label><select id="os-anon" value={anonymity} onChange={e=>setAnonymity(e.target.value)}>{['all','elite','anonymous','transparent'].map(x=><option key={x} value={x}>{x==='all'?'Tüm seviyeler':x.toUpperCase()}</option>)}</select></div>
         <div><label htmlFor="os-latency">Azami gecikme (ms)</label><input id="os-latency" type="number" min={100} max={30000} value={latency} onChange={e=>setLatency(e.target.value)}/></div>
         <div><label htmlFor="os-uptime">Minimum uptime (%)</label><input id="os-uptime" type="number" min={0} max={100} value={uptime} onChange={e=>setUptime(e.target.value)}/></div>
         <div><label htmlFor="os-count">{data?.quota?.unlimited?'Owner · Proxy sayısı':'Level '+level+' · Proxy hakkın'}</label><input id="os-count" type="text" value={proxyLimit===null?'Sınırsız · tüm eşleşen kayıtlar':proxyLimit} readOnly aria-describedby="os-count-rule"/><small id="os-count-rule">{proxyLimit===null?'Kaynağın mevcut bütün eşleşen kayıtları':'10 + level × 5'}</small></div>
        </div>:page==='metadata'?<div className="os-input-wrap"><input id="os-query-target" type="file" onChange={e=>setMetadataFile(e.target.files?.[0]||null)} required aria-label="Yerel dosya · en fazla 25 MB"/><small>İçerik tarayıcıda kalır. Yalnızca ad, boyut, başlangıç imzası ve SHA-256 rapora gönderilir.</small></div>:page==='mail'?<div className="os-mail-builder"><div className="os-mail-address"><input aria-label="Geçici e-posta adres adı" value={mailName} onChange={e=>setMailName(e.target.value.toLowerCase())} maxLength={40} placeholder="frizz2025 · boşsa rastgele"/><span>@</span><select aria-label="E-posta sağlayıcı ve domain" value={mailDomain} onChange={e=>setMailDomain(e.target.value)}><option value="">Otomatik aktif domain</option>{mailDomains.map(d=><option key={d.provider+'|'+d.domain} value={d.provider+'|'+d.domain}>{d.domain} · {d.provider==='mailgw'?'Mail.gw / 10 dk':'Mail.tm'}</option>)}</select></div><label className="os-mail-replace"><input type="checkbox" checked={mailReplace} onChange={e=>setMailReplace(e.target.checked)}/> Mevcut adresi değiştir · Yeni adres hazır olunca eski kutuya platform erişimi sona erer.</label><p>Mail.tm: 24 saat platform erişimi · Mail.gw: 10 dakika. Kişisel Gmail/başka birine ait adres seçilemez. <a href="https://mail.tm" target="_blank" rel="noreferrer">Mail.tm</a> / <a href="https://mail.gw" target="_blank" rel="noreferrer">Mail.gw</a></p></div>:['mail-inbox','number','sms-inbox'].includes(page)?<div className="os-inline-message">{page==='mail-inbox'?'Yalnızca kendi geçici gelen kutun okunur.':'Yalnızca sana atanmış aktif numara ve atama başladıktan sonraki gelen SMS okunur.'}</div>:<div className="os-input-wrap"><Search size={19}/><input id="os-query-target" placeholder={PLACEHOLDERS[page]||'Sorgu hedefi'} value={target} maxLength={250} onChange={e=>setTarget(e.target.value)} autoComplete="off" required/></div>}
        <div className="os-query-actions"><button className="os-primary-action" type="submit" disabled={!data?.authenticated||(!data?.quota?.unlimited&&!data?.quota?.remaining)||busy}>{busy?<RefreshCw size={17} className="os-spin"/>:<Search size={17}/>} {busy?'Sorgu işleniyor':page==='proxy'?'Filtreli listeyi oluştur':'Sorguyu çalıştır'} <ArrowRight size={16}/></button><span><LockKeyhole size={13}/> Günlük hak + süreli ek hak · Owner sınırsız.</span></div>
        {!data?.authenticated&&<div className="os-inline-message">Araçları kullanmak için <a href="/api/auth/login?return=%2Fosint">Discord ile giriş yapmalısın.</a></div>}
        {data?.authenticated&&data?.quota?.remaining===0&&<div className="os-inline-message">Günlük araştırma hakkın tükendi. Türkiye saatiyle 00:00'da yenilenir.</div>}
       </form>}
       {error&&<div className="os-error" role="alert"><ShieldAlert size={17}/>{error}</div>}
       {busy&&sourceProgress&&<p className="os-inline-message" role="status">{sourceProgress}</p>}
       {page.startsWith('social-')&&<SocialCapabilities platform={page==='social-all'?undefined:page.slice(7)}/>}
       {page!=='proxy-live'&&!comboPresets.some(p=>p.id===page)&&result&&<section className="os-result-panel"><div className="os-result-heading"><div><span className="os-kicker">QUERY COMPLETE</span><h3>{result.title}</h3><p>{result.summary}</p></div><button onClick={()=>navigator.clipboard.writeText(resultText)} title="Sonuçları kopyala"><Copy size={17}/> Kopyala</button><button onClick={()=>{const url=URL.createObjectURL(new Blob([resultText],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='turkishpix-'+result.kind+'-rapor.txt';a.click();URL.revokeObjectURL(url);}}>TXT indir</button></div>{result.security&&<OsintSecurityReport assessment={result.security}/>} {!!result.socialProfiles?.length&&<OsintSocialProfiles profiles={result.socialProfiles}/>} {result.profiles?<UsernameResults profiles={result.profiles} searchLinks={result.searchLinks}/>:<div className="os-result-rows">{result.items.map((row,i)=><div key={i}><span>{row.name}</span><pre>{row.value}</pre></div>)}</div>}<div className="os-result-notice">{result.notice}</div><div className="os-result-dm"><Check size={16}/> Sonuç web çalışma alanında gösterildi.</div></section>}
      </section>
      <aside className="os-tool-aside">
       <div className="os-aside-header"><ShieldCheck size={19}/><h3>Oturum durumu</h3></div><div className="os-aside-data"><span>OPERATÖR</span><strong>{profile?.displayName||'Bağlı değil'}</strong></div><div className="os-aside-data"><span>LEVEL KAYNAĞI</span><strong>{data?.quota?.levelSource||'TurkishPix XP'}</strong>{data?.quota&&!data.quota.profileFound&&<small>Henüz XP kaydı yok · Başlangıç seviye 0</small>}</div><div className="os-aside-data"><span>ERİŞİM UNVANI</span><strong>{data?.quota?rank.name:'—'}</strong></div><div className="os-aside-data"><span>KALAN HAK</span><strong>{data?.quota?data.quota.unlimited?'Sınırsız · Owner':data.quota.remaining+' toplam / '+data.quota.dailyLimit+' günlük':'—'}</strong></div>
       {(data?.quota?.boosterBonus||0)>0&&<div className="os-booster-badge">🚀 BOOSTER · +20 GÜNLÜK SORGU<span>Tüm araştırma araçlarında ortak bonus</span></div>}
       <div className="os-aside-note"><CircleHelp size={18}/><p>{['proxy','proxy-check'].includes(page)?'Proxy Checker sağlayıcının son kontrol kayıtlarını gösterir; bağımsız canlı bağlantı garantisi değildir.':['combo-domain','reports','headers'].includes(page)?'Görünen IP CDN’ye ait olabilir. Yapılandırma gözlemleri doğrulanmış zafiyet değildir. Genel başlık incelemesini yetkili olduğun hedeflerde kullan.':'Sonuçları kaynak ve gözlem tarihiyle değerlendir. Araç raporu tek başına güvenlik veya kimlik doğrulaması değildir.'}</p></div>
       <button className="os-tool-return" onClick={home}> <Home size={16}/> Genel bakışa dön <ArrowRight size={16}/></button>
      </aside>
     </div>
    </section>}
   </div>
  </div>
 </div>;
}
