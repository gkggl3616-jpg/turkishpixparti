import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PermissionFlagsBits} from 'discord.js';
import {setTestDatabase} from '../packages/core/src/db';
import {purgeMessages,handlePurgeInteraction} from '../apps/bot/src/message-purge';
import {brightEmbed} from '../packages/core/src/presentation';
import {discordCard,uiText} from '../packages/core/src/discord-ui';
import {guildCommands,globalCommands} from '../packages/core/src/commands';
import {audioURL} from '../apps/bot/src/audio-source';
import {youtubeAudioResult,fragmentedYouTubeAudio} from '../apps/bot/src/youtube-audio';
process.env.DISCORD_GUILD_ID='888888888888888888';
const userId='111111111111111111',otherId='222222222222222222',botId='333333333333333333',channelId='444444444444444444';
function fixture(size=10){
 const messages=Array.from({length:size},(_,n)=>({id:String(1500000000000000000n+BigInt(size-n)),createdTimestamp:Date.now()-n*1000,author:{id:n%2?otherId:userId},pinned:false,components:[] as any[]}));
 const protectedIds:string[]=[],fetches:any[]=[],deletions:string[][]=[],queries:any[]=[];
 setTestDatabase({query:async(sql,params)=>{queries.push({sql,params});return {rows:(sql.includes('SELECT message_id')?protectedIds.map(message_id=>({message_id})):[]) as any[],rowCount:0};}});
 const actor={id:userId},bot={id:botId};let actorAllowed=true,botAllowed=true;
 const channel:any={id:channelId,permissionsFor:(m:any)=>({has:(p:any)=>m.id===userId?actorAllowed:botAllowed}),messages:{fetch:async(o:any)=>{fetches.push(o);const offset=o.before?messages.findIndex(m=>m.id===o.before)+1:0;return new Map(messages.slice(offset,offset+o.limit).map(m=>[m.id,m]));}},bulkDelete:async(ids:string[],filter:boolean)=>{assert.equal(filter,true);deletions.push(ids);return new Map(ids.map(id=>[id,null]));}};
 const fetched:any[]=[],guild:any={client:{user:{id:botId}},members:{fetch:async(o:any)=>{fetched.push(o);return o.user===userId?actor:bot;}}};
 const i:any={id:'purge-test',guild,channel,channelId,user:{id:userId,username:'Yetkili'}};
 return {i,messages,protectedIds,fetches,deletions,queries,fetched,actorDeny:()=>{actorAllowed=false;},botDeny:()=>{botAllowed=false;}};
}
test('Purge protects pinned posts, active giveaway IDs and interactive bot panels',async()=>{
 const f=fixture();f.messages[0].pinned=true;f.protectedIds.push(f.messages[1].id);f.messages[2].author.id=botId;f.messages[2].components=[{type:1}];
 const result=await purgeMessages(f.i,3);assert.equal(result.deleted,3);assert.equal(result.protectedCount,3);assert.deepEqual(f.deletions[0],f.messages.slice(3,6).map(m=>m.id));
 assert.ok(f.queries.some(q=>q.sql.includes("kind='GIVEAWAY' AND status='OPEN'")));assert.ok(f.fetched.every(o=>o.force===true));
});
test('User filter counts matching messages across history pages; others are never removed',async()=>{
 const f=fixture(230);for(const m of f.messages)m.author.id=otherId;f.messages[5].author.id=userId;f.messages[115].author.id=userId;f.messages[205].author.id=userId;
 const result=await purgeMessages(f.i,3,userId);assert.equal(result.deleted,3);assert.equal(f.fetches.length,3);assert.deepEqual(f.deletions[0],[5,115,205].map(n=>f.messages[n].id));assert.ok(f.fetches[1].before);assert.ok(f.fetches.every(o=>o.cache===false));
});
test('Purge never crosses the two-week boundary or the 1,000-message scan limit',async()=>{
 const f=fixture();f.messages[0].createdTimestamp=Date.now()-15*86400000;f.messages.splice(1);const result=await purgeMessages(f.i,100);assert.equal(result.deleted,0);assert.equal(f.deletions.length,0);
 const g=fixture(1100);for(const m of g.messages)m.author.id=otherId;g.messages[1050].author.id=userId;const bounded=await purgeMessages(g.i,5,userId);assert.equal(bounded.deleted,0);assert.equal(bounded.scanned,1000);assert.equal(g.fetches.length,10);
});
test('Current member and bot channel permissions are required before fetching or deleting',async()=>{
 const f=fixture();f.actorDeny();await assert.rejects(purgeMessages(f.i,5),(e:any)=>e.code==='FORBIDDEN');assert.equal(f.fetches.length,0);
 const g=fixture();g.botDeny();await assert.rejects(purgeMessages(g.i,5),(e:any)=>e.code==='BOT_PERMISSION');assert.equal(g.deletions.length,0);
 for(const count of [0,101,1.5])await assert.rejects(purgeMessages(g.i,count),(e:any)=>e.code==='PURGE_COUNT');
});
test('A delete error is reported as unverified and is never automatically retried',async()=>{
 const f=fixture();let attempts=0;f.i.channel.bulkDelete=async()=>{attempts++;throw {code:50013};};await assert.rejects(purgeMessages(f.i,2),(e:any)=>e.code==='PURGE_DELETE_FAILED');assert.equal(attempts,1);
});
test('/sil acknowledges privately and displays the actual deletion count',async()=>{
 const f=fixture(2),replies:any[]=[];Object.assign(f.i,{commandName:'sil',isChatInputCommand:()=>true,options:{getUser:()=>null,getInteger:()=>5},deferReply:async(v:any)=>replies.push(v),editReply:async(v:any)=>replies.push(v)});
 assert.equal(await handlePurgeInteraction(f.i),true);assert.equal(replies[0].flags,64);assert.match(replies[1].embeds[0].description,/2 mesaj/);assert.deepEqual(replies[1].allowedMentions.parse,[]);
 const command:any=globalCommands.find(c=>c.name==='sil');assert.equal(command.default_member_permissions,String(PermissionFlagsBits.ManageMessages));assert.equal(command.options[1].required,false);assert.equal(guildCommands.length,100);assert.ok(globalCommands.length<=100);
});
test('Ornate shared cards stay within Discord limits and preserve component interaction IDs',()=>{
 const embed=brightEmbed('🎶 Ses salonu','*Birlikte dinle*');assert.match(embed.title,/✦/);assert.match(embed.description,/\*✧/);assert.ok(embed.thumbnail.url.endsWith('/brand/turkishpix-bot.png'));
 const huge=brightEmbed('x'.repeat(500),'d'.repeat(5000),Array.from({length:25},()=>({name:'n'.repeat(300),value:'v'.repeat(1500)})));
 const total=huge.title.length+huge.description.length+huge.author.name.length+huge.footer.text.length+huge.fields.reduce((n,f)=>n+f.name.length+f.value.length,0);assert.ok(total<=6000);assert.ok(huge.fields.every(f=>f.name.length<=256&&f.value.length<=1024));
 const card=discordCard('🎛️ Yönetim','Ayarlarını seç',[uiText('**✨ Otomasyon**')]);assert.match(card.components[0].components[0].components[0].content,/\*Ayarlarını seç\*/);assert.deepEqual(card.allowedMentions.parse,[]);
});
test('YouTube headers and segmented audio are handled without weakening URL restrictions',()=>{
 const source=youtubeAudioResult({url:'https://r1.googlevideo.com/audio?'+'a'.repeat(1800),duration:90,protocol:'m3u8_native',http_headers:{'User-Agent':'Safari','Referer':'https://www.youtube.com/','Cookie':'secret','Origin':'bad\r\nHeader: value'}});
 assert.equal(fragmentedYouTubeAudio(source),true);assert.equal(source.headers['User-Agent'],'Safari');assert.equal(source.headers.Cookie,undefined);assert.equal(source.headers.Origin,undefined);assert.ok(audioURL(source.url));
 assert.throws(()=>audioURL('https://googlevideo.com.evil.test/audio?'+'a'.repeat(1800)));assert.throws(()=>audioURL('https://r1.googlevideo.com/audio?'+'a'.repeat(9000)));assert.throws(()=>youtubeAudioResult({url:'https://localhost/'}));assert.equal(fragmentedYouTubeAudio({protocol:'https'}),false);
});
