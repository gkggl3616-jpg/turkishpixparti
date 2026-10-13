export const OWO_ACCESS_ROLE='1557607714681786448';
export const OWO_SOURCE_BOT='408785106942164992';
export const owoCommand={name:'owo',description:'Kanal, tarihli tarama ve kişisel canlı OwO önerileri.',options:[
 {type:1,name:'kanal',description:'İzlenecek metin kanalını ve oyun botunu seç.',options:[{type:7,name:'kanal',description:'Boşsa bu kanal',required:false,channel_types:[0]},{type:6,name:'kaynak',description:'Boşsa resmî OwO; oyun mesajlarını yayımlayan bot',required:false}]},
 {type:1,name:'tara',description:'Erişilebilir en eski mesaja kadar tara; istersen başlangıç tarihi seç.',options:[{type:3,name:'tarih',description:'YYYY-AA-GG; İstanbul saatinde bu tarihten itibaren (boşsa tüm geçmiş)',required:false,max_length:10}]},
 {type:1,name:'calistir',description:'Son tarama verileriyle kendi oyunlarını canlı izle ve öneri göster.',options:[{type:4,name:'sure',description:'Dakika 1–1440; boşsa durdurana kadar sürekli',required:false,min_value:1,max_value:1440}]}
]};
