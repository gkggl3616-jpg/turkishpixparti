// Thin shortcuts into the shared OSINT engine; /kur still installs categories only.
export const osintUtilityCommands=[
 {name:'qr-olustur',description:'Metin/bağlantıdan QR üret; PNG kendi DM kutuna gönderilir.',options:[{type:3,name:'metin_veya_url',description:'QR içeriği (en fazla 2000 UTF-8 bayt)',required:true,min_length:1,max_length:1800}]},
 {name:'api-ara',description:'Ücretsiz API kataloğunu kategoriye göre araştır.',options:[{type:3,name:'kategori',description:'AI, Finans, Oyun, Hava Durumu veya Tümü',required:true,max_length:100}]},
 {name:'altyapi-ara',description:'MIT/Apache lisanslı açık kaynak bot ve web altyapısı bul.',options:[{type:3,name:'dil_veya_framework',description:'Örnek: discord bot typescript veya nextjs template',required:true,min_length:2,max_length:120},{type:3,name:'lisans',description:'Kullanım koşullarını ayrıca incele',required:false,choices:[{name:'MIT',value:'mit'},{name:'Apache 2.0',value:'apache-2.0'}]}]},
 {name:'temp-mail',description:'Mevcut kişisel Temp Mail kutunu oluştur/görüntüle; yalnız sana yanıt verir.'},
 {name:'proxy-cek',description:'Mevcut proxy havuzundan filtreli TXT dosyasını DM’ye al.',options:[{type:3,name:'tur',description:'Proxy protokolü',required:true,choices:[{name:'HTTP',value:'http'},{name:'HTTPS',value:'https'},{name:'SOCKS4',value:'socks4'},{name:'SOCKS5',value:'socks5'}]}]},
 {name:'roblox-isim-kontrol',description:'Roblox API’de tam kullanıcı adı eşleşmesini kontrol et.',options:[{type:3,name:'kullanici_adi',description:'Roblox kullanıcı adı (görünen ad değil)',required:true,min_length:3,max_length:20}]},
 {name:'mc-durum',description:'Genel Minecraft Java sunucusuna tek durum ping’i gönder.',options:[{type:3,name:'ip',description:'Genel IP veya alan adı; URL girme',required:true,max_length:253},{type:4,name:'port',description:'Java portu (varsayılan 25565)',required:false,min_value:1,max_value:65535}]}
];
export function utilityCommandInput(i:any):{kind:string;target:string}|null{
 const value=(name:string)=>i.options.getString(name,true);
 switch(i.commandName){
  case 'qr-olustur':return {kind:'qr-code',target:value('metin_veya_url')};
  case 'api-ara':return {kind:'api-directory',target:value('kategori')};
  case 'altyapi-ara':return {kind:'repository-search',target:JSON.stringify({query:value('dil_veya_framework'),license:i.options.getString('lisans')||'mit'})};
  case 'proxy-cek':return {kind:'proxy',target:JSON.stringify({protocol:value('tur'),country:'',anonymity:'all',maxLatency:3000,minUptime:0})};
  case 'roblox-isim-kontrol':return {kind:'roblox-username',target:value('kullanici_adi')};
  case 'mc-durum':return {kind:'minecraft-status',target:JSON.stringify({host:value('ip'),port:i.options.getInteger('port')||25565})};
  default:return null;
 }
}
