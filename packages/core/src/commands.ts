import {config} from './config';
export const commands=[
 {name:'partikur',description:'Parti kuruluş başvurusunu web panelinde başlat.'},
 {name:'partiler',description:'TurkishPix siyasi partilerini görüntüle.'},
 {name:'oylamalar',description:'Aktif halk ve meclis oylamalarını görüntüle.'},
 {name:'tbmm',description:'TBMM ve milletvekili listesini görüntüle.'},
 {name:'secimler',description:'Seçimleri ve sonuçlarını görüntüle.'},
 {name:'teklif',description:'Yönerge veya kanun teklifini web panelinde sun.'},
 {name:'yardim',description:'Siyasi sistemin komut ve kurallarını öğren.'}
].map(c=>({...c,type:1,contexts:[0],integration_types:[0]}));
export function commandReply(name:string){
 const c=config();const views:Record<string,string>={partikur:'basvurular',partiler:'partiler',oylamalar:'oylamalar',tbmm:'tbmm',secimler:'secimler',teklif:'tbmm',yardim:'kilavuz'};
 const text=name==='partikur'?'Parti adını, kısaltmasını, logosunu, açıklamasını ve hedeflerini panele gir. Lider kendi Discord hesabıyla başvurur. Dört owner onayından sonra halk oylaması açılır.':name==='yardim'?'/partikur · /partiler · /oylamalar · /tbmm · /secimler · /teklif\nOwner onayları ve oylar kaydedilir. Her hesap bir oy kullanabilir.':'İlgili sayfayı panelde açabilirsiniz.';
 return {embeds:[{title:name==='partikur'?'TurkishPix · Parti kuruluşu':'TurkishPix · Cumhuriyet portalı',description:text,color:0xd6ad55,thumbnail:{url:c.appUrl+'/brand/turkishpix-bot.png'},footer:{text:'Dört owner · Ortak irade · Kayıtlı kararlar'}}],components:[{type:1,components:[{type:2,style:5,label:name==='partikur'?'Parti başvurusu yap':'Paneli aç',url:c.appUrl+'/?view='+(views[name]||'genel')+(name==='partikur'?'&create=PARTY':name==='teklif'?'&create=BILL':'')}]}],allowed_mentions:{parse:[]}};
}
