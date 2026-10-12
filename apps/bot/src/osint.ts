import {MessageFlags} from 'discord.js';
import {config,DomainError} from '../../../packages/core/src/config';
import {osintRun,osintQuota,osintTools} from '../../../packages/core/src/osint';
import {osintLog,assertOsintAllowed,osintCommandChannel,setOsintCommandChannel} from '../../../packages/core/src/osint-access';
import {formatOsintDm,deliverOsintDm} from '../../../packages/core/src/osint-dm';
import {guildMember} from '../../../packages/core/src/discord';

const link=()=>process.env.OSINT_WEB_URL||config().appUrl+'/osint';
const inputs:Record<string,{kind:string;field:string}>={
 dns:{kind:'dns',field:'alan'},ip:{kind:'ip',field:'adres'},url:{kind:'url',field:'adres'},
 rdap:{kind:'rdap',field:'alan'},subdomain:{kind:'subdomains',field:'alan'},sertifika:{kind:'tls',field:'alan'},
 asn:{kind:'asn',field:'adres'},cve:{kind:'cve',field:'kod'},email:{kind:'email',field:'alan'},hash:{kind:'hash',field:'sha256'},
 'proxy-checker':{kind:'proxy-check',field:'adres'}
};
export async function handleOsintInteraction(i:any):Promise<boolean>{
 if(!i.isChatInputCommand()||i.commandName!=='osint')return false;
 await i.deferReply({flags:MessageFlags.Ephemeral});
 let kind='',target='';
 try{
  const subcommand=i.options.getSubcommand();
  if(subcommand==='kanal'){
   const channel=i.options.getChannel('hedef',true);
   if(channel.guildId!==i.guildId||![0,5].includes(channel.type))throw new DomainError('INVALID_CHANNEL','Bir TurkishPix metin kanalı seç.');
   await setOsintCommandChannel({id:i.user.id,username:i.user.username},channel.id);
   await i.editReply({content:'✅ OSINT komutları artık yalnızca <#'+channel.id+'> kanalında çalışacak.',allowedMentions:{parse:[]}});return true;
  }
  await guildMember(i.user.id);
  await assertOsintAllowed(i.user.id);
  const assigned=await osintCommandChannel();
  if(assigned&&i.channelId!==assigned)throw new DomainError('OSINT_CHANNEL','Araçları yalnızca <#'+assigned+'> kanalında kullanabilirsin.',403);
  if(subcommand==='profil'||subcommand==='yardim'){
   const q=await osintQuota(i.user.id);
   const content=subcommand==='profil'?'🔎 **TURKISH OSINT · XP PROFİLİ**\n⭐ '+q.xp+' XP · Seviye '+q.level+' · '+q.tier+'\n📊 Günlük hakkın: **'+q.remaining+' / '+q.dailyLimit+'**\n🔁 Türkiye saati 00:00':'🛰️ **TURKISH OSINT · NEXUS**\n'+osintTools.filter(t=>t.enabled).map(t=>t.icon+' **'+t.name+'**').join('\n')+'\n\nSonuçlar DM üzerinden gönderilir. Diğer entegrasyonlar sağlayıcı anahtarı gerektirir.';
   await i.editReply({content:content+'\n🌐 '+link(),allowedMentions:{parse:[]}});return true;
  }
  if(subcommand==='temp-mail'||subcommand==='temp-number'){
   await i.editReply({content:subcommand==='temp-mail'?'✉️ Temp Mail için yetkili e-posta sağlayıcısı ve domain/webhook yapılandırması henüz gerekli. Bu komut sahte e-posta üretmez.':'📱 Temp Number için lisanslı SMS/telefon sağlayıcısı, numara tahsisi ve güvenli webhook anahtarları henüz gerekli. Bu komut sahte numara tahsis etmez.',allowedMentions:{parse:[]}});return true;
  }
  if(subcommand==='proxy-generator'){
   kind='proxy';
   target=JSON.stringify({protocol:i.options.getString('protokol')||'all',country:i.options.getString('ulke')||'',anonymity:i.options.getString('anonimlik')||'all',maxLatency:i.options.getInteger('gecikme')??3000,minUptime:i.options.getInteger('uptime')??0,limit:i.options.getInteger('adet')??10});
  }else{
   const selected=inputs[subcommand];if(!selected)throw new DomainError('INVALID_COMMAND','Araç tanımlı değil.',400);
   kind=selected.kind;target=i.options.getString(selected.field,true);
  }
  const data=await osintRun({id:i.user.id,username:i.user.username,avatar:i.user.avatar},kind,target,i.id);
  await osintLog(i.user.id,'QUERY','DISCORD',kind,target,null);
  const content=formatOsintDm(data.result,data.quota.remaining);
  const sent=await deliverOsintDm(i.user.id,content);
  await i.editReply({content:sent?'✅ **Araştırma tamamlandı!** Sonuç özel mesajına gönderildi. Kalan hak: '+data.quota.remaining:'⚠️ DM gönderilemedi. Discord gizlilik ayarlarında sunucu üyelerinden özel mesaj almayı aç.\n\n'+content.slice(0,1300),allowedMentions:{parse:[]}});
 }catch(e){
  await osintLog(i.user.id,'DENIED','DISCORD',kind,target,null,e instanceof DomainError?e.code:'ERROR').catch(()=>{});
  await i.editReply({content:'⚠️ '+(e instanceof DomainError?e.message:'Araştırma tamamlanamadı.'),allowedMentions:{parse:[]}}).catch(()=>{});
 }
 return true;
}
