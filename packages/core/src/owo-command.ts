export const OWO_ACCESS_ROLE='1557607714681786448';
export const OWO_SOURCE_BOT='408785106942164992';
const reportOptions=[{type:3,name:'tarih',description:'YYYY-AA-GG; ayın 1’inden başlayan üç günlük dönemi seç',required:false,max_length:10},{type:3,name:'oyun',description:'Sonuç ekranında gösterilecek oyun',required:false,choices:[{name:'Tüm oyunlar',value:'TUMU'},{name:'Mines',value:'MINES'},{name:'Blackjack',value:'BLACKJACK'},{name:'Coinflip',value:'COINFLIP'},{name:'Slots',value:'SLOTS'},{name:'WSG',value:'WSG'},{name:'Battle',value:'BATTLE'}]},{type:4,name:'sayfa',description:'Oyun ve el toplamı tablolarının sayfası',required:false,min_value:1,max_value:100}];
export const owoCommand={name:'owo',description:'Rol/owner yetkili, süreli OwO oyun analizi ve kanal istatistikleri.',options:[
 {type:1,name:'yardim',description:'Bu kanalda süreli, özel analiz oturumu başlat; hamleleri kendin yap.',options:[{type:4,name:'sure',description:'Dakika (varsayılan 5, en fazla 15)',required:false,min_value:1,max_value:15}]},
 {type:1,name:'durum',description:'Kendi analiz oturumunun kalan süresini ve gözlenen oyunu gör.'},
 {type:1,name:'durdur',description:'Kendi analiz oturumunu hemen kapat.'},
 {type:1,name:'kur',description:'İzlenecek kanal ve doğrulanacak kaynak bot hesabını seç.',options:[{type:7,name:'kanal',description:'İzinli metin kanalı (boşsa bu kanal)',required:false,channel_types:[0]},{type:6,name:'kaynak',description:'Oyun mesajlarını yayımlayan bot (boşsa resmî OwO)',required:false}]},
 {type:1,name:'tara',description:'Son 700 mesajı tara; sonuçları tarih dönemlerine ayır.',options:[{type:4,name:'adet',description:'Son kaç mesaj? Varsayılan 700, en fazla 5000',required:false,min_value:100,max_value:5000}]},
 {type:1,name:'istatistik',description:'Tarihli kanal raporu, 3×3 Mines çizimi ve gözlenen BJ el oranları.',options:reportOptions},
 {type:1,name:'benim',description:'Yalnız kendi tarihli oyun/tahta/el oranlarını bot kartlarında gör.',options:reportOptions},
 {type:1,name:'ocr',description:'Görsel okuma durumunu ve OCR güveniyle birlikte son metinleri gör.'},
 {type:1,name:'takip',description:'Sürekli kaynak izlemesini ve üç günlük otomatik taramayı aç/kapat.',options:[{type:5,name:'acik',description:'Sürekli izleme açık mı?',required:true}]},
 {type:1,name:'komutlar',description:'OwO komut/alias rehberini kaynak ve analiz kapsamıyla gör.',options:[{type:3,name:'arama',description:'Komut veya kısa adı (bj, cf, mine, hunt...)',required:false,max_length:50},{type:3,name:'kategori',description:'gambling, economy, animals, social, utility, emotes...',required:false,max_length:30},{type:4,name:'sayfa',description:'Katalog sayfası',required:false,min_value:1,max_value:100}]}
]};
