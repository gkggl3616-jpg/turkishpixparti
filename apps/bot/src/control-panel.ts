import {ChannelType,PermissionFlagsBits,MessageFlags} from 'discord.js';
import {config,DomainError,discordAuditSettings,auditSettingsRevision,updateDiscordAuditSettings,recentDiscordAudit,discordAuditEvent,auditRowToEvent,auditKindLabels,auditCategoryLabels,auditCategories,botGuardStatus,discordCard,uiText,uiRow,uiButton,uiSeparator,messageQuote,theme,userTag,channelTag,displayText,communitySettings,saveCommunitySettings,type AuditCategory} from '@turkishpix/core';
const views=[['home','🏛️ Kontrol merkezi'],['audit','📋 Denetim ayarları'],['records','🔎 Denetim kayıtları'],['guard','🤖 Bot giriş engeli'],['chat','🛡️ Sohbet koruması'],['welcome','👋 Karşılama'],['levels','⭐ Seviye & XP'],['roles','🎭 Rol otomasyonları'],['rooms','🔊 Özel odalar'],['music','🎵 Müzik & ses'],['events','📅 Etkinlikler'],['support','🎫 Bilet & çekiliş'],['games','🎮 Oyunlar'],['profile','⚙️ Bot görünümü']] as const;
const custom=(id:string,verb:string,value='',revision?:number)=>['control',id,verb,value,revision].filter(v=>v!==undefined).join(':');
const status=(enabled:boolean)=>enabled?'🟢 Açık':'⚪ Kapalı';
export async function controlActor(i:any,requireManage=false,requireGuard=false){
 const member=await i.guild.members.fetch({user:i.user.id,force:true});
 const configuredOwner=config().owners.includes(i.user.id),guardManager=configuredOwner||i.user.id===i.guild.ownerId||member.permissions.has(PermissionFlagsBits.Administrator),manageGuild=guardManager||member.permissions.has(PermissionFlagsBits.ManageGuild);
 if(member.pending)throw new DomainError('MEMBERSHIP_PENDING','Önce sunucu doğrulamasını tamamla.',403);
 if(requireManage&&!manageGuild)throw new DomainError('FORBIDDEN','Bu işlem için Sunucuyu Yönet izni gerekir.',403);
 if(requireGuard&&!guardManager)throw new DomainError('FORBIDDEN','Bot engelini sunucu sahibi veya yönetici değiştirebilir.',403);
 return {id:i.user.id,username:i.user.username,manageGuild,guardManager,viewAudit:manageGuild||member.permissions.has(PermissionFlagsBits.ViewAuditLog),configuredOwner,member};
}
function requireAudit(actor:any){if(!actor.viewAudit)throw new DomainError('FORBIDDEN','Denetim Kaydını Görüntüle izni gerekir.',403);}
export async function validateAuditChannel(i:any,id:string){
 const channel=await i.guild.channels.fetch(id);if(!channel||channel.guildId!==i.guildId||channel.type!==ChannelType.GuildText)throw new DomainError('AUDIT_CHANNEL','Bu sunucudan özel bir metin kanalı seç.');
 const actor=await controlActor(i,true),me=await i.guild.members.fetchMe();
 if(!channel.permissionsFor(actor.member)?.has(PermissionFlagsBits.ViewChannel))throw new DomainError('CHANNEL_ACCESS','Bu kanala erişimin yok.',403);
 if(channel.permissionsFor(i.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel))throw new DomainError('AUDIT_CHANNEL_PUBLIC','Mesaj içerikleri kaydedilir. Herkese kapalı, yetkililere özel bir kanal seç.');
 if(!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))throw new DomainError('BOT_PERMISSION','Kayıt kanalında botun Görüntüle, Mesaj Gönder ve Bağlantıları Yerleştir izinleri gerekir.');
 return channel;
}
async function setupAudit(i:any){
 const actor=await controlActor(i,true);let channel=i.options.getChannel('kanal');
 if(channel)channel=await validateAuditChannel(i,channel.id);
 else{
  const me=await i.guild.members.fetchMe();if(!me.permissions.has(PermissionFlagsBits.ManageChannels))throw new DomainError('BOT_PERMISSION','Otomatik kurulum için botun Kanalları Yönet izni gerekir.');
  const existing=i.guild.channels.cache.find((c:any)=>c.type===ChannelType.GuildText&&c.name==='🔒・denetim-kaydi');
  if(existing)channel=await validateAuditChannel(i,existing.id);
  else{const viewers=[...new Set([...config().owners,i.guild.ownerId,me.id])],roles=[...i.guild.roles.cache.values()].filter((r:any)=>r.id!==i.guildId&&!r.permissions.has(PermissionFlagsBits.Administrator)&&r.permissions.has(PermissionFlagsBits.ViewAuditLog)).slice(0,20);channel=await i.guild.channels.create({name:'🔒・denetim-kaydi',type:ChannelType.GuildText,reason:'TurkishPix: yetkililere özel denetim kaydı kurulumu',permissionOverwrites:[{id:i.guildId,deny:[PermissionFlagsBits.ViewChannel]},...viewers.map(id=>({id,type:1,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,...(id===me.id?[PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles]:[])]})),...roles.map((r:any)=>({id:r.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]}))]});}
 }
 await updateDiscordAuditSettings(actor,{enabled:true,logChannelId:channel.id});return channel;
}
function channelSelect(id:string,verb:string,placeholder:string,revision:number,selected?:string,multiple=false){return uiRow({type:8,custom_id:custom(id,verb,'',revision),placeholder,channel_types:[0],min_values:multiple?0:1,max_values:multiple?25:1,...(selected?{default_values:[{id:selected,type:'channel'}]}:{})});}
export async function controlPanelView(i:any,view='home',category='all',page=0,notice=''){
 if(view==='roles')return (await import('./role-automation')).rolePanelView(i,notice);
 if(!views.some(v=>v[0]===view))view='home';const actor=await controlActor(i),id=actor.id,s=await discordAuditSettings(),revision=await auditSettingsRevision(),community=await communitySettings(),me=i.guild.members.me;
 if(['audit','chat','welcome','levels','profile'].includes(view)&&!actor.manageGuild)throw new DomainError('FORBIDDEN','Bu ayar paneli yöneticilere açık.',403);
 if(['records','guard'].includes(view))requireAudit(actor);
 const body:any[]=[];let color=theme.cyan;
 if(notice)body.push(uiText('✅ '+notice));
 if(view==='home'){
  body.push(uiText('**'+displayText(i.guild.name,80)+'**\n'+status(s.enabled)+' Denetim kaydı  ·  '+status(s.botGuard.enabled)+' Bot giriş engeli\n'+status(community.security.enabled)+' Sohbet koruması  ·  '+status(community.features.xpEnabled)+' Mesaj XP’si'));
  body.push(uiText('### Sunucunun yönetimi burada\nMenüden bir modül seç. Kayıtları filtrele, kanalları belirle, güvenlik ve topluluk ayarlarını güncelle.\n**Kişisel menü** · Seçimlerin yalnızca sana görünür.'));
  body.push(uiRow(uiButton(custom(id,'view','records'),'📋 Kayıtlar',1),uiButton(custom(id,'view','guard'),'🤖 Bot engeli'),uiButton(custom(id,'view','audit'),'⚙️ Kurulum')));
 }else if(view==='audit'){
  color=theme.purple;body.push(uiText('**Denetim** '+status(s.enabled)+'\n**Ana kanal** '+channelTag(s.logChannelId||config().logChannel)+'\n**Saklama** '+s.retentionDays+' gün · Eski mesaj önbelleği 7 gün\n**Kapsam** Yeni / düzenlenen / silinen mesaj, yasaklı içerik, duyuru, üye, rol, kanal ve bot işlemleri.'));
  body.push(channelSelect(id,'logchannel','Yetkililere özel ana kayıt kanalını seç',revision,s.logChannelId));
  body.push(uiRow({type:3,custom_id:custom(id,'categories','',revision),placeholder:'Kayıt tutulacak kategorileri seç',min_values:0,max_values:6,options:auditCategories.map(value=>({label:auditCategoryLabels[value],value,default:s.categories[value]}))}));
  body.push(uiRow(uiButton(custom(id,'toggle','enabled',revision),s.enabled?'Denetimi kapat':'Denetimi aç',s.enabled?4:3),uiButton(custom(id,'toggle','messageCreate',revision),'💬 Yeni mesaj '+(s.messageCreate?'✓':'—')),uiButton(custom(id,'toggle','messageEdit',revision),'✏️ Düzenleme '+(s.messageEdit?'✓':'—')),uiButton(custom(id,'toggle','messageDelete',revision),'🗑️ Silme '+(s.messageDelete?'✓':'—'))));
  body.push(uiRow({type:3,custom_id:custom(id,'retention','',revision),placeholder:'Kayıt saklama süresi',options:[7,30,90].map(n=>({label:n+' gün',value:String(n),default:n===s.retentionDays}))}));
  body.push(uiRow(uiButton(custom(id,'view','routing'),'📁 Kategori kanalları'),uiButton(custom(id,'view','exclude'),'🙈 Hariç kanallar')));
 }else if(view==='guard'){
  color=s.botGuard.enabled?theme.green:theme.gold;const jobs=await botGuardStatus();
  body.push(uiText('**Yeni bot girişleri** '+(s.botGuard.enabled?'🔒 Engelleniyor':'🔓 Serbest')+'\nYeni katılan yabancı bot otomatik çıkarılır. TurkishPix her zaman korunur. Sunucudaki mevcut botlara toplu işlem yapılmaz.\n**Üyeleri At** '+(me?.permissions.has(PermissionFlagsBits.KickMembers)?'✅':'⚠️ Eksik')+' · Botun rolü hedef botların üstünde olmalı.'));
  body.push(uiText('**İzinli botlar**\n'+(s.botGuard.allowlist.length?s.botGuard.allowlist.map(v=>userTag(v)).join(' · '):'Yabancı bot istisnası yok.')));
  body.push(uiRow(uiButton(custom(id,'guard',s.botGuard.enabled?'off':'on',revision),s.botGuard.enabled?'Giriş engelini kapat':'Tüm bot girişlerini engelle',s.botGuard.enabled?4:3),uiButton(custom(id,'allowmodal','add',revision),'＋ Bot ID ile izin ver')));
  if(s.botGuard.allowlist.length)body.push(uiRow({type:3,custom_id:custom(id,'allowremove','',revision),placeholder:'İzinli listeden kaldırılacak bot',options:s.botGuard.allowlist.map(value=>({label:'Bot '+value,value}))}));
  body.push(uiText('**Son giriş işlemleri**\n'+(jobs.slice(0,4).map(j=>userTag(j.bot_id)+' · '+({REMOVED:'🛡️ Çıkarıldı',QUEUED:'⏳ Bekliyor',RUNNING:'⏳ İşleniyor',SKIPPED:'✅ Korundu / ayrıldı',FAILED:'⚠️ Başarısız'} as any)[j.status]+(j.last_error?' · '+displayText(j.last_error,60):'')).join('\n')||'Henüz bot giriş işlemi yok.')));
 }else if(view==='records'){
  const filter=auditCategories.includes(category as AuditCategory)?category as AuditCategory:undefined;const result=await recentDiscordAudit(filter,Math.max(0,page)*3);
  body.push(uiRow({type:3,custom_id:custom(id,'filter'),placeholder:'Kayıt kategorisini seç',options:[{label:'Tüm kayıtlar',value:'all',default:!filter},...auditCategories.map(value=>({label:auditCategoryLabels[value],value,default:filter===value}))]}));
  body.push(uiText('**'+result.total+' son kayıt** · Sayfa '+(page+1)+'\n'+(result.rows.map(r=>`**${auditKindLabels[r.kind]||displayText(r.kind)}**\n${r.actor_id?userTag(r.actor_id):'İşlem sahibi verilmedi'}${r.target_id?' → '+userTag(r.target_id):''}${r.channel_id?' · '+channelTag(r.channel_id):''}\n<t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>\n${displayText(r.after_content||r.before_content||r.metadata?.action||'',180)}`).join('\n\n')||'Bu kategoride kayıt yok.')));
  if(result.rows.length)body.push(uiRow(...result.rows.map((r,n)=>uiButton('audit:detail:'+r.id,'Kayıt '+(page*3+n+1)))));
  body.push(uiRow(uiButton(custom(id,'page',category+','+(page-1)),'◀ Önceki',2,page<=0),uiButton(custom(id,'page',category+','+(page+1)),'Sonraki ▶',2,(page+1)*3>=result.total)));
 }else{
  // Existing modules remain available from the same native Discord navigation.
  const descriptions:Record<string,string>={
   chat:'**Sohbet koruması** '+status(community.security.enabled)+'\n'+Object.entries(community.security.content.modes).map(([name,v])=>name+': '+({DELETE:'⛔ Sil',REVIEW:'🔎 İncele',OFF:'⚪ Kapalı'} as any)[String(v)]).join(' · ')+'\nSpam, davet, aşırı etiket ve yasaklı mesajlar denetlenir. Engellenen metin denetim kaydında gösterilir.',
   welcome:'**Karşılama** '+status(community.welcome.enabled)+'\n**Kanal** '+channelTag(community.welcome.channelId)+'\n'+messageQuote(community.welcome.message,600)+'\nŞablon: `{user}` `{username}` `{server}` `{count}`',
   levels:'**Mesaj XP’si** '+status(community.features.xpEnabled)+'\n**Mesaj başına** '+community.features.xpPerMessage+' XP · **Bekleme** '+community.features.xpCooldownSeconds+' sn\n**Seviye bildirimi** '+status(community.features.levelUpEnabled)+'\n`/rank` · `/seviye` · `/siralama`',
   rooms:'**Özel odalar** '+status(community.expansion.rooms.enabled)+'\n**Oda oluşturma kanalı** '+channelTag(community.expansion.rooms.createChannelId)+'\n`/topluluk oda kur` ile kur. ➕ Oda Oluştur kanalına gir; odan açılsın.\n`/topluluk oda kilitle` · `davet` · `limit` · `devret`\nAdım adım rehber: `/topluluk oda yardim`',
   music:'**Müzik** '+status(community.music.enabled)+'\n`/muzik oynat` → YouTube’da ara ve seç\n`/muzik radyo` → İstasyon seç\n`/ses katil` → Ses kanalına katıl\n`/muzik ekran` → Birlikte izle',
   events:'**Etkinlikler**\n`/etkinlik` → Başlık, kontenjan, tekrar ve rol şartı\n`/topluluk etkinlik takvim` → Yaklaşan etkinlikler\n`/topluluk etkinlik katilimcilar` → Katılım ve bekleme listesi\n`/topluluk duyuru planla` → Zamanlı duyuru\nKatılıyorum · Belki · Katılmıyorum düğmeleri ve otomatik hatırlatmalar.',
   support:'**Bilet & çekiliş**\n`/bilet kur` → Kanal, kategori ve yetkili rolü\n`/bilet ac` → Ödül Talebi, Destek, Şikâyet, Başvuru, Diğer\n`/cekilis` → Ödül, süre ve kazanan sayısı\nDüğmeyle katılım; yetkili etiketleme ve özel destek kanalları.',
   games:'**Discord’da oyna**\n`/topluluk oyun 2048` · 100 Bot TL\n`/topluluk oyun mayin` · 100 Bot TL\n`/topluluk oyun dortlu` · 150 Bot TL\n`/xox` · `/anket` · `/zar`\n9 tarayıcı oyunu: `/topluluk oyun salon`',
   profile:'**Bot durumu** '+community.presence.status+'\n**Aktivite** '+displayText(community.presence.text,128)+'\nBotun durum yazısını formdan düzenle. Bu ayar sunucuya yeniden bağlandıktan sonra da korunur.'
  };body.push(uiText(descriptions[view]||'Bir modül seç.'));
  const moduleToggles:Record<string,Array<[string,string,boolean]>>={chat:[['security','Koruma',community.security.enabled]],welcome:[['welcome','Karşılama',community.welcome.enabled]],levels:[['xp','Mesaj XP’si',community.features.xpEnabled],['levelnotice','Seviye bildirimi',community.features.levelUpEnabled]],rooms:[['rooms','Özel odalar',community.expansion.rooms.enabled]],music:[['music','Müzik',community.music.enabled]]};
  if(actor.configuredOwner&&moduleToggles[view])body.push(uiRow(...moduleToggles[view].map(([key,label,on])=>uiButton(custom(id,'module',key),label+' '+(on?'kapat':'aç'),on?4:3))));
  if(view==='welcome'&&actor.configuredOwner){body.push(uiRow(uiButton(custom(id,'welcomemodal'),'✏️ Karşılama metni')));body.push(channelSelect(id,'welcomechannel','Karşılama kanalını seç',revision,community.welcome.channelId));}
  if(view==='profile'&&actor.configuredOwner)body.push(uiRow(uiButton(custom(id,'presencemodal'),'✏️ Aktivite metni')));
 }
 body.push(uiSeparator(),uiRow({type:3,custom_id:custom(id,'nav'),placeholder:'Başka bir yönetim modülü seç',options:views.map(([value,label])=>({label,value,default:value===view}))}),uiText('-# TurkishPix • Discord Kontrol Merkezi • /botpanel'));
 return discordCard(views.find(v=>v[0]===view)?.[1]||'Kontrol merkezi','Sunucunun ayarlarını Discord içinden yönet.',body,color);
}
async function routingView(i:any,exclude=false){const actor=await controlActor(i,true),s=await discordAuditSettings(),revision=await auditSettingsRevision(),id=actor.id;if(exclude)return discordCard('🙈 Kayıt dışında tutulan kanallar','Bu kanalların mesaj içerikleri denetim sistemine alınmaz.',[channelSelect(id,'excluded','Hariç kanalları seç; temizlemek için seçimi kaldır',revision,undefined,true),uiText(s.ignoredChannelIds.map(channelTag).join(' · ')||'Hariç kanal yok.'),uiRow(uiButton(custom(id,'view','audit'),'Geri'))],theme.purple);return discordCard('📁 Kategori kayıt kanalları','Kategori menüsünü seç, ardından özel kanalını belirle.',[uiRow({type:3,custom_id:custom(id,'routecategory'),placeholder:'Hangi kayıtlar için ayrı kanal?',options:auditCategories.map(value=>({label:auditCategoryLabels[value],value}))}),uiText(auditCategories.map(k=>auditCategoryLabels[k]+' → '+channelTag(s.channels[k]||s.logChannelId||config().logChannel)).join('\n')),uiRow(uiButton(custom(id,'view','audit'),'Geri'))],theme.purple);}
const textModal=(custom_id:string,title:string,label:string,value='',max=1500)=>({custom_id,title,components:[{type:1,components:[{type:4,custom_id:'text',label,style:max>128?2:1,required:true,max_length:max,...(value?{value}:{})}]}]});
export async function handleControlInteraction(i:any){
 const slash=i.isChatInputCommand?.()&&(i.commandName==='botpanel'||i.commandName==='topluluk'&&['denetim','botkoruma'].includes(i.options.getSubcommandGroup(false)));
 const component=!!i.customId&&(i.customId.startsWith('control:')||i.customId.startsWith('audit:detail:'));
 if(!slash&&!component)return false;
 try{
  if(component&&i.customId.startsWith('control:')&&i.customId.split(':')[1]!==i.user.id)throw new DomainError('PANEL_OWNER','Bu menü sana ait değil. /botpanel ile kendi panelini aç.',403);
  if(i.customId?.startsWith('audit:detail:')){
   await i.deferReply({flags:MessageFlags.Ephemeral});const actor=await controlActor(i);requireAudit(actor);const record=await discordAuditEvent(i.customId.split(':')[2]);if(!record)throw new DomainError('RECORD_MISSING','Bu kayıt bulunamadı veya saklama süresi dolmuş.',404);
   const raw=[auditKindLabels[record.kind]||record.kind,'Zaman: '+new Date(record.created_at).toISOString(),'İşlemi yapan: '+(record.actor_name||'')+' '+(record.actor_id||'Verilmedi'),'Hedef: '+(record.target_id||'—'),'Kanal: '+(record.channel_id||'—'),'\nÖNCEKİ İÇERİK\n'+(record.before_content??'Bot tarafından görülmedi.'),'\nİÇERİK\n'+(record.after_content??'Yazı yok.'),'\nAYRINTILAR\n'+JSON.stringify(record.metadata,null,2)].join('\n');
   await i.editReply({...discordCard(auditKindLabels[record.kind]||'📋 Denetim kaydı','Tam içerik aşağıdaki metin dosyasındadır.',[uiText('**İşlem sahibi** '+(record.actor_id?userTag(record.actor_id):'Verilmedi')+'\n'+messageQuote(record.after_content??record.before_content,1000)),{type:13,file:{url:'attachment://denetim-'+record.id.slice(0,8)+'.txt'}}]),files:[{attachment:Buffer.from(raw,'utf8'),name:'denetim-'+record.id.slice(0,8)+'.txt'}]});return true;
  }
  const parts=i.customId?.split(':')||[],verb=parts[2],value=parts[3],revision=parts[4]===undefined?undefined:Number(parts[4]);
  if(['allowmodal','welcomemodal','presencemodal'].includes(verb)&&!i.isModalSubmit?.()){
   const actor=await controlActor(i,true,verb==='allowmodal');if(verb!=='allowmodal'&&!actor.configuredOwner)throw new DomainError('FORBIDDEN','Bu modülün ayarları tanımlı owner hesaplarına açık.',403);
   const s=await communitySettings();await i.showModal(textModal(custom(i.user.id,verb==='allowmodal'?'allowsubmit':verb==='welcomemodal'?'welcomesubmit':'presencesubmit',value,revision),verb==='allowmodal'?'Bot giriş istisnası':verb==='welcomemodal'?'Karşılama mesajı':'Bot aktivitesi',verb==='allowmodal'?'Botun Discord ID’si':'Metin',verb==='allowmodal'?'':verb==='welcomemodal'?s.welcome.message:s.presence.text,verb==='allowmodal'?20:verb==='welcomemodal'?1500:128));return true;
  }
  if(component&&!i.isModalSubmit?.())await i.deferUpdate();else await i.deferReply({flags:MessageFlags.Ephemeral});
  let view='home',notice='',category='all',page=0;
  if(slash){if(i.commandName==='topluluk'){const group=i.options.getSubcommandGroup(),sub=i.options.getSubcommand();view=group==='denetim'?sub==='kayitlar'?'records':'audit':'guard';if(sub==='kur'){const ch=await setupAudit(i);notice=channelTag(ch.id)+' kayıt kanalı hazır.';}if(sub==='kayitlar')category=i.options.getString('kategori')||'all';if(group==='botkoruma'&&sub!=='panel'){const actor=await controlActor(i,true,true),s=await discordAuditSettings();if(sub==='ac'){const me=await i.guild.members.fetchMe();if(!me.permissions.has(PermissionFlagsBits.KickMembers))throw new DomainError('BOT_PERMISSION','Önce bota Üyeleri At iznini ver.');s.botGuard.enabled=true;}else if(sub==='kapat')s.botGuard.enabled=false;else if(sub==='izinver'){const bot=i.options.getUser('bot',true);if(!bot.bot)throw new DomainError('NOT_BOT','Bir bot hesabı seç.');s.botGuard.allowlist=[...new Set([...s.botGuard.allowlist,bot.id])];}else if(sub==='izinsil')s.botGuard.allowlist=s.botGuard.allowlist.filter(id=>id!==i.options.getString('botid',true));await updateDiscordAuditSettings(actor,{botGuard:s.botGuard});notice='Bot giriş ayarı kaydedildi.';}}
  }else if(['nav','view','filter','page'].includes(verb)){view=verb==='nav'?i.values[0]:verb==='view'?value:'records';if(verb==='filter')category=i.values[0];if(verb==='page'){const selected=value.split(',');category=selected[0];page=Math.max(0,Math.min(33,Number(selected[1])||0));}}
  else if(verb==='routecategory'){await controlActor(i,true);const selected=i.values[0];if(!auditCategories.includes(selected))throw new DomainError('INVALID_CATEGORY','Kategori bulunamadı.');await i.editReply(discordCard('📁 '+auditCategoryLabels[selected as AuditCategory],'Yetkililere özel kanal seç.',[channelSelect(i.user.id,'route-'+selected,'Bu kategorinin kayıt kanalı',await auditSettingsRevision()),uiRow(uiButton(custom(i.user.id,'view','audit'),'Geri'))],theme.purple));return true;}
  else if(['toggle','categories','retention','logchannel','excluded','guard','allowremove','allowsubmit'].includes(verb)||verb?.startsWith('route-')){
   const actor=await controlActor(i,true,['guard','allowremove','allowsubmit'].includes(verb)),s=await discordAuditSettings();let patch:any={};view=['guard','allowremove','allowsubmit'].includes(verb)?'guard':'audit';
   if(verb==='toggle'){if(!['enabled','messageCreate','messageEdit','messageDelete'].includes(value))throw new DomainError('INVALID_SETTING','Ayar bulunamadı.');patch[value]=!s[value as keyof typeof s];}
   else if(verb==='categories'){patch.categories=Object.fromEntries(auditCategories.map(k=>[k,i.values.includes(k)]));}
   else if(verb==='retention'){patch.retentionDays=Number(i.values[0]);}
   else if(verb==='logchannel'){await validateAuditChannel(i,i.values[0]);patch.logChannelId=i.values[0];}
   else if(verb==='excluded'){for(const id of i.values){const ch=await i.guild.channels.fetch(id);if(!ch||ch.guildId!==i.guildId||!ch.permissionsFor(actor.member)?.has(PermissionFlagsBits.ViewChannel))throw new DomainError('CHANNEL_ACCESS','Erişebildiğin sunucu kanallarını seç.',403);}patch.ignoredChannelIds=i.values;}
   else if(verb==='guard'){if(!['on','off'].includes(value))throw new DomainError('INVALID_SETTING','Ayar bulunamadı.');if(value==='on'&&!i.guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers))throw new DomainError('BOT_PERMISSION','Önce bota Üyeleri At iznini ver.');patch.botGuard={...s.botGuard,enabled:value==='on'};}
   else if(verb==='allowsubmit'){const botId=i.fields.getTextInputValue('text').trim();if(!/^\d{17,20}$/.test(botId))throw new DomainError('BOT_ID','17–20 haneli bot ID’si gir.');const bot=await i.client.users.fetch(botId);if(!bot.bot)throw new DomainError('NOT_BOT','Bu hesap bir bot değil.');patch.botGuard={...s.botGuard,allowlist:[...new Set([...s.botGuard.allowlist,botId])]};}
   else if(verb==='allowremove'){patch.botGuard={...s.botGuard,allowlist:s.botGuard.allowlist.filter(id=>id!==i.values[0])};}
   else{const selected=verb.slice(6) as AuditCategory;if(!auditCategories.includes(selected))throw new DomainError('INVALID_CATEGORY','Kategori bulunamadı.');await validateAuditChannel(i,i.values[0]);patch.channels={...s.channels,[selected]:i.values[0]};}
   await updateDiscordAuditSettings(actor,patch,revision);notice='Ayar kaydedildi.';
  }else if(['module','welcomechannel','welcomesubmit','presencesubmit'].includes(verb)){
   const actor=await controlActor(i,true);if(!actor.configuredOwner)throw new DomainError('FORBIDDEN','Bu modülün ayarları tanımlı owner hesaplarına açık.',403);const s=await communitySettings();
   if(verb==='module'){const map:any={security:['security','enabled','chat'],welcome:['welcome','enabled','welcome'],xp:['features','xpEnabled','levels'],levelnotice:['features','levelUpEnabled','levels'],music:['music','enabled','music']};if(value==='rooms'){s.expansion.rooms.enabled=!s.expansion.rooms.enabled;view='rooms';}else{const setting=map[value];if(!setting)throw new DomainError('INVALID_SETTING','Ayar bulunamadı.');(s as any)[setting[0]][setting[1]]=!(s as any)[setting[0]][setting[1]];view=setting[2];}}
   else if(verb==='welcomechannel'){const ch=await i.guild.channels.fetch(i.values[0]);if(!ch||ch.guildId!==i.guildId||ch.type!==0||!ch.permissionsFor(actor.member)?.has(PermissionFlagsBits.ViewChannel))throw new DomainError('CHANNEL_ACCESS','Bu sunucudan erişebildiğin bir metin kanalı seç.');s.welcome.channelId=ch.id;view='welcome';}
   else if(verb==='welcomesubmit'){s.welcome.message=i.fields.getTextInputValue('text');view='welcome';}else{s.presence.text=i.fields.getTextInputValue('text');view='profile';}
   await saveCommunitySettings({id:actor.id,username:actor.username},s);notice='Bot ayarı kaydedildi.';
  }else throw new DomainError('INVALID_CONTROL','Menü işlemi bulunamadı. /botpanel ile yeniden aç.');
  if(view==='routing'||view==='exclude')await i.editReply(await routingView(i,view==='exclude'));else await i.editReply(await controlPanelView(i,view,category,page,notice));
 }catch(e){const text=e instanceof DomainError?e.message:'İşlem tamamlanamadı. Bot izinlerini kontrol edip yeniden dene.';const error=discordCard('⚠️ İşlem tamamlanamadı',text,[uiText('Menünü yeniden aç: `/botpanel`')],theme.gold);if(i.deferred||i.replied)await i.editReply(error);else await i.reply({...error,flags:error.flags|MessageFlags.Ephemeral});}
 return true;
}
