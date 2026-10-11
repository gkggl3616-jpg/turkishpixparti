import {randomBytes} from 'node:crypto';
import {MessageFlags} from 'discord.js';
import {config,database,DomainError,rateLimit,brightEmbed,displayText,theme,type CommunitySettings} from '@turkishpix/core';
import {searchSoundCloud,type SoundCloudTrack} from './soundcloud-audio';
import {youtubeControls} from './youtube';
type Session={userId:string;guildId:string;channelId:string;messageId:string|null;expires:number;tracks:SoundCloudTrack[];selected?:SoundCloudTrack;playback?:string;playing?:boolean};
const sessions=new Map<string,Session>();
const duration=(seconds:number)=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
function newSession(i:any,tracks:SoundCloudTrack[]){
 for(const [id,s] of sessions)if(s.expires<Date.now())sessions.delete(id);
 if(sessions.size>=500)sessions.delete(sessions.keys().next().value!);
 const id=randomBytes(12).toString('hex'),s:Session={userId:i.user.id,guildId:i.guildId,channelId:i.channelId,messageId:null,expires:Date.now()+10*60*1000,tracks};sessions.set(id,s);return {id,s};
}
function sessionFor(i:any,id:string){
 const s=sessions.get(id);if(!s||s.expires<Date.now()){sessions.delete(id);throw new DomainError('MUSIC_SESSION_EXPIRED','Bu arama süresi dolmuş. SoundCloud’da yeni bir arama aç.');}
 if(s.userId!==i.user.id)throw new DomainError('MUSIC_SESSION_OWNER','Bu sonuçlar başka bir üyeye ait. Kendi şarkı aramanı aç.',403);
 if(s.guildId!==i.guildId||s.channelId!==i.channelId||s.messageId!==i.message?.id||!s.messageId)throw new DomainError('MUSIC_SESSION_MESSAGE','Bu arama bu mesaja ait değil.',403);return s;
}
function searchView(id:string,s:Session,note=''){
 const t=s.selected,embed=brightEmbed(t?'🎧 '+displayText(t.title,220):'🎧 SoundCloud · Şarkını seç',
  t?'**'+displayText(t.artist,120)+'** · '+duration(t.duration)+'\n\n'+(s.playback?'🎶 **'+displayText(s.playback,360)+'**':'*Şarkıyı listeden seç; bulunduğun ses kanalında çalsın.*')+'\n[SoundCloud’da aç]('+t.url+')'+(note?'\n\n'+note:''):
  s.tracks.length?'**'+s.tracks.length+' sonuç** · *Bot seçiminle bulunduğun ses kanalına otomatik katılır.*\nBu aramayı açan üye seçim yapabilir; herkes kendi aramasını açabilir.':'Bu aramada süre sınırına uygun şarkı bulunamadı. Başka şarkı veya sanatçı adı dene.',
  t?[]:s.tracks.map((t,n)=>({name:'🎵 '+(n+1)+'. '+displayText(t.title,220),value:'**'+displayText(t.artist,120)+'** · *'+duration(t.duration)+'*\n[SoundCloud’da aç]('+t.url+')'})),theme.purple);
 if(t?.thumbnail)embed.image={url:t.thumbnail};
 const rows:any[]=[];
 if(s.tracks.length)rows.push({type:1,components:[{type:3,custom_id:'sc:pick:'+id,placeholder:'🎵 Şarkını seç · '+s.tracks.length+' sonuç',min_values:1,max_values:1,options:s.tracks.map(t=>({label:t.title.slice(0,100),value:t.id,description:(t.artist+' · '+duration(t.duration)).slice(0,100),emoji:{name:'🎵'}}))}]});
 if(t)rows.push({type:1,components:[{type:2,style:1,custom_id:'sc:listen:'+id,label:s.playback?'Tekrar çal':'Şarkıyı çal',emoji:{name:'▶️'}},{type:2,style:5,label:'SoundCloud’da aç',url:t.url},{type:2,style:2,custom_id:'sc:search',label:'Yeni arama',emoji:{name:'🔎'}}]});
 rows.push(...youtubeControls());return {embeds:[embed],components:rows,allowedMentions:{parse:[]}};
}
export async function useSoundCloudSearch(i:any){
 const provider=i.options.getString('kaynak');if(provider==='SOUNDCLOUD')return true;if(provider==='YOUTUBE')return false;
 const row=(await database().query("SELECT status FROM integration_status WHERE name='youtube-audio' AND updated_at>now()-interval '1 day'")).rows[0];return row?.status?.ready===false;
}
export async function handleSoundCloudInteraction(i:any,settings:CommunitySettings,play:(i:any,track:SoundCloudTrack)=>Promise<string>,search=searchSoundCloud){
 const slash=!!i.isChatInputCommand?.()&&i.commandName==='muzik'&&i.options.getSubcommand()==='oynat',button=!!i.isButton?.()&&i.customId?.startsWith('sc:'),select=!!i.isStringSelectMenu?.()&&i.customId?.startsWith('sc:'),modal=!!i.isModalSubmit?.()&&i.customId==='sc:query';
 if(!slash&&!button&&!select&&!modal)return false;
 if(slash&&(!i.options.getString('ara')||!await useSoundCloudSearch(i)))return false;
 try{
  if(i.guildId!==config().guildId)throw new DomainError('GUILD_ONLY','Bu müzik menüsü TurkishPix sunucusunda kullanılabilir.',403);
  if(!settings.music.enabled)throw new DomainError('MUSIC_DISABLED','Müzik modülü kapalı.',403);
  if(button&&i.customId==='sc:search'){await i.showModal({custom_id:'sc:query',title:'SoundCloud’da şarkı ara',components:[{type:1,components:[{type:4,custom_id:'query',label:'Şarkı veya sanatçı adı',style:1,required:true,min_length:2,max_length:120}]}]});return true;}
  if(select||button){
   const match=/^sc:(pick|listen):([a-f0-9]{24})$/.exec(i.customId);if(!match)throw new DomainError('MUSIC_COMPONENT','Geçersiz müzik düğmesi.');const s=sessionFor(i,match[2]);
   if(s.playing)throw new DomainError('MUSIC_BUSY','Seçtiğin şarkı hazırlanıyor. Birkaç saniye bekle.');
   const track=match[1]==='pick'?s.tracks.find(t=>t.id===i.values?.[0]):s.selected;if(!track)throw new DomainError('MUSIC_SELECTION','Listeden geçerli bir şarkı seç.');
   s.playing=true;
   try{await i.deferUpdate();await rateLimit('soundcloud-action:'+i.user.id,10,60);if(match[1]==='pick'&&s.selected?.id===track.id&&s.playback){await i.editReply(searchView(match[2],s));return true;}s.selected=track;s.playback=undefined;s.playback=await play(i,track);await i.editReply(searchView(match[2],s));}
   catch(e){await i.editReply(searchView(match[2],s,'⚠️ '+displayText(e instanceof Error?e.message:'Bu şarkı açılamadı. Başka bir sonuç seç.',800)));}finally{s.playing=false;}return true;
  }
  await i.deferReply({});await rateLimit('soundcloud-search:'+i.user.id,10,60);
  if(slash&&(i.options.getString('baglanti')||i.options.getAttachment?.('dosya')))throw new DomainError('MUSIC_INPUT','Şarkı adı, bağlantı veya dosyadan yalnızca birini seç.');
  const query=modal?i.fields.getTextInputValue('query'):i.options.getString('ara',true),tracks=await search(query,settings.music.maxTrackMinutes),{id,s}=newSession(i,tracks);const message=await i.editReply(searchView(id,s));s.messageId=message?.id||null;
 }catch(e){const view={embeds:[brightEmbed('🎧 SoundCloud bağlantısı',e instanceof Error?e.message:'Şarkı araması tamamlanamadı.',[],theme.gold)],components:youtubeControls(),allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(view);else await i.reply({...view,flags:MessageFlags.Ephemeral});}
 return true;
}
