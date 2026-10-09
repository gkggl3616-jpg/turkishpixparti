import {MessageFlags} from 'discord.js';
import {config,brightEmbed,theme,featureCommands,featureCategories,entertainmentCommands,entertainmentCategories} from '@turkishpix/core';
import {commands} from '../../../packages/core/src/commands';

const supportNames=['bilet','destek','destekler','destekkapat','cekilis','cekilisler'];
const aiNames=['sor','yapayzekaaktif','yapayzekakapat'];
const preferenceNames=['duyurukatıl','duyuruayril','sesdmac','sesdmkapat','botpanel','yardim'];
export const helpCategories=[
 {id:'bilet',name:'🎫 Bilet & çekiliş',description:'Özel destek kanalları ve ödüller',path:'/biletler',color:theme.cyan},
 {id:'muzik',name:'🎵 Müzik & ses',description:'Sese katıl, radyo aç ve kuyruğu yönet',path:'/muzik',color:theme.purple},
 {id:'ai',name:'✦ Yapay zekâ',description:'Soru sor ve bağlantını yönet',path:'/yapay-zeka',color:theme.purple},
 ...featureCategories.map(c=>({id:'feature-'+c.id,name:c.name,description:'Topluluk komutları ve kullanım bilgileri',path:'/topluluk',color:theme.gold})),
 ...entertainmentCategories.map(c=>({id:'fun-'+c.id,name:(c.id==='oyun'?'🎮 ':c.id==='eglence'?'🎲 ':'👥 ')+c.name,description:c.description,path:'/eglence',color:theme.green})),
 {id:'sistem',name:'🏛️ Meclis & partiler',description:'Partiler, seçimler ve oylamalar',path:'/?view=genel',color:theme.gold},
 {id:'tercihler',name:'⚙️ Bot & bildirimler',description:'Panel, yardım ve kişisel bildirimler',path:'/',color:theme.cyan}
];
export function commandCategory(name:string){
 if(supportNames.includes(name))return 'bilet';
 if(['muzik','ses'].includes(name))return 'muzik';
 if(aiNames.includes(name))return 'ai';
 if(preferenceNames.includes(name))return 'tercihler';
 const feature=featureCommands.find(c=>c.name===name);if(feature)return 'feature-'+feature.category;
 const fun=entertainmentCommands.find(c=>c.name===name);if(fun)return 'fun-'+fun.category;
 return 'sistem';
}
const examples:Record<string,string>={
 'bilet ac':'/bilet ac tur: Ödül Talebi','destek':'/destek tur: Destek','cekilis':'/cekilis odul: Nitro dakika: 60 kazanan: 2',
 'sor':'/sor soru: Bugün ne oynayalım?','muzik radyo':'/muzik radyo istasyon: Groove Salad · Chill','ses katil':'/ses katil','anket':'/anket soru: Ne oynayalım? secenekler: Valorant | Minecraft',
 'xox':'/xox zorluk: zor','bilet kur':'/bilet kur kanal: #bilet-ac kategori: Biletler yetkili: @Destek'
};
export function helpEntries(category:string){return commands.filter(c=>commandCategory(c.name)===category).flatMap((c:any)=>{
 const subs=(c.options||[]).filter((o:any)=>o.type===1);
 const entries=subs.length?subs.map((s:any)=>({key:c.name+' '+s.name,description:s.description,options:s.options||[],restricted:c.default_member_permissions})): [{key:c.name,description:c.description,options:c.options||[],restricted:c.default_member_permissions}];
 return entries.map((entry:any)=>({...entry,usage:'/'+entry.key+entry.options.map((o:any)=>o.required?' <'+o.name+'>':' ['+o.name+']').join('')}));
});}
export function commandHelpView(category='home',page=0){
 const selected=helpCategories.find(c=>c.id===category);if(!selected)category='home';
 const entries=selected?helpEntries(selected.id):[],pages=Math.max(1,Math.ceil(entries.length/5));page=Math.max(0,Math.min(pages-1,Math.floor(Number.isFinite(page)?page:0)));
 const fields=selected?entries.slice(page*5,page*5+5).map(entry=>({name:'▸ /'+entry.key,value:entry.description+'\n`'+entry.usage+'`'+(examples[entry.key]?'\n**Örnek** · `'+examples[entry.key]+'`':'')+(entry.restricted?'\n◇ Yetkili izni gerekir.':'')})):[
  {name:'🎫 Yardım ve ödüller',value:'`/bilet ac` → kategori seç\n`/cekilis` → ödülünü ve süreyi belirle',inline:true},
  {name:'🎵 Ses ve müzik',value:'`/ses katil` → ses kanalına katıl\n`/muzik radyo` → bir istasyon seç',inline:true},
  {name:'🎮 Oyun ve sohbet',value:'`/xox` · `/anket` · `/sor`\nBir kategori seçerek tüm kullanımları gör.',inline:true}
 ];
 const embed=brightEmbed(selected?selected.name:'✦ Komut merkezi',selected?'**'+entries.length+' kullanım** · Sayfa **'+(page+1)+' / '+pages+'**\n`<alan>` gerekli · `[alan]` isteğe bağlı':'**𝙏𝙪𝙧𝙠𝙞𝙨𝙝𝙋𝙞𝙭**\n'+commands.length+' komut · '+helpCategories.length+' kategori\nAşağıdaki menüden ne yapmak istediğini seç.',fields,selected?.color||theme.cyan);
 embed.footer={text:'TurkishPix • /yardim • Kategori menüsüyle keşfet'};
 return {embeds:[embed],components:[
  {type:1,components:[{type:3,custom_id:'help:category',placeholder:selected?.name||'Bir komut kategorisi seç',options:[{label:'✦ Başlangıç',value:'home',default:category==='home'},...helpCategories.map(c=>({label:c.name,value:c.id,description:c.description.slice(0,100),default:c.id===category}))]}]},
  {type:1,components:[{type:2,style:2,custom_id:`help:page:${category}:${page-1}`,label:'Önceki',emoji:{name:'◀️'},disabled:page===0},{type:2,style:2,custom_id:`help:page:${category}:${page+1}`,label:'Sonraki',emoji:{name:'▶️'},disabled:page===pages-1},{type:2,style:5,label:selected?'İlgili paneli aç':'Yönetim panelini aç',url:config().appUrl+(selected?.path||'/')}]}
 ],allowedMentions:{parse:[]}};
}
export async function handleHelpInteraction(i:any){
 if(i.isChatInputCommand()&&i.commandName==='yardim'){await i.reply({...commandHelpView(),flags:MessageFlags.Ephemeral});return true;}
 if(i.isStringSelectMenu()&&['help:category','funhelp:category'].includes(i.customId)){
  const value=i.values[0],category=i.customId==='funhelp:category'&&['eglence','oyun','topluluk'].includes(value)?'fun-'+value:value;
  await i.update(commandHelpView(category));return true;
 }
 if(i.isButton()&&i.customId.startsWith('help:page:')){const parts=i.customId.split(':');await i.update(commandHelpView(parts[2],Number(parts[3])));return true;}
 return false;
}
