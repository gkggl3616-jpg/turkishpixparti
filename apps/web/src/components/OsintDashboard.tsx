'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
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
type Quota={xp:number;level:number;proxyResultLimit:number;tier:string;dailyLimit:number;used:number;remaining:number;resetTimezone:string};
type Member={username:string;id:string;avatar?:string|null;displayName?:string;discordJoinedAt?:string|null;siteJoinedAt?:string|null};
type Result={kind:string;target:string;title:string;summary:string;notice:string;items:{name:string;value:string}[]};
type Data={authenticated:boolean;me?:Member;csrf?:string;quota?:Quota;tools:Tool[];owner?:boolean;loginUrl?:string;error?:string};

const GROUPS:{id:string;label:string;caption:string;icon:LucideIcon;tools:string[]}[]=[
 {id:'proxy',label:'Proxy & Network',caption:'01 / ROUTING',icon:Network,tools:['proxy','proxy-check']},
 {id:'infrastructure',label:'Altyapı Analizi',caption:'02 / INFRASTRUCTURE',icon:Globe2,tools:['dns','ip','rdap','tls','subdomains','dns-history','asn','email','headers','geo']},
 {id:'threats',label:'Tehdit Araştırması',caption:'03 / INTELLIGENCE',icon:ShieldAlert,tools:['threat','malware','url','cve','hash','ioc']},
 {id:'communication',label:'İletişim & Kimlik',caption:'04 / IDENTITY',icon:Fingerprint,tools:['mail','number','usernames']},
 {id:'research',label:'Araştırma & Dosyalar',caption:'05 / INVESTIGATION',icon:FolderOpen,tools:['github','archives','metadata','reports']}
];
const TOOL_ICONS:Record<string,LucideIcon>={dns:Globe2,ip:Radio,url:ShieldCheck,rdap:BookOpen,threat:ShieldAlert,mail:Mail,number:Phone,proxy:Network,malware:Shield, tls:KeyRound,subdomains:Layers3,'dns-history':Clock3,asn:Server,email:Mail,usernames:UserRound,github:Database,archives:FolderOpen,metadata:HardDrive,headers:FileSearch,ioc:Fingerprint,cve:ShieldAlert,hash:Hash,reports:BookOpen,'proxy-check':Wifi,geo:Globe2};
const PLACEHOLDERS:Record<string,string>={
 dns:'example.com',ip:'8.8.8.8',url:'https://example.com',rdap:'example.com',subdomains:'example.com',
 tls:'example.com',asn:'8.8.8.8',email:'example.com',cve:'CVE-2024-12345',hash:'SHA-256 hash — 64 karakter',
 'proxy-check':'http://1.2.3.4:8080'
};
const LABELS:Record<string,string>={
 proxy:'Proxy Generator','proxy-check':'Proxy Checker',dns:'DNS Intelligence',ip:'IP Intelligence',
 rdap:'RDAP / WHOIS',tls:'SSL / Sertifika',subdomains:'Subdomain Discovery','dns-history':'DNS History',
 asn:'ASN / BGP',email:'E-posta Güvenliği',headers:'HTTP Headers',geo:'GeoIP',
 threat:'Threat Intelligence',malware:'Malware Scanner',url:'URL Analyzer',cve:'CVE Intelligence',
 hash:'Hash Reputation',ioc:'IOC Normalizer',mail:'Temp Mail',number:'Temp Number',
 usernames:'Username Research',github:'GitHub Intelligence',archives:'Web Archives',
 metadata:'File Metadata',reports:'Research Reports'
};
const dateText=(value?:string|null)=>{if(!value)return 'Kayıt bulunamadı';const d=new Date(value);return Number.isNaN(d.getTime())?'Kayıt bulunamadı':new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'long',year:'numeric',timeZone:'Europe/Istanbul'}).format(d);};
const durationText=(value?:string|null)=>{if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const days=Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));return days===0?'Bugünden beri':days+' gündür';};
const memberAvatar=(m?:Member)=>m?.id&&/^\d{17,20}$/.test(m.id)&&m?.avatar&&/^a?_[a-f0-9]{12,}$|^[a-f0-9]{12,}$/i.test(m.avatar)?'https://cdn.discordapp.com/avatars/'+m.id+'/'+m.avatar+(m.avatar.startsWith('a_')?'.gif':'.png')+'?size=256':null;

function IconOf({id,size=17}:{id:string;size?:number}){const Icon=TOOL_ICONS[id]||Database;return <Icon size={size} strokeWidth={1.7}/>;}

export default function OsintDashboard(){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[page,setPage]=useState('overview');
 const [groups,setGroups]=useState<string[]>(['proxy','infrastructure']),[sidebarCollapsed,setSidebarCollapsed]=useState(false);
 const [mobileOpen,setMobileOpen]=useState(false),[search,setSearch]=useState('');
 const [target,setTarget]=useState(''),[result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dm,setDm]=useState<boolean|null>(null);
 const [deliveryId,setDeliveryId]=useState(''),[retrying,setRetrying]=useState(false),[loginError,setLoginError]=useState('');
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
  void load();
 },[]);
 const catalog=data?.tools||[];
 const tool=useMemo(()=>catalog.find(t=>t.id===page),[catalog,page]);
 const toolGroup=GROUPS.find(g=>g.tools.includes(page));
 const rank=rankOf(data?.quota?.level||0);
 const nextRank=RANKS.find(x=>x.level>(data?.quota?.level||0));
 const profile=data?.me;
 const avatar=memberAvatar(profile);
 const xp=data?.quota?.xp||0,level=data?.quota?.level||0;
 const proxyLimit=data?.quota?.proxyResultLimit??10+5*level;
 const {nextXp,percent:levelPct}=levelProgress(xp,level);
 const usedPct=data?.quota?Math.min(100,data.quota.used/Math.max(1,data.quota.dailyLimit)*100):0;

 const matching=useMemo(()=>catalog.filter(x=>((LABELS[x.id]||x.name)+' '+x.label).toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR').trim())),[catalog,search]);
 function openTool(id:string){setPage(id);setTarget('');setResult(null);setDm(null);setError('');setMobileOpen(false);window.scrollTo({top:0,behavior:'smooth'});}
 function home(){setPage('overview');setResult(null);setError('');setMobileOpen(false);window.scrollTo({top:0,behavior:'smooth'});}
 function toggleGroup(id:string){setGroups(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
 async function run(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(!data?.authenticated||!data.csrf||!tool?.enabled||busy||!data.quota?.remaining)return;
  setBusy(true);setError('');setResult(null);setDm(null);
  try{
   const input=page==='proxy'?JSON.stringify({protocol,country,anonymity,maxLatency:Number(latency),minUptime:Number(uptime),limit:proxyLimit}):target;
   const r=await fetch('/api/osint/run',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':data.csrf},body:JSON.stringify({kind:page,target:input,requestId:crypto.randomUUID()})});
   const body=await r.json();if(!r.ok)throw Error(body.error||'Araştırma tamamlanamadı.');
   setResult(body.result);setDeliveryId(body.deliveryId||'');setDm(Boolean(body.dmDelivered));setData(previous=>previous?{...previous,quota:body.quota}:previous);
  }catch(e){setError(e instanceof Error?e.message:'İşlem başarısız.');}
  finally{setBusy(false);}
 }
 async function retryDm(){
  if(!data?.csrf||!deliveryId||retrying)return;setRetrying(true);
  try{const r=await fetch('/api/osint/delivery',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':data.csrf},body:JSON.stringify({deliveryId})}),body=await r.json();if(!r.ok)throw Error(body.error||'DM gönderilemedi.');setDm(Boolean(body.dmDelivered));if(!body.dmDelivered)setError('Discord DM teslimine izin vermedi. Sunucunun gizlilik ayarlarında Özel Mesajlar seçeneğini aç.');else setError('');}
  catch(e){setError(e instanceof Error?e.message:'DM gönderilemedi.');}finally{setRetrying(false);}
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
    <div className="os-sidebar-foot"><span className="os-online-dot"/> OSINT CORE <span>v2.2</span></div>
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
      <div className="os-stat"><span>GÜNLÜK SORGU HAKKI</span><strong>{data?.quota?.dailyLimit??'—'}</strong><small>XP seviyene göre tanımlanır</small><div className="os-stat-mark"><Activity size={19}/></div></div>
      <div className="os-stat"><span>KALAN SORGU</span><strong>{data?.quota?.remaining??'—'}</strong><small>{data?.quota?data.quota.used+' sorgu kullanıldı':'Oturum gerekli'}</small><div className="os-stat-mark"><Database size={19}/></div></div>
      <div className="os-stat"><span>AKTİF ARAÇLAR</span><strong>{activeCount.toString().padStart(2,'0')} <em>/ {catalog.length.toString().padStart(2,'0')}</em></strong><small>Servis bağlantısı bulunan modüller</small><div className="os-stat-mark"><Layers3 size={19}/></div></div>
      <div className="os-stat"><span>ERİŞİM SINIFI</span><strong className="os-stat-rank">{data?.quota?rank.name:'—'}</strong><small>{data?.quota?.tier||'Discord doğrulaması gerekli'}</small><div className="os-stat-mark"><KeyRound size={19}/></div></div>
     </div>
     <div className="os-quota-track"><span>KULLANIM ORANI</span><div className="os-track"><div style={{width:usedPct+'%'}}/></div><strong>%{Math.round(usedPct)}</strong></div>

     <div className="os-section-heading"><div><span className="os-kicker">DIRECT ACCESS</span><h2>Araştırma merkezleri</h2></div><span className="os-section-note">Modülü seçerek konsolu aç</span></div>
     <div className="os-centers">
      <button className="os-center-card" onClick={()=>openTool('proxy')}><img src="/osint-assets/proxy-mesh.svg" alt="" aria-hidden="true"/><div className="os-center-content"><span>01 / NETWORK ROUTING</span><h3>Proxy Intelligence</h3><p>Proxy generator, filtreleme, son kontrol kayıtları ve ağ altyapısı.</p><div className="os-center-open">Modüle git <ArrowUpRight size={15}/></div></div></button>
      <button className="os-center-card" onClick={()=>openTool('dns')}><img src="/osint-assets/network-constellation.svg" alt="" aria-hidden="true"/><div className="os-center-content"><span>02 / INFRASTRUCTURE</span><h3>Domain & Network</h3><p>DNS, IP, RDAP, ASN, sertifika geçmişi ve pasif alan adı araştırmaları.</p><div className="os-center-open">Modüle git <ArrowUpRight size={15}/></div></div></button>
      <button className="os-center-card" onClick={()=>openTool('cve')}><img src="/osint-assets/threat-matrix.svg" alt="" aria-hidden="true"/><div className="os-center-content"><span>03 / THREAT RESEARCH</span><h3>Threat Intelligence</h3><p>CVE, hash itibarı, URL incelemesi ve güvenlik araştırması.</p><div className="os-center-open">Modüle git <ArrowUpRight size={15}/></div></div></button>
     </div>

     <footer className="os-page-footer">NEXUS OSINT / TURKISHPIX <span>Halka açık veriler üzerinden yasal, pasif araştırma · Sorgu meta verileri 14 güne kadar saklanır.</span></footer>
    </>:
    <section className="os-tool-page">
     <div className="os-tool-banner">
      <img src={toolGroup?.id==='proxy'?'/osint-assets/proxy-mesh.svg':toolGroup?.id==='threats'?'/osint-assets/threat-matrix.svg':'/osint-assets/network-constellation.svg'} alt="" aria-hidden="true"/>
      <div className="os-tool-banner-content"><span className="os-eyebrow"><span className="os-eyebrow-line"/> {toolGroup?.caption||'INTELLIGENCE MODULE'}</span><div className="os-module-icon"><IconOf id={page} size={23}/></div>
       <h1>{LABELS[page]||tool?.name||'Araştırma aracı'}</h1><p>{tool?.label||'Araştırma modülü'} · {tool?.enabled?'Servis bağlantısı yapılandırılmıştır.':'Modül API entegrasyonu bekliyor.'}</p>
       <span className={'os-tool-status'+(tool?.enabled?' is-enabled':'')}>{tool?.enabled?<><span className="os-online-dot"/> SORGUYA AÇIK</>:<><LockKeyhole size={13}/> YAKINDA</>}</span>
      </div>
     </div>
     <div className="os-tool-layout">
      <section className="os-query-panel">
       <div className="os-panel-header"><div><span className="os-kicker">SECURE QUERY WORKBENCH</span><h2>Araştırma konsolu</h2></div><Terminal size={20}/></div>
       {!tool?.enabled?<div className="os-query-disabled"><LockKeyhole size={31}/><h3>Bu modül henüz etkinleştirilmedi</h3><p>Sağlayıcı API'si veya güvenli işlem altyapısı yapılandırıldıktan sonra burada kullanılabilir olacak. Gerçek bağlantısı olmayan sonuçlar üretilmez.</p><button onClick={home}>Genel bakışa dön <ArrowRight size={15}/></button></div>:
       <form onSubmit={run} className="os-query-form">
        <label htmlFor="os-query-target">{page==='proxy'?'PROXY LİSTE KRİTERLERİ':'ARAŞTIRMA HEDEFİ'}</label>
        {page==='proxy'?<div className="os-proxy-fields">
         <div><label htmlFor="os-protocol">Protokol</label><select id="os-protocol" value={protocol} onChange={e=>setProtocol(e.target.value)}>{['all','http','https','socks4','socks5'].map(x=><option key={x} value={x}>{x==='all'?'Tüm protokoller':x.toUpperCase()}</option>)}</select></div>
         <div><label htmlFor="os-country">Ülke kodu</label><input id="os-country" value={country} placeholder="TR, DE, US..." maxLength={2} onChange={e=>setCountry(e.target.value.toUpperCase())}/></div>
         <div><label htmlFor="os-anon">Anonimlik</label><select id="os-anon" value={anonymity} onChange={e=>setAnonymity(e.target.value)}>{['all','elite','anonymous','transparent'].map(x=><option key={x} value={x}>{x==='all'?'Tüm seviyeler':x.toUpperCase()}</option>)}</select></div>
         <div><label htmlFor="os-latency">Azami gecikme (ms)</label><input id="os-latency" type="number" min={100} max={30000} value={latency} onChange={e=>setLatency(e.target.value)}/></div>
         <div><label htmlFor="os-uptime">Minimum uptime (%)</label><input id="os-uptime" type="number" min={0} max={100} value={uptime} onChange={e=>setUptime(e.target.value)}/></div>
         <div><label htmlFor="os-count">Level {level} · Proxy hakkın</label><input id="os-count" type="number" value={proxyLimit} readOnly aria-describedby="os-count-rule"/><small id="os-count-rule">10 + level × 5</small></div>
        </div>:<div className="os-input-wrap"><Search size={19}/><input id="os-query-target" placeholder={PLACEHOLDERS[page]||'Sorgu hedefi'} value={target} maxLength={250} onChange={e=>setTarget(e.target.value)} autoComplete="off" required/></div>}
        <div className="os-query-actions"><button className="os-primary-action" type="submit" disabled={!data?.authenticated||!data?.quota?.remaining||busy}>{busy?<RefreshCw size={17} className="os-spin"/>:<Search size={17}/>} {busy?'Sorgu işleniyor':page==='proxy'?'Filtreli listeyi oluştur':'Sorguyu çalıştır'} <ArrowRight size={16}/></button><span><LockKeyhole size={13}/> Kullanım günlük XP kotasına bağlıdır.</span></div>
        {!data?.authenticated&&<div className="os-inline-message">Araçları kullanmak için <a href="/api/auth/login?return=%2Fosint">Discord ile giriş yapmalısın.</a></div>}
        {data?.authenticated&&data?.quota?.remaining===0&&<div className="os-inline-message">Günlük araştırma hakkın tükendi. Türkiye saatiyle 00:00'da yenilenir.</div>}
       </form>}
       {error&&<div className="os-error" role="alert"><ShieldAlert size={17}/>{error}</div>}
       {result&&<section className="os-result-panel"><div className="os-result-heading"><div><span className="os-kicker">QUERY COMPLETE</span><h3>{result.title}</h3><p>{result.summary}</p></div><button onClick={()=>navigator.clipboard.writeText(resultText)} title="Sonuçları kopyala"><Copy size={17}/> Kopyala</button></div><div className="os-result-rows">{result.items.map((row,i)=><div key={i}><span>{row.name}</span><pre>{row.value}</pre></div>)}</div><div className="os-result-notice">{result.notice}</div><div className="os-result-dm">{dm?<><Check size={16}/> Sonuç Discord özel mesajına da gönderildi.</>:<><ShieldAlert size={16}/> DM gizlilik ayarını açıp yeniden gönderebilirsin.</>}</div>{dm===false&&deliveryId&&<button className="os-primary-action" type="button" onClick={()=>void retryDm()} disabled={retrying}><Mail size={16}/>{retrying?'Gönderiliyor':'DM’ye Tekrar Gönder'}</button>}</section>}
      </section>
      <aside className="os-tool-aside">
       <div className="os-aside-header"><ShieldCheck size={19}/><h3>Oturum durumu</h3></div><div className="os-aside-data"><span>OPERATÖR</span><strong>{profile?.displayName||'Bağlı değil'}</strong></div><div className="os-aside-data"><span>ERİŞİM UNVANI</span><strong>{data?.quota?rank.name:'—'}</strong></div><div className="os-aside-data"><span>KALAN HAK</span><strong>{data?.quota?data.quota.remaining+' / '+data.quota.dailyLimit:'—'}</strong></div>
       <div className="os-aside-note"><CircleHelp size={18}/><p>Proxy Checker mevcut sağlayıcı kayıtlarını doğrular; doğrudan, bağımsız canlı bağlantı testi yapmaz. Araç sonuçları tek başına güvenlik garantisi değildir.</p></div>
       <button className="os-tool-return" onClick={home}> <Home size={16}/> Genel bakışa dön <ArrowRight size={16}/></button>
      </aside>
     </div>
    </section>}
   </div>
  </div>
 </div>;
}
