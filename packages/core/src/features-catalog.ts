import {ticketTopicOption} from './ticket-policy';
// Pure catalog shared with the owner panel and Discord registration.
const text=(name:string,description:string,required=true,max_length=300)=>({name,description,type:3,required,max_length});
const num=(name:string,description:string,min_value:number,max_value:number,required=true)=>({name,description,type:4,required,min_value,max_value});
const user=(required=false)=>({name:'uye',description:'Bir sunucu üyesi seç',type:6,required});
const id=text('kayit','Listede gösterilen kayıt kodu',true,36);
const channel={name:'kanal',description:'Bu sunucudan bir metin kanalı seç',type:7,required:false,channel_types:[0,5]};
const cmd=(name:string,description:string,category:string,options:any[]=[],permission?:string)=>({name,description,category,options,...(permission?{default_member_permissions:permission}:{})});
export const featureCategories=[{id:'ekonomi',name:'🪙 Seviye & ekonomi'},{id:'planlama',name:'📝 Kişisel araçlar'},{id:'topluluk',name:'🎉 Topluluk etkinlikleri'},{id:'yonetim',name:'🛡️ Yetkili araçları'},{id:'rehber',name:'📚 Roller & rehber'}];
export const featureCommands=[
 cmd('uyeprofil','Seviye, sanal bakiye, itibar ve rozet kartını görüntüle.','ekonomi',[user()]),
 cmd('seviye','Sohbet XP’sini ve sonraki seviyeye ilerlemeyi gör.','ekonomi',[user()]),
 cmd('siralama','Sunucunun sohbet XP sıralamasını görüntüle.','ekonomi'),
 cmd('gunluk','Türkiye saatine göre günlük sanal ödülünü al.','ekonomi'),
 cmd('cuzdan','Kendinin veya bir üyenin sanal bakiyesini gör.','ekonomi',[user()]),
 cmd('transfer','Bir üyeye sanal Pix gönder; bakiyeler kalıcıdır.','ekonomi',[user(true),num('miktar','Gönderilecek sanal Pix',1,10000)]),
 cmd('magaza','Sanal Pix ile alınabilen profil rozetlerini gör.','ekonomi'),
 cmd('satinal','Profil mağazasından bir rozeti satın al.','ekonomi',[text('urun','Mağaza ürün kodu',true,40)]),
 cmd('envanter','Satın aldığın kalıcı profil rozetlerini görüntüle.','ekonomi'),
 cmd('rozetler','Seviye, aktiflik ve itibar başarı rozetlerini gör.','ekonomi',[user()]),
 cmd('tesekkur','Bir üyeye teşekkür ederek itibar kazandır.','ekonomi',[user(true)]),
 cmd('itibar','Üyenin topluluk teşekkür puanını görüntüle.','ekonomi',[user()]),
 cmd('hatirlat','Belirlediğin sürede sana özel hatırlatma gönder.','planlama',[num('dakika','1 dakika–30 gün',1,43200),text('mesaj','Sana hatırlatılacak mesaj',true,500)]),
 cmd('hatirlatmalar','Bekleyen kişisel hatırlatmalarını görüntüle.','planlama'),
 cmd('hatirlatmasil','Bekleyen bir hatırlatmanı iptal et.','planlama',[id]),
 cmd('notekle','Yalnızca sana görünen kalıcı bir not ekle.','planlama',[text('not','Not metni',true,1000)]),
 cmd('notlar','Kişisel notlarını görüntüle.','planlama'),
 cmd('notsil','Kişisel notlarından birini sil.','planlama',[id]),
 cmd('gorevekle','Kişisel yapılacaklar listene görev ekle.','planlama',[text('gorev','Yapılacak görev',true,500)]),
 cmd('gorevler','Açık ve tamamlanan kişisel görevlerini görüntüle.','planlama'),
 cmd('gorevtamamla','Kişisel bir görevi tamamlandı olarak işaretle.','planlama',[id]),
 cmd('gorevsil','Kişisel bir görevi listenden kaldır.','planlama',[id]),
 cmd('cekilis','Ücretsiz katılımlı, düğmeli bir çekiliş başlat.','topluluk',[text('odul','Ödül açıklaması; teslim organizatöre aittir',true,200),num('dakika','Çekiliş süresi (5 dakika–7 gün)',5,10080),channel,num('kazanan','Seçilecek kazanan sayısı',1,10,false)],'32'),
 cmd('cekilissonuc','Çekiliş sonucunu gör; organizatör erken sonuçlandırabilir.','topluluk',[id]),
 cmd('cekiliskapat','Kendi çekilişini sonuçlandırmadan iptal et.','topluluk',[id]),
 cmd('etkinlik','Düğmeyle katılımlı bir sunucu etkinliği planla.','topluluk',[text('baslik','Etkinlik adı',true,100),num('dakika','Kaç dakika sonra başlayacak?',5,43200),text('aciklama','Etkinliğin açıklaması',false,600)],'32'),
 cmd('etkinlikler','Yaklaşan etkinlikleri ve katılım sayılarını gör.','topluluk'),
 cmd('etkinlikkapat','Organizatör olarak etkinliği iptal et.','topluluk',[id]),
 cmd('oner','Sunucu için oylanabilir bir öneri gönder.','topluluk',[text('metin','Önerin',true,600)]),
 cmd('oneriler','Son topluluk önerilerini ve durumlarını görüntüle.','topluluk'),
 cmd('oneridurum','Bir öneriyi kabul et veya reddet.','topluluk',[id,{...text('durum','Yetkili kararı'),choices:[{name:'Kabul',value:'APPROVED'},{name:'Ret',value:'REJECTED'}]}],'32'),
 cmd('destek','Sana ve yetkililere özel bir destek kanalı aç.','topluluk',[ticketTopicOption()]),
 cmd('destekler','Kendi taleplerini; yetkiliysen tüm talepleri gör.','topluluk'),
 cmd('destekkapat','Kendi destek talebini veya yetkili olarak bir talebi kapat.','topluluk',[id]),
 cmd('uyar','Bir üyeye gerekçeli, kayıtlı yetkili uyarısı ekle.','yonetim',[user(true),text('sebep','Uyarı gerekçesi',true,500)],'1099511627776'),
 cmd('uyarilar','Kendi uyarılarını; yetkiliysen seçilen üyeninkini gör.','yonetim',[user()]),
 cmd('uyarikaldir','Yetkili olarak bir uyarı kaydını geri çek.','yonetim',[id],'1099511627776'),
 cmd('yavasmod','Bir metin kanalının yavaş modunu ayarla.','yonetim',[num('saniye','0: kapalı, en fazla 6 saat',0,21600),channel],'16'),
 cmd('kilitle','Kanalı kilitle; önceki yazma izinleri korunur.','yonetim',[channel],'16'),
 cmd('kilitac','TurkishPix kilidini kaldırıp eski izinleri geri getir.','yonetim',[channel],'16'),
 cmd('temizle','Son 14 gündeki 1–100 mesajı onayla ve temizle.','yonetim',[num('adet','Silinecek en fazla mesaj sayısı',1,100)],'8192'),
 cmd('duyuru','Seçilen kanala renkli bir embed duyurusu gönder.','yonetim',[text('baslik','Duyuru başlığı',true,100),text('metin','Duyuru metni',true,1500),channel],'32'),
 cmd('sabitle','Bu kanaldaki bir mesajı sabitle.','yonetim',[text('mesaj','Bu kanaldaki mesaj ID’si veya bağlantısı',true,160)],'8192'),
 cmd('rolmenu','Yetkisiz, kozmetik roller için katıl/ayrıl düğmesi oluştur.','rehber',[text('baslik','Menü başlığı',true,100),{name:'rol',description:'İzinleri sıfır olan kozmetik rol',type:8,required:true}],'268435456'),
 cmd('rolmenukapat','Yetkili olarak bir rol menüsünü devre dışı bırak.','rehber',[id],'268435456'),
 cmd('sss','Sunucunun sık sorulan sorularında arama yap.','rehber',[text('ara','Arama metni',false,100)]),
 cmd('sssekle','Sunucu rehberine soru ve cevap ekle.','rehber',[text('soru','Sık sorulan soru',true,150),text('cevap','Yetkili cevabı',true,1000)],'32'),
 cmd('ssssil','Sunucu rehberinden bir soru ve cevabı kaldır.','rehber',[id],'32'),
 cmd('kanalbilgi','Kanalın türünü, konusunu ve yavaş modunu gör.','rehber',[channel]),
 cmd('ozellikler','50 yeni özelliğin kategori ve kullanım rehberini aç.','rehber')
];
export const featureNames=featureCommands.map(c=>c.name);
export const shopItems=[{id:'kitapkurdu',name:'📚 Kitap kurdu',price:150},{id:'sanatci',name:'🎨 Piksel sanatçısı',price:250},{id:'yildiz',name:'🌟 Topluluk yıldızı',price:500},{id:'kahraman',name:'🏛️ Meclis gönüllüsü',price:800},{id:'elmas',name:'💎 Elmas koleksiyoncu',price:1500}];
