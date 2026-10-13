# OSINT 2.25.0

Bu sürüm mevcut TypeScript/discord.js/Next.js mimarisine entegredir. Python/discord.py ile ikinci bir bot kurulmaz. İstenen davranışlar asenkron Node.js modülleriyle, ortak web/Discord araştırma motorundan çalışır.

| Slash komutu | Web aracı | /kur ana kategorisi | Davranış |
|---|---|---|---|
| /qr-olustur metin_veya_url | qr-code | /kur arastirma | 1024×1024 PNG kendi DM kutuna; webde PNG/SVG önizleme ve indirme |
| /api-ara kategori | api-directory | /kur arastirma | Public APIs README kataloğu; kategori, HTTPS, anahtarsızlık, ad/açıklama filtreleri; sayfalama |
| /altyapi-ara dil_veya_framework [lisans] | repository-search | /kur arastirma | MIT (varsayılan) veya Apache-2.0; webde dil/yıldız/güncellik filtreleri |
| /temp-mail | mail | /kur iletisim | Var olan kendi kutunu kullanır veya kişisel sağlayıcıdan oluşturur; adres gizli yanıt |
| /proxy-cek tur | proxy | /kur proxy | Mevcut proxy motoru; level/owner haklarıyla TXT kendi DM kutuna |
| /roblox-isim-kontrol kullanici_adi | roblox-username | /kur sosyal | Resmî Users API; tam ad eşleşmesi, ID, görünen ad ve açık profil linki |
| /mc-durum ip [port] | minecraft-status | /kur altyapi | Genel Minecraft Java sunucusuna bir Server List Ping; sayı/sürüm/yanıt süresi |

Web bağlantıları: `/osint?tool=<araç-id>`. `/kur` altında sekiz kategori kalır; alt araçlar menüden seçilir. Yeni araçların ve kategorilerin `?` açıklamaları vardır.

## Kaynaklar ve doğruluk

- GitHub proje araması sabit resmî REST endpointini kullanır. 20 sonuç/sayfa, en fazla ilk 1000 eşleşme. Önbellek 5 dakika; API hatası boş sonuç değildir. Kod otomatik indirilmez/çalıştırılmaz. Webde lisans filtresi “Tümü” seçilirse lisanssız adaylar ayrıca belirtilir; varsayılan MIT.
- API kataloğu `public-apis/public-apis` README kaynağından okunur; raw taşıma başarısızsa aynı dosya GitHub Contents API’den alınır. Katalog 6 saat önbelleklenir. Katalog kayıtları bağlı/çalışan API sayısına dahil edilmez. Upstream liste ücretsiz plan, güncellik ve çalışırlık garantisi değildir. Bilinen örnek uç noktalarında cURL API isteğidir; diğerlerinde yalnız belge sayfasını okuduğu açıkça yazılır. AI/Finans/Oyun/Hava Durumu Türkçe kategori adları desteklenir.
- Roblox’ta eşleşme yokluğu, adın yeni kayıt için müsait olduğunu kanıtlamaz. E-posta/telefon/özel hesap alanları alınmaz. Hatalı yanıt ile eşleşme yokluğu ayrıdır.
- Minecraft: Java, açık IP/alan adı, varsayılan 25565, özel/ayrılmış IP engeli, DNS IP sabitlemesi, 5 saniye bağlantı sınırı, 64 KiB paket sınırı. Sunucunun oyuncu isim/UUID örnekleri tutulmaz. Sunucuya giriş/AFK/komut yürütme yok. Bedrock ve SRV keşfi yok. Bağlantı hatası kesin çevrimdışı iddiası değildir. Başarılı durum 60 saniye önbelleklenir.
- QR: en fazla 2000 UTF-8 bayt, M hata düzeltme, 4 modül boş kenar. Üretim kendi uygulama sunucusunda yapılır; içerik harici QR sağlayıcısına gönderilmez. Web raporu 7 gün şifreli saklanır; owner erişim olayına QR içeriği yazılmaz. Discord teslimi yalnız sorguyu yapanın DM kutusuna.
- Temp Mail/proxy için yeni motor kurulmaz; mevcut kişisel kutu ve proxy limitleri korunur. Proxy havuzunda görünmek her hedefe bağlantı garantisi değildir.

## Uygulama dosyaları

- `packages/core/src/osint-utility-catalog.ts`: tarayıcıyla paylaşılabilen araç/sonuç türleri.
- `packages/core/src/osint-utilities.ts`: QR ve GitHub proje araması.
- `packages/core/src/osint-api-directory.ts`: katalog ayrıştırma/arama/önbellek.
- `packages/core/src/osint-game-tools.ts`: Roblox ve sınırlı Minecraft protokolü.
- `packages/core/src/osint-utility-commands.ts`: slash tanımları ve mevcut motora kısayollar.
- `apps/web/src/components/OsintUtilityWorkbench.tsx`: filtreli web ekranları.
- `packages/core/sql/030_osint_utilities.sql`: yeni query_kind değerleri; mevcut kullanım kayıtları korunur.
- `tests/osint-utilities.test.ts`: bağımsız QR çözümleme, gerçek PNG MIME/ek yapısı, şifreli kullanıcı raporu, kaynak ayrımı, parser sınırları, slash yönlendirmesi, erişim kapısı.

Yayın öncesi migration 030 uygulanmalıdır. OSINT sağlık kontrolü 030 sürümünü arar. Uygulama çalışırken admin veritabanı anahtarı kullanılmaz. Yönetim web servisi ve yönetim botu sürüm notları bu OSINT sürümünün kapsamına dahil değildir.
