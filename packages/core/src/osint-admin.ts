import {createHash} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {guildMember} from './discord';
import {assertOsintOwner} from './osint-entitlements';
import {osintOwnerList} from './osint-access';
import {osintProviderStatus,providerDefinitions,providerJson} from './osint-network';
import {levelInfo} from './features';
import {audit,canonical} from './audit';
import {loadServerSettings} from './setup';
export async function osintAdminState(ownerId:string,search='',offset=0){
 await loadServerSettings();assertOsintOwner(ownerId);await guildMember(ownerId);
 if(search.length>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new DomainError('INVALID_FILTER','Geçerli arama ve sayfa gerekli.',400);
 const pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
 const where="(EXISTS(SELECT 1 FROM member_profiles p WHERE p.guild_id=$1 AND p.user_id=u.id) OR EXISTS(SELECT 1 FROM osint_usage x WHERE x.guild_id=$1 AND x.user_id=u.id) OR EXISTS(SELECT 1 FROM osint_access_events e WHERE e.guild_id=$1 AND e.user_id=u.id)) AND (u.id ILIKE $2 OR u.username ILIKE $2)";
 const [base,users,total,grants,providers]=await Promise.all([
  osintOwnerList(ownerId,250),
  database().query(`SELECT u.id,u.username,u.avatar,u.created_at,u.last_seen_at,p.xp,p.messages,p.voice_seconds,m.joined_at AS site_joined_at,b.reason AS blocked_reason,(SELECT count(*)::int FROM osint_usage x WHERE x.guild_id=$1 AND x.user_id=u.id) AS queries,(SELECT count(*)::int FROM osint_access_events e WHERE e.guild_id=$1 AND e.user_id=u.id AND e.event_type='DENIED' AND e.created_at>now()-interval '14 days') AS denied,(SELECT max(e.created_at) FROM osint_access_events e WHERE e.guild_id=$1 AND e.user_id=u.id) AS last_activity,(SELECT e.observed_ip FROM osint_access_events e WHERE e.guild_id=$1 AND e.user_id=u.id AND e.observed_ip IS NOT NULL AND e.created_at>now()-interval '14 days' ORDER BY e.created_at DESC LIMIT 1) AS observed_ip,(SELECT count(*)::int FROM osint_dm_deliveries d WHERE d.guild_id=$1 AND d.user_id=u.id AND d.status IN ('PENDING','SENDING') AND d.expires_at>now()) AS pending_dm FROM users u LEFT JOIN member_profiles p ON p.user_id=u.id AND p.guild_id=$1 LEFT JOIN osint_portal_memberships m ON m.user_id=u.id LEFT JOIN osint_access_blocks b ON b.user_id=u.id AND b.guild_id=$1 WHERE ${where} ORDER BY u.last_seen_at DESC,u.id LIMIT 50 OFFSET $3`,[config().guildId,pattern,offset]),
  database().query(`SELECT count(*)::int AS n FROM users u WHERE ${where}`,[config().guildId,pattern]),
  database().query('SELECT g.id,g.user_id,u.username,g.assigned_by,g.credits,g.used,g.expires_at,g.revoked_at,g.created_at FROM osint_grants g JOIN users u ON u.id=g.user_id WHERE g.guild_id=$1 ORDER BY g.created_at DESC LIMIT 250',[config().guildId]),
  osintProviderStatus()
 ]);
 return {...base,users:users.rows.map(u=>({...u,xp:Number(u.xp||0),level:levelInfo(Number(u.xp||0)).level,owner:config().owners.includes(u.id)})),grants:grants.rows.map(g=>({...g,credits:Number(g.credits),used:Number(g.used)})),providers,owners:config().owners,totalUsers:Number(total.rows[0]?.n||0),offset,pageSize:50,generatedAt:new Date().toISOString(),privacyNotice:'Bu panel platform hesabı, sunucu XP/kullanımı ve 14 günlük araştırma erişim meta verilerini gösterir. Özel mesaj/gelen kutusu içeriği, şifre ve oturum anahtarları gösterilmez. Veriler amaçla sınırlı yetkili erişim içindir; IP tek başına kimlik/konum kanıtı değildir.'};
}
export async function osintMemberDetails(ownerId:string,userId:string){
 await loadServerSettings();assertOsintOwner(ownerId);await guildMember(ownerId);
 if(!/^\d{17,20}$/.test(userId))throw new DomainError('INVALID_USER','Geçerli Discord kullanıcı ID gerekli.',400);
 const member=await guildMember(userId);
 return {id:userId,username:member.user?.username,displayName:member.nick||member.user?.global_name||member.user?.username,avatar:member.user?.avatar,discordJoinedAt:member.joined_at||null,roleIds:member.roles||[],membershipPending:member.pending===true,timeoutUntil:member.communication_disabled_until||null,bot:member.user?.bot===true};
}
export async function osintAuditExport(ownerId:string,search='',offset=0){
 const state=await osintAdminState(ownerId,search,offset),document=JSON.parse(JSON.stringify({schema:'turkishpix-osint-audit-v1',generatedAt:state.generatedAt,guildId:config().guildId,retentionDays:14,scope:{search,offset,pageSize:50,totalUsers:state.totalUsers,eventLimit:250,grantLimit:250},users:state.users,events:state.events,blocks:state.blocks,grants:state.grants,notice:state.privacyNotice}));
 const sha256=createHash('sha256').update(canonical(document)).digest('hex');
 await transaction(tx=>audit(tx,ownerId,'OSINT_AUDIT_EXPORT',config().guildId,{sha256,userCount:state.users.length,eventCount:state.events.length,offset}));
 return {...document,sha256,hashEncoding:'SHA-256 of UTF-8 canonical JSON excluding sha256/hashEncoding; keys lexically sorted'};
}
export async function testOsintProvider(ownerId:string,id:string){
 await loadServerSettings();assertOsintOwner(ownerId);await guildMember(ownerId);
 return probeOsintProvider(id);
}
async function probeOsintProvider(id:string){
 const def=providerDefinitions.find(p=>p.id===id);if(!def)throw new DomainError('INVALID_PROVIDER','Sağlayıcı tanımlı değil.',400);
 if(def.category==='username'){const {usernameSources,profileProviderId,checkUsernameSource}=await import('./osint-usernames');const source=usernameSources.find(s=>profileProviderId(s.name)===id)!;const r=await checkUsernameSource(source,source.claimed||'octocat');if(['UNVERIFIABLE','NOT_CHECKED'].includes(r.status))throw new DomainError('PROVIDER_UNAVAILABLE',r.evidence,503);return {success:true,provider:id,checkedAt:r.checkedAt,evidence:r.status};}
 if(id==='twilio'){await (await import('./osint-sms')).listOwnedNumbers();return {success:true,provider:id,checkedAt:new Date().toISOString()};}
 if(id==='ssllabs'){await (await import('./osint-web-intelligence')).webIntelligenceResearch('ssl-labs','example.com');return {success:true,provider:id,checkedAt:new Date().toISOString()};}
 if(['otx','greynoise','brave','github-token','gravatar'].includes(id)){const {intelligenceResearch}=await import('./osint-intelligence');const kind=id==='brave'?'search-web':id==='github-token'?'github-mentions':id;await intelligenceResearch(kind as any,id==='gravatar'?'info@example.com':id==='brave'||id==='github-token'?'example.com':'1.1.1.1');return {success:true,provider:id,checkedAt:new Date().toISOString()};}
 const targets:Record<string,string>={observatory:'https://observatory-api.mdn.mozilla.net/api/v2/version',certspotter:'https://api.certspotter.com/v1/issuances?domain=example.com&expand=dns_names','hsts-preload':'https://hstspreload.org/api/v2/status?domain=example.com',tranco:'https://tranco-list.eu/api/ranks/domain/example.com',greenweb:'https://api.thegreenwebfoundation.org/api/v3/greencheck/example.com',internetdb:'https://internetdb.shodan.io/1.1.1.1',hibp:'https://haveibeenpwned.com/api/v3/breaches?domain=example.com',geojs:'https://get.geojs.io/v1/ip/geo/1.1.1.1.json',countryis:'https://api.country.is/1.1.1.1','aws-ranges':'https://ip-ranges.amazonaws.com/ip-ranges.json','cloudflare-ranges':'https://api.cloudflare.com/client/v4/ips','google-ranges':'https://www.gstatic.com/ipranges/cloud.json',nominatim:'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=Eiffel+Tower',mailgw:'https://api.mail.gw/domains',commoncrawl:'https://index.commoncrawl.org/collinfo.json','proxyscrape-origin':'https://raw.githubusercontent.com/proxyscrape/free-proxy-list/main/proxies/all/data.json',cloudflare:'https://cloudflare-dns.com/dns-query?name=example.com&type=A','google-dns':'https://dns.google/resolve?name=example.com&type=A',rdap:'https://rdap.org/domain/example.com','iana-rdap':'https://data.iana.org/rdap/dns.json',ripe:'https://stat.ripe.net/data/network-info/data.json?resource=1.1.1.1',ipwho:'https://ipwho.is/1.1.1.1',crtsh:'https://crt.sh/?q=example.com&output=json',nvd:'https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2024-3094',mitre:'https://cveawg.mitre.org/api/cve/CVE-2024-3094',proxyscrape:'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/all/data.json',github:'https://api.github.com/users/octocat',gitlab:'https://gitlab.com/api/v4/users?username=gitlab',mailtm:'https://api.mail.tm/domains',wayback:'https://web.archive.org/cdx/search/cdx?url=example.com&output=json&limit=1'};
 const {providerKey,boundedProviderText}=await import('./osint-network');
 if(id==='hackertarget'){const text=await boundedProviderText(id,'https://api.hackertarget.com/hostsearch/?q=example.com',300000);if(/API count exceeded|error|API key/i.test(text)){const {providerHealth}=await import('./osint-network');await providerHealth(id,false,'API_RESPONSE',0);throw new DomainError('PROVIDER_RESPONSE','HackerTarget kota/hata yanıtı verdi.',503);}}
 else if(def.key){const key=await providerKey(id);if(!key)throw new DomainError('PROVIDER_KEY_REQUIRED','Önce API anahtarını yapılandırın.',400);if(id==='virustotal')await providerJson(id,'https://www.virustotal.com/api/v3/ip_addresses/1.1.1.1',500000,{headers:{'x-apikey':key}});else if(id==='abuseipdb')await providerJson(id,'https://api.abuseipdb.com/api/v2/check?ipAddress=1.1.1.1&maxAgeInDays=30',500000,{headers:{Key:key}});else if(id==='securitytrails')await providerJson(id,'https://api.securitytrails.com/v1/ping',100000,{headers:{APIKEY:key}});else if(id==='malwarebazaar')await providerJson(id,'https://mb-api.abuse.ch/api/v1/',300000,{method:'POST',headers:{'Auth-Key':key,'Content-Type':'application/x-www-form-urlencoded'},body:'query=get_info&hash='+('0'.repeat(64))});else await providerJson(id,'https://urlscan.io/api/v1/search/?q=domain%3Aexample.com&size=1',500000,{headers:{'api-key':key}});}
 else await providerJson(id,targets[id],id.startsWith('proxyscrape')?6000000:5000000,{headers:id==='cloudflare'?{Accept:'application/dns-json'}:id==='nominatim'?{'User-Agent':'Turkish-OSINT/2.20 (+https://turkish-osint.up.railway.app)'}:id==='hibp'?{'User-Agent':'Turkish-OSINT-Research'}:{}});
 return {success:true,provider:id,checkedAt:new Date().toISOString()};
}

export async function probeOsintProviders(){
 const status=await osintProviderStatus(),pending=status.filter(p=>p.category!=='username'&&p.configured&&(!p.checkedAt||new Date(p.checkedAt).getTime()<Date.now()-900000));
 let checked=0,ok=0;
 for(let i=0;i<pending.length;i+=3){const results=await Promise.allSettled(pending.slice(i,i+3).map(p=>probeOsintProvider(p.id)));checked+=results.length;ok+=results.filter(r=>r.status==='fulfilled').length;}
 if(checked)console.log('OSINT_PROVIDER_PROBE',JSON.stringify({checked,ok,failed:checked-ok,keysRequired:status.filter(p=>!p.configured).length}));
}

let headProbeAt=0;
export async function probeOsintHead(){if(Date.now()-headProbeAt<3600000)return;headProbeAt=Date.now();const {publicHead}=await import('./osint-research');try{const result=await publicHead(process.env.OSINT_WEB_URL||config().appUrl);console.log('OSINT_PUBLIC_HEAD_READY',JSON.stringify({ready:true,status:result.status,liveTls:!!result.certificate}));}catch(e){console.log('OSINT_PUBLIC_HEAD_READY',JSON.stringify({ready:false,code:e instanceof DomainError?e.code:'NETWORK'}));}}
