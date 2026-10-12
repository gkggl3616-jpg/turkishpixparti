import {config} from './config';
import {COMPONENTS_V2,uiText,uiSeparator,uiRow,uiButton} from './discord-ui';
export type OsintPanelKind='proxy'|'osint'|'mail';
export const osintWebLink=()=>process.env.OSINT_WEB_URL||config().appUrl+'/osint';
const link=(label:string,url:string)=>({type:2,style:5,label,url});
const action=(id:string,label:string,style=2,emoji?:string)=>({...uiButton('tp-osint:'+id,label,style),...(emoji?{emoji:{name:emoji}}:{})});
export function osintPanel(kind:OsintPanelKind,thumbnail?:string){
 const details={
  proxy:{subtitle:'🌐 Proxy Generator & Checker',title:'⌘ Proxy Al',body:'Güncel proxy havuzundan HTTP, HTTPS, SOCKS4 ve SOCKS5 kayıtlarını al.\n\n**Seviye 0 → 10 proxy** · Her level **+5 sonuç**\nSonuçlar ve tam TXT listen yalnızca **DM** üzerinden gönderilir.'},
  osint:{subtitle:'🛰️ Araştırma Konsolu',title:'🔎 Sorgu Başlat',body:'Domain ve IP kombolarıyla altyapıyı incele. DNS, alt alan adları, TLS, CVE ve açık profilleri araştır.\n\nAracını seç, hedefini gir ve **özel mesajındaki** raporunu al.'},
  mail:{subtitle:'✉️ Temp Mail & Inbox',title:'✨ Geçici E-Posta',body:'Anında geçici e-posta oluştur ve gelen mesajlarını özel kutundan oku.\n\nAdresin ve gelen kutun yalnızca **DM** üzerinden gönderilir. Platform erişimi **24 saat**. Sağlayıcı: [Mail.tm](https://mail.tm).'}
 }[kind];
 const buttons=kind==='proxy'?[uiRow(action('proxy','Proxy Al',3,'⚡'),action('proxy-filters','Filtrele',2,'⚙️')),uiRow(action('query:proxy-check','Proxy Checker',1,'✅'),action('profile','Level & Kota',2,'⭐'))]
  :kind==='osint'?[uiRow(action('research','Sorgu Başlat',3,'🔎'),action('query:combo-domain','Domain Kombosu',1,'🌐')),uiRow(action('query:combo-ip','IP Kombosu',2,'🛰️'),action('profile','Level & Kota',2,'⭐'))]
  :[uiRow(action('mail-create','E-Posta Al (Anlık)',3,'⚡')),uiRow(action('mail-inbox','Gelen Kutusu',1,'📥'),link('Mail.tm','https://mail.tm'))];
 return {flags:COMPONENTS_V2,components:[{type:17,accent_color:0x5865f2,components:[
  {type:9,components:[uiText('# TurkishPix\n'+details.subtitle)],accessory:{type:11,media:{url:thumbnail||config().appUrl+'/brand/turkishpix-bot.png'},description:'TurkishPix'}},
  uiSeparator(),uiText('### '+details.title+'\n'+details.body),...buttons,
  uiSeparator(),uiRow(link('discord.gg/turkishpix','https://discord.gg/turkishpix'),link('Araştırma Paneli',osintWebLink()))
 ]}],allowedMentions:{parse:[]}};
}
const fields:Record<string,{label:string;placeholder:string}>={
 'combo-domain':{label:'Alan adı · Domain Kombosu',placeholder:'example.com'},'combo-ip':{label:'IP · Ağ Kombosu',placeholder:'1.1.1.1'},headers:{label:'Genel web adresi',placeholder:'https://example.com'},geo:{label:'IP adresi',placeholder:'1.1.1.1'},threat:{label:'IP adresi',placeholder:'1.1.1.1'},usernames:{label:'Açık profil kullanıcı adı',placeholder:'octocat'},github:{label:'GitHub deposu',placeholder:'owner/repo'},archives:{label:'Alan adı',placeholder:'example.com'},ioc:{label:'IP / domain / URL / hash',placeholder:'example[.]com'},
 dns:{label:'Alan adı',placeholder:'example.com'},ip:{label:'IP adresi',placeholder:'8.8.8.8'},url:{label:'URL',placeholder:'https://example.com'},
 rdap:{label:'Alan adı',placeholder:'example.com'},subdomains:{label:'Alan adı',placeholder:'example.com'},tls:{label:'Alan adı',placeholder:'example.com'},
 asn:{label:'IP adresi',placeholder:'8.8.8.8'},cve:{label:'CVE kimliği',placeholder:'CVE-2024-12345'},email:{label:'E-posta alan adı',placeholder:'example.com'},
 'dns-history':{label:'Alan adı / DNS geçmişi',placeholder:'example.com'},reports:{label:'Alan adı / rapor',placeholder:'example.com'},malware:{label:'SHA-256 / hash raporu',placeholder:'64 haneli dosya özeti'},hash:{label:'SHA-256',placeholder:'64 haneli dosya özeti'},'proxy-check':{label:'Proxy adresi',placeholder:'http://1.2.3.4:8080'}
};
export function osintQueryModal(kind:string){
 const field=fields[kind];if(!field)return null;
 return {custom_id:'tp-osint:modal:'+kind,title:kind==='proxy-check'?'TurkishPix · Proxy Checker':'TurkishPix · Araştırma',components:[{type:18,label:field.label,component:{type:4,custom_id:'target',style:1,placeholder:field.placeholder,required:true,min_length:2,max_length:250}}]};
}
export function osintProxyModal(){
 return {custom_id:'tp-osint:modal:proxy',title:'TurkishPix · Proxy Filtreleri',components:[
  ['protocol','Protokol','all / http / https / socks4 / socks5','all',8],
  ['country','Ülke kodu','TR, DE, US — boşsa tüm ülkeler','',2],
  ['anonymity','Anonimlik','all / elite / anonymous / transparent','all',12],
  ['latency','Azami gecikme (ms)','100–30000','3000',5],
  ['uptime','Asgari uptime (%)','0–100','0',3]
 ].map(([id,label,placeholder,value,max])=>({type:18,label,component:{type:4,custom_id:id,style:1,placeholder,value,required:id!=='country',max_length:max}}))};
}
