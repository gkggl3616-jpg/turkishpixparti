import {z} from 'zod';
export const roleAutomationSchema=z.object({autoEnabled:z.boolean().default(false),autoRoleIds:z.array(z.string().regex(/^\d{17,20}$/)).max(10).default([]),tagEnabled:z.boolean().default(false),tagRoleId:z.union([z.string().regex(/^\d{17,20}$/),z.literal('')]).default('')}).refine(s=>!s.tagEnabled||!!s.tagRoleId,{message:'Sunucu tagı için bir rol seç.'}).refine(s=>!s.tagRoleId||!s.autoRoleIds.includes(s.tagRoleId),{message:'Tag rolü ile otomatik üye rolü farklı olmalı.'});
export type RoleAutomationSettings=z.infer<typeof roleAutomationSchema>;
/** The actual primary guild identity is authoritative; nickname text is unrelated. */
export function hasServerTag(user:any,guildId:string):boolean|null{
 if(!Object.hasOwn(user,'primary_guild'))return null;
 const identity=user.primary_guild;if(identity===null)return false;
 if(!identity||identity.identity_enabled===undefined||identity.identity_guild_id===undefined)return null;
 return identity.identity_enabled===true&&identity.identity_guild_id===guildId;
}
export function reactionEmojiKey(value:string){const custom=/^<(?:a)?:[A-Za-z0-9_]+:(\d{17,20})>$/.exec(value)||/^(\d{17,20})$/.exec(value);if(custom)return custom[1];const unicode=value.trim().normalize('NFC').replace(/\uFE0F/g,'');if(!unicode||unicode.length>32||/\s|[<>]/.test(unicode)||!/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3)/u.test(unicode))throw new Error('Geçerli bir Discord veya Unicode emojisi gir.');return unicode;}
const role={type:8,name:'rol',description:'Yönetici yetkisi içermeyen bir sunucu rolü',required:true};
const sub=(name:string,description:string,options:any[]=[])=>({type:1,name,description,options});
export const roleAutomationCommandGroup={type:2,name:'roller',description:'Toplu rol, otomatik üye rolü, emoji rolü ve sunucu tagı rolü.',options:[
 sub('panel','Discord içindeki rol otomasyon panelini aç.'),
 sub('otorol','Yeni katılan insan üyeler için otomatik rolü belirle.',[role]),
 sub('otorol-kapat','Yeni üyelere otomatik rol vermeyi durdur.'),
 sub('seviye-panel','Birden fazla XP seviye ödülünü Discord içinden yönet.'),
 sub('seviye-ekle','Mevcut ödülleri koruyarak bir XP seviyesi için rol ekle.',[{type:4,name:'seviye',description:'Rolün kazanılacağı XP seviyesi',required:true,min_value:1,max_value:100},role]),
 sub('seviye-sil','Yalnızca seçilen seviye ve rol eşlemesini kaldır.',[{type:4,name:'seviye',description:'Kaldırılacak ödülün XP seviyesi',required:true,min_value:1,max_value:100},role]),
 sub('seviye-tara','Hak edilmiş fakat verilememiş XP rollerini yeniden kontrol et.'),
 sub('herkese','Mevcut insan üyelere rol dağıtımını önizle ve başlat.',[role]),
 sub('emoji','Emojiye basılınca rol veren kalıcı mesaj oluştur.',[role,{type:3,name:'emoji',description:'Örnek: ✅ veya bir özel sunucu emojisi',required:true,max_length:100},{type:7,name:'kanal',description:'Rol mesajının metin kanalı',required:false,channel_types:[0]},{type:3,name:'baslik',description:'Rol mesajının başlığı',required:false,max_length:100}]),
 sub('emoji-kapat','Emoji rol mesajını kapat; verilmiş roller korunur.',[{type:3,name:'mesaj',description:'Emoji rol mesajının Discord ID’si',required:true,min_length:17,max_length:20}]),
 sub('tag','Bu sunucunun gerçek Discord tagını kullananlara otomatik rol ver.',[role]),
 sub('tag-kapat','Sunucu tagı rol otomasyonunu durdur; verilen roller korunur.'),
 sub('tag-tara','Mevcut üyelerin gerçek sunucu tagını yeniden kontrol et.'),
 sub('toplu-durum','Toplu rol dağıtımının ilerlemesini göster.')
]};
