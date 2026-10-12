import {MessageFlags,PermissionFlagsBits} from 'discord.js';
import {config,DomainError} from '../../../packages/core/src/config';
import {database,transaction} from '../../../packages/core/src/db';
import {rateLimit} from '../../../packages/core/src/auth';
import {osintRun,osintQuota,osintTools} from '../../../packages/core/src/osint';
import {osintLog,assertOsintAllowed,osintCommandChannel,setOsintCommandChannel} from '../../../packages/core/src/osint-access';
import {sendOsintResult,queueOsintDm,retryOsintDelivery,type DeliveryOutcome} from '../../../packages/core/src/osint-dm';
import {guildMember,discordRequest,isDiscordMissing,syncUser} from '../../../packages/core/src/discord';
import {osintPanel,osintWebLink,osintQueryModal,osintProxyModal,type OsintPanelKind} from '../../../packages/core/src/osint-panels';

const inputs:Record<string,{kind:string;field:string}>={
 dns:{kind:'dns',field:'alan'},ip:{kind:'ip',field:'adres'},url:{kind:'url',field:'adres'},
 rdap:{kind:'rdap',field:'alan'},subdomain:{kind:'subdomains',field:'alan'},sertifika:{kind:'tls',field:'alan'},
 asn:{kind:'asn',field:'adres'},cve:{kind:'cve',field:'kod'},email:{kind:'email',field:'alan'},hash:{kind:'hash',field:'sha256'},
 'proxy-checker':{kind:'proxy-check',field:'adres'}
};
const running=new Set<string>();
const actor=(i:any)=>({id:i.user.id,username:i.user.username,avatar:i.user.avatar});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function requireGuild(i:any){
 if(!i.guildId||i.guildId!==config().guildId)throw new DomainError('OSINT_GUILD','Bu panel TurkishPix sunucusunda kullanılabilir.',403);
}
function deliveryReply(delivery:DeliveryOutcome){
 return {
  content:delivery.delivered?'✅ **Sonucun özel mesajına gönderildi.**':delivery.error==='DM_CLOSED'?'⚠️ **Discord şu anda DM teslimine izin vermedi.**\nSunucu → Gizlilik Ayarları → Özel Mesajlar seçeneğini aç ve tekrar gönder. Sonucun 24 saat korunur; yeniden gönderim sorgu hakkı harcamaz.':'⏳ **DM teslimi bekliyor.**\nBağlantı yeniden denenecek. Sonucun 24 saat korunur; aşağıdaki düğmeden sorgu hakkı harcamadan tekrar gönderebilirsin.',
  components:delivery.delivered?[]:[{type:1,components:[{type:2,style:3,label:'DM’ye Tekrar Gönder',emoji:{name:'📨'},custom_id:'tp-osint:retry:'+delivery.id},{type:2,style:5,label:'DM Kutum',url:'https://discord.com/channels/@me'}]}],
  allowedMentions:{parse:[]}
 };
}
async function notice(i:any,title:string,content:string){
 const outcome=await queueOsintDm(actor(i),i.id,{content:'🛰️ **TURKISHPİX · '+title+'**\n\n'+content});
 await i.editReply(deliveryReply(outcome));
}
async function installPanel(i:any,kind:OsintPanelKind){
 const member=await i.guild.members.fetch({user:i.user.id,force:true});
 if(!config().owners.includes(i.user.id)&&i.guild.ownerId!==i.user.id&&!member.permissions.has(PermissionFlagsBits.ManageGuild))throw new DomainError('PANEL_PERMISSION','Paneli kurmak için Sunucuyu Yönet yetkisi gerekiyor.',403);
 const selected=i.options.getChannel('kanal');
 const channel=selected?await i.guild.channels.fetch(selected.id):i.channel;
 if(!channel||channel.guildId!==config().guildId||![0,5].includes(channel.type))throw new DomainError('INVALID_CHANNEL','Bir TurkishPix metin kanalı seç.',400);
 const card=osintPanel(kind,i.client.user.displayAvatarURL({size:256,extension:'png'}));
 const {allowedMentions,...wire}=card;const payload={...wire,allowed_mentions:{parse:[]}};
 const id=await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['osint-panel:'+i.guildId+':'+channel.id+':'+kind]);
  await syncUser(tx,actor(i));
  const existing=(await tx.query('SELECT message_id FROM osint_panels WHERE guild_id=$1 AND channel_id=$2 AND panel_type=$3',[i.guildId,channel.id,kind])).rows[0];
  let message:any;
  if(existing)try{message=await discordRequest('/channels/'+channel.id+'/messages/'+existing.message_id,{method:'PATCH',body:JSON.stringify(payload)});}catch(e){if(!isDiscordMissing(e,10008))throw e;}
  if(!message)message=await discordRequest('/channels/'+channel.id+'/messages',{method:'POST',body:JSON.stringify({...payload,nonce:i.id,enforce_nonce:true})});
  await tx.query('INSERT INTO osint_panels(guild_id,channel_id,panel_type,message_id,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,channel_id,panel_type) DO UPDATE SET message_id=EXCLUDED.message_id,updated_by=EXCLUDED.updated_by,updated_at=now()',[i.guildId,channel.id,kind,message.id,i.user.id]);
  return message.id;
 });
 await i.editReply({content:'✅ **TurkishPix paneli hazır.**\n<#'+channel.id+'> · https://discord.com/channels/'+i.guildId+'/'+channel.id+'/'+id,allowedMentions:{parse:[]}});
}
export async function handleOsintInteraction(i:any):Promise<boolean>{
 const slash=!!i.isChatInputCommand?.()&&['osint','proxy','tempmail'].includes(i.commandName);
 const component=typeof i.customId==='string'&&i.customId.startsWith('tp-osint:');
 if(!slash&&!component)return false;
 let kind='',target='';
 try{
  requireGuild(i);
  if(component&&(i.isButton?.()||i.isStringSelectMenu?.())&&i.message?.author?.id!==i.client.user.id)throw new DomainError('INVALID_PANEL','Panel doğrulanamadı.',403);
  // Modal display must acknowledge within three seconds; authorization is checked on submission.
  if(i.isButton?.()&&i.customId==='tp-osint:proxy-filters'){await i.showModal(osintProxyModal());return true;}
  if(i.isButton?.()&&i.customId.startsWith('tp-osint:query:')){
   const modal=osintQueryModal(i.customId.slice('tp-osint:query:'.length));
   if(!modal)throw new DomainError('INVALID_TOOL','Araç tanımlı değil.',400);
   await i.showModal(modal);return true;
  }
  if(i.isStringSelectMenu?.()&&i.customId==='tp-osint:tool'){
   const selected=i.values?.[0],available=osintTools.some(t=>t.id===selected&&t.enabled);
   const modal=available?osintQueryModal(selected):null;
   if(!modal)throw new DomainError('INVALID_TOOL','Bu araç şu an kullanılamıyor.',400);
   await i.showModal(modal);return true;
  }
  if(i.isButton?.()&&i.customId==='tp-osint:research'){
   await i.reply({flags:MessageFlags.Ephemeral,content:'🔎 **Araştırma aracını seç.** Sonuç yalnızca özel mesajına gönderilecek.',components:[{type:1,components:[{type:3,custom_id:'tp-osint:tool',placeholder:'Sorgu türünü seç',min_values:1,max_values:1,options:osintTools.filter(t=>t.enabled&&!!osintQueryModal(t.id)).map(t=>({label:t.name,value:t.id,description:t.label,emoji:{name:t.icon}}))}]}],allowedMentions:{parse:[]}});
   return true;
  }
  await i.deferReply({flags:MessageFlags.Ephemeral});
  if(slash&&(i.commandName==='proxy'||i.commandName==='tempmail'||i.options.getSubcommand()==='kur')){
   const chosen=i.commandName==='proxy'?'proxy':i.commandName==='tempmail'?'mail':i.options.getString('panel')||'osint';
   if(!['proxy','osint','mail'].includes(chosen))throw new DomainError('INVALID_PANEL','Panel türü tanımlı değil.',400);
   await installPanel(i,chosen as OsintPanelKind);return true;
  }
  if(slash&&i.options.getSubcommand()==='kanal'){
   const channel=i.options.getChannel('hedef',true);
   if(channel.guildId!==i.guildId||![0,5].includes(channel.type))throw new DomainError('INVALID_CHANNEL','Bir TurkishPix metin kanalı seç.');
   await setOsintCommandChannel(actor(i),channel.id);
   await i.editReply({content:'✅ Doğrudan OSINT komutları <#'+channel.id+'> kanalında çalışacak. Kurulu butonlu paneller kendi kanallarında kullanılabilir.',allowedMentions:{parse:[]}});return true;
  }
  await guildMember(i.user.id);await assertOsintAllowed(i.user.id);
  if(component&&i.customId.startsWith('tp-osint:retry:')){
   const id=i.customId.slice('tp-osint:retry:'.length);
   if(!uuid.test(id))throw new DomainError('INVALID_DELIVERY','Geçersiz teslim kaydı.',400);
   await rateLimit('osint-dm-retry:'+i.user.id,4,60);
   await i.editReply(deliveryReply(await retryOsintDelivery(id,i.user.id,true)));return true;
  }
  const subcommand=slash?i.options.getSubcommand():i.customId.slice('tp-osint:'.length);
  if(subcommand==='profil'||subcommand==='profile'){
   const q=await osintQuota(i.user.id);
   await notice(i,'LEVEL & KOTA','⭐ **Seviye '+q.level+'** · '+q.xp+' XP\n🌐 Her proxy isteğinde **'+q.proxyResultLimit+' sonuç**\n📊 Günlük sorgu hakkın: **'+q.remaining+' / '+q.dailyLimit+'**\n🔁 Türkiye saati 00:00’da yenilenir.\n\n'+osintWebLink());return true;
  }
  if(subcommand==='yardim'){
   await notice(i,'ARAŞTIRMA ARAÇLARI',osintTools.filter(t=>t.enabled).map(t=>t.icon+' **'+t.name+'**').join('\n')+'\n\nSonuçlar yalnızca DM ile gönderilir.\n'+osintWebLink());return true;
  }
  if(['temp-mail','temp-number','mail-status','mail-inbox'].includes(subcommand)){
   await notice(i,subcommand==='temp-number'?'TEMP NUMBER':'TEMP MAIL',subcommand==='temp-number'?'📱 Telefon/SMS sağlayıcısı henüz bağlanmadı. Şu anda numara tahsis edilemiyor.':'✉️ E-posta sağlayıcısı henüz bağlanmadı. Şu anda geçici adres ve gelen kutusu oluşturulamıyor.');return true;
  }
  if(slash){
   const assigned=await osintCommandChannel();
   if(assigned&&i.channelId!==assigned)throw new DomainError('OSINT_CHANNEL','Komutu <#'+assigned+'> kanalında veya kurulu panel düğmelerinden kullan.',403);
  }
  if(subcommand==='proxy-generator'||subcommand==='proxy'){
   kind='proxy';target=JSON.stringify({protocol:slash?i.options.getString('protokol')||'all':'all',country:slash?i.options.getString('ulke')||'':'',anonymity:slash?i.options.getString('anonimlik')||'all':'all',maxLatency:slash?i.options.getInteger('gecikme')??3000:3000,minUptime:slash?i.options.getInteger('uptime')??0:0});
  }else if(i.isModalSubmit?.()&&subcommand.startsWith('modal:')){
   kind=subcommand.slice('modal:'.length);
   if(kind==='proxy')target=JSON.stringify({protocol:i.fields.getTextInputValue('protocol').trim().toLowerCase()||'all',country:i.fields.getTextInputValue('country').trim(),anonymity:i.fields.getTextInputValue('anonymity').trim().toLowerCase()||'all',maxLatency:Number(i.fields.getTextInputValue('latency')),minUptime:Number(i.fields.getTextInputValue('uptime'))});
   else{if(!osintQueryModal(kind))throw new DomainError('INVALID_TOOL','Araç tanımlı değil.',400);target=i.fields.getTextInputValue('target');}
  }else{
   const selected=inputs[subcommand];if(!selected)throw new DomainError('INVALID_COMMAND','Araç tanımlı değil.',400);
   kind=selected.kind;target=i.options.getString(selected.field,true);
  }
  const key=i.guildId+':'+i.user.id;
  if(running.has(key))throw new DomainError('OSINT_BUSY','Mevcut sorgun tamamlanıyor. DM teslimini bekleyip yeniden dene.',409);
  running.add(key);
  try{
   const data=await osintRun(actor(i),kind,target,i.id);
   await osintLog(i.user.id,'QUERY','DISCORD',kind,target,null);
   const delivery=await sendOsintResult(actor(i),data.result,data.quota.remaining,i.id);
   await i.editReply(deliveryReply(delivery));
  }finally{running.delete(key);}
 }catch(e){
  await osintLog(i.user.id,'DENIED','DISCORD',kind,target,null,e instanceof DomainError?e.code:'ERROR').catch(()=>{});
  const message={content:'⚠️ '+(e instanceof DomainError?e.message:'İşlem tamamlanamadı. Botun kanal izinlerini kontrol edip yeniden dene.'),components:[],allowedMentions:{parse:[]}};
  if(i.deferred||i.replied)await i.editReply(message).catch(()=>{});else await i.reply({...message,flags:MessageFlags.Ephemeral}).catch(()=>{});
 }
 return true;
}
