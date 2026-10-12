'use client';
import {useEffect,useState} from 'react';
import {ArrowRight,BookOpen,CheckCircle2,Copy,ExternalLink,LockKeyhole,RefreshCw,Search,ShieldCheck,Terminal} from 'lucide-react';

type Tool={id:string;name:string;label:string;enabled:boolean;icon:string};
type Quota={xp:number;level:number;tier:string;dailyLimit:number;used:number;remaining:number;resetTimezone:string};
type Result={kind:string;target:string;title:string;summary:string;notice:string;items:{name:string;value:string}[]};
type Data={authenticated:boolean;me?:{username:string;id:string};csrf?:string;quota?:Quota;tools:Tool[];loginUrl?:string;error?:string};
const hint:Record<string,string>={dns:'example.com',ip:'8.8.8.8',url:'https://example.com'};
const options:Record<string,string>={dns:'DNS',ip:'IP / PTR',url:'URL'};
export default function OsintPanel(){
 const [data,setData]=useState<Data|null>(null),[active,setActive]=useState<'dns'|'ip'|'url'>('dns'),[target,setTarget]=useState(''),[result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{fetch('/api/osint',{cache:'no-store'}).then(r=>r.json()).then(setData).catch(()=>setError('Sunucuya erişilemedi.')).finally(()=>setLoading(false));},[]);
 async function run(e:React.FormEvent){
  e.preventDefault();if(!data?.authenticated||!data.csrf||busy)return;
  setBusy(true);setError('');setResult(null);
  try{
   const response=await fetch('/api/osint/run',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':data.csrf},body:JSON.stringify({kind:active,target,requestId:crypto.randomUUID()})});
   const body=await response.json();if(!response.ok)throw Error(body.error||'Sorgu başarısız.');
   setResult(body.result);setData(prev=>prev?{...prev,quota:body.quota}:prev);
  }catch(e){setError(e instanceof Error?e.message:'Sorgu başarısız.');}finally{setBusy(false);}
 }
 return <main className="osint-page">
  <section className="osint-hero">
   <div className="osint-label"><span className="osint-pulse"/>TURKISH OSINT NETWORK <span className="osint-divider"/> NEXUS OSINT</div>
   <h1>Her veri bir iz bırakır.<br/><span>İzleri birleştir.</span></h1>
   <p>TurkishPix Discord hesabınla giriş yap. Sunucuda kazandığın XP ile araştırma haklarını artır; web ve Discord aynı limitleri paylaşır.</p>
   <div className="osint-hero-pills"><span><ShieldCheck size={15}/> Discord hesabı</span><span><Terminal size={15}/> Pasif araştırma</span><span><LockKeyhole size={15}/> XP tabanlı limit</span></div>
  </section>
  <div className="osint-content">
   <div className="osint-stats">
    <div><small>OTURUM</small><strong>{loading?'Kontrol ediliyor':data?.authenticated?'@'+data.me?.username:'Giriş gerekli'}</strong></div>
    <div><small>SEVİYE / TIER</small><strong>{data?.quota?'Lv. '+data.quota.level+' · '+data.quota.tier:'—'}</strong></div>
    <div><small>GÜNLÜK KULLANIM</small><strong>{data?.quota?data.quota.remaining+' / '+data.quota.dailyLimit:'—'}</strong></div>
    <div><small>TOPLAM XP</small><strong>{data?.quota?.xp??'—'}</strong></div>
   </div>
   {!loading&&!data?.authenticated&&<section className="osint-login"><LockKeyhole size={28}/><div><strong>TurkishPix ile güvenli giriş</strong><p>OSINT erişimi yalnızca sunucudaki doğrulanmış üyeler içindir. Ayrı kayıt veya şifre gerekmez.</p></div><a className="osint-button" href={data?.loginUrl||'/api/auth/login?return=%2Fosint'}>Discord ile giriş <ArrowRight size={17}/></a></section>}
   {data?.quota&&<div className="osint-progress" aria-label="Günlük kullanım"><div style={{width:(data.quota.used/data.quota.dailyLimit*100)+'%'}}/><span>{data.quota.used} sorgu kullanıldı · Türkiye saatiyle 00:00'da yenilenir</span></div>}
   <div className="osint-grid-layout">
    <section className="osint-box osint-console">
     <div className="osint-section-title"><Terminal size={18}/><h2>ARAŞTIRMA KONSOLU</h2><span>v0.1</span></div>
     <div className="osint-tool-tabs">{(['dns','ip','url'] as const).map(kind=><button key={kind} type="button" className={active===kind?'selected':''} onClick={()=>{setActive(kind);setResult(null);setError('');setTarget('');}}>{options[kind]}</button>)}</div>
     <form onSubmit={run}><label htmlFor="osint-target">{active==='dns'?'Alan adı':active==='ip'?'IPv4 / IPv6 adresi':'Tam URL'}</label><div className="osint-search"><Search size={20}/><input id="osint-target" value={target} onChange={e=>setTarget(e.target.value)} placeholder={hint[active]} maxLength={250} autoComplete="off" required/><button disabled={!data?.authenticated||busy||!data?.quota?.remaining}>{busy?<RefreshCw size={16}/>:<ArrowRight size={16}/>} {busy?'Sorgulanıyor':'Analiz et'}</button></div></form>
     {error&&<div className="osint-error" role="alert">{error}</div>}
     {result?<div className="osint-output"><div className="osint-output-head"><div><small>SORGU SONUCU</small><h3>{result.title}</h3><p>{result.summary}</p></div><button title="Sonucu kopyala" onClick={()=>navigator.clipboard.writeText(result.title+'\n'+result.items.map(x=>x.name+': '+x.value).join('\n'))}><Copy size={16}/></button></div><div className="osint-output-list">{result.items.map(x=><div key={x.name}><span>{x.name}</span><pre>{x.value}</pre></div>)}</div><p className="osint-notice">{result.notice}</p></div>:<div className="osint-empty"><Terminal size={35}/><strong>Yeni araştırma başlat</strong><p>DNS kayıtlarını, IP ters çözümlemesini veya URL biçimsel uyarılarını kontrol et. Komutlar Discord tarafında da aynı XP kotasına bağlıdır.</p></div>}
    </section>
    <aside className="osint-box osint-info"><div className="osint-section-title"><BookOpen size={18}/><h2>XP ERİŞİM SİSTEMİ</h2></div>
     <p>XP harcanmaz; mevcut seviye günlük kullanım sınırını belirler. Bütün sorgular sunucu tarafında sayılır.</p>
     {[['0+','Starter','5'],['5+','Researcher','15'],['10+','Analyst','35'],['20+','Expert','75'],['40+','Elite','150']].map(row=><div className="osint-tier" key={row[0]}><span>Lv. {row[0]}</span><strong>{row[1]}</strong><b>{row[2]} / gün</b></div>)}
     <div className="osint-tip"><CheckCircle2 size={18}/> Discord: <code>/osint</code> komutunu kullan. Web ve bot tek hesap üzerinden sayar.</div>
    </aside>
   </div>
   <div className="osint-section-title osint-catalog-heading"><ShieldCheck size={19}/><h2>ARAÇ KATALOĞU</h2><span>Mevcut / planlanan</span></div>
   <div className="osint-catalog">{(data?.tools||[
    {id:'dns',name:'Domain Intelligence',label:'DNS & kayıt sorgusu',enabled:true,icon:'🌐'},
    {id:'ip',name:'IP Intelligence',label:'IP ve ters DNS',enabled:true,icon:'🛰️'},
    {id:'url',name:'URL Analyzer',label:'Pasif URL risk analizi',enabled:true,icon:'🔗'}
   ]).map(t=><div className="osint-tool-card" key={t.id}><div className="osint-tool-symbol">{t.icon}</div><strong>{t.name}</strong><p>{t.label}</p><span className={t.enabled?'osint-enabled':'osint-planned'}>{t.enabled?'Çalışan çekirdek':'Entegrasyon planında'}</span></div>)}</div>
   <footer className="osint-disclaimer"><ShieldCheck size={17}/> Yalnızca meşru araştırma ve savunma amaçlı kullanım. Pasif analizler zararsızlık garantisi değildir. <a href="https://discord.gg/turkishpix" target="_blank" rel="noreferrer">TurkishPix topluluğu <ExternalLink size={13}/></a></footer>
  </div>
 </main>;
}
