import {releases} from './releases';
import {brightEmbed,theme} from './presentation';
import {expansionCommand} from './expansion-policy';
import {supportCommands} from './support-commands';
import {featureCommands} from './features-catalog';
import {musicCommands} from './music-policy';
import {config} from './config';
import {entertainmentCommands} from './entertainment-catalog';
export const commands=[
 {name:'partikur',description:'Parti kuruluş başvurusunu web panelinde başlat.'},
 {name:'partiler',description:'TurkishPix siyasi partilerini görüntüle.'},
 {name:'oylamalar',description:'Aktif halk ve meclis oylamalarını görüntüle.'},
 {name:'tbmm',description:'TBMM ve milletvekili listesini görüntüle.'},
 {name:'secimler',description:'Seçimleri ve sonuçlarını görüntüle.'},
 {name:'teklif',description:'Yönerge veya kanun teklifini web panelinde sun.'},
 {name:'yapayzekaaktif',description:'Yapay zekâ yanıtlarını etkinleştir (owner).'},
 {name:'yapayzekakapat',description:'Yapay zekâ yanıtlarını kapat (owner).'},
 {name:'sor',description:'TurkishPix yardımcısına soru sor.',options:[{name:'soru',description:'Sorunuz veya matematik işlemi',type:3,required:true,max_length:2000}]},
 {name:'duyurukatıl',description:'Sunucunun DM duyurularını almaya katıl.'},
 {name:'duyuruayril',description:'DM duyurularından ayrıl.'},
 {name:'sesdmac',description:'Ses kanalı giriş ve çıkış DM bildirimlerini aç.'},
 {name:'sesdmkapat',description:'Ses kanalı giriş ve çıkış DM bildirimlerini kapat.'},
 {name:'botpanel',description:'Bot yönetim merkezini aç.'},
 {name:'guncellemeler',description:'Yeni özellikleri, komutları ve önceki sürüm notlarını görüntüle.',options:[{type:3,name:'surum',description:'Görüntülenecek sürüm; boşsa en yeni sürüm',required:false,choices:releases.map(r=>({name:'v'+r.version+' · '+r.title,value:r.version}))}]},
 {name:'yardim',description:'100 komutun kategorilerini ve tüm alt komutları keşfet.'},
 expansionCommand,
 ...musicCommands,
 ...supportCommands,
 ...featureCommands.filter(c=>c.name!=='ozellikler').map(({category,...command})=>command),
 ...entertainmentCommands.map(({category,...command})=>command)
].map(c=>({...c,type:1,contexts:[0],integration_types:[0]}));
export function commandReply(name:string){
 const c=config();const views:Record<string,string>={partikur:'basvurular',partiler:'partiler',oylamalar:'oylamalar',tbmm:'tbmm',secimler:'secimler',teklif:'tbmm',yardim:'kilavuz'};
 const text=name==='partikur'?'Parti adını, kısaltmasını, logosunu, açıklamasını ve hedeflerini panele gir. Lider kendi Discord hesabıyla başvurur. Dört owner onayından sonra halk oylaması açılır.':name==='yardim'?'/partikur · /partiler · /oylamalar · /tbmm · /secimler · /teklif\nOwner onayları ve oylar kaydedilir. Her hesap bir oy kullanabilir.':'İlgili sayfayı panelde açabilirsiniz.';
 return {embeds:[{...brightEmbed(name==='partikur'?'🏛️ Parti kuruluşu':'🏛️ Cumhuriyet portalı',text,[{name:'◆ Sonraki adım',value:'Aşağıdaki düğmeden ilgili sayfayı aç.'}],theme.gold),thumbnail:{url:c.appUrl+'/brand/turkishpix-bot.png'}}],components:[{type:1,components:[{type:2,style:5,label:name==='partikur'?'Parti başvurusu yap':'Paneli aç',url:(name==='botpanel'?c.appUrl:c.appUrl+'/?view='+(views[name]||'genel'))+(name==='partikur'?'&create=PARTY':name==='teklif'?'&create=BILL':'')}]}],allowed_mentions:{parse:[]}};
}
