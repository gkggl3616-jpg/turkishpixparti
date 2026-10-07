'use client';
import {useEffect,useState} from 'react';
import {Users,ShieldCheck,RefreshCw,Search,Check,AlertCircle,ArrowUpRight} from 'lucide-react';

const labels={TBMM_PRESIDENT:'TBMM başkanı',PARTY_LEADER:'Parti başkanı',MP:'Milletvekili',PARTY_MEMBER:'Parti üyesi'};
type RoleKey=keyof typeof labels;
const blank={TBMM_PRESIDENT:null,PARTY_LEADER:null,MP:null,PARTY_MEMBER:null} as Record<RoleKey,string|null>;
const exampleRoles=Object.entries(labels).map(([key,name],i)=>({id:String(900000000000000000n+BigInt(i)),name,position:4-i,color:[0xd4ab56,0xdc3a45,0x5d8fca,0x43b982][i],manageable:true,blockedReason:''}));
const sample={roles:exampleRoles,mappings:Object.fromEntries(Object.keys(labels).map((key,i)=>[key,exampleRoles[i].id])),grants:[],bot:{name:'TurkishPix',canManage:true,highestRole:'TurkishPix Bot'},guild:{name:'TurkishPix'}};
export default function RolePanel({me,isDemo,busy,onAction,notify,login,onReview}:{me:any;isDemo:boolean;busy:boolean;onAction:(action:string,data:any)=>Promise<boolean>;notify:(s:string)=>void;login:React.ReactNode;onReview:()=>void}){
 const [catalog,setCatalog]=useState<any>(null),[mappings,setMappings]=useState<Record<RoleKey,string|null>>(blank),[own,setOwn]=useState<any>(null),[member,setMember]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [request,setRequest]=useState({userId:'',roleKey:'TBMM_PRESIDENT' as RoleKey,enabled:true,reason:''});
 async function read(url:string){const r=await fetch(url,{cache:'no-store'});const x=await r.json();if(!r.ok)throw new Error(x.error||'Discord rolleri alınamadı.');return x;}
 async function refresh(){
  setLoading(true);setError('');
  try{
   if(isDemo){setCatalog(sample);setMappings(sample.mappings as Record<RoleKey,string>);return;}
   if(!me)return;
   const ownRoles=await read('/api/me/roles');setOwn(ownRoles);
   if(me.isOwner){const x=await read('/api/roles');setCatalog(x);setMappings(x.mappings);}
  }catch(e){setError((e as Error).message);}finally{setLoading(false);}
 }
 useEffect(()=>{void refresh();},[me?.id,isDemo]);
 async function lookup(){
  if(!/^\d{17,20}$/.test(request.userId)){notify('17–20 rakamlı Discord kullanıcı ID’si girin.');return;}
  setLoading(true);setMember(null);try{setMember(await read('/api/roles/member?id='+request.userId));}catch(e){notify((e as Error).message);}finally{setLoading(false);}
 }
 return <div className="role-page">
  <div className="info-note"><ShieldCheck size={23}/><div><strong>Sunucudaki görevler, tek panelde</strong><p>TBMM başkanı, parti başkanı, milletvekili ve parti üyesi rollerini Discord sunucusuyla bağlayın. Rol atamaları dört ayrı owner onayından sonra uygulanır.</p></div><button className="button ghost" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16} className={loading?'spin':''}/>Yenile</button></div>
  {error&&<div className="error-banner"><AlertCircle size={17}/>{error}</div>}
  {me&&<section className="surface role-profile"><div className="surface-heading"><h2>Discord rollerim</h2><span className="muted">@{me.username}</span></div>{own?<><div className="role-tags">{own.politicalRoles.map((r:any)=><span className="badge passed" key={r.key}>{r.label}</span>)}</div><div className="role-tags">{own.roles.map((r:any)=><span className="discord-role" key={r.id}><i style={{background:r.color?'#'+r.color.toString(16).padStart(6,'0'):'var(--muted)'}}/>{r.name}</span>)}{!own.roles.length&&<p className="muted">Bu hesabın Discord sunucusunda ek rolü bulunmuyor.</p>}</div></>:<p className="muted">Sunucu bağlantısı kurulunca hesabınızın rolleri burada görünür.</p>}</section>}
  {me?.isOwner||isDemo?<>
   <section className="surface"><div className="surface-heading"><div><span className="eyebrow">SUNUCU BAĞLANTISI</span><h2>Görev ve rol eşleştirmeleri</h2></div><Users size={24}/></div>
    {catalog?<><div className="role-bot-status"><span className={'status-dot '+(catalog.bot.canManage?'online':'')}/><strong>{catalog.guild.name}</strong><span>Bot: {catalog.bot.name} · En yüksek rol: {catalog.bot.highestRole}</span></div>
     <form onSubmit={async e=>{e.preventDefault();if(await onAction('roleMappings',{mappings}))await refresh();}}>
      <div className="role-mapping-grid">{(Object.entries(labels) as [RoleKey,string][]).map(([key,label])=><label className="form-field" key={key}>{label}<select value={mappings[key]||''} disabled={busy||isDemo} onChange={e=>setMappings(old=>({...old,[key]:e.target.value||null}))}><option value="">Rol bağlanmadı</option>{catalog.roles.map((r:any)=><option key={r.id} value={r.id} disabled={!r.manageable}>{r.name}{r.manageable?'':' · '+r.blockedReason}</option>)}</select><small>{mappings[key]?'Rol ID: '+mappings[key]:'Discord’daki mevcut bir rolü seçin.'}</small></label>)}</div>
      <div className="form-footer"><button type="button" className="button ghost" disabled={busy||isDemo} onClick={()=>void onAction('reconcileRoles',{})}><RefreshCw size={16}/>Görevleri eşitle</button><button className="button primary" disabled={busy||isDemo}><Check size={17}/>Eşleştirmeleri kaydet</button></div>
     </form><p className="role-help">Botun “Rolleri Yönet” izni olmalı ve bot rolü bu dört rolün üstünde bulunmalı. Yönetici yetkisi içeren ve entegrasyonların yönettiği roller eşleştirilemez.</p>
    </>:<p className="muted">Sunucudaki rol listesi bekleniyor. Bot bağlantısı tamamlandıktan sonra Yenile’ye basın.</p>}
   </section>
   <section className="surface"><div className="surface-heading"><div><span className="eyebrow">DÖRT OWNER ONAYI</span><h2>Rol atama veya kaldırma</h2></div><ShieldCheck size={24}/></div>
    <form onSubmit={async e=>{e.preventDefault();if(await onAction('create',{kind:'ROLE_ASSIGNMENT',...request})){setRequest(old=>({...old,reason:''}));onReview();}}}>
     <label className="form-field">Üyenin Discord kullanıcı ID’si<div className="role-lookup"><input required pattern="[0-9]{17,20}" value={request.userId} onChange={e=>{setRequest(old=>({...old,userId:e.target.value}));setMember(null);}} placeholder="Discord’da Kullanıcı ID’sini Kopyala"/><button type="button" className="button ghost" disabled={loading||isDemo} onClick={()=>void lookup()}><Search size={16}/>Üyeyi bul</button></div></label>
     {member&&<div className="role-member"><strong>@{member.user.username}</strong><span>{member.user.id}</span><div className="role-tags">{member.roles.map((r:any)=><span className="discord-role" key={r.id}>{r.name}</span>)}</div></div>}
     <div className="form-grid"><label className="form-field">Siyasi görev<select value={request.roleKey} onChange={e=>setRequest(old=>({...old,roleKey:e.target.value as RoleKey}))}>{Object.entries(labels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label className="form-field">İşlem<select value={String(request.enabled)} onChange={e=>setRequest(old=>({...old,enabled:e.target.value==='true'}))}><option value="true">Rol ata</option><option value="false">Rolü kaldır</option></select></label></div>
     <label className="form-field">Atama veya kaldırma gerekçesi<textarea required minLength={10} maxLength={10000} rows={3} placeholder="Bu görev değişikliğinin gerekçesini yazın." value={request.reason} onChange={e=>setRequest(old=>({...old,reason:e.target.value}))}/></label>
     <p className="role-help">Milletvekili koltukları TBMM üzerinden atanır. Discord rolü tek başına meclis oy hakkı vermez. TBMM başkanı aktif milletvekillerinden seçilir ve görevi mevcut yasama dönemiyle sınırlıdır.</p>
     <div className="form-footer"><button type="button" className="button ghost" onClick={onReview}>Onay merkezine git<ArrowUpRight size={16}/></button><button className="button primary" disabled={busy||isDemo||!catalog}><ShieldCheck size={17}/>Owner incelemesine gönder</button></div>
    </form>
   </section>
   {catalog?.grants?.length>0&&<section className="surface"><div className="surface-heading"><h2>Owner onaylı görev kayıtları</h2></div><div className="table-scroll"><table><thead><tr><th>Üye</th><th>Görev</th><th>Onay tarihi</th></tr></thead><tbody>{catalog.grants.map((g:any)=><tr key={g.user_id+g.role_key}><td>@{g.username}<br/><small>{g.user_id}</small></td><td>{labels[g.role_key as RoleKey]}</td><td>{new Date(g.updated_at).toLocaleDateString('tr-TR')}</td></tr>)}</tbody></table></div></section>}
  </>:<div className="access-panel"><ShieldCheck size={32}/><h2>Rol yönetimi owner’lara açık</h2><p>Discord ile giriş yaptığınızda sunucudaki kendi rollerinizi görüntüleyebilirsiniz.</p>{!me&&login}</div>}
 </div>;
}
