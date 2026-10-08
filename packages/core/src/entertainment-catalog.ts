// Shared by Discord registration and the management panel; contains no server dependencies.
const text=(name:string,description:string,required=true,max_length=400)=>({name,description,type:3,required,max_length});
const number=(name:string,description:string,min_value:number,max_value:number,required=false)=>({name,description,type:4,required,min_value,max_value});
const user=(required=false)=>({name:'uye',description:'Bir sunucu üyesi seç',type:6,required});
const difficulty={name:'zorluk',description:'Oyun seviyesi',type:3,required:false,choices:[{name:'Kolay',value:'kolay'},{name:'Normal',value:'normal'},{name:'Zor',value:'zor'}]};
export const entertainmentCategories=[{id:'eglence',name:'Eğlence & arkadaşlık',description:'Sohbeti renklendiren 14 komut'},{id:'oyun',name:'Mini oyunlar',description:'Düğmeler ve formlarla oynanan 10 oyun'},{id:'topluluk',name:'Topluluk & araçlar',description:'Profil, sıralama ve sunucu bilgileri'}];
export const entertainmentCommands=[
 {name:'zar',description:'1–6 zar at; her zarın sonucunu ve toplamını gör.',category:'eglence',options:[number('adet','Kaç zar atılsın?',1,6),{...number('yuz','Zarın yüz sayısı',6,100),choices:[{name:'6 yüz',value:6},{name:'20 yüz',value:20},{name:'100 yüz',value:100}]}]},
 {name:'yazitura',description:'Yazı tura at; dilersen sonucu tahmin et.',category:'eglence',options:[{...text('tahmin','Tahminin',false),choices:[{name:'Yazı',value:'yazi'},{name:'Tura',value:'tura'}]}]},
 {name:'8top',description:'Sihirli 8 topa bir soru sor; eğlencelik yanıt al.',category:'eglence',options:[text('soru','8 topa soracağın soru',true,300)]},
 {name:'sans',description:'Bugünkü eğlencelik şans yüzdesini keşfet.',category:'eglence'},
 {name:'uyum',description:'Bir arkadaşınla günün eğlencelik uyumunu gör.',category:'eglence',options:[user(true)]},
 {name:'iltifat',description:'Kendine veya bir arkadaşına güzel bir söz gönder.',category:'eglence',options:[user()]},
 {name:'saka',description:'Kısa ve dostça bir şakayla sohbete renk kat.',category:'eglence'},
 {name:'espri',description:'Kelime oyunlarıyla bir tebessüm bırak.',category:'eglence'},
 {name:'motivasyon',description:'Güne devam etmek için küçük bir motivasyon al.',category:'eglence'},
 {name:'gununsozu',description:'Bugünün özgün TurkishPix sözünü gör.',category:'eglence'},
 {name:'sec',description:'Verdiğin 2–10 seçenek arasından rastgele seçim yap.',category:'eglence',options:[text('secenekler','Seçenekleri | ile ayır: Çay | Kahve',true,500)]},
 {name:'karistir',description:'2–20 maddelik bir listenin sırasını karıştır.',category:'eglence',options:[text('liste','Maddeleri | ile ayır',true,800)]},
 {name:'takim',description:'İsim listesini dengeli ve rastgele takımlara böl.',category:'eglence',options:[text('kisiler','2–30 ismi | ile ayır',true,1000),number('adet','Takım sayısı',2,6,true)]},
 {name:'anket',description:'2–5 seçenekli, süreli bir topluluk anketi başlat.',category:'eglence',options:[text('soru','Anketin sorusu',true,250),text('secenekler','Seçenekleri | ile ayır',true,400),number('dakika','1–60 dakika; varsayılan 10',1,60)]},
 {name:'tas-kagit-makas',description:'Botla taş, kâğıt, makas oyna.',category:'oyun'},
 {name:'sayi-tahmin',description:'İpuçlarıyla gizli sayıyı 6 denemede bul.',category:'oyun',options:[difficulty]},
 {name:'kelime-tahmin',description:'Harf veya kelime girerek gizli kelimeyi bul.',category:'oyun'},
 {name:'bilmece',description:'Dört seçenekli bir bilmece çöz.',category:'oyun'},
 {name:'bilgi',description:'Genel kültür sorusuyla kendini dene.',category:'oyun'},
 {name:'tarih-sorusu',description:'Türkiye tarihi hakkında kısa bir bilgi sorusu çöz.',category:'oyun'},
 {name:'matematik',description:'Seviyene uygun rastgele bir işlem çöz.',category:'oyun',options:[difficulty]},
 {name:'hafiza',description:'Emoji dizisini aklında tut ve doğru sırayı seç.',category:'oyun'},
 {name:'refleks',description:'Yeşil düğmeyi bekle ve tepki süreni ölç.',category:'oyun'},
 {name:'xox',description:'Botla XOX oyna; kolay, normal veya zor seviye seç.',category:'oyun',options:[difficulty]},
 {name:'profil',description:'Mini oyun istatistiklerini ve eğlence puanını gör.',category:'topluluk',options:[user()]},
 {name:'liderlik',description:'Sunucunun en yüksek puanlı 10 oyuncusunu gör.',category:'topluluk'},
 {name:'avatar',description:'Kendinin veya seçtiğin üyenin avatarını aç.',category:'topluluk',options:[user()]},
 {name:'kullanici',description:'Üyenin hesap, katılım ve rol bilgilerini gör.',category:'topluluk',options:[user()]},
 {name:'sunucu',description:'Sunucunun üye, kanal ve takviye bilgilerini gör.',category:'topluluk'},
 {name:'ping',description:'Botun gerçek Gateway ve işlem gecikmesini ölç.',category:'topluluk'}
];
export const entertainmentNames=entertainmentCommands.map(c=>c.name);
