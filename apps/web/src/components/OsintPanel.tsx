'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,BookOpen,CheckCircle2,Copy,ExternalLink,LockKeyhole,RefreshCw,Search,ShieldCheck,Terminal,SlidersHorizontal,ScanSearch} from 'lucide-react';
type Tool={id:string;name:string;label:string;enabled:boolean;icon:string};
type Quota={xp:number;level:number;tier:string;dailyLimit:number;used:number;remaining:number;resetTimezone:string};
type Result={kind:string;target:string;title:string;summary:string;notice:string;items:{name:string;value:string}[]};
type Data={authenticated:boolean;me?:{username:string;id:string};csrf?:string;quota?:Quota;tools:Tool[];owner?:boolean;loginUrl?:string;error?:string};
const examples:Record<string,string>={dns:'example.com',ip:'8.8.8.8',url:'https://example.com',rdap:'example.com',subdomains:'example.com',tls:'example.com',asn:'8.8.8.8',email:'example.com',cve:'CVE-2024-12345',hash:'SHA-256 hash (64 hex)', 'proxy-check':'http://1.2.3.4:8080'};
const buckets=['Araştırma','Proxy & Ağ','Tehdit','İletişim','Tümü'] as const;
export default function OsintPanel(){
 const [data,setData]=useState<Data|null>(null),[active,setActive]=useState('dns'),[target,setTarget]=useState(''),[result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[dm,setDm]=useState<boolean|null>(null);
 const [search,setSearch]=useState(''),[bucket,setBucket]=useState<(typeof buckets)[number]>('Tümü');
 const [country,setCountry]=useState(''),[protocol,setProtocol]=useState('all'),[anonymity,setAnonymity]=useState('all'),[latency,setLatency]=useState('3000'),[uptime,setUptime]=useState('0'),[count,setCount]=useState('10');
 async function refresh(){try{const r=await fetch('/api/osint',{cache:'no-store'}),body=await r.json();if(!r.ok)throw Error(body.error||'Araştırma profili açılamadı.');setData(body);setError('');}catch(e){setError(e instanceof Error?e.message:'Bağlantı kurulamadı.');}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);
 const selectedTool=data?.tools.find(x=>x.id===active);
 const tools=data?.tools||[];
 const list=useMemo(()=>tools.filter(x=>{if(search&&!((x.name+' '+x.label).toLowerCase().includes(search.toLowerCase())))return false;
  if(bucket==='Tümü')return true;if(bucket==='Proxy & Ağ')return x.id.includes('proxy')||['ip','asn','geo'].includes(x.id);
  if(bucket==='Tehdit')return ['threat','malware','hash','cve','ioc','url'].includes(x.id);
  if(bucket==='İletişim')return ['mail','number','email'].includes(x.id);
  return !['proxy','proxy-check','ip','asn','geo','threat','malware','hash','cve','ioc','url','mail','number','email'].includes(x.id);
 }),[tools,search,bucket]);
 async function run(e:React.FormEvent){e.preventDefault();if(!data?.authenticated||!data.csrf||busy||!selectedTool?.enabled)return;
  setBusy(true);setError('');setDm(null);setResult(null);
  try{
   const query=active==='proxy'?JSON.stringify({protocol,country,anonymity,maxLatency:Number(latency),minUptime:Number(uptime),limit:Number(count)}):target;
   const res=await fetch('/api/osint/run',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':data.csrf},body:JSON.stringify({kind:active,target:query,requestId:crypto.randomUUID()})}),body=await res.json();
   if(!res.ok)throw Error(body.error||'Sorgu başarısız.');setResult(body.result);setDm(!!body.dmDelivered);setData(prev=>prev?{...prev,quota:body.quota}:prev);
  }catch(e){setError(e instanceof Error?e.message:'Sorgu tamamlanamadı.');}finally{setBusy(false);}
 }
 return <main className="osint-page">
  <header className="osint-topnav"><Link className="osint-logo" href="/osint">TURKISH<span> OSINT</span><small style={{display:'block',fontSize:10,letterSpacing:2,color:'#7fb1a8'}}>NEXUS INTELLIGENCE NETWORK</small></Link><nav className="osint-nav-actions"><a href="#tool-catalog">Tüm araçlar</a><a href="#research-console">Konsol</a>{data?.owner&&<Link href="/osint/owner">Owner Panel</Link>}<a href="https://discord.gg/turkishpix" target="_blank" rel="noreferrer">Discord <ExternalLink size={12}/></a></nav></header>
  <section className="osint-hero"><div className="osint-label"><span className="osint-pulse"/>TURKISH OSINT NETWORK <span className="osint-divider"/> NEXUS / INTELLIGENCE</div>
   <h1>Araştır. Doğrula.<br/><span>Veriyi anlamlandır.</span></h1><p>TurkishPix Discord hesabınla giriş yap. DNS, RDAP, ASN, CVE, sertifika, proxy metaverisi ve daha fazlasını tek araştırma merkezinde incele. XP seviyen günlük hakkını belirler.</p>
   <div className="osint-hero-pills"><span><ShieldCheck size={15}/> Discord OAuth</span><span><Terminal size={15}/> Pasif, sınırlı araştırma</span><span><LockKeyhole size={15}/> XP + owner denetimi</span></div>
  </section>
  <div className="osint-content">
   <div className="osint-stats"><div><small>HESAP</small><strong>{loading?'Yükleniyor':data?.authenticated?'@'+data.me?.username:'Giriş gerekli'}</strong></div><div><small>XP TIER</small><strong>{data?.quota?'Lv. '+data.quota.level+' · '+data.quota.tier:'—'}</strong></div><div><small>GÜNLÜK KALAN</small><strong>{data?.quota?data.quota.remaining+' / '+data.quota.dailyLimit:'—'}</strong></div><div><small>ARAÇ KATALOĞU</small><strong>{tools.length?tools.filter(x=>x.enabled).length+' / '+tools.length:'—'}</strong></div></div>
   {!loading&&!data?.authenticated&&<section className="osint-login"><LockKeyhole size={28}/><div><strong>Discord ile tek tıkla giriş</strong><p>TurkishPix üyeliğin, XP seviyen ve kullanım kotan aynı hesapla çalışır. Giriş işlemleri ve sorgular güvenlik için kayıt altındadır.</p></div><a className="osint-button" href={data?.loginUrl||'/api/auth/login?return=%2Fosint'}>Discord ile giriş <ArrowRight size={17}/></a></section>}
   {data?.quota&&<div className="osint-progress"><div style={{width:(data.quota.used/data.quota.dailyLimit*100)+'%'}}/><span>{data.quota.used} sorgu kullanıldı · Her gün Türkiye saatiyle 00:00'da sıfırlanır</span></div>}
   <section className="osint-grid-layout" id="research-console"><div className="osint-box osint-console">
     <div className="osint-section-title"><Terminal size={18}/><h2>ARAŞTIRMA KONSOLU</h2><span>{selectedTool?.enabled?'● SERVİS BAĞLI':'○ ENTEGRASYON GEREKLİ'}</span></div>
     <div className="osint-catalog-buttons">{tools.filter(t=>t.enabled).map(t=><button key={t.id} className={active===t.id?'selected':''} type="button" onClick={()=>{setActive(t.id);setTarget('');setError('');setResult(null);setDm(null);}}>{t.icon} {t.name}</button>)}</div>
     <form onSubmit={run}><label htmlFor="osint-target">{selectedTool?.name||'Araştırma hedefi'}</label>
      {active==='proxy'?<div className="osint-searching-tools"><select aria-label="Proxy protokol" value={protocol} onChange={e=>setProtocol(e.target.value)}>{['all','http','https','socks4','socks5'].map(x=><option key={x}>{x}</option>)}</select><input aria-label="Ülke kodu" placeholder="Ülke: TR, DE, US" value={country} maxLength={2} onChange={e=>setCountry(e.target.value.toUpperCase())}/><select aria-label="Anonimlik" value={anonymity} onChange={e=>setAnonymity(e.target.value)}>{['all','elite','anonymous','transparent'].map(x=><option key={x}>{x}</option>)}</select><input type="number" aria-label="Maksimum gecikme" min={100} max={30000} value={latency} onChange={e=>setLatency(e.target.value)} placeholder="Gecikme (ms)"/><input type="number" aria-label="Minimum uptime yüzdesi" min={0} max={100} value={uptime} onChange={e=>setUptime(e.target.value)} placeholder="Min. uptime (%)"/><input type="number" aria-label="Liste adedi" min={1} max={25} value={count} onChange={e=>setCount(e.target.value)}/></div>:<div className="osint-search"><Search size={20}/><input id="osint-target" value={target} onChange={e=>setTarget(e.target.value)} placeholder={examples[active]||'Araştırma verisi'} maxLength={250} autoComplete="off" required/><button disabled={!data?.authenticated||busy||!selectedTool?.enabled||!data?.quota?.remaining}>{busy?<RefreshCw size={15}/>:<ArrowRight size={15}/>} {busy?'Araştırılıyor':'Sorgula'}</button></div>}
      {active==='proxy'&&<button className="osint-button" style={{marginTop:12,border:0}} type="submit" disabled={!data?.authenticated||busy||!data?.quota?.remaining}> <SlidersHorizontal size={15}/> {busy?'Filtreleniyor':'Proxy listesini oluştur'} </button>}
     </form>
     {error&&<div className="osint-error" role="alert">{error}</div>}
     {result?<div className="osint-output"><div className="osint-output-head"><div><small>ARAŞTIRMA TAMAMLANDI</small><h3>{result.title}</h3><p>{result.summary}</p></div><button title="Sonucu kopyala" onClick={()=>navigator.clipboard.writeText(result.title+'\n'+result.items.map(x=>x.name+': '+x.value).join('\n'))}><Copy size={16}/></button></div><div className="osint-output-list">{result.items.map((x,i)=><div key={x.name+i}><span>{x.name}</span><pre>{x.value}</pre></div>)}</div><p className="osint-notice">{result.notice}</p><p className="osint-notice">{dm?'✅ Discord özel mesajına da gönderildi.':'⚠️ Discord DM gönderilemedi. Bu sonuç yalnızca tarayıcıda görüntülendi.'}</p></div>:<div className="osint-empty"><ScanSearch size={36}/><strong>Güvenli araştırma başlat</strong><p>Araç seçip sorgu gönder. Sağlayıcı yanıtları ve sınırlamaları açık şekilde gösterilir; sonuçlar kullanıcı isteğiyle DM olarak da iletilir.</p></div>}
    </div><aside className="osint-box osint-info"><div className="osint-section-title"><BookOpen size={18}/><h2>XP ERİŞİMİ</h2></div><p>XP harcanmaz. Web ve Discord komutları aynı günlük sınırı paylaşır.</p>
     {[['0+','Starter','5'],['5+','Researcher','15'],['10+','Analyst','35'],['20+','Expert','75'],['40+','Elite','150']].map(t=><div key={t[0]} className="osint-tier"><span>Lv. {t[0]}</span><strong>{t[1]}</strong><b>{t[2]} / gün</b></div>)}
     <div className="osint-tip"><CheckCircle2 size={18}/> Discord'da <code>/osint proxy-generator</code>, <code>/osint dns</code> veya <code>/osint cve</code> komutunu kullan.</div>
     <p style={{marginTop:20}}>Temp Mail ve Temp Number için onaylı sağlayıcı, tahsis edilmiş kaynaklar ve gelen mesaj webhookları henüz gereklidir. Sahte SMS veya gelen kutusu gösterilmez.</p>
    </aside></section>
   <section id="tool-catalog"><div className="osint-section-title osint-catalog-heading"><ShieldCheck size={19}/><h2>TÜM ARAÇLAR</h2><span>Çalışan ve planlanan modüller</span></div>
    <div className="osint-searching-tools"><input placeholder="Araç kategorisi ara..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={bucket} onChange={e=>setBucket(e.target.value as typeof bucket)}>{buckets.map(b=><option key={b}>{b}</option>)}</select></div>
    <div className="osint-catalog">{list.map(t=><div key={t.id} className={'osint-tool-card '+(t.enabled?'clickable':'')} onClick={()=>{if(t.enabled){setActive(t.id);setResult(null);document.getElementById('research-console')?.scrollIntoView({behavior:'smooth'});}}}><div className="osint-tool-symbol">{t.icon}</div><strong>{t.name}</strong><p>{t.label}</p><span className={t.enabled?'osint-enabled':'osint-planned'}>{t.enabled?'API / çekirdek bağlı':'Servis anahtarı veya entegrasyon bekliyor'}</span></div>)}</div>
   </section>
   <footer className="osint-disclaimer"><ShieldCheck size={17}/> Araştırma girişleri ve sorgu meta verileri kötüye kullanımın önlenmesi amacıyla en fazla 14 gün saklanır. IP gözlemi kesin kimlik tespiti değildir. <a href="https://discord.gg/turkishpix" target="_blank" rel="noreferrer">TurkishPix Discord <ExternalLink size={13}/></a></footer>
  </div>
 </main>;
}
