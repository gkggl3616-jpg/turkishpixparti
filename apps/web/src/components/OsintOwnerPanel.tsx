'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,ShieldAlert,LockKeyhole,RefreshCw} from 'lucide-react';
type EventRow={id:number;user_id:string;username:string|null;event_type:string;source:string;query_kind:string;target_preview:string;observed_ip:string|null;error_code:string;created_at:string};
type Block={user_id:string;username:string|null;reason:string;created_at:string};
type State={events:EventRow[];blocks:Block[];retentionDays:number;csrf:string;error?:string;ipNotice?:string};
export default function OsintOwnerPanel(){
 const [data,setData]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reason,setReason]=useState('Şüpheli veya yetkisiz kullanım'),[selected,setSelected]=useState('');
 async function load(){try{const r=await fetch('/api/osint/owner',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Erişim reddedildi.');setData(d);setError('');}catch(e){setError(e instanceof Error?e.message:'Panel yüklenemedi.');}}
 useEffect(()=>{void load();},[]);
 async function change(blocked:boolean){
  if(!selected||!data?.csrf||busy)return;setBusy(true);setError('');
  try{const r=await fetch('/api/osint/owner',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':data.csrf},body:JSON.stringify({userId:selected,blocked,reason})}),d=await r.json();if(!r.ok)throw Error(d.error||'İşlem reddedildi.');await load();}catch(e){setError(e instanceof Error?e.message:'İşlem reddedildi.');}finally{setBusy(false);}
 }
 return <main className="osint-page"><section className="osint-hero"><div className="osint-label">TURKISH OSINT · OWNER SECURITY CENTER</div><h1>Denetim <span>merkezi</span></h1><p>Sorgu geçmişi, üyelik erişimi ve platform güvenliği. Bu panel yalnızca tanımlı TurkishPix owner hesaplarına açıktır.</p><Link href="/osint" className="osint-owner-back"><ArrowLeft size={15}/> Araştırma paneline dön</Link></section>
 <div className="osint-content">
 {error&&<div className="osint-error" role="alert">{error}</div>}
 {data&&<><div className="osint-stats"><div><small>DENETİM KAYDI</small><strong>{data.events.length}</strong></div><div><small>ENGELLENEN HESAP</small><strong>{data.blocks.length}</strong></div><div><small>LOG SAKLAMA</small><strong>{data.retentionDays} gün</strong></div><div><small>YETKİ</small><strong>OWNER ONLY</strong></div></div>
 <section className="osint-box osint-owner-controls"><h2><LockKeyhole size={20}/> Kullanıcının OSINT erişimi</h2><p>Engelleme yalnızca Turkish Osint sorgularını durdurur; Discord sunucusundan yasaklama işlemi yapmaz.</p><label>Discord üye ID</label><input placeholder="Kullanıcı ID" value={selected} onChange={e=>setSelected(e.target.value)} maxLength={20}/><label>Gerekçe</label><input value={reason} maxLength={250} onChange={e=>setReason(e.target.value)}/><div><button onClick={()=>change(true)} disabled={busy||!/^\d{17,20}$/.test(selected)}><ShieldAlert size={15}/> OSINT erişimini engelle</button><button className="secondary" onClick={()=>change(false)} disabled={busy||!/^\d{17,20}$/.test(selected)}>Engeli kaldır</button></div></section>
 <section className="osint-box osint-owner-records"><h2>Aktif engeller</h2>{data.blocks.length?data.blocks.map(row=><div key={row.user_id} className="osint-record"><strong>@{row.username||'Bilinmiyor'} · {row.user_id}</strong><span>{row.reason}</span></div>):<p>Aktif engel yok.</p>}</section>
 <section className="osint-box osint-owner-records"><div className="osint-owner-heading"><h2>Son araştırma ve giriş kayıtları</h2><button onClick={()=>load()}><RefreshCw size={15}/> Yenile</button></div><p>{data.ipNotice} Sorgu metinlerinde hassas URL parametreleri saklanmaz.</p><div className="osint-audit-scroll"><table><thead><tr><th>Tarih</th><th>Kullanıcı</th><th>İşlem</th><th>Sorgu</th><th>Gözlenen IP</th><th>Durum</th></tr></thead><tbody>{data.events.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString('tr-TR')}</td><td><strong>@{r.username||'Bilinmiyor'}</strong><small>{r.user_id}</small></td><td>{r.event_type} · {r.source}</td><td>{r.query_kind} · {r.target_preview}</td><td>{r.observed_ip||'Gözlenmedi'}</td><td>{r.error_code||'—'}</td></tr>)}</tbody></table></div></section>
 </>}</div></main>;
}
