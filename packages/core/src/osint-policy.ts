// Compact shared Discord application-command contract; one global root, all OSINT subcommands.
const q=(name:string,description:string,input='hedef',inputDesc='Araştırma hedefi')=>({type:1,name,description,options:[{type:3,name:input,description:inputDesc,required:true,max_length:250}]});
const choice=(name:string,description:string,values:string[])=>({type:3,name,description,required:false,choices:values.map(v=>({name:v,value:v}))});
export const osintCommand={name:'osint',description:'Turkish Osint araştırma, proxy ve XP erişim komutları.',options:[
 {type:1,name:'profil',description:'Günlük XP araştırma limitini gör.'},
 {type:1,name:'yardim',description:'Araçları ve yeni web platformunu öğren.'},
 q('dns','DNS A/AAAA/MX/NS/TXT kayıtlarını kontrol et.','alan','example.com'),
 q('ip','IP, ters DNS ve ağ özeti.','adres','8.8.8.8'),
 q('url','Pasif URL biçimsel risk kontrolü.','adres','https://example.com'),
 q('rdap','Alan adı RDAP kayıt bilgileri.','alan','example.com'),
 q('subdomain','CT üzerinden pasif alt alan adları.','alan','example.com'),
 q('sertifika','CT sertifika geçmişi.','alan','example.com'),
 q('asn','RIPEstat ağ prefix ve ASN kontrolü.','adres','8.8.8.8'),
 q('cve','NVD CVE zafiyet kataloğu.','kod','CVE-2024-12345'),
 q('email','SPF ve DMARC DNS kontrolü.','alan','example.com'),
 q('hash','VirusTotal SHA-256 itibar sorgusu (API key gerekir).','sha256','64 haneli SHA-256'),
 {type:1,name:'proxy-generator',description:'Güncel proxy listesini sağlayıcı metaverisine göre filtrele.',options:[
  choice('protokol','İstediğin proxy türü',['http','https','socks4','socks5']),
  {type:3,name:'ulke',description:'İki harfli ülke kodu: TR, DE, US',required:false,max_length:2},
  choice('anonimlik','Proxy anonimlik seviyesi',['elite','anonymous','transparent']),
  {type:4,name:'gecikme',description:'Azami sağlayıcı gecikmesi (ms)',required:false,min_value:100,max_value:30000},
  {type:4,name:'uptime',description:'Asgari sağlayıcı uptime yüzdesi',required:false,min_value:0,max_value:100},
  {type:4,name:'adet',description:'Sonuç sayısı (1–25)',required:false,min_value:1,max_value:25}
 ]},
 q('proxy-checker','ProxyScrape son kontrol meta verisine göre durum incele.','adres','http://1.2.3.4:8080'),
 {type:1,name:'temp-mail',description:'Geçici e-posta sağlayıcısının yapılandırma durumunu gör.'},
 {type:1,name:'temp-number',description:'Sanal numara/SMS sağlayıcısının yapılandırma durumunu gör.'},
 {type:1,name:'kanal',description:'Owner: komutların kullanılabileceği OSINT kanalını seç.',options:[{type:7,name:'hedef',description:'OSINT metin kanalı',required:true,channel_types:[0,5]}]}
]};
