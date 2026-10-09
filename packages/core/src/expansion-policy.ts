import {z} from 'zod';
import {discordAuditCommandGroups} from './discord-audit-policy';
import {roleAutomationCommandGroup} from './role-automation-policy';
import {arcadeGames} from './arcade-policy';
const id=z.union([z.string().regex(/^\d{17,20}$/),z.literal('')]);
const ids=z.array(z.string().regex(/^\d{17,20}$/)).max(20);
export const expansionSettingsSchema=z.object({
 enabled:z.boolean().default(true),
 rooms:z.object({enabled:z.boolean(),joinToCreate:z.boolean().default(true),createChannelId:id.default(''),categoryId:id,maxRooms:z.number().int().min(1).max(50),defaultLimit:z.number().int().min(0).max(99),emptySeconds:z.number().int().min(30).max(1800)}),
 registration:z.object({enabled:z.boolean(),memberRoleId:id,unregisteredRoleId:id,staffRoleIds:ids,logChannelId:id}),
 autoRoleIds:ids,
 customCommands:z.array(z.object({name:z.string().regex(/^[a-z0-9-]{1,32}$/),response:z.string().trim().min(1).max(1500),channelId:id})).max(50).refine(a=>new Set(a.map(c=>c.name)).size===a.length,'Özel komut adları farklı olmalı.'),
 birthdays:z.object({enabled:z.boolean(),channelId:id}),
 afkEnabled:z.boolean(),
 voiceXP:z.object({enabled:z.boolean(),perMinute:z.number().int().min(1).max(30)}),
 levelRoles:z.array(z.object({level:z.number().int().min(1).max(100),roleId:z.string().regex(/^\d{17,20}$/)})).max(50).refine(rows=>new Set(rows.map(r=>r.level+':'+r.roleId)).size===rows.length,'Aynı seviye ve rol iki kez eklenemez.'),
 farewell:z.object({enabled:z.boolean(),channelId:id,message:z.string().trim().min(1).max(1000)})
});
export type ExpansionSettings=z.infer<typeof expansionSettingsSchema>;
export function defaultExpansionSettings():ExpansionSettings{return {
 enabled:true,rooms:{enabled:true,joinToCreate:true,createChannelId:'',categoryId:'',maxRooms:20,defaultLimit:0,emptySeconds:120},
 registration:{enabled:true,memberRoleId:'',unregisteredRoleId:'',staffRoleIds:[],logChannelId:''},autoRoleIds:[],customCommands:[],
 birthdays:{enabled:true,channelId:''},afkEnabled:true,voiceXP:{enabled:true,perMinute:5},levelRoles:[],
 farewell:{enabled:false,channelId:'',message:'{username}, {server} topluluğundan ayrıldı. Yeniden görüşmek üzere! 👋'}
};}
export const eventOptionsSchema=z.object({capacity:z.number().int().min(0).max(500).default(0),repeat:z.enum(['OFF','DAILY','WEEKLY']).default('OFF'),reminders:z.array(z.number().int().min(1).max(1440)).max(5).default([15]),requiredRoleId:id.default(''),description:z.string().max(600).default('')});
export function validBirthday(day:number,month:number){return Number.isInteger(day)&&Number.isInteger(month)&&month>=1&&month<=12&&day>=1&&day<=[31,29,31,30,31,30,31,31,30,31,30,31][month-1];}
// Only administrative/moderation powers are unsafe for automatic grants.
// Creating events/expressions, mentions and read-only analytics are ordinary capabilities.
export const AUTOMATIC_ROLE_DANGER_MASK=2n|4n|8n|16n|32n|8192n|4194304n|8388608n|16777216n|134217728n|268435456n|536870912n|1073741824n|8589934592n|17179869184n|1099511627776n;
export const WATCH_TOGETHER_APPLICATION_ID='880218394199220334';
const text=(name:string,description:string,required=true,max_length=300)=>({type:3,name,description,required,max_length});
const num=(name:string,description:string,min_value:number,max_value:number,required=true)=>({type:4,name,description,required,min_value,max_value});
const user={type:6,name:'uye',description:'Sunucudan bir üye seç',required:true};
const role={type:8,name:'rol',description:'Bir sunucu rolü seç',required:true};
const reason=text('sebep','İşlemin gerekçesi',false,500);
const record=text('kayit','Etkinlik kartındaki kayıt kodu',true,36);
const sub=(name:string,description:string,options:any[]=[])=>({type:1,name,description,options});
const group=(name:string,description:string,options:any[])=>({type:2,name,description,options});
export const expansionCommand={name:'topluluk',description:'Özel odalar, kayıt, otomasyon, etkinlik ve yetkili araçları.',options:[
 ...discordAuditCommandGroups,
 roleAutomationCommandGroup,
 group('oyun','Oyun salonunu aç veya Discord’da düğmelerle oyna.',[
  sub('salon','Dokuz 2D / 3D oyundan birini tarayıcıda aç.',[{type:3,name:'oyun',description:'Açılacak oyun; tur ücretini sitede onaylarsın.',required:false,choices:arcadeGames.map(g=>({name:g.name+' · '+g.cost+' Bot TL',value:g.id}))}]),
  sub('2048','Discord düğmeleriyle 2048 oyna. Tur: 100 Bot TL.'),
  sub('mayin','Discord’da dört mayını bul. Tur: 100 Bot TL.'),
  sub('dortlu','Akıllı bota karşı Dörtlü Bağla. Tur: 150 Bot TL.')
 ]),
 group('oda','Kendi geçici ses odanı yönet.',[
  sub('yardim','Oda oluşturma, kilitleme ve davet adımlarını öğren.'),
  sub('kur','Yetkili olarak katılınca oda oluşturan ses kanalını kur.',[{type:7,name:'kategori',description:'Yeni odaların ses kategorisi',required:false,channel_types:[4]}]),
  sub('ac','Sana ait bir ses odası oluştur; boş kalan oda otomatik kapanır.',[text('ad','Odanın adı',false,60)]),
  sub('kilitle','Yeni katılımlara kapat.'),sub('kilitac','Odayı yeni katılımlara aç.'),
  sub('ad','Odanın adını değiştir.',[text('ad','Yeni oda adı',true,60)]),sub('limit','Oda kapasitesini ayarla.',[num('adet','0: sınırsız',0,99)]),
  sub('davet','Bir üyeye odaya giriş izni ver.',[user]),sub('cikar','Üyeyi odandan çıkar ve girişini kapat.',[user]),
  sub('devret','Oda sahipliğini odadaki bir üyeye devret.',[user]),sub('kapat','Kendi odanı sil.'),sub('liste','Açık geçici ses odalarını gör.')
 ]),
 group('kayit','Kayıt ve üye onay sistemi.',[sub('onayla','Yetkili olarak üyeyi kaydet ve kayıt rolünü ver.',[user,text('isim','Sunucudaki adı',true,32)]),sub('bilgi','Üyenin kayıt durumunu gör.',[{...user,required:false}]),sub('istatistik','Yetkili kayıt istatistiklerini gör.')]),
 group('ozel','Sunucuya özel cevap komutları.',[sub('ekle','Yetkili olarak !komut için cevap kaydet.',[text('ad','Küçük harflerle komut adı',true,32),text('cevap','{user}, {username}, {server} değişkenlerini kullanabilirsin.',true,1500),{type:7,name:'kanal',description:'İsteğe bağlı komut kanalı',required:false,channel_types:[0,5]}]),sub('sil','Yetkili olarak özel komutu kaldır.',[text('ad','Komut adı',true,32)]),sub('liste','Sunucuya özel komutları gör.'),sub('calistir','Özel komutu çalıştır.',[text('ad','Komut adı',true,32)])]),
 group('dogum','İsteğe bağlı sunucu doğum günü kutlamaları.',[sub('ayarla','Gün ve ayını sunucu kutlama takvimine ekle; yıl istenmez.',[num('gun','Ayın günü',1,31),num('ay','Ay',1,12)]),sub('sil','Doğum gününü kutlama takviminden sil.'),sub('takvim','Gönüllü paylaşılan doğum günlerini gör.')]),
 group('afk','Uzakta olduğunu sohbete bildir.',[sub('ac','AFK durumunu aç; mesaj yazınca otomatik kapanır.',[text('sebep','Uzakta olma sebebin',false,150)]),sub('kapat','AFK durumunu kapat.')]),
 group('yetkili','Discord yetkilerine göre moderasyon araçları.',[
  sub('ban','Yetkili olarak üyeyi sunucudan yasakla.',[user,reason]),sub('kick','Yetkili olarak üyeyi sunucudan çıkar.',[user,reason]),
  sub('unban','Yetkili olarak kullanıcı yasağını kaldır.',[text('kullanici','Yasaklı kullanıcının Discord ID’si',true,20),reason]),
  sub('takmaad','Üyenin sunucu adını değiştir.',[user,text('isim','Yeni takma ad',true,32)]),
  sub('sustur','Üyeyi belirli süre sustur.',[user,num('dakika','En fazla 28 gün',1,40320),reason]),sub('susturmaac','Üyenin susturmasını kaldır.',[user]),
  sub('surelirol','Güvenli bir rolü süreli ver; süresi dolunca geri al.',[user,role,num('dakika','En fazla 30 gün',1,43200)]),
  sub('roller','Sunucu rollerini ve üye sayılarını gör.'),
  sub('sestasi','Üyeyi seçtiğin ses kanalına taşı.',[user,{type:7,name:'kanal',description:'Hedef ses kanalı',required:true,channel_types:[2]}])
 ]),
 group('etkinlik','Katılım, bekleme listesi ve takvim.',[sub('katilimcilar','Etkinliğin katılım ve bekleme listesini gör.',[record]),sub('duzenle','Organizatör olarak gelecek etkinliği düzenle.',[record,num('dakika','Yeni başlangıç: kaç dakika sonra?',5,43200),text('baslik','Yeni başlık',false,100)]),sub('takvim','Yaklaşan etkinliklerin takvimini gör.')]),
 group('duyuru','İleri zamana kanal duyurusu planla.',[sub('planla','Yetkili olarak ileri zamana duyuru planla.',[text('metin','Duyuru metni',true,1500),num('dakika','1 dakika–30 gün sonra',1,43200),{type:7,name:'kanal',description:'Metin kanalı',required:true,channel_types:[0,5]}]),sub('liste','Kendi planladığın duyuruları gör.'),sub('iptal','Kendi bekleyen duyurunu iptal et.',[text('kayit','Duyuru kayıt kodu',true,36)])])
]};
export const expansionUsageCount=expansionCommand.options.reduce((sum,g)=>sum+g.options.length,0);
