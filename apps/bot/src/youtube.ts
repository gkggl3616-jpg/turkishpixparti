import {randomBytes} from 'node:crypto';
import {MessageFlags} from 'discord.js';
import {config,RELEASE_VERSION,database,DomainError,rateLimit,searchYouTube,youtubeStatus,youtubeVideo,youtubeVideoId,recordYouTubeView,saveYouTubeFavourite,youtubeFavourites,youtubeHistory,createWatchTogether,brightEmbed,displayText,theme,type CommunitySettings,type YouTubeVideo} from '@turkishpix/core';
type Session={userId:string;guildId:string;channelId:string;messageId:string|null;expires:number;videos:YouTubeVideo[];selected?:YouTubeVideo;favourite?:boolean;invite?:string};
const sessions=new Map<string,Session>(),ttl=10*60*1000;
export const youtubeControls=()=>[{type:1,components:[
 {type:2,style:1,custom_id:'yt:search',label:'YouTube’da ara',emoji:{name:'🔎'}},
 {type:2,style:2,custom_id:'yt:activity',label:'Ortak YouTube ekranı',emoji:{name:'▶️'}},
 {type:2,style:5,label:'Müzik paneli',url:config().appUrl+'/muzik'}
]}];
const actorOf=(i:any)=>({id:i.user.id,username:i.user.username,avatar:i.user.avatar});
function newSession(i:any,videos:YouTubeVideo[],selected?:YouTubeVideo){
 for(const [key,s] of sessions)if(s.expires<Date.now())sessions.delete(key);
 if(sessions.size>=500)sessions.delete(sessions.keys().next().value!);
 const id=randomBytes(12).toString('hex'),s:Session={userId:i.user.id,guildId:i.guildId,channelId:i.channelId,messageId:null,expires:Date.now()+ttl,videos,selected};
 sessions.set(id,s);return {id,s};
}
function sessionFor(i:any,id:string){
 const s=sessions.get(id);
 if(!s||s.expires<Date.now()){sessions.delete(id);throw new DomainError('YOUTUBE_SESSION_EXPIRED','Bu arama süresi dolmuş. YouTube’da ara düğmesiyle yeni bir arama yap.');}
 if(s.userId!==i.user.id)throw new DomainError('YOUTUBE_SESSION_OWNER','Bu sonuçlar başka bir üyeye ait. YouTube’da ara düğmesiyle kendi aramanı başlat.',403);
 if(s.guildId!==i.guildId||s.channelId!==i.channelId||!s.messageId||s.messageId!==i.message?.id)throw new DomainError('YOUTUBE_SESSION_MESSAGE','Bu arama bu mesaja ait değil.',403);
 return s;
}
function duration(iso:string){
 const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);if(!m)return '';
 const h=Number(m[1]||0),min=Number(m[2]||0),sec=Number(m[3]||0);
 return (h?h+':'+String(min).padStart(2,'0'):String(min))+':'+String(sec).padStart(2,'0');
}
export function youtubeView(videos:YouTubeVideo[]){
 return {embeds:[brightEmbed('▶ YouTube',videos.length?'Videonu seç. Görüntülü oynatıcıda aç veya ses kanalında ortak oturuma katıl.':'Bu aramada video bulunamadı.',videos.map((v,n)=>({name:(n+1)+'. '+displayText(v.title,220),value:displayText(v.channel,120)+'\n[YouTube’da aç]('+v.url+') · [Panelde oynat]('+config().appUrl+'/izle?v='+v.id+')'})),theme.purple)],components:youtubeControls(),allowedMentions:{parse:[]}};
}
export function musicLaunchView(){
 return {embeds:[brightEmbed('🎧 Müzik merkezi','**Ne dinlemek istersin?**\nYouTube’da ara düğmesine bas, şarkı adını yaz ve listeden seç.\n\n**YouTube** · Görüntülü oynatıcı veya ses kanalında Watch Together etkinliği.\n**Botun ses bağlantısı** · Komuta bir ses dosyası ekle, doğrudan ses bağlantısı ver veya /muzik radyo kullan.\n\nYouTube ortak oturumunda herkes aynı oynatma listesini izler ve dinler.',[],theme.purple)],components:youtubeControls(),allowedMentions:{parse:[]}};
}
function searchView(id:string,s:Session){
 const list=youtubeView(s.videos);list.embeds[0].title='🔎 YouTube · Şarkını seç';
 if(s.videos.length){
  list.embeds[0].description='**'+s.videos.length+' sonuç** · '+displayText(s.videos[0].channel,120)+'\nAşağıdaki listeden istediğin şarkıyı seç.\nBu aramayı açan üye seçim yapabilir; herkes kendi aramasını başlatabilir.';
  list.embeds[0].image={url:s.videos[0].thumbnail};
  list.components.unshift({type:1,components:[{type:3,custom_id:'yt:pick:'+id,placeholder:'Şarkını seç · '+s.videos.length+' sonuç',min_values:1,max_values:1,options:s.videos.map(v=>({label:v.title.slice(0,100),value:v.id,description:(v.channel+(duration(v.duration)?' · '+duration(v.duration):'')).slice(0,100)||'YouTube',emoji:{name:'🎵'}}))}]} as any);
 }
 return list;
}
function selectedView(id:string,s:Session,note=''){
 const v=s.selected!,embed=brightEmbed('▶ '+displayText(v.title,230),'**Seçildi** · '+displayText(v.channel,120)+(duration(v.duration)?' · '+duration(v.duration):'')+'\n\nSes kanalına katıl ve **Birlikte aç** düğmesine bas. Ortak oturumdaki arama kutusuna bu video bağlantısını yapıştır:\n'+v.url+(s.invite?'\n\n**Ortak oturum hazır.** Oturuma katıl düğmesiyle görüntülü oynatıcıya geç.':'')+(note?'\n\n'+note:''),[{name:'👤 Seçen üye',value:'<@'+s.userId+'>',inline:true},{name:'🎬 Oynatma',value:'YouTube · Watch Together',inline:true}],theme.purple);
 embed.image={url:v.thumbnail};
 return {embeds:[embed],components:[{type:1,components:[
  s.invite?{type:2,style:5,label:'Oturuma katıl',url:s.invite,emoji:{name:'▶️'}}:{type:2,style:1,custom_id:'yt:listen:'+id,label:'Ses kanalında birlikte aç',emoji:{name:'▶️'}},
  {type:2,style:5,label:'Videoyu izle',url:config().appUrl+'/izle?v='+v.id},
  {type:2,style:2,custom_id:'yt:fav:'+id,label:s.favourite?'Favoriden çıkar':'Favoriye ekle',emoji:{name:s.favourite?'♥️':'🤍'}},
  {type:2,style:2,custom_id:'yt:search',label:'Yeni arama',emoji:{name:'🔎'}}
 ]}],allowedMentions:{parse:[]}};
}
async function searchReply(i:any,query:string){
 const videos=await searchYouTube(i.user.id,query),{id,s}=newSession(i,videos);
 const message=await i.editReply(searchView(id,s));s.messageId=message?.id||null;
}
async function selectedReply(i:any,video:YouTubeVideo){
 const {id,s}=newSession(i,[video],video);await recordYouTubeView(actorOf(i),video);
 const message=await i.editReply(selectedView(id,s));s.messageId=message?.id||null;
}
async function activity(i:any,settings:CommunitySettings){
 const member=await i.guild.members.fetch(i.user.id),channelId=member.voice.channelId;
 if(!channelId)throw new DomainError('VOICE_CHANNEL','Önce bir ses kanalına katıl.');
 if(settings.music.channelIds.length&&!settings.music.channelIds.includes(channelId))throw new DomainError('MUSIC_CHANNEL','Bu ses kanalı müzik için açık değil.');
 return createWatchTogether(channelId);
}
function queryModal(){return {custom_id:'yt:query',title:'YouTube’da şarkı ara',components:[{type:1,components:[{type:4,custom_id:'query',label:'Şarkı veya sanatçı adı',style:1,required:true,min_length:2,max_length:120,placeholder:'Örn. sanatçı adı + şarkı adı'}]}]};}
async function activityReply(i:any,settings:CommunitySettings){
 const result=await activity(i,settings);
 await i.editReply({embeds:[brightEmbed('▶ Ortak YouTube ekranı',result.message+'\n\n**1.** Oturuma katıl düğmesine bas.\n**2.** YouTube oynatıcısında şarkı ara veya video bağlantısını yapıştır.\n**3.** Katılımcılar aynı videoyu birlikte izler ve dinler.\n\nBu, Discord’un Watch Together etkinliğidir.',[],theme.purple)],components:[{type:1,components:[{type:2,style:5,label:'Oturuma katıl',url:result.url},{type:2,style:2,custom_id:'yt:search',label:'YouTube’da ara',emoji:{name:'🔎'}}]}],allowedMentions:{parse:[]}});
}
export async function handleYouTubeInteraction(i:any,settings:CommunitySettings){
 const slash=!!i.isChatInputCommand?.()&&i.commandName==='muzik',button=!!i.isButton?.()&&i.customId?.startsWith('yt:'),select=!!i.isStringSelectMenu?.()&&i.customId?.startsWith('yt:'),modal=!!i.isModalSubmit?.()&&i.customId==='yt:query';
 if(!slash&&!button&&!select&&!modal)return false;
 const sub=slash?i.options.getSubcommand():'';
 if(slash&&!['oynat','youtube','video','birlikte','ekran','favori','favoriler','gecmis'].includes(sub))return false;
 let input:string|undefined,query:string|undefined;
 if(sub==='oynat'){
  query=i.options.getString('ara')||undefined;const link=i.options.getString('baglanti'),file=i.options.getAttachment?.('dosya');
  if(link){try{youtubeVideoId(link);input=link;}catch{}}
  if(!query&&!input&&(link||file))return false;
 }
 try{
  if(i.guildId!==config().guildId)throw new DomainError('GUILD_ONLY','Bu müzik menüsü TurkishPix sunucusunda kullanılabilir.',403);
  if(!settings.music.enabled)throw new DomainError('MUSIC_DISABLED','Müzik modülü kapalı.',403);
  if(button&&i.customId==='yt:search'){await i.showModal(queryModal());return true;}
  if(select||button&&/^yt:(listen|fav):/.test(i.customId)){
   const m=/^yt:(pick|listen|fav):([a-f0-9]{24})$/.exec(i.customId);if(!m)throw new DomainError('YOUTUBE_COMPONENT','Geçersiz müzik düğmesi.');
   const s=sessionFor(i,m[2]);
   if(m[1]==='pick'){const v=s.videos.find(v=>v.id===i.values?.[0]);if(!v)throw new DomainError('YOUTUBE_SELECTION','Listeden geçerli bir video seç.');await i.deferUpdate();await rateLimit('youtube-select:'+i.user.id,15,60);if(s.selected?.id!==v.id){await recordYouTubeView(actorOf(i),v);s.favourite=undefined;s.invite=undefined;}s.selected=v;await i.editReply(selectedView(m[2],s));return true;}
   if(!s.selected)throw new DomainError('YOUTUBE_SELECTION','Önce listeden şarkını seç.');
   await i.deferUpdate();await rateLimit('youtube-action:'+i.user.id,10,60);
   if(m[1]==='listen'){s.invite=(await activity(i,settings)).url;await i.editReply(selectedView(m[2],s));}
   else {const r=await saveYouTubeFavourite(actorOf(i),s.selected.url);s.favourite=r.saved;await i.editReply(selectedView(m[2],s,r.saved?'Favorilerine eklendi.':'Favorilerinden kaldırıldı.'));}
   return true;
  }
  if(button&&i.customId!=='yt:activity')return false;
  await i.deferReply({});await rateLimit('youtube-command:'+i.user.id,10,60);
  const actor=actorOf(i);
  if(modal){await searchReply(i,i.fields.getTextInputValue('query').trim());return true;}
  if(button||['birlikte','ekran'].includes(sub)){await activityReply(i,settings);return true;}
  if(sub==='oynat'){
   const count=[query,i.options.getString('baglanti'),i.options.getAttachment?.('dosya')].filter(Boolean).length;
   if(count>1)throw new DomainError('MUSIC_INPUT','Şarkı adı, bağlantı veya dosyadan yalnızca birini seç.');
   if(query){await searchReply(i,query);return true;}
   if(!input){await i.editReply(musicLaunchView());return true;}
  }
  if(sub==='youtube'){await searchReply(i,i.options.getString('ara',true));return true;}
  if(['favoriler','gecmis'].includes(sub)){const rows=sub==='favoriler'?await youtubeFavourites(actor.id):await youtubeHistory();await i.editReply({embeds:[brightEmbed(sub==='favoriler'?'♡ YouTube favorilerin':'◷ Paylaşılan YouTube videoları',rows.map((r,n)=>String(n+1)+'. ['+displayText(r.title,160)+'](https://www.youtube.com/watch?v='+r.video_id+')').join('\n')||'Henüz video yok.',[],theme.purple)],components:youtubeControls(),allowedMentions:{parse:[]}});return true;}
  if(sub==='favori'){const result=await saveYouTubeFavourite(actor,i.options.getString('baglanti',true));await i.editReply({embeds:[brightEmbed('♡ YouTube favorisi',displayText(result.video.title)+(result.saved?' favorilerine eklendi.':' favorilerinden kaldırıldı.'),[],theme.purple)],components:youtubeControls(),allowedMentions:{parse:[]}});return true;}
  await selectedReply(i,await youtubeVideo(input||i.options.getString('baglanti',true)));
 }catch(e){
  const message=e instanceof DomainError?e.message:'YouTube isteği tamamlanamadı. Biraz sonra yeniden dene.';
  const view={embeds:[brightEmbed('YouTube bağlantısı',message,[],theme.gold)],components:youtubeControls(),allowedMentions:{parse:[]}};
  if(i.deferred||i.replied)await i.editReply(view);else await i.reply({...view,flags:slash||modal?undefined:MessageFlags.Ephemeral});
 }
 return true;
}
/** One real search per release verifies the configured credential without exposing it. */
export async function reportYouTubeSearchReady(settings:CommunitySettings){
 const status:any={version:RELEASE_VERSION,configured:(await youtubeStatus()).configured,searchVerified:false,modal:true,selection:true,watchTogether:true};
 if(status.configured&&settings.music.enabled){
  try{
   const previous=(await database().query("SELECT status FROM integration_status WHERE name='youtube-ui'")).rows[0]?.status;
   if(previous?.version===RELEASE_VERSION&&previous.searchVerified){status.searchVerified=true;status.results=previous.results;}
   else {const videos=await searchYouTube(config().clientId,'music');status.searchVerified=videos.length>0;status.results=videos.length;await database().query("INSERT INTO integration_status(name,status) VALUES('youtube-ui',$1) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",[status]);}
  }catch(e){status.reason=e instanceof DomainError?e.code:'PROBE_UNAVAILABLE';}
 }
 console.log('YOUTUBE_SEARCH_UI_READY',JSON.stringify(status));
 return status;
}
