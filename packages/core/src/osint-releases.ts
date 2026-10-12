import type {Release} from './releases';
export const OSINT_VERSION='2.20.0';
export const osintReleases:Release[]=[
 {version:OSINT_VERSION,date:'2026-10-12',title:'Modüler OSINT konsolu & genişletilmiş kombolar',summary:'Web sonuçları webde; seçilebilir araştırma modülleri, canlı işlem akışı, kaynak durumları ve kişisel rapor çalışma alanı.',features:[
  {title:'Sonuç kanalı ayrımı',description:'Webden başlatılan sorgu yalnızca webde gösterilir; otomatik DM oluşturulmaz. Discord panelinden başlatılan mevcut sorgular Discord özel mesajında kalır.',commands:[],path:'/osint'},
  {title:'Sekiz kombo ve modül seçimi',description:'Domain, IP, web güvenliği, e-posta güvenliği, arşiv, açık profil ve tehdit profilleri; otomatik hedef türü, seçilebilir modüller, hızlı / dengeli / derin bütçe ve gerçek işlem günlüğü.',commands:[],path:'/osint?tool=scan'},
  {title:'IP ve tehdit istihbaratı',description:'IP RDAP, abuse, reverse DNS / IP, BGP, RPKI, ülke konsensüsü, resmî bulut aralıkları ve Shodan InternetDB geçmiş port / CVE kayıtları. Anahtarlı OTX ve GreyNoise bağlanabilir.',commands:[],path:'/osint?tool=combo-ip'},
  {title:'Kaynak ve rapor çalışma alanı',description:'Kaynak, zaman, süre, hata ve anahtar gereksinimi bölüm başına görünür. Kaydet, aç, sil, ara, kopyala, TXT / CSV / JSON indir. Raporlar hesap ve tarayıcıya göre ayrılır.',commands:[],path:'/osint?tool=scan'},
  {title:'Arşiv, arama ve açık kimlik',description:'humans.txt, urlscan geçmişi, kamuya açıklanmış HIBP site ihlalleri, GitHub anahtar parmak izleri / Gist, Gravatar, Discord Snowflake, SPF include ve açık işletme araması. Brave / GitHub araması API anahtarıyla sonuçları sitede gösterir.',commands:[],path:'/osint?tool=combo-archive',note:'Özel hesap, sızmış parola veya kişisel ihlal dökümü sorgulanmaz.'}
 ]},
 {version:'2.19.0',date:'2026-10-12',title:'Açık profil araştırması & teknik araçlar',summary:'92 platform, DNS / web politika araçları ve geçici iletişim.',features:[
  {title:'92 platformluk nick araştırması',description:'Doğrulanan açık profil, aday, bulunamadı ve erişim engeli ayrı gösterilir; durum filtreleri ve dışa aktarma.',commands:[],path:'/osint?tool=usernames'},
  {title:'DNS & web araçları',description:'DNSSEC, MX / NS / SOA / CAA, e-posta politikaları, web başlıkları, sayfa işaretleri, robots, sitemap ve Common Crawl.',commands:[],path:'/osint'},
  {title:'Booster ve kişisel gelen kutusu',description:'Booster için +20 günlük ortak hak. Seçilebilir Mail.tm / Mail.gw adresleri. Sahip olunan Twilio numarası atamasıyla kişisel SMS kutusu.',commands:[],path:'/osint?tool=mail'}
 ]},
 {version:'2.18.0',date:'2026-10-12',title:'API bağlantı merkezi & süreli haklar',summary:'Alternatif kaynaklar, şifreli API anahtarları ve owner araştırma yönetimi.',features:[
  {title:'API bağlantıları',description:'Kaynakların son gerçek bağlantı testi, şifreli anahtar yönetimi, hata ve kota durumu.',commands:[],path:'/osint/owner'},
  {title:'Süreli sorgu hakları',description:'Owner ek sorgu adedi ve bitiş tarihi tanımlar; kullanım ve erişim kayıtlarını denetler.',commands:[],path:'/osint/owner'}
 ]}
];
