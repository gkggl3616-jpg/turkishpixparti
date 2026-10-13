import {osintUtilityCommands,utilityCommandInput} from '../../../packages/core/src/osint-utility-commands';
import {ZodError} from 'zod';
import {osintCategories} from '../../../packages/core/src/osint-navigation';
import {liveInboxState,liveInboxAction,liveInboxProviders} from '../../../packages/core/src/osint-live-inbox';
import {MessageFlags,PermissionFlagsBits} from 'discord.js';
import {config,DomainError} from '../../../packages/core/src/config';
import {database,transaction} from '../../../packages/core/src/db';
import {rateLimit} from '../../../packages/core/src/auth';
import {osintRun,osintQuota,osintTools,osintCatalog} from '../../../packages/core/src/osint';
import {osintLog,assertOsintAllowed} from '../../../packages/core/src/osint-access';
import {sendOsintResult,queueOsintDm,retryOsintDelivery,type DeliveryOutcome} from '../../../packages/core/src/osint-dm';
import {guildMember,discordRequest,isDiscordMissing,syncUser,DiscordAPIError} from '../../../packages/core/src/discord';
import {osintPanel,osintWebLink,osintQueryModal,osintProxyModal,osintMailModal,osintToolMenus,type OsintPanelKind} from '../../../packages/core/src/osint-panels';

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
  const existing=(await tx.query('SELECT message_id,panel_type FROM osint_panels WHERE guild_id=$1 AND channel_id=$2 AND panel_type=ANY($3::text[]) ORDER BY (panel_type=$4) DESC LIMIT 1',[i.guildId,channel.id,[kind,...(kind==='infrastructure'?['osint']:kind==='communication'?['mail']:[])],kind])).rows[0];
  let message:any;
  if(existing)try{message=await discordRequest('/channels/'+channel.id+'/messages/'+existing.message_id,{method:'PATCH',body:JSON.stringify({...payload,content:null,embeds:[]})});}catch(e){if(!isDiscordMissing(e,10008))throw e;}
  if(!message)message=await discordRequest('/channels/'+channel.id+'/messages',{method:'POST',body:JSON.stringify({...payload,nonce:i.id,enforce_nonce:true})});
  if(existing&&existing.panel_type!==kind)await tx.query('DELETE FROM osint_panels WHERE guild_id=$1 AND channel_id=$2 AND panel_type=$3',[i.guildId,channel.id,existing.panel_type]);
  await tx.query('INSERT INTO osint_panels(guild_id,channel_id,panel_type,message_id,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,channel_id,panel_type) DO UPDATE SET message_id=EXCLUDED.message_id,updated_by=EXCLUDED.updated_by,updated_at=now()',[i.guildId,channel.id,kind,message.id,i.user.id]);
  return message.id;
 });
 await i.editReply({content:'✅ **TurkishPix paneli hazır.**\n<#'+channel.id+'> · https://discord.com/channels/'+i.guildId+'/'+channel.id+'/'+id,allowedMentions:{parse:[]}});
}
export async function handleOsintInteraction(i:any):Promise<boolean>{
 const slash=!!i.isChatInputCommand?.()&&i.commandName==='kur';
 const direct=!!i.isChatInputCommand?.()&&osintUtilityCommands.some(c=>c.name===i.commandName);
 const component=typeof i.customId==='string'&&i.customId.startsWith('tp-osint:');
 if(!slash&&!component&&!direct)return false;
 let kind='',target='';
 try{
  const privateFilter=component&&i.customId.startsWith('tp-osint:inbox-filter:');if(i.guildId||!privateFilter)requireGuild(i);
  if(component&&(i.isButton?.()||i.isStringSelectMenu?.())&&i.message?.author?.id!==i.client.user.id)throw new DomainError('INVALID_PANEL','Panel doğrulanamadı.',403);
  // Modal display must acknowledge within three seconds; authorization is checked on submission.
  if(i.isButton?.()&&i.customId==='tp-osint:mail-custom'){await i.showModal(osintMailModal());return true;}
  if(i.isButton?.()&&i.customId==='tp-osint:proxy-filters'){await i.showModal(osintProxyModal());return true;}
  if(i.isButton?.()&&i.customId.startsWith('tp-osint:query:')){
   const modal=osintQueryModal(i.customId.slice('tp-osint:query:'.length));
   if(!modal)throw new DomainError('INVALID_TOOL','Araç tanımlı değil.',400);
   await i.showModal(modal);return true;
  }
  if(i.isStringSelectMenu?.()&&(i.customId==='tp-osint:tool'||i.customId.startsWith('tp-osint:tool:'))){
   const selected=i.values?.[0],available=(await osintCatalog()).some(t=>t.id===selected&&t.enabled);
   const modal=available?osintQueryModal(selected):null;
   if(!modal)throw new DomainError('INVALID_TOOL','Bu araç şu an kullanılamıyor.',400);
   await i.showModal(modal);return true;
  }
  if(i.isButton?.()&&i.customId.startsWith('tp-osint:category:')){await guildMember(i.user.id);await assertOsintAllowed(i.user.id);const category=osintCategories.find(c=>c.id===i.customId.slice('tp-osint:category:'.length));if(!category)throw new DomainError('INVALID_CATEGORY','Kategori tanımlı değil.',400);await i.reply({flags:MessageFlags.Ephemeral,content:'🔎 **'+category.label+' · aracını seç**',components:osintToolMenus((await osintCatalog()).filter(t=>category.tools.includes(t.id))),allowedMentions:{parse:[]}});return true;}
  if(i.isButton?.()&&i.customId.startsWith('tp-osint:help:')){const category=osintCategories.find(c=>c.id===i.customId.slice('tp-osint:help:'.length));if(!category)throw new DomainError('INVALID_CATEGORY','Kategori tanımlı değil.',400);await i.reply({flags:MessageFlags.Ephemeral,content:'❔ **'+category.label+'**\n'+category.description+'\n\n**Örnek:** '+category.example+'\n\nSonuçlar Discord özel mesajına gönderilir. Eksik anahtar/hata boş sonuç değildir.',allowedMentions:{parse:[]}});return true;}
  if(i.isButton?.()&&i.customId==='tp-osint:research'){
   await i.reply({flags:MessageFlags.Ephemeral,content:'🔎 **Araştırma aracını seç.** Sonuç yalnızca özel mesajına gönderilecek.',components:osintToolMenus(await osintCatalog()),allowedMentions:{parse:[]}});
   return true;
  }
  await i.deferReply({flags:MessageFlags.Ephemeral});
  if(slash){
   const sub=i.options.getSubcommand();
   const chosen=osintCategories.find(c=>c.command===sub)?.id as OsintPanelKind|undefined;
   if(!chosen)throw new DomainError('INVALID_PANEL','Panel türü tanımlı değil.',400);
   await installPanel(i,chosen);return true;
  }
  await guildMember(i.user.id);await assertOsintAllowed(i.user.id);
  if(i.isButton?.()&&i.customId.startsWith('tp-osint:inbox-filter:')){const [, , id,service]=i.customId.split(':');await rateLimit('discord-inbox-filter:'+i.user.id,15,60);await liveInboxAction(actor(i),{action:'filter',id,service});await i.editReply({content:'✅ Kendi kutunun mesaj filtresi güncellendi. Web ve canlı DM kutusunda uygulanır; hesap kaydı taranmaz.',allowedMentions:{parse:[]}});return true;}
  if(i.isStringSelectMenu?.()&&i.customId==='tp-osint:inbox-number-select'){const id=i.values?.[0],state=await liveInboxState(i.user.id,false),assignment=state.assignments.find(a=>a.id===id);if(!assignment)throw new DomainError('NUMBER_NOT_ASSIGNED','Bu numara sana atanmış değil veya süresi doldu.',403);await rateLimit('discord-inbox:'+i.user.id,4,60);const created=await liveInboxAction(actor(i),{action:'create',provider:assignment.provider,assignmentId:id});if(!('id' in created)||!('address' in created))throw new DomainError('INBOX_CREATE','Kutu açılamadı.',503);await liveInboxAction(actor(i),{action:'discord',id:created.id,enabled:true});await i.editReply({content:'✅ Seçtiğin kişisel numara: '+created.address+'\nKendi sürekli güncellenen SMS DM kutun açıldı. Mesaj filtreleri kutunun altındadır.',components:[],allowedMentions:{parse:[]}});return true;}
  if(i.isButton?.()&&i.customId.startsWith('tp-osint:inbox:')){const type=i.customId.split(':').at(-1);if(!['mail','number'].includes(type))throw new DomainError('INBOX_TYPE','Kutu türü geçersiz.',400);const state=await liveInboxState(i.user.id),choices=state.providers.filter(p=>p.kind===type&&p.configured);if(type==='number'){const assignments=state.assignments.filter(a=>state.providers.some(p=>p.id===a.provider&&p.configured));await i.editReply({content:'📲 **Kişisel numaranı seç**\n'+(assignments.length?'Seçilen atama SMS kutuna bağlanır. Başka numara seçince önceki sağlayıcı kutusu kapanır.':'Sana atanmış aktif numara yok. Owner mevcut sağlayıcı numarasını sana süreli atamalı.'),components:[...(assignments.length?[{type:1,components:[{type:3,custom_id:'tp-osint:inbox-number-select',placeholder:'Kendi atanmış numaranı seç',options:assignments.slice(0,25).map(a=>({label:a.phone+' · '+a.provider,value:a.id,description:'Bitiş: '+new Date(a.expires_at).toISOString()}))}]}]:[]),{type:1,components:[{type:2,style:5,label:'Web numara ve SMS kutum',url:osintWebLink()+'?tool=number'}]}],allowedMentions:{parse:[]}});return true;}await i.editReply({content:'📬 **'+(type==='mail'?'Temp Mail & Gelen Kutusu':'Numara & SMS Kutusu')+'**\n'+state.inboxes.filter(b=>type==='mail'?!['twilio','signalwire','mailslurp-sms'].includes(b.provider):['twilio','signalwire','mailslurp-sms'].includes(b.provider)).map(b=>b.provider+' · '+b.address+' · '+b.messages.length+' mesaj').join('\n')+'\nSağlayıcı seçince kendi canlı DM kutun açılır. Atanmamış numara bağlanmaz.',components:choices.length?[{type:1,components:[{type:3,custom_id:'tp-osint:inbox-create',placeholder:'Kendi kutun için sağlayıcı seç',min_values:1,max_values:1,options:choices.map(p=>({label:p.name,value:p.id}))}]}]:[],allowedMentions:{parse:[]}});return true;}
  if(i.isStringSelectMenu?.()&&i.customId==='tp-osint:inbox-create'){const provider=i.values?.[0];if(!(await liveInboxProviders()).some(p=>p.id===provider&&p.configured))throw new DomainError('PROVIDER_KEY_REQUIRED','Sağlayıcı bağlı değil.',400);await rateLimit('discord-inbox:'+i.user.id,4,60);const created=await liveInboxAction(actor(i),{action:'create',provider});if(!('id' in created)||!('address' in created))throw new DomainError('INBOX_CREATE','Kutu açılamadı.',503);await liveInboxAction(actor(i),{action:'discord',id:created.id,enabled:true});await i.editReply({content:'✅ **Adres/numara ve gelen kutun birlikte hazır:** '+created.address+'\nKendi canlı Discord DM kutun açıldı. Yeni içerikte güncellenir; webden kapatabilirsin.',components:[],allowedMentions:{parse:[]}});return true;}
  if(component&&i.customId.startsWith('tp-osint:retry:')){
   const id=i.customId.slice('tp-osint:retry:'.length);
   if(!uuid.test(id))throw new DomainError('INVALID_DELIVERY','Geçersiz teslim kaydı.',400);
   await rateLimit('osint-dm-retry:'+i.user.id,4,60);
   await i.editReply(deliveryReply(await retryOsintDelivery(id,i.user.id,true)));return true;
  }
  if(direct&&i.commandName==='temp-mail'){await rateLimit('discord-inbox:'+i.user.id,4,60);const state=await liveInboxState(i.user.id),existing=state.inboxes.find(b=>!['twilio','signalwire','mailslurp-sms'].includes(b.provider)),provider=existing?.provider||state.providers.find(p=>p.kind==='mail'&&p.configured)?.id;if(!provider)throw new DomainError('PROVIDER_UNAVAILABLE','Kişisel mail sağlayıcısı şu an bağlı değil.',503);const box=existing||await liveInboxAction(actor(i),{action:'create',provider});if(!('address' in box))throw new DomainError('INBOX_CREATE','Adres oluşturulamadı.',503);await i.editReply({content:'📬 **Kişisel Temp Mail adresin:** '+box.address+'\nGelen kutunu /kur iletisim panelinden veya web mail ekranından açabilirsin.',components:[{type:1,components:[{type:2,style:5,label:'Kendi mail kutum',url:osintWebLink()+'?tool=mail'}]}],allowedMentions:{parse:[]}});return true;}
  const subcommand=component?i.customId.slice('tp-osint:'.length):'';
  if(subcommand==='profil'||subcommand==='profile'){
   const q=await osintQuota(i.user.id);
   await notice(i,'LEVEL & KOTA','⭐ **Seviye '+q.level+'** · '+q.xp+' XP\n📍 Kaynak: '+q.levelSource+(q.profileFound?'':' · Henüz XP kaydı yok; başlangıç seviye 0.')+'\n🌐 Her proxy isteğinde **'+q.proxyResultLimit+' sonuç**\n📊 Günlük sorgu hakkın: **'+(q.unlimited?'Sınırsız · Owner':q.remaining+' toplam / '+q.dailyLimit+' günlük · '+q.extraCredits+' ek hak')+'**'+(q.boosterBonus?'\n🚀 Booster bonusun: **+20 günlük sorgu** · tüm araçlarda ortak.':'')+'\n🔁 Türkiye saati 00:00’da yenilenir.\n\n'+osintWebLink());return true;
  }
  if(subcommand==='yardim'){
   await notice(i,'ARAŞTIRMA ARAÇLARI',osintTools.filter(t=>t.enabled).map(t=>t.icon+' **'+t.name+'**').join('\n')+'\n\nSonuçlar yalnızca DM ile gönderilir.\n'+osintWebLink());return true;
  }
  if(direct){const input=utilityCommandInput(i);if(!input)throw new DomainError('INVALID_TOOL','Araç tanımlı değil.',400);kind=input.kind;target=input.target;}else if(['mail-create','mail-inbox'].includes(subcommand)){
   kind=subcommand==='mail-create'?'mail':'mail-inbox';target=subcommand==='mail-create'?'account':'inbox';
  }else if(subcommand==='proxy'){
   kind='proxy';target=JSON.stringify({protocol:'all',country:'',anonymity:'all',maxLatency:3000,minUptime:0});
  }else if(i.isModalSubmit?.()&&subcommand.startsWith('modal:')){
   kind=subcommand.slice('modal:'.length);
   if(kind==='proxy')target=JSON.stringify({protocol:i.fields.getTextInputValue('protocol').trim().toLowerCase()||'all',country:i.fields.getTextInputValue('country').trim(),anonymity:i.fields.getTextInputValue('anonymity').trim().toLowerCase()||'all',maxLatency:Number(i.fields.getTextInputValue('latency')),minUptime:Number(i.fields.getTextInputValue('uptime'))});
   else if(kind==='mail')target=JSON.stringify({localPart:i.fields.getTextInputValue('localPart').trim(),domain:i.fields.getTextInputValue('domain').trim()||undefined,replace:i.fields.getTextInputValue('replace').trim().toLocaleLowerCase('tr-TR')==='evet'});
   else{if(!osintQueryModal(kind))throw new DomainError('INVALID_TOOL','Araç tanımlı değil.',400);target=i.fields.getTextInputValue('target');}
  }else{
   throw new DomainError('INVALID_ACTION','Bu düğme artık kullanılamıyor. Paneli /kur üzerinden yenile.',400);
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
  const message={content:'⚠️ '+(e instanceof DomainError?e.message:e instanceof ZodError?e.issues[0]?.message:'İşlem tamamlanamadı. Botun kanal izinlerini kontrol edip yeniden dene.'),components:[],allowedMentions:{parse:[]}};
  if(i.deferred||i.replied)await i.editReply(message).catch(()=>{});else await i.reply({...message,flags:MessageFlags.Ephemeral}).catch(()=>{});
 }
 return true;
}

/** Refresh only previously installed, bot-owned panel messages. Never create new posts. */
export async function refreshOsintPanels(thumbnail?:string){
 const rows=(await database().query('SELECT channel_id,message_id,panel_type FROM osint_panels WHERE guild_id=$1 ORDER BY channel_id,panel_type',[config().guildId])).rows;let updated=0,failed=0;const failures:{code:string;http?:number;discordCode?:number|null}[]=[];
 for(let start=0;start<rows.length;start+=2)await Promise.all(rows.slice(start,start+2).map(async row=>{const kind=row.panel_type==='osint'?'infrastructure':row.panel_type==='mail'?'communication':row.panel_type;if(!osintCategories.some(c=>c.id===kind)||!/^\d{17,20}$/.test(row.channel_id)||!/^\d{17,20}$/.test(row.message_id)){failed++;return;}try{const {allowedMentions,...wire}=osintPanel(kind as OsintPanelKind,thumbnail);await discordRequest('/channels/'+row.channel_id+'/messages/'+row.message_id,{method:'PATCH',body:JSON.stringify({...wire,content:null,embeds:[],allowed_mentions:{parse:[]}})});await database().query('UPDATE osint_panels SET updated_at=now() WHERE guild_id=$1 AND channel_id=$2 AND panel_type=$3',[config().guildId,row.channel_id,row.panel_type]);updated++;}catch(e){failed++;if(failures.length<20)failures.push(e instanceof DiscordAPIError?{code:e.code,http:e.responseStatus,discordCode:e.discordCode}:{code:e instanceof DomainError?e.code:'REFRESH_FAILED'});}}));
 return {registered:rows.length,updated,failed,newPosts:0,failures};
}
