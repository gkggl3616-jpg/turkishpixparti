import {z} from 'zod';
const channel=z.union([z.string().regex(/^\d{17,20}$/),z.literal('')]);
export const auditCategories=['messages','moderation','announcements','members','server','bots'] as const;
export type AuditCategory=typeof auditCategories[number];
export const auditCategoryLabels:Record<AuditCategory,string>={messages:'💬 Mesajlar',moderation:'🛡️ Yasaklı içerik',announcements:'📣 Duyurular',members:'👥 Üyeler & moderasyon',server:'🏛️ Kanal & rol işlemleri',bots:'🤖 Bot girişleri'};
export const discordAuditSettingsSchema=z.object({
 enabled:z.boolean().default(true),logChannelId:channel.default(''),
 channels:z.object(Object.fromEntries(auditCategories.map(key=>[key,channel.default('')])) as Record<AuditCategory,z.ZodDefault<typeof channel>>).default({messages:'',moderation:'',announcements:'',members:'',server:'',bots:''}),
 categories:z.object(Object.fromEntries(auditCategories.map(key=>[key,z.boolean().default(true)])) as Record<AuditCategory,z.ZodDefault<z.ZodBoolean>>).default({messages:true,moderation:true,announcements:true,members:true,server:true,bots:true}),
 messageCreate:z.boolean().default(true),messageEdit:z.boolean().default(true),messageDelete:z.boolean().default(true),
 ignoredChannelIds:z.array(z.string().regex(/^\d{17,20}$/)).max(30).default([]),
 retentionDays:z.union([z.literal(7),z.literal(30),z.literal(90)]).default(30),
 botGuard:z.object({enabled:z.boolean().default(true),allowlist:z.array(z.string().regex(/^\d{17,20}$/)).max(25).default([])}).default({enabled:true,allowlist:[]})
});
export type DiscordAuditSettings=z.infer<typeof discordAuditSettingsSchema>;
export const defaultDiscordAuditSettings=()=>discordAuditSettingsSchema.parse({});
export function auditCategory(kind:string):AuditCategory{
 if(kind.startsWith('MESSAGE_'))return 'messages';
 if(kind==='BLOCKED_MESSAGE')return 'moderation';
 if(kind.startsWith('ANNOUNCEMENT'))return 'announcements';
 if(kind.startsWith('BOT_'))return 'bots';
 if(kind.startsWith('ROLE_')||kind.startsWith('CHANNEL_')||kind.startsWith('GUILD_')||kind.startsWith('INTEGRATION_'))return 'server';
 return 'members';
}
export function shouldBlockBot(botId:string,isBot:boolean,ownId:string,settings:DiscordAuditSettings,applicationId:string){
 return isBot&&settings.botGuard.enabled&&botId!==ownId&&botId!==applicationId&&!settings.botGuard.allowlist.includes(botId);
}
export function captureAuditMessage(channelId:string,settings:DiscordAuditSettings,fallbackChannel:string){
 return settings.enabled&&settings.categories.messages&&!settings.ignoredChannelIds.includes(channelId)&&!new Set([settings.logChannelId,fallbackChannel,...Object.values(settings.channels)].filter(Boolean)).has(channelId);
}
export const auditKindLabels:Record<string,string>={MESSAGE_CREATE:'💬 Mesaj gönderildi',MESSAGE_EDIT:'✏️ Mesaj düzenlendi',MESSAGE_DELETE:'🗑️ Mesaj silindi',BLOCKED_MESSAGE:'⛔ Yasaklı mesaj',ANNOUNCEMENT:'📣 Duyuru gönderildi',ANNOUNCEMENT_PLANNED:'🗓️ Duyuru planlandı',ANNOUNCEMENT_CANCELLED:'📣 Duyuru iptal edildi',BOT_JOIN:'🤖 Bot katıldı',BOT_BLOCKED:'🛡️ Bot sunucudan çıkarıldı',BOT_BLOCK_FAILED:'⚠️ Bot çıkarılamadı',BOT_ALLOWED:'✅ İzinli bot',BOT_ADD:'🤖 Bot ekleme kaydı',MEMBER_JOIN:'👋 Üye katıldı',MEMBER_LEAVE:'🚪 Üye ayrıldı',MEMBER_KICK:'🥾 Üye çıkarıldı',MEMBER_BAN_ADD:'🔨 Üye yasaklandı',MEMBER_BAN_REMOVE:'🔓 Yasak kaldırıldı',MEMBER_UPDATE:'👤 Üye güncellendi',MEMBER_ROLE_UPDATE:'🎭 Üye rolleri değişti',ROLE_CREATE:'🎭 Rol oluşturuldu',ROLE_UPDATE:'🎭 Rol değiştirildi',ROLE_DELETE:'🎭 Rol silindi',CHANNEL_CREATE:'📁 Kanal oluşturuldu',CHANNEL_UPDATE:'📁 Kanal değiştirildi',CHANNEL_DELETE:'📁 Kanal silindi',GUILD_UPDATE:'🏛️ Sunucu değiştirildi',INTEGRATION_CREATE:'🔗 Entegrasyon eklendi',INTEGRATION_DELETE:'🔗 Entegrasyon silindi',SETTINGS_CHANGED:'⚙️ Denetim ayarları güncellendi'};
const sub=(name:string,description:string,options:any[]=[])=>({type:1,name,description,options});
export const discordAuditCommandGroups=[
 {type:2,name:'denetim',description:'Mesaj, duyuru ve sunucu işlemlerini Discord içinde yönet.',options:[sub('panel','Denetim kayıtları ve kanal ayarlarını aç.'),sub('kur','Yetkililere özel kayıt kanalını kur veya mevcut özel kanalı seç.',[{type:7,name:'kanal',description:'Özel metin kanalı; boşsa otomatik oluşturulur.',required:false,channel_types:[0]}]),sub('kayitlar','Son denetim kayıtlarını filtreleyerek gör.',[{type:3,name:'kategori',description:'Kayıt kategorisi',required:false,choices:auditCategories.map(value=>({name:auditCategoryLabels[value],value}))}])]},
 {type:2,name:'botkoruma',description:'Yeni bot girişlerini engelle; izinli botları belirle.',options:[sub('panel','Bot engeli, izinli liste ve son işlemleri göster.'),sub('ac','Yeni katılan yabancı botları otomatik çıkar.'),sub('kapat','Yeni botları otomatik çıkarma özelliğini kapat.'),sub('izinver','Seçilen botu giriş engelinden muaf tut.',[{type:6,name:'bot',description:'İzin verilecek bot hesabı',required:true}]),sub('izinsil','Botun giriş istisnasını kaldır.',[{type:3,name:'botid',description:'Botun Discord ID’si',required:true,min_length:17,max_length:20}])]}];
