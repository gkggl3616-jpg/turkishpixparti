import {ChannelType, PermissionFlagsBits} from 'discord.js';

const option = (type:number,name:string,trName:string,description:string,trDescription:string,extra:object={}) =>
 ({type,name,description,name_localizations:{tr:trName},description_localizations:{tr:trDescription},...extra});
const string = (name:string,trName:string,description:string,trDescription:string,extra:object={}) =>
 option(3,name,trName,description,trDescription,extra);
const guildCommand = {type:1,contexts:[0],integration_types:[0],default_member_permissions:PermissionFlagsBits.ManageGuild.toString()};

export const serverEngagementCommands = [
 {
  ...option(1,'giveaway','cekilis-yonet','Create and manage server giveaways.','Sunucu çekilişlerini başlat ve yönet.'),
  ...guildCommand,
  options:[
   option(1,'start','baslat','Start a giveaway.','Çekiliş başlat.',{options:[
    string('prize','odul','Prize','Ödül',{required:true,max_length:200}),
    option(4,'minutes','dakika','Duration in minutes','Süre (dakika)',{required:true,min_value:1,max_value:10080}),
    option(4,'winners','kazananlar','Number of winners','Kazanan sayısı',{min_value:1,max_value:10}),
    string('language','dil','Language of the giveaway screen','Çekiliş ekranının dili',{choices:[
     {name:'English',name_localizations:{tr:'İngilizce'},value:'en'},
     {name:'Turkish',name_localizations:{tr:'Türkçe'},value:'tr'}
    ]}),
    option(7,'channel','kanal','Giveaway channel','Çekiliş kanalı',{channel_types:[ChannelType.GuildText,ChannelType.GuildAnnouncement]}),
    option(5,'require-tag','tag-sarti','Require the configured Discord server tag','Ayarlanmış Discord sunucu tagını şart koş'),
    option(4,'minimum-messages','en-az-mesaj','Minimum total messages in this server','Bu sunucuda gereken toplam mesaj',{min_value:1,max_value:1000000})
   ]}),
   ...[
    ['end','bitir','End a giveaway and draw winners.','Çekilişi bitir ve kazananları seç.'],
    ['cancel','iptal','Cancel a giveaway.','Çekilişi iptal et.'],
    ['reroll','yeniden-sec','Draw new winners.','Yeni kazanan seç.']
   ].map(([name,trName,en,tr])=>option(1,name,trName,en,tr,{options:[
    string('id','kod','Giveaway ID from the start confirmation','Başlatma onayındaki çekiliş kodu',{required:true,min_length:36,max_length:36})
   ]}))
  ]
 },
 {
  ...option(1,'tag-role','tag-rol','Manage automatic Discord server tag roles.','Discord sunucu tagına göre otomatik rolü yönet.'),
  ...guildCommand,
  default_member_permissions:PermissionFlagsBits.ManageRoles.toString(),
  options:[
   option(1,'set','ayarla','Set the tag and its automatic role.','Tagı ve otomatik rolü ayarla.',{options:[
    string('role','rol','Exact role name or role ID','Rolün tam adı veya ID’si',{required:true,max_length:100}),
    string('tag-server-id','tag-sunucu-id','Tag source server ID. Defaults to this server.','Tagın ait olduğu sunucunun ID’si. Varsayılan bu sunucu.',{min_length:17,max_length:20})
   ]}),
   option(1,'disable','kapat','Disable tag role automation.','Tag rolü otomasyonunu kapat.'),
   option(1,'rescan','tara','Rescan members for the configured tag.','Üyeleri ayarlanan tag için yeniden tara.')
  ]
 }
];
