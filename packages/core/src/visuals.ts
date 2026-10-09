export const cardCategories = {
  home: {title:'Komut merkezi', subtitle:'Keşfet. Katıl. Birlikte büyü.', accent:'#53dcff', icon:'compass'},
  music: {title:'Müzik & YouTube', subtitle:'Şarkını bul · Birlikte dinle', accent:'#c291ff', icon:'music'},
  rank: {title:'Seviye & aktiflik', subtitle:'Sohbetin iz bıraksın', accent:'#ffd06c', icon:'star'},
  economy: {title:'Ödüller & ekonomi', subtitle:'Günlük ödüller · Profil rozetleri', accent:'#ffd06c', icon:'coin'},
  ticket: {title:'Destek merkezi', subtitle:'Talebini seç · Yetkililere ulaş', accent:'#53dcff', icon:'ticket'},
  giveaway: {title:'Çekiliş zamanı', subtitle:'Katıl · Şansını dene', accent:'#ff92cf', icon:'gift'},
  events: {title:'Topluluk etkinlikleri', subtitle:'Takvimini aç · Yerini ayır', accent:'#83efd0', icon:'calendar'},
  games: {title:'Oyun & eğlence', subtitle:'Yeni bir tur. Yeni bir rakip.', accent:'#83efd0', icon:'game'},
  security: {title:'Sunucu güvenliği', subtitle:'Düzenli sohbet · Güçlü topluluk', accent:'#ff829b', icon:'shield'},
  roles: {title:'Roller & kayıt', subtitle:'Topluluğun içindeki yerin', accent:'#c291ff', icon:'people'},
  parliament: {title:'Meclis & partiler', subtitle:'Fikirlerin ortak karara dönüşsün', accent:'#ffd06c', icon:'building'},
  tools: {title:'Kişisel araçlar', subtitle:'Notların · Görevlerin · Planların', accent:'#53dcff', icon:'note'},
  guide: {title:'Sunucu rehberi', subtitle:'Aradığın bilgi bir komut uzakta', accent:'#c291ff', icon:'book'},
  settings: {title:'Bot & bildirimler', subtitle:'Topluluğuna göre ayarla', accent:'#53dcff', icon:'gear'},
  community: {title:'Gelişmiş topluluk', subtitle:'Odalar · Otomasyon · Birlikte yaşam', accent:'#c291ff', icon:'people'},
  ai: {title:'Yapay zekâ', subtitle:'Sor. Düşün. Yeni fikirler keşfet.', accent:'#c291ff', icon:'spark'}
} as const;
export type CardCategory=keyof typeof cardCategories;
export function categoryForTitle(title:string):CardCategory {
 const t=title.normalize('NFKC').toLocaleLowerCase('tr-TR');
 if(/youtube|müzik|ses kanalı|ses bağlantı|radyo/.test(t))return 'music';
 if(/rank|seviye|aktiflik|sohbet sıralama|üye kartı/.test(t))return 'rank';
 if(/çekiliş|kazanan/.test(t))return 'giveaway';
 if(/bilet|destek|talep/.test(t))return 'ticket';
 if(/koruma|güvenlik|incelemesi|sustur|uyarı/.test(t))return 'security';
 if(/etkinlik|doğum|kutlama|takvim/.test(t))return 'events';
 if(/rol|kayıt|yetkili/.test(t))return 'roles';
 if(/cüzdan|pix|ödül|mağaza|rozet|ekonomi|itibar/.test(t))return 'economy';
 if(/oyun|eğlence|xox|anket|refleks|hafıza|zar/.test(t))return 'games';
 if(/meclis|parti|seçim|oylama|milletvekili|yönerge/.test(t))return 'parliament';
 if(/hatırlat|notun|görev|plan|kişisel/.test(t))return 'tools';
 if(/rehber|sss|bilgi/.test(t))return 'guide';
 if(/yapay|zekâ/.test(t))return 'ai';
 if(/ayar|bildirim|tercih/.test(t))return 'settings';
 if(/yardım|komut|özellik/.test(t))return 'home';
 return 'community';
}
export function helpCardCategory(id:string):CardCategory {
 return ({home:'home',gelismis:'community',bilet:'ticket',muzik:'music',ai:'ai',
 'feature-ekonomi':'rank','feature-planlama':'tools','feature-topluluk':'events',
 'feature-yonetim':'security','feature-rehber':'guide','fun-oyun':'games',
 'fun-eglence':'games','fun-topluluk':'community',sistem:'parliament',tercihler:'settings'} as Record<string,CardCategory>)[id]||'home';
}
export const xmlText=(value:string)=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]!)).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
export function cardText(value:string,max=35){const plain=value.normalize('NFKC').replace(/\s+/g,' ').trim();return xmlText([...plain].length>max?[...plain].slice(0,max-1).join('')+'…':plain);}
const icons:Record<string,string>={
 music:'<path d="M42 75V24l43-9v49M42 37l43-9"/><ellipse cx="29" cy="78" rx="14" ry="10"/><ellipse cx="72" cy="67" rx="14" ry="10"/>',
 star:'<path d="M50 9l12 27 29 3-22 21 6 29-25-14-25 14 6-29L9 39l29-3z"/>',
 compass:'<circle cx="50" cy="50" r="39"/><path d="M65 29L57 57 29 65l8-28z"/>',
 coin:'<circle cx="50" cy="50" r="37"/><path d="M60 32H43a10 10 0 000 20h14a10 10 0 010 20H36M50 23v58"/>',
 ticket:'<path d="M12 24h76v19a9 9 0 000 18v19H12V61a9 9 0 000-18zM63 24v56"/>',
 gift:'<path d="M14 40h72v19H14zM21 59v30h58V59M50 40v49"/><path d="M50 39C7 42 16 5 34 17l16 22c40 3 35-33 16-22z"/>',
 calendar:'<rect x="14" y="22" width="72" height="65" rx="9"/><path d="M14 42h72M32 13v21M68 13v21M30 58h11M58 58h11M30 73h11"/>',
 game:'<path d="M31 32h38c24 0 34 49 14 51-8 1-14-13-20-13H37c-6 0-12 14-20 13C-3 81 7 32 31 32zM22 51h22M33 40v22"/><circle cx="65" cy="47" r="3"/><circle cx="76" cy="57" r="3"/>',
 shield:'<path d="M50 9l33 13v28c0 20-14 31-33 43-19-12-33-23-33-43V22zM31 50l13 14 27-30"/>',
 people:'<circle cx="50" cy="29" r="15"/><path d="M24 85V73c0-34 52-34 52 0v12M12 34a12 12 0 0113-12M4 72c0-17 5-25 18-25M88 34a12 12 0 00-13-12M96 72c0-17-5-25-18-25"/>',
 building:'<path d="M9 33l41-23 41 23zM9 87h82M16 79h68M24 43v36M41 43v36M59 43v36M76 43v36"/>',
 note:'<path d="M22 12h40l18 18v57H22zM62 12v19h18M34 45h32M34 59h32M34 73h21"/>',
 book:'<path d="M50 27c-12-14-29-12-40-5v61c14-7 27-7 40 4 13-11 26-11 40-4V22c-11-7-28-9-40 5zM50 27v60M23 39l14-1M23 54l14-1M63 38l14 1M63 53l14 1"/>',
 gear:'<path d="M43 9h14l4 12 11 6 12-2 7 13-8 10v12l8 10-7 13-12-2-11 6-4 12H43l-4-12-11-6-12 2-7-13 8-10V48L9 38l7-13 12 2 11-6z"/><circle cx="50" cy="54" r="16"/>',
 spark:'<path d="M50 8l11 29 29 11-29 11-11 29-11-29-29-11 29-11zM85 6v14M78 13h14"/>'
};
export function categoryBannerSVG(category:CardCategory){
 const c=cardCategories[category];
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="280" viewBox="0 0 1200 280"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#171d35"/><stop offset="1" stop-color="#0b0e1d"/></linearGradient><radialGradient id="glow"><stop stop-color="'+c.accent+'" stop-opacity=".22"/><stop offset="1" stop-color="'+c.accent+'" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="280" rx="28" fill="url(#bg)"/><circle cx="980" cy="130" r="290" fill="url(#glow)"/><path d="M730 0l-210 280M970 0L760 280M1200 0L990 280" stroke="'+c.accent+'" stroke-opacity=".08" stroke-width="2"/><rect x="38" y="36" width="5" height="205" rx="2" fill="'+c.accent+'"/><g font-family="DejaVu Sans, sans-serif"><text x="65" y="65" fill="'+c.accent+'" font-size="16" letter-spacing="5" font-weight="bold">TURKISHPiX · TOPLULUK</text><text x="63" y="143" fill="#f5f7ff" font-size="48" font-weight="bold">'+cardText(c.title,40)+'</text><text x="66" y="190" fill="#a8b7d1" font-size="21">'+cardText(c.subtitle,50)+'</text><text x="66" y="241" fill="#70829e" font-size="14" letter-spacing="2">DISCORD.GG/TURKISHPIX</text></g><circle cx="1010" cy="140" r="98" fill="'+c.accent+'" fill-opacity=".06" stroke="'+c.accent+'" stroke-opacity=".2"/><g transform="translate(933 63) scale(1.55)" fill="none" stroke="'+c.accent+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">'+icons[c.icon]+'</g></svg>';
}
export type RankCardInput={username:string;displayName:string;guildName:string;xp:number;level:number;start:number;end:number;percent:number;remaining:number;rank:number|null;rankedMembers:number;messages:number;voiceMinutes:number;avatarData?:string};
export function rankCardSVG(p:RankCardInput){
 const progress=Math.max(0,Math.min(1,p.percent/100)),xpInto=Math.max(0,p.xp-p.start),next=Math.max(1,p.end-p.start);
 const avatar=p.avatarData?'<image href="'+p.avatarData+'" x="47" y="100" width="164" height="164" clip-path="url(#avatar)"/>':'<circle cx="129" cy="182" r="80" fill="#273a5d"/><text x="129" y="200" text-anchor="middle" font-size="54" fill="#91e8ff">'+xmlText([...p.displayName.trim().toLocaleUpperCase('tr-TR')].slice(0,2).join(''))+'</text>';
 const number=(n:number)=>new Intl.NumberFormat('tr-TR').format(n);
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="440"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#15203b"/><stop offset="1" stop-color="#0b0d1c"/></linearGradient><linearGradient id="bar"><stop stop-color="#53dcff"/><stop offset=".7" stop-color="#8f99ff"/><stop offset="1" stop-color="#c291ff"/></linearGradient><clipPath id="avatar"><circle cx="129" cy="182" r="80"/></clipPath></defs><rect width="1200" height="440" rx="32" fill="url(#bg)"/><circle cx="1080" cy="370" r="320" fill="#4d2e92" fill-opacity=".13"/><path d="M850 0l-240 440M1050 0L810 440M1250 0L1010 440" stroke="#8499dd" stroke-opacity=".06"/><g font-family="DejaVu Sans,sans-serif"><text x="48" y="54" font-size="15" letter-spacing="4" fill="#6cdfff" font-weight="bold">TURKISHPiX / RANK</text><text x="1152" y="54" text-anchor="end" fill="#8596b8" font-size="17">'+cardText(p.guildName,32)+'</text><circle cx="129" cy="182" r="85" fill="none" stroke="url(#bar)" stroke-width="4"/>'+avatar+'<text x="129" y="310" text-anchor="middle" fill="#91a5c8" font-size="15">SEVİYE</text><text x="129" y="366" text-anchor="middle" fill="#f5f7ff" font-size="47" font-weight="bold">'+p.level+'</text><text x="250" y="137" fill="#f5f7ff" font-size="35" font-weight="bold">'+cardText(p.displayName,26)+'</text><text x="252" y="172" fill="#8ea2c7" font-size="18">@'+cardText(p.username,34)+'</text><rect x="944" y="95" width="208" height="104" rx="18" fill="#ffe1a4" fill-opacity=".06" stroke="#ffd06c" stroke-opacity=".22"/><text x="1048" y="124" text-anchor="middle" fill="#bca67c" font-size="13" letter-spacing="2">SUNUCU SIRASI</text><text x="1048" y="174" text-anchor="middle" fill="#ffd06c" font-size="35" font-weight="bold">'+(p.rank===null?'—':'#'+p.rank)+'</text><text x="252" y="237" fill="#a0b1cd" font-size="15">SEVİYE '+p.level+' → '+(p.level+1)+'</text><text x="1152" y="237" text-anchor="end" fill="#bed3f8" font-size="17">'+number(xpInto)+' / '+number(next)+' XP</text><rect x="250" y="254" width="902" height="20" rx="10" fill="#29314d"/>'+(progress?'<rect x="250" y="254" width="'+902*progress+'" height="20" rx="10" fill="url(#bar)"/>':'')+'<text x="252" y="307" fill="#7c91b8" font-size="14">TOPLAM XP</text><text x="545" y="307" fill="#7c91b8" font-size="14">SOHBET KATKISI</text><text x="865" y="307" fill="#7c91b8" font-size="14">SESTE AKTİFLİK</text><text x="252" y="345" fill="#e1ebff" font-size="27" font-weight="bold">'+number(p.xp)+'</text><text x="545" y="345" fill="#e1ebff" font-size="27" font-weight="bold">'+number(p.messages)+' mesaj</text><text x="865" y="345" fill="#e1ebff" font-size="27" font-weight="bold">'+number(p.voiceMinutes)+' dk</text><path d="M250 376h902" stroke="#29314d"/><text x="252" y="412" fill="#8ea2c7" font-size="14">Sonraki seviye için '+number(p.remaining)+' XP · '+number(p.rankedMembers)+' XP kazanan üye</text><text x="1152" y="412" text-anchor="end" fill="#627694" font-size="13">/siralama · /seviye</text></g></svg>';
}
