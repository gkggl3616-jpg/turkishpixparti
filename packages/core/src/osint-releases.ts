import type {Release} from './releases';
export const OSINT_VERSION='2.21.0';
export const osintReleases:Release[]=[
 {version:OSINT_VERSION,date:'2026-10-13',title:'696 kaynak, çoklu API ve canlı kişisel kutular',summary:'604 yeni açık profil adaptörü, 25 yeni API sağlayıcı bağlantısı, kaynak karşılaştırmaları ve kanıta dayalı güvenlik skorları. Tasarım korunur; yalnız OSINT servisi güncellenir.',features:[
  {title:'696 kaynakta tam kullanıcı adı kontrolü',description:'Kaynaklar 12 eşzamanlı istekle sorgulanır; gerçek işlem akışı ve kaynak başına doğrulanan, aday, engellenen veya bulunamayan sonuç. WhatsMyName veri kümesi CC BY-SA 4.0 atfıyla kullanılır. Açık profil kaynakları resmî API olarak sayılmaz.',commands:[],path:'/osint?tool=usernames'},
  {title:'Bütün bağlı API’leri karşılaştır',description:'7 DoH çözümleyicisi; 10 GeoIP bağlantısı; IP, domain, URL, hash ve CVE için çoklu kaynak araştırması. Eksik anahtar, kaynak hatası ve başarılı yanıt ayrı gösterilir.',commands:[],path:'/osint?tool=scan'},
  {title:'Güvenlik skoru ve bulgu filtreleri',description:'Web, TLS, DNS, SPF ve DMARC kontrolleri; kanıt, önem seviyesi, çözüm, kapsam ve test edilmeyenler. Skor yalnız değerlendirilen yapılandırma kontrollerinden hesaplanır; injection açığı iddiası üretilmez.',commands:[],path:'/osint?tool=security-score'},
  {title:'Temp Mail / Number merkezi',description:'Mail.tm, Mail.gw, Guerrilla Mail, anahtarlı DropMail ve MailSlurp; kişisel Twilio / SignalWire / MailSlurp numarası. Web kutusu saniyede bir yenilenir, sağlayıcı kota aralığı korunur. Kullanıcının açtığı kendi Discord kutusu yeni mesajlarda güncellenir.',commands:[],path:'/osint?tool=inbox-hub'},
  {title:'Hesaba ait kalıcı web raporları',description:'Webden tamamlanan bütün sorgular hesaba şifreli kaydedilir, 7 gün saklanır; sayfalama, araç/hedef filtresi ve JSON/TXT dışa aktarma. Discord sorguları kendi kanalında kalır.',commands:[],path:'/osint?tool=report-history'},
  {title:'Owner proxy sayısı sınırı kaldırıldı',description:'Owner için level temelli sonuç sınırı yok; kaynakta mevcut tüm eşleşen kayıtlar gösterilir. Canlı kontrolde owner adres sayısı sınırı yok; bağlantılar sınırlı eşzamanlılıkla işlenir.',commands:[],path:'/osint?tool=proxy'}
 ]},
 {version:'2.20.0',date:'2026-10-12',title:'Modüler OSINT konsolu & genişletilmiş kombolar',summary:'Web sonuçları webde; seçilebilir araştırma modülleri, canlı işlem akışı, kaynak durumları ve kişisel rapor çalışma alanı.',features:[
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
