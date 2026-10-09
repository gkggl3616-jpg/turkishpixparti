const text=(name:string,description:string,max_length:number)=>({name,description,type:3,required:true,max_length});
export const supportCommands=[
 {name:'bilet',description:'Özel destek kanalları ve bilet panelini yönet.',options:[
  {name:'kur',description:'Bilet paneli, kategori ve yetkili rollerini seç.',type:1,options:[{name:'kanal',description:'Bilet aç düğmesinin gönderileceği kanal',type:7,channel_types:[0,5],required:true},{name:'kategori',description:'Özel bilet kanallarının kategorisi',type:7,channel_types:[4],required:true},{name:'yetkili',description:'Biletlerde etiketlenecek yetkili rolü',type:8,required:true},{name:'yetkili2',description:'İkinci yetkili rolü',type:8,required:false},{name:'yetkili3',description:'Üçüncü yetkili rolü',type:8,required:false}]},
  {name:'ac',description:'Sana ve yetkililere özel bir destek kanalı aç.',type:1,options:[text('konu','Destek konusu',100),text('mesaj','Talebinin ayrıntıları',1000)]},
  {name:'kapat',description:'Bu kanaldaki bileti kapat; görüşmeler korunur.',type:1},
  {name:'liste',description:'Açtığın biletlerin kanallarını görüntüle.',type:1}
 ]},
 {name:'cekilisler',description:'Çekilişleri gör; düğmelerle bitir, iptal et veya yeniden seç.'}
];
