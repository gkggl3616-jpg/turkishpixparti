export const intelligenceTools=[
 ['ip-rdap','IP RDAP / Tahsis','Ağ aralığı ve kayıt olayları','ip','infrastructure'],
 ['bgp','BGP Routing','Gözlenen prefix / ASN yönlendirmesi','ip','infrastructure'],
 ['rpki','RPKI Validation','ROA durumunu prefix ve ASN ile doğrula','ip','infrastructure'],
 ['abuse-contact','Abuse Contact','RIR ağ abuse irtibatı','ip','infrastructure'],
 ['rdns','Reverse DNS','Açık reverse DNS kaydı','ip','infrastructure'],
 ['reverse-ip','Reverse IP','Aynı IP ile ilişkili açık domain kayıtları','ip','infrastructure'],
 ['geo-consensus','GeoIP Consensus','Üç kaynağın ülke yanıtlarını karşılaştır','ip','infrastructure'],
 ['cloud-ip','Cloud / CDN Match','Yayımlanan AWS / Google / Cloudflare aralıkları','ip','infrastructure'],
 ['internetdb','InternetDB Port & CVE','Shodan tarihî port / CPE / CVE indeksi','ip','threats'],
 ['otx','AlienVault OTX','Açık pulse ilişkileri ve tehdit meta verisi','indicator','threats'],
 ['greynoise','GreyNoise Community','Geçmiş tarama ve RIOT sinyalleri','ip','threats'],
 ['public-breaches','Public Breach Catalog','Domain için yayımlanmış ihlal olayları','domain','threats'],
 ['humans','humans.txt','Yayımlanan geliştirici / ekip beyanları','domain','research'],
 ['url-history','urlscan History','Açık geçmiş tarama indeksindeki raporlar','domain','research'],
 ['search-web','Live Web Search','Domain ile sınırlı Brave sonuçları','domain','research'],
 ['github-mentions','Repository References','Domain için açık kod referansları','domain','research'],
 ['github-keys','Public SSH / GPG / Gist','Yayımlanmış anahtar parmak izleri ve Gist meta verisi','username','communication'],
 ['gravatar','Gravatar Profile','Yayımlanmış profil meta verisi','email','communication'],
 ['discord-id','Discord Snowflake','Yerel hesap oluşturma zamanını çözümle','discord','communication'],
 ['spf-deep','SPF Include Tree','Include / redirect zinciri ve 10 lookup limiti','domain','infrastructure'],
 ['proxy-live','Live Proxy Checker','Toplu HTTP / HTTPS / SOCKS bağlantı testi','proxy','proxy'],
 ['business','Public Business Finder','OpenStreetMap açık yer / işletme kayıtları','text','research']
] as const;
export type IntelligenceKind=(typeof intelligenceTools)[number][0];
export const intelligenceCatalog=intelligenceTools.map(([id,name,label,input,group])=>({id,name,label,input,group,enabled:true,icon:'🔎'}));
