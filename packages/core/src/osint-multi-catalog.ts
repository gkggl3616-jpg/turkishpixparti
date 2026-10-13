// Browser-safe inventory: API integrations and public profile adapters are counted separately.
export const multiCatalog=[
 {id:'dns-multi',name:'Çoklu DNS DoH',label:'Bağımsız çözümleyiciler, DNSSEC ve A / AAAA / MX / TXT karşılaştırması',input:'domain',icon:'🌐',enabled:true},
 {id:'geo-multi',name:'Çoklu GeoIP',label:'Bağlı bütün GeoIP API’lerinde ülke, ASN ve ağ bilgisi',input:'ip',icon:'🌍',enabled:true},
 {id:'ip-multi',name:'Çoklu IP İtibarı',label:'Bütün bağlı ağ / tehdit sağlayıcıları; kaynak başına gerçek durum',input:'ip',icon:'🛡️',enabled:true},
 {id:'domain-multi',name:'Çoklu Domain Kaynakları',label:'RDAP, CT, itibar, arşiv ve bağlı domain API’leri',input:'domain',icon:'🔎',enabled:true},
 {id:'url-multi',name:'Çoklu URL İtibarı',label:'Mevcut URL raporları; yeni üçüncü taraf taraması gönderilmez',input:'url',icon:'🔗',enabled:true},
 {id:'hash-multi',name:'Çoklu Hash İtibarı',label:'Bağlı hash / zararlı örnek meta veri API’leri',input:'hash',icon:'🧬',enabled:true},
 {id:'cve-multi',name:'Çoklu CVE Kaynakları',label:'NVD, CVE.org, GitHub advisories ve CISA KEV',input:'cve',icon:'⚠️',enabled:true},
 {id:'security-score',name:'Güvenlik Skoru & Bulgular',label:'Kanıt, risk, kapsam, çözüm önerisi ve test edilmeyen kontroller',input:'domain',icon:'🛡️',enabled:true},
 {id:'report-history',name:'Kendi Web Raporlarım',label:'Hesaba ait şifreli araştırma geçmişi, filtreler ve dışa aktarma',input:'panel',icon:'📑',enabled:true},
 {id:'inbox-hub',name:'Temp Mail & Number Merkezi',label:'Kişisel canlı gelen kutuları, sağlayıcılar ve Discord özel kutusu',input:'panel',icon:'📬',enabled:true}
] as const;
export type MultiKind=(typeof multiCatalog)[number]['id'];
export const extraProviderDefinitions=[
 {id:'quad9',name:'Quad9 DoH / HTTP2',key:false},{id:'adguard',name:'AdGuard unfiltered DoH',key:false},{id:'mullvad',name:'Mullvad DoH',key:false},{id:'dns-sb',name:'DNS.SB DoH',key:false},{id:'alidns',name:'AliDNS DoH',key:false},
 {id:'ipapi-co',name:'ipapi.co',key:false},{id:'ipapi-is',name:'ipapi.is',key:false},
 {id:'ipinfo',name:'IPinfo Lite',key:true,env:'IPINFO_TOKEN'},{id:'ipregistry',name:'ipregistry',key:true,env:'IPREGISTRY_KEY'},{id:'ipgeolocation',name:'IPGeolocation.io',key:true,env:'IPGEOLOCATION_KEY'},{id:'ipdata',name:'ipdata.co',key:true,env:'IPDATA_KEY'},{id:'ip2location',name:'IP2Location.io',key:true,env:'IP2LOCATION_KEY'},
 {id:'shodan',name:'Shodan Host API',key:true,env:'SHODAN_API_KEY'},{id:'pulsedive',name:'Pulsedive indicator API',key:true,env:'PULSEDIVE_KEY'},{id:'urlhaus',name:'abuse.ch URLhaus',key:true,env:'ABUSECH_AUTH_KEY'},{id:'threatfox',name:'abuse.ch ThreatFox',key:true,env:'ABUSECH_AUTH_KEY'},
 {id:'google-safebrowsing',name:'Google Safe Browsing v4',key:true,env:'SAFE_BROWSING_KEY'},{id:'google-webrisk',name:'Google Web Risk',key:true,env:'WEBRISK_KEY'},
 {id:'whoisxml',name:'WhoisXML WhoisService',key:true,env:'WHOISXML_API_KEY'},{id:'openpagerank',name:'OpenPageRank',key:true,env:'OPENPAGERANK_API_KEY'},{id:'cisa-kev',name:'CISA Known Exploited Vulnerabilities',key:false},
 {id:'dropmail',name:'DropMail GraphQL',key:true,env:'DROPMAIL_TOKEN'},{id:'guerrilla',name:'Guerrilla Mail JSON API',key:false},{id:'signalwire',name:'SignalWire sahip olunan SMS numaraları',key:true,env:'SIGNALWIRE_CREDENTIALS'},
 {id:'mailslurp',name:'MailSlurp email / SMS inboxes',key:true,env:'MAILSLURP_API_KEY'}
];
export const temporaryProviderDirectory=[
 {name:'Temp-Mail.io',providerId:'temp-mail-io',url:'https://temp-mail.io',docs:'https://docs.temp-mail.io/docs/getting-started',kind:'mail',state:'API_KEY',notice:'Resmî API adaptörü hazır; premium API anahtarı gerekir.'},
 {name:'TempMail.lol',providerId:'tempmail-lol',url:'https://tempmail.lol',docs:'https://tempmail.lol/en/api/',kind:'mail',state:'API_ADAPTER',notice:'Yeni kutu tokenı ile erişim; 1 saat, yalnız kendi adresine gelen mesajlar.'},
 {name:'TempMail.plus',url:'https://tempmail.plus',docs:'https://tempmail.plus',kind:'mail',state:'API_UNVERIFIED',notice:'PIN destekleyen web hizmeti. Bu uygulama için belgelenmiş özel kutu API bağlantısı doğrulanmadı.'},
 {name:'Inboxes.com',url:'https://inboxes.com',docs:'https://inboxes.com/ourapi',kind:'mail',state:'API_ACCESS_REQUIRED',notice:'Resmî sayfa RapidAPI anahtar/aboneliği istiyor; özel oturum kapsamı bu sürümde bağlanmadı.'},
 ...['sms-receive-online.com','receive-sms.io','sms24.me','anonymsms.com','receive-smss.com','freephonenum.com','sms-online.co','receive-sms.cc','receive-sms-online.info','receive-sms-free.cc'].map(host=>({name:host,url:'https://'+host,kind:'number',state:'EXTERNAL_SITE',notice:'Videodaki kaynak. Kişisel numara API’si doğrulanmadı; paylaşılan SMS bu uygulamaya aktarılmaz.'})),
 ...['blondmail.com','chapsmail.com','chitthi.in','dropjar.com','fexbox.org','fexpost.com','fextemp.com','fivermail.com','getairmail.com','getmule.com','getnada.com','gimpmail.com','merepost.com','olipii.com','pokemail.net','replyloop.com','robot-mail.com','ruutukf.com','sharklasers.com','maxxspace.com','rover.info'].map(host=>({name:host,url:'https://'+host,kind:'mail',state:'VIDEO_DOMAIN',notice:'Videodaki domain adı. Güncel sahiplik, adres kullanılabilirliği ve ayrı API desteği doğrulanmadı.'})),
 {name:'Mail.tm',providerId:'mailtm',url:'https://mail.tm',kind:'mail',state:'API_ADAPTER',notice:'Kişisel hesap oluşturma ve mesaj API’si.'},{name:'Mail.gw',providerId:'mailgw',url:'https://mail.gw',kind:'mail',state:'API_ADAPTER',notice:'Kişisel hesap oluşturma ve mesaj API’si.'},
 {name:'Guerrilla Mail',providerId:'guerrilla',url:'https://www.guerrillamail.com',kind:'mail',state:'API_ADAPTER',notice:'Sunucuda saklanan kişisel API oturumu; rastgele adres.'},
 {name:'DropMail',url:'https://dropmail.me/api/',kind:'mail',state:'API_KEY',notice:'Geçerli af_ token gerekir.'},{name:'MailSlurp',url:'https://www.mailslurp.com',kind:'mail',state:'API_KEY',notice:'Hesap API anahtarı ve sağlayıcı kotası gerekir.'},
 {name:'SignalWire',url:'https://signalwire.com',kind:'number',state:'OWNED_NUMBER_API',notice:'Hesaba ait numara; süreli üye ataması ve gelen SMS API’si.'},{name:'MailSlurp SMS',url:'https://www.mailslurp.com/docs/txt-sms/',kind:'number',state:'OWNED_NUMBER_API',notice:'Önceden sahip olunan numara / SMS planı gerekir; uygulama numara satın almaz.'},
 {name:'Twilio',url:'https://www.twilio.com',kind:'number',state:'OWNED_NUMBER_API',notice:'Hesabın sahip olduğu numara, owner ataması, kişisel gelen SMS.'}
];
