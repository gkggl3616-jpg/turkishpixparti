import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTestDatabase,defaultCommunitySettings} from '../packages/core/src/index';
import {soundCloudURL,soundCloudSearchArguments,soundCloudSearchResult,soundCloudAudioArguments,soundCloudAudioResult,type SoundCloudTrack} from '../apps/bot/src/soundcloud-audio';
import {handleSoundCloudInteraction,useSoundCloudSearch} from '../apps/bot/src/soundcloud';
import {musicCommands} from '../packages/core/src/music-policy';
process.env.DISCORD_GUILD_ID='888888888888888888';process.env.APP_URL='https://turkishpix.example';
const guildId=process.env.DISCORD_GUILD_ID,channelId='999999999999999998',userId='555555555555555555',track:SoundCloudTrack={id:'293',url:'https://soundcloud.com/forss/flickermood',title:'Flickermood',artist:'Forss',duration:213};
let youtubeReady=false,sequence=0;
setTestDatabase({query:async<T>(sql:string)=>({rows:(sql.includes("name='youtube-audio'")?[{status:{ready:youtubeReady}}]:[{hits:1}]) as T[],rowCount:1})});
function interaction(kind:string,values:any={}){
 const calls:any[]=[],messageId=values.messageId||'123456789012345678',i:any={id:'sc-'+(++sequence),guildId,channelId,user:{id:values.userId||userId},message:{id:messageId},customId:values.customId||'',values:values.selected?[values.selected]:[],commandName:'muzik',options:{getSubcommand:()=>values.sub||'oynat',getString:(key:string)=>values[key]||null,getAttachment:()=>values.file||null},fields:{getTextInputValue:()=>values.query||'Forss'},isChatInputCommand:()=>kind==='slash',isButton:()=>kind==='button',isStringSelectMenu:()=>kind==='select',isModalSubmit:()=>kind==='modal',showModal:async(v:any)=>calls.push({modal:v}),deferReply:async(v:any)=>{i.deferred=true;calls.push({defer:v});},deferUpdate:async()=>{i.deferred=true;calls.push({update:true});},editReply:async(v:any)=>{calls.push(v);return {id:messageId};},reply:async(v:any)=>{i.replied=true;calls.push(v);}};return {i,calls};
}
const search=async()=>[track];
test('SoundCloud accepts only public single-track links and fixed search arguments',()=>{
 assert.equal(soundCloudURL('https://www.soundcloud.com/forss/flickermood?utm_source=test'),'https://soundcloud.com/forss/flickermood');
 for(const url of ['https://localhost/a/b','https://soundcloud.com.evil.test/a/b','https://user:secret@soundcloud.com/a/b','http://soundcloud.com/a/b','https://soundcloud.com/a/sets','https://soundcloud.com/a/sets/album','https://soundcloud.com/a/b/s-secret','https://soundcloud.com/a/b?secret_token=s-secret'])assert.throws(()=>soundCloudURL(url));
 const args=soundCloudSearchArguments('--exec echo test');assert.equal(args.at(-2),'--');assert.equal(args.at(-1),'scsearch5:--exec echo test');assert.ok(!args.includes('--exec'));assert.throws(()=>soundCloudSearchArguments('x'));assert.throws(()=>soundCloudSearchArguments('x'.repeat(121)));
 assert.equal(soundCloudAudioArguments(track.url).at(-1),track.url);assert.ok(soundCloudAudioArguments(track.url).includes('bestaudio[protocol^=http][format_id!*=preview]'));
});
test('Search removes invalid, duplicate and over-limit songs; source rejects previews and unrelated hosts',()=>{
 const result=soundCloudSearchResult({entries:[{id:'293',webpage_url:track.url,title:track.title,uploader:'Forss',duration:213},{id:'293',webpage_url:track.url,title:'Duplicate',duration:213},{id:'2',webpage_url:'https://localhost/a/b',title:'Bad',duration:120},{id:'3',webpage_url:'https://soundcloud.com/a/b',title:'Long',duration:4000}]},60);assert.equal(result.length,1);assert.equal(result[0].artist,'Forss');
 const good={url:'https://cf-media.sndcdn.com/public.mp3?signature=test',duration:213,protocol:'http',format_id:'http_mp3_0_0',title:'Flickermood'};assert.equal(soundCloudAudioResult(good,60).title,'Flickermood');
 for(const update of [{url:'https://sndcdn.com.evil.test/audio'},{url:'https://user:secret@cf-media.sndcdn.com/audio'},{format_id:'http_mp3_preview'},{protocol:'m3u8_native'},{duration:4000}])assert.throws(()=>soundCloudAudioResult({...good,...update},60));
});
test('Automatic search uses SoundCloud only for a failed recent YouTube probe; explicit provider wins',async()=>{
 const i=interaction('slash').i;youtubeReady=false;assert.equal(await useSoundCloudSearch(i),true);youtubeReady=true;assert.equal(await useSoundCloudSearch(i),false);assert.equal(await useSoundCloudSearch(interaction('slash',{kaynak:'SOUNDCLOUD'}).i),true);assert.equal(await useSoundCloudSearch(interaction('slash',{kaynak:'YOUTUBE'}).i),false);youtubeReady=false;
 const command:any=musicCommands.find(c=>c.name==='muzik'),play=command.options.find((s:any)=>s.name==='oynat');assert.equal(command.options.length,25);assert.ok(play.options.find((o:any)=>o.name==='kaynak').choices.some((c:any)=>c.value==='SOUNDCLOUD'));
});
test('Song selection is bound to owner, guild, channel and message before playing',async()=>{
 const open=interaction('modal',{customId:'sc:query'});await handleSoundCloudInteraction(open.i,defaultCommunitySettings(),async()=>'',search);
 const id=open.calls.at(-1).components[0].components[0].custom_id;let played=0;
 for(const values of [{userId:'666666666666666666'},{messageId:'123456789012345679'},{selected:'404'}]){const pick=interaction('select',{selected:'293',customId:id,...values});await handleSoundCloudInteraction(pick.i,defaultCommunitySettings(),async()=>{played++;return 'Çalıyor';},search);assert.equal(pick.calls.at(-1).flags,64);}
 const channel=interaction('select',{selected:'293',customId:id});channel.i.channelId='999999999999999997';await handleSoundCloudInteraction(channel.i,defaultCommunitySettings(),async()=>{played++;return 'Çalıyor';},search);assert.equal(played,0);
 const pick=interaction('select',{selected:'293',customId:id});await handleSoundCloudInteraction(pick.i,defaultCommunitySettings(),async(i,t)=>{played++;assert.equal(i.user.id,userId);assert.equal(t.url,track.url);return '▶️ Çalıyor: Flickermood';},search);assert.equal(played,1);assert.match(pick.calls.at(-1).embeds[0].description,/Çalıyor: Flickermood/);assert.equal(pick.calls.at(-1).components.length,5);assert.ok(pick.calls.at(-1).components.every((r:any)=>r.components.length<=5));
 await handleSoundCloudInteraction(pick.i,defaultCommunitySettings(),async()=>{played++;return 'Duplicate';},search);assert.equal(played,1);
});
test('Failed playback stays retryable and never reports success; concurrent selection plays once',async()=>{
 const open=interaction('slash',{ara:'Forss',kaynak:'SOUNDCLOUD'});await handleSoundCloudInteraction(open.i,defaultCommunitySettings(),async()=>'',search);const id=open.calls.at(-1).components[0].components[0].custom_id;
 const failed=interaction('select',{selected:'293',customId:id});await handleSoundCloudInteraction(failed.i,defaultCommunitySettings(),async()=>{throw Error('Kaynak reddetti.');},search);assert.match(failed.calls.at(-1).embeds[0].description,/Kaynak reddetti/);assert.ok(!failed.calls.at(-1).embeds[0].description.includes('Çalıyor'));assert.ok(failed.calls.at(-1).components[1].components.some((b:any)=>b.custom_id?.startsWith('sc:listen:')));
 let release!:()=>void,started!:()=>void,plays=0;const wait=new Promise<void>(r=>{release=r;}),entered=new Promise<void>(r=>{started=r;});const play=async()=>{plays++;started();await wait;return '▶️ Çalıyor';};
 const first=interaction('select',{selected:'293',customId:id}),second=interaction('select',{selected:'293',customId:id}),running=handleSoundCloudInteraction(first.i,defaultCommunitySettings(),play,search);await entered;await handleSoundCloudInteraction(second.i,defaultCommunitySettings(),play,search);assert.match(second.calls.at(-1).embeds[0].description,/hazırlanıyor/);release();await running;assert.equal(plays,1);
});
test('Search modal and disabled module do not play audio or join voice channels',async()=>{
 let played=0;const play=async()=>{played++;return '';},button=interaction('button',{customId:'sc:search'});await handleSoundCloudInteraction(button.i,defaultCommunitySettings(),play,search);assert.equal(button.calls[0].modal.custom_id,'sc:query');
 const settings=defaultCommunitySettings();settings.music.enabled=false;const denied=interaction('button',{customId:'sc:search'});await handleSoundCloudInteraction(denied.i,settings,play,search);assert.match(denied.calls.at(-1).embeds[0].description,/kapalı/);assert.equal(played,0);
 const conflicting=interaction('slash',{ara:'Forss',kaynak:'SOUNDCLOUD',file:{url:'https://cdn.discordapp.com/a.mp3'}});await handleSoundCloudInteraction(conflicting.i,defaultCommunitySettings(),play,search);assert.match(conflicting.calls.at(-1).embeds[0].description,/yalnızca birini/);
});
