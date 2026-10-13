export const OWO_ACCESS_ROLE='1557607714681786448';
export const OWO_SOURCE_BOT='408785106942164992';
export const owoCommand={name:'owo',description:'Rol/owner yetkili, süreli OwO oyun analizi ve kanal istatistikleri.',options:[
 {type:1,name:'yardim',description:'Bu kanalda süreli, özel analiz oturumu başlat; hamleleri kendin yap.',options:[{type:4,name:'sure',description:'Dakika (varsayılan 5, en fazla 15)',required:false,min_value:1,max_value:15}]},
 {type:1,name:'durum',description:'Kendi analiz oturumunun kalan süresini ve gözlenen oyunu gör.'},
 {type:1,name:'durdur',description:'Kendi analiz oturumunu hemen kapat.'},
 {type:1,name:'kur',description:'İzlenecek kanal ve doğrulanacak kaynak bot hesabını seç.',options:[{type:7,name:'kanal',description:'İzinli metin kanalı (boşsa bu kanal)',required:false,channel_types:[0]},{type:6,name:'kaynak',description:'Oyun mesajlarını yayımlayan bot (boşsa resmî OwO)',required:false}]},
 {type:1,name:'tara',description:'Yapılandırılan kanalın erişilebilir geçmişini sayfalı tara; sonucu birleştir.'},
 {type:1,name:'istatistik',description:'Kanal sonuçları, kullanıcı netleri ve açıklanan Mines tahtalarını incele.'},
 {type:1,name:'benim',description:'Yalnız kendi oyunlarını, net sonuçlarını ve Mines hücre geçmişini incele.'},
 {type:1,name:'komutlar',description:'OwO komut/alias rehberini kaynak ve analiz kapsamıyla gör.',options:[{type:3,name:'arama',description:'Komut veya kısa adı (bj, cf, mine, hunt...)',required:false,max_length:50},{type:3,name:'kategori',description:'gambling, economy, animals, social, utility, emotes...',required:false,max_length:30},{type:4,name:'sayfa',description:'Katalog sayfası',required:false,min_value:1,max_value:100}]}
]};
