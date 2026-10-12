// Kept separate from DNS/networking so slash-command registration stays lightweight.
const sub=(name:string,description:string,targetName:string,targetDescription:string)=>({type:1,name,description,options:[{type:3,name:targetName,description:targetDescription,required:true,max_length:250}]});
export const osintCommand={name:'osint',description:'Turkish Osint: XP seviyene göre araştırma konsolu.',options:[
 {type:1,name:'profil',description:'Günlük hakkını, XP seviyeni ve erişim paketini gör.'},
 sub('dns','Alan adının DNS kayıtlarını kontrol et.','alan','Örnek: example.com'),
 sub('ip','IP adresinin sınıfını ve PTR kaydını incele.','adres','Örnek: 8.8.8.8'),
 sub('url','URL biçimini ve pasif risk sinyallerini incele.','adres','Örnek: https://example.com'),
 {type:1,name:'yardim',description:'Araçların kapsamı ve web giriş bağlantısını gör.'}
]};
