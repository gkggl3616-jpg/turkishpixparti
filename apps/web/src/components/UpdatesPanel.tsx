'use client';
import {useEffect,useState} from 'react';
import {Search,Sparkles,ArrowUpRight,Copy,Check,RefreshCw} from 'lucide-react';
import {releases,currentRelease,releaseMatches} from '../../../../packages/core/src/releases';
type Live={webVersion:string;installUrl:string;bot:null|{version:string|null;connected:boolean;guildAvailable:boolean;commandsRegistered:boolean;registeredVersion:string|null}};
export default function UpdatesPanel(){
 const [query,setQuery]=useState(''),[version,setVersion]=useState('all'),[live,setLive]=useState<Live|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState('');
 async function refresh(){setChecking(true);try{const response=await fetch('/api/updates',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();setLive(await response.json());setError('');}catch{setLive(null);setError('Bağlantı durumu alınamadı. Yeniden kontrol et.');}finally{setChecking(false);}}
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(''),2000);return()=>clearTimeout(timer);},[copied]);
 async function copy(command:string){try{await navigator.clipboard.writeText(command);setCopied(command);}catch{setError('Kopyalama yapılamadı. Komutu seçerek kopyalayabilirsin.');}}
 const matches=releases.filter(r=>(version==='all'||r.version===version)&&releaseMatches(r,query));
 const bot=live?.bot,registered=!!bot?.connected&&bot.guildAvailable&&bot.commandsRegistered&&bot.registeredVersion===live?.webVersion;
 return <main className="bot-main updates-main">
  <div className="module-heading"><div><span className="eyebrow">TURKISHPiX · YENİLİKLER</span><h1>Güncellemeler</h1><p>Eklenen özellikleri keşfet. Komutunu kopyala, hemen dene.</p></div><span className="updates-version"><Sparkles size={16}/>v{currentRelease.version}</span></div>
  <section className="surface updates-live" aria-label="Yayın ve bot bağlantısı"><div><strong>Canlı durum</strong><span>Web <b>{live?'v'+live.webVersion:'Kontrol ediliyor…'}</b></span><span>Bot <b>{!live?'Kontrol ediliyor…':bot?.connected?'v'+(bot.version||'—')+' · Bağlı':'Bağlantı doğrulanamadı'}</b></span><span className={registered?'positive':'gold-text'}>{registered?'✓ Komutlar güncel':live?'Komut kaydı bekleniyor':'Komutlar kontrol ediliyor…'}</span></div><button className="button ghost small" onClick={()=>void refresh()} disabled={checking}><RefreshCw size={15} className={checking?'spin':''}/>Kontrol et</button></section>
  {error&&<p role="status" className="error-banner">{error}</p>}
  {live&&bot?.connected&&!bot.guildAvailable&&<div className="info-note"><div><strong>Botun sunucu bağlantısı bekleniyor.</strong><p>Owner hesabınla botu TurkishPix sunucusuna ekle. Bağlantı kurulduğunda komutlar otomatik güncellenir.</p><a className="button discord small" href={live.installUrl} target="_blank" rel="noreferrer">Botu sunucuya ekle<ArrowUpRight size={15}/></a></div></div>}
  <div className="updates-controls"><label className="updates-search"><Search size={19}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Özellik veya komut ara…" aria-label="Güncellemelerde ara"/></label><label className="updates-select">Sürüm<select value={version} onChange={e=>setVersion(e.target.value)}><option value="all">Tüm sürümler</option>{releases.map(r=><option key={r.version} value={r.version}>v{r.version}</option>)}</select></label></div>
  <div className="updates-timeline">{matches.map(release=><article className="surface release-card" id={'v'+release.version} key={release.version}>
   <header className="release-header"><div className="release-label"><span>v{release.version}</span>{release===currentRelease&&<b>EN YENİ</b>}<time dateTime={release.date}>{release.date.split('-').reverse().join('.')}</time></div><h2>{release.title}</h2><p>{release.summary}</p></header>
   <div className="release-features">{release.features.map(feature=><section className="release-feature" key={feature.title}><h3>{feature.title}</h3><p>{feature.description}</p><div className="release-commands">{feature.commands.map(command=><button key={command} type="button" title="Komutu kopyala" onClick={()=>void copy(command)} aria-label={command+' komutunu kopyala'}><code>{command}</code>{copied===command?<Check size={14}/>:<Copy size={14}/>}</button>)}</div>{feature.note&&<small className="release-note">{feature.note}</small>}<a className="text-link" href={feature.path}>İlgili sayfayı aç<ArrowUpRight size={15}/></a></section>)}</div>
  </article>)}</div>
  {!matches.length&&<div className="empty"><Search size={28}/><p>Bu aramaya uygun güncelleme bulunamadı.</p><button className="button ghost" onClick={()=>{setQuery('');setVersion('all');}}>Filtreleri temizle</button></div>}
 </main>;
}
