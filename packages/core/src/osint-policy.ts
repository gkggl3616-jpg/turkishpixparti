// Public Discord setup commands. Research happens through persistent panel buttons.
const channel={type:7,name:'kanal',description:'Panelin gönderileceği kanal (boşsa burası)',required:false,channel_types:[0,5]};
export const osintSetupCommand={name:'kur',description:'TurkishPix butonlu araç panellerini kur.',default_member_permissions:null,options:[
 {type:1,name:'proxy',description:'Proxy Generator panelini kur.',options:[channel]},
 {type:1,name:'proxy-checker',description:'Proxy Generator ve Checker panelini kur.',options:[channel]},
 {type:1,name:'osint',description:'Butonlu araştırma ve sorgu panelini kur.',options:[channel]},
 {type:1,name:'temp-mail',description:'Geçici e-posta bağlantı durum panelini kur.',options:[channel]}
]};
