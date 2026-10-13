import catalog from './owo-catalog-data.json';
export {catalog as owoCatalog};
const games:Record<string,string>={mines:'MINES',blackjack:'BLACKJACK',coinflip:'COINFLIP',slots:'SLOTS',snailgarden:'WSG',battle:'BATTLE'};
const aliasMap=new Map(catalog.entries.flatMap(entry=>entry.aliases.map(alias=>[alias.toLowerCase(),entry] as const)));
export function parseOwoCommand(content:string){
 const input=content.slice(0,2000),match=/^\s*(?:owo|uwu|w)(?:\s+([\w-]+))?(?:\s|$)/i.exec(input),compact=/^\s*w([hb])(?:\s|$)/i.exec(input);if(!match&&!compact)return null;
 const alias=(match?.[1]||compact?.[1]||'owo').toLowerCase(),entry=aliasMap.get(alias);return entry?{command:entry.name,alias,game:games[entry.name]||null,category:entry.category}:null;
}
const notes:Record<string,string>={blackjack:'Gözlenen ara el/sonuç çiftlerinden kazanma oranı, tarihli eşik karşılaştırması ve OCR.',mines:'3×3 tarama oranı çizimi, mayın sayısına göre hücre geçmişi ve tekrar analizi.',coinflip:'heads/tails, bahis, ödeme ve kişisel sonuçlar; seri gelecek sonucu değiştirmez.',slots:'Animasyon tamamlanınca bahis/ödeme/net sonuç; eksik satır kazanılmış para sayılmaz.',snailgarden:'Gösterilen Failure Chance ve adım tutarları; alias kaynağı henüz doğrulanmadı.',battle:'Sonuç/XP metni ve görsel OCR; düşük güvenli sprite/ikon bilgisi bilinmeyen kalır.'};
const categories:Record<string,string>={animals:'Hayvan/ekipman veya takım komutu; kullanım sayısı izlenir, sonuç ekranına özel risk modeli yok.',economy:'Ekonomi komutu; kullanım sayısı izlenir, hesap bakiyesi bu bot tarafından okunamaz.',social:'Sosyal komut; yalnız kullanım metaverisi, kişisel içerik arşivi yok.',patreon:'Destekçi/özel komut; erişim sağlayıcıya bağlı, yalnız kullanım metaverisi.',utility:'Yardımcı komut; yalnız kullanım metaverisi.',emotes:'Duygu ifadesi; yalnız komut kullanım sayısı.',actions:'Etkileşim/ifade komutu; yalnız kullanım sayısı.',memegeneration:'Görsel/eğlence komutu; kullanım sayısı, resim içeriği analizi yok.',rankings:'Sıralama/sayaç komutu; kullanım sayısı.',gambling:'Komut kataloğunda mevcut; özel sonuç/risk ayrıştırıcısı henüz yok.',fun:'Eğlence komutu; yalnız kullanım sayısı.'};
export function owoCatalogPage(search='',category='',page=1){
 const s=search.trim().toLowerCase(),g=category.trim().toLowerCase();
 const entries=catalog.entries.filter(e=>(!s||e.aliases.some(a=>a.toLowerCase().includes(s)))&&(!g||e.category===g));
 const pages=Math.max(1,Math.ceil(entries.length/8)),actual=Math.max(1,Math.min(Number.isInteger(page)?page:1,pages));
 return {page:actual,pages,total:entries.length,snapshot:catalog.snapshot,notice:catalog.notice,entries:entries.slice((actual-1)*8,actual*8).map(e=>({...e,analysis:notes[e.name]||categories[e.category]||'Komut kullanımı izlenir; özel risk modeli yok.'}))};
}
