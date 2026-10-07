# Railway dağıtımı

7 Ekim 2026 dağıtım girişiminde hesap yeni proje oluşturmayı `Free plan resource provision limit exceeded` hatasıyla engelledi. Önce hesabın kaynak oluşturma limiti giderilmelidir. Mevcut başka projelere dokunulmadı.

## Servisler

| Servis | Dockerfile | Komut | Dış erişim |
| --- | --- | --- | --- |
| Postgres | Railway PostgreSQL template | Yönetilen veritabanı | Uygulamalar için private network |
| Web | `Dockerfile.web` | `node apps/web/server.js` | HTTPS Railway domain |
| Bot | `Dockerfile.bot` | `npm run bot` | Dış domain gerekmez |

İki uygulama aynı repository kökünden build edilir. Root Directory’yi `apps/web` veya `apps/bot` yapmayın; workspace bağımlılıkları kökte kalmalıdır. Her hizmette `RAILWAY_DOCKERFILE_PATH` ilgili Dockerfile’ı belirtir.

Yeni projeler için `.railway/railway.ts` güncel Railway IaC formatını kullanır. Web ve Bot kaynakları `gkggl3616-jpg/turkishpixparti` reposunun `main` dalına bağlanır. Dört owner ID’si servis tanımında hazırdır. `railway config plan` sonucu incelenerek `railway config apply` çalıştırılır. SDK `railway` dev bağımlılığıdır; güncel Railway CLI gerekir.

`railway.web.json` ve `railway.bot.json`, eski Config as Code kullanan servisler için ayrıca sağlanmıştır. Yeni servislerde IaC veya dashboard ayarlarını kullanın.

Resmî kaynaklar:
- https://docs.railway.com/infrastructure-as-code/reference
- https://docs.railway.com/builds/dockerfiles
- https://docs.railway.com/deployments/pre-deploy-command

## İlk migration ve kısıtlı uygulama rolü

1. Postgres servisini oluşturun.
2. Yönetici bağlantısını yalnızca bir migration ortamında kullanarak `npm run db:migrate` çalıştırın. Yerelden çalıştırıyorsanız Railway’nin uygun public bağlantısını ve TLS ayarlarını kullanın. Yönetici URL’sini Git’e eklemeyin.
3. Aynı yönetici ortamında en az 32 karakterlik rastgele `DATABASE_RUNTIME_PASSWORD` tanımlayıp `npm run db:harden` çalıştırın. Script `.runtime.env` dosyasına yeni rolün bağlantısını yazar. Dosya `.gitignore` ile dışlanır.
4. Web ve Bot’a `DATABASE_URL` olarak bu bağlantıyı verin. IaC kullanırken ortamın Shared Variables bölümünde `DATABASE_RUNTIME_URL` bu değeri taşımalıdır. Private hostname üretim servislerinde korunmalıdır.
5. Yönetici URL’sini Web ve Bot değişkenlerine koymayın. Uygulama rolü audit trigger’larını kapatamaz.

Web pre-deploy komutu `node scripts/migrate.mjs`’dir. `001_initial` ve `003_discord_roles` şemaları zaten varsa bunları doğrulayıp çıkar; kısıtlı rol DDL çalıştırmaz. İleride yeni migration sürümleri için yönetici migration ortamı kullanılır.

## Paylaşılan değişkenler

| Değişken | Değer |
| --- | --- |
| `DATABASE_RUNTIME_URL` | Kısıtlı rolün üretim PostgreSQL bağlantısı (IaC ortak referansı) |
| `APP_URL` | Web’in HTTPS domain’i; sonunda `/` yok |
| `DISCORD_CLIENT_ID` | `1557484052133707896` |
| `DISCORD_PUBLIC_KEY` | `.env.example` içindeki ekran görüntüsünden alınmış değer |
| `DISCORD_CLIENT_SECRET` | OAuth2 Client Secret; özel server değişkeni |
| `DISCORD_BOT_TOKEN` | **Bot** sayfasından alınan ayrı token |
| `DISCORD_GUILD_ID` | TurkishPix Discord sunucu ID’si |
| `DISCORD_VOTE_CHANNEL_ID` | Halk/meclis oylama kanalı ID’si |
| `DISCORD_LOG_CHANNEL_ID` | Owner’lara açık log kanalı ID’si |
| `DISCORD_OWNER_IDS` | Virgülle ayrılan dört ayrı owner kullanıcı ID’si |
| `DISCORD_MP_ROLE_ID` | İsteğe bağlı ilk milletvekili rol ID’si; owner panelindeki eşleştirme önceliklidir |
| `AUDIT_HMAC_KEY` | En az 32 karakterlik sabit rastgele imza anahtarı |
| `OWNER_APPROVAL_QUORUM` | `4` |
| `BALLOT_HOURS` | Varsayılan `24` |
| `MIN_VOTES` | Varsayılan `1`; canlı sunucunun ölçeğine göre ayarlanır |
| `MIN_MEMBER_AGE_HOURS` | Varsayılan `0` |
| `SESSION_HOURS` | Varsayılan `24` |
| `DEMO_MODE` | Canlıda `false` |
| `NODE_ENV` | `production` |

OAuth2 Client Secret ve bot token’ını, Web/Bot tarafından ulaşılabilen private değişkenlerde tutun. Bunların `NEXT_PUBLIC_` karşılığı yoktur.

## Yayına geçiş

Web HTTPS domain’i üretildikten sonra `APP_URL` iki serviste aynı olmalıdır. Discord Redirect URI bu domain + `/api/auth/callback` olarak kaydedilir. Healthcheck `/api/health`, timeout 180 saniye. Bot servisinde public domain ve HTTP healthcheck gerekmiyor; çalışan süreç kontrol edilir.

Bot sunucuya eklenir. `/partikur` ve diğer komutlar, yapılandırılmış ortamda `npm run commands:register` ile sunucuya kaydedilir. Gateway botu kullanıldığı için Interactions Endpoint URL boş kalır.

Canlı smoke testi:

1. Normal sunucu üyesi Discord ile giriş yapar, parti başvurusu gönderir.
2. Dört owner ayrı oturumlarla onay verir; ilk üç onay oylama açmamalı.
3. Dördüncü onay Discord kanalında oy mesajı oluşturmalı.
4. Discord’dan oy veren kişi web’den tekrar oy verememeli.
5. Süre dolunca bot sonucu yazmalı ve kabul edilen parti panelde görünmeli.
6. En az iki partiyle seçim oluşturulup aday listeleri girilmeli; sonuç milletvekili dağılımını üretmeli.
7. Owner panelindeki audit zinciri doğrulanmalı.

Bu smoke testi canlı bağlantı bilgileri eksik olduğu için bu teslimatta çalıştırılmadı.

## 7 Ekim 2026 hesap kontrolü

Görülen iki proje ve üç uygulama servisi:

| Proje | Servis | Public domain |
| --- | --- | --- |
| pixelya-studio | pixelya-studio-web | https://pixelya-studio-web-production.up.railway.app |
| pixmap-fun-redisless | pixmap-fun | https://pixmap-fun-production.up.railway.app |
| pixmap-fun-redisless | pixmap-studio-mobile-v9 | https://pixmap-studio-mobile-v9-production.up.railway.app |

Pixmap projesinde ayrıca 500 MB disk ve bir storage bucket var. Railway yeni TurkishPix projesini kod almadan `Free plan resource provision limit exceeded. Please upgrade to provision more resources!` yanıtıyla reddetti. API kaynak kotasının tam sayacını döndürmedi; disk veya bucket’ın bu reddi oluşturduğu doğrulanmış değildir. Mevcut uygulamalar silinmedi veya değiştirilmedi.

Dört siyasi rolü **Discord rolleri** sayfasından eşleştirin. Bot için `Manage Roles` izni ve hedef rollerin üzerinde bir bot rolü gerekir. OAuth giriş scope’ları `identify guilds.members.read`; rolleri okuyan bot Guild Members veya Message Content privileged intent gerektirmez.
