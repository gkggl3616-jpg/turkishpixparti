import {osintCategories,toolHelp} from './osint-navigation';
import {intelligenceCatalog} from './osint-intelligence-catalog';
import {webIntelligenceCatalog} from './osint-web-intelligence-catalog';
import {socialCatalog} from './osint-social-catalog';
import {multiCatalog} from './osint-multi-catalog';
import {comboPresets} from './osint-scan-catalog';
import {config} from './config';
import {COMPONENTS_V2,uiText,uiSeparator,uiRow,uiButton} from './discord-ui';
import {extraCatalog} from './osint-extra-catalog';
export type OsintPanelKind='proxy'|'combos'|'infrastructure'|'threats'|'communication'|'research'|'web'|'social'|'osint'|'mail';
export const osintWebLink=()=>process.env.OSINT_WEB_URL||config().appUrl+'/osint';
const link=(label:string,url:string)=>({type:2,style:5,label,url});
const action=(id:string,label:string,style=2,emoji?:string)=>({...uiButton('tp-osint:'+id,label,style),...(emoji?{emoji:{name:emoji}}:{})});
export function osintPanel(kind:OsintPanelKind,thumbnail?:string){
 const id=kind==='osint'?'infrastructure':kind==='mail'?'communication':kind,c=osintCategories.find(c=>c.id===id)!;
 const web=(tool:string)=>{const u=new URL(osintWebLink());u.searchParams.set('tool',tool);return u.href;};
 const buttons=id==='proxy'?[uiRow(action('proxy','Proxy Al',3,'⚡'),action('proxy-filters','Filtrele',2,'⚙️'),action('query:proxy-check','Proxy Checker',1,'✅'))]
 :id==='communication'?[uiRow(action('inbox:mail','Temp Mail & Kutu',3,'✉️'),action('inbox:number','Numara & SMS',1,'📲')),uiRow(link('Alias Tool',web('aliases')),action('query:usernames','Nick Araştırması',2,'👤'))]
 :[uiRow(action('category:'+id,'Araçları Seç',3,'🔎'),link('Web Çalışma Alanı',web(c.tools[0])))];
 return {flags:COMPONENTS_V2,components:[{type:17,accent_color:parseInt(c.accent.slice(1),16),components:[
  {type:12,items:[{media:{url:new URL('/api/osint/banner/'+id+'?v=2.23.0',osintWebLink()).href},description:c.label+' · OSINT kategori kapağı'}]},
  {type:9,components:[uiText('## '+c.label+'\n*'+c.caption+'*')],accessory:{type:11,media:{url:thumbnail||config().appUrl+'/brand/turkishpix-bot.png'},description:'TurkishPix'}},
  uiText(c.description+'\n\n**Örnek:** '+c.example+'\n-# Discord sorgu sonuçları kendi DM’inde; web sorgu sonuçları web çalışma alanında.'),uiSeparator(),...buttons,
  uiRow(action('help:'+id,'? Nasıl Kullanılır',2),action('profile','Level & Kota',2,'⭐'),link('TurkishPix','https://discord.gg/turkishpix'))
 ]}],allowedMentions:{parse:[]}};
}
const fields:Record<string,{label:string;placeholder:string}>={
 'api-directory':{label:'API kategorisi',placeholder:'AI, Finans, Oyun, Hava Durumu veya Tümü'},'minecraft-status':{label:'Minecraft Java sunucu adresi',placeholder:'play.example.com:25565'},'roblox-username':{label:'Roblox kullanıcı adı',placeholder:'Roblox'},
 'qr-code':{label:'QR içine yazılacak metin veya bağlantı',placeholder:'https://example.com'},'repository-search':{label:'Açık kaynak bot / araç / altyapı',placeholder:'discord moderation bot'},
 'combo-domain':{label:'Alan adı · Domain Kombosu',placeholder:'example.com'},'combo-ip':{label:'IP · Ağ Kombosu',placeholder:'1.1.1.1'},headers:{label:'Genel web adresi',placeholder:'https://example.com'},geo:{label:'IP adresi',placeholder:'1.1.1.1'},threat:{label:'IP adresi',placeholder:'1.1.1.1'},usernames:{label:'Açık profil kullanıcı adı',placeholder:'octocat'},github:{label:'GitHub deposu',placeholder:'owner/repo'},archives:{label:'Alan adı',placeholder:'example.com'},ioc:{label:'IP / domain / URL / hash',placeholder:'example[.]com'},
 dns:{label:'Alan adı',placeholder:'example.com'},ip:{label:'IP adresi',placeholder:'8.8.8.8'},url:{label:'URL',placeholder:'https://example.com'},
 rdap:{label:'Alan adı',placeholder:'example.com'},subdomains:{label:'Alan adı',placeholder:'example.com'},tls:{label:'Alan adı',placeholder:'example.com'},
 asn:{label:'IP adresi',placeholder:'8.8.8.8'},cve:{label:'CVE kimliği',placeholder:'CVE-2024-12345'},email:{label:'E-posta alan adı',placeholder:'example.com'},
 'dns-history':{label:'Alan adı / DNS geçmişi',placeholder:'example.com'},reports:{label:'Alan adı / rapor',placeholder:'example.com'},malware:{label:'SHA-256 / hash raporu',placeholder:'64 haneli dosya özeti'},hash:{label:'SHA-256',placeholder:'64 haneli dosya özeti'},'proxy-check':{label:'Proxy adresi',placeholder:'http://1.2.3.4:8080'}
};
export function osintQueryModal(kind:string){
 const extra=[...extraCatalog,...intelligenceCatalog,...webIntelligenceCatalog,...multiCatalog,...socialCatalog].find(t=>t.id===kind),combo=comboPresets.find(c=>c.id===kind),field=fields[kind]||(combo?{label:combo.name,placeholder:combo.inputs.includes('ip' as never)?'1.1.1.1':combo.inputs.includes('username' as never)?'octocat':'example.com'}:extra&&(!('input' in extra)||extra.input!=='panel')?{label:extra.name.slice(0,45),placeholder:kind.startsWith('social-')?'Kullanıcı adı veya desteklenen ID':'input' in extra&&extra.input==='url'?'https://example.com':'input' in extra&&extra.input==='ip'?'1.1.1.1':'input' in extra&&String(extra.input)==='dkim'?'example.com selector':'example.com'}:['number','sms-inbox'].includes(kind)?{label:'Kişisel numara / SMS',placeholder:'inbox'}:null);if(!field)return null;
 return {custom_id:'tp-osint:modal:'+kind,title:kind==='proxy-check'?'TurkishPix · Proxy Checker':'TurkishPix · Araştırma',components:[{type:18,label:field.label,component:{type:4,custom_id:'target',style:kind==='qr-code'?2:1,placeholder:field.placeholder,required:true,min_length:kind==='qr-code'?1:2,max_length:kind==='qr-code'?1800:250}}]};
}
export function osintMailModal(){return {custom_id:'tp-osint:modal:mail',title:'TurkishPix · Adresini Seç',components:[{type:18,label:'Adres adı · boşsa rastgele',component:{type:4,custom_id:'localPart',style:1,required:false,max_length:40,placeholder:'frizz2025'}},{type:18,label:'Domain · boşsa aktif sağlayıcı seçilir',component:{type:4,custom_id:'domain',style:1,required:false,max_length:150,placeholder:'Aktif alan adları web Temp Mail ekranında'}},{type:18,label:'Aktif adres değişsin mi? evet / hayır',component:{type:4,custom_id:'replace',style:1,required:true,value:'hayır',max_length:5}}]};}
export function osintToolMenus(tools:{id:string;name:string;label:string;enabled:boolean;icon:string}[]){const available=tools.filter(t=>t.enabled&&osintQueryModal(t.id));return Array.from({length:Math.ceil(available.length/25)},(_,i)=>({type:1,components:[{type:3,custom_id:'tp-osint:tool:'+i,placeholder:'Araştırma araçları '+(i*25+1)+'–'+Math.min((i+1)*25,available.length),min_values:1,max_values:1,options:available.slice(i*25,(i+1)*25).map(t=>({label:t.name.slice(0,100),value:t.id,description:t.label.slice(0,100),emoji:{name:t.icon}}))}]}));}
export function osintProxyModal(){
 return {custom_id:'tp-osint:modal:proxy',title:'TurkishPix · Proxy Filtreleri',components:[
  ['protocol','Protokol','all / http / https / socks4 / socks5','all',8],
  ['country','Ülke kodu','TR, DE, US — boşsa tüm ülkeler','',2],
  ['anonymity','Anonimlik','all / elite / anonymous / transparent','all',12],
  ['latency','Azami gecikme (ms)','100–30000','3000',5],
  ['uptime','Asgari uptime (%)','0–100','0',3]
 ].map(([id,label,placeholder,value,max])=>({type:18,label,component:{type:4,custom_id:id,style:1,placeholder,value,required:id!=='country',max_length:max}}))};
}
