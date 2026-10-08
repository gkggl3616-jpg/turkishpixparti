import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {Collection,MessageFlags} from 'discord.js';
import {setTestDatabase,config,defaultCommunitySettings,communitySettingsSchema,entertainmentCommands,entertainmentNames,checkEntertainment,entertainmentRate,startEntertainment,playEntertainment,pollEntertainment,entertainmentProfile,entertainmentLeaderboard,getEntertainmentSession,expireEntertainmentSessions,attachEntertainmentMessage,createGame,advanceGame,botMove,boardWinner,shuffle,listItems,safeText,dailyValue} from '../packages/core/src/index';
import {commands} from '../packages/core/src/commands';
import {handleEntertainmentInteraction,entertainmentView} from '../apps/bot/src/entertainment';
process.env.DATABASE_URL='postgresql://test.invalid/test';process.env.APP_URL='https://turkishpix.example';process.env.DISCORD_GUILD_ID='888888888888888888';process.env.DEMO_MODE='false';process.env.DISCORD_OWNER_IDS='111111111111111111,222222222222222222,333333333333333333,444444444444444444';
const actor={id:'555555555555555555',username:'Player@everyone'},friend={id:'666666666666666666',username:'Friend'},owner={id:'111111111111111111',username:'Owner'},channel='999999999999999999',otherChannel='777777777777777777';
const settings=defaultCommunitySettings().entertainment;let pg:PGlite;
before(async()=>{pg=new PGlite();setTestDatabase({query:async(sql:string,params:any[]=[])=>{const r=await pg.query(sql,params);return {rows:r.rows as any[],rowCount:r.affectedRows||0};}});for(const name of ['001_initial','003_discord_roles','004_server_setup','005_community','006_voice_presence','007_entertainment'])await pg.exec(await readFile(new URL('../packages/core/sql/'+name+'.sql',import.meta.url),'utf8'));});
beforeEach(async()=>{await pg.exec('DELETE FROM entertainment_sessions; DELETE FROM entertainment_scores; DELETE FROM rate_limits;');});
after(async()=>{await pg.close();});
function fakeInteraction(name:string,extra:any={}){
 const avatar=()=> 'https://cdn.discordapp.com/embed/avatars/0.png',user={...actor,avatar:null,bot:false,createdTimestamp:1500000000000,displayAvatarURL:avatar},selected={...friend,bot:false,createdTimestamp:1500000000000,displayAvatarURL:avatar};
 const values:Record<string,string>={soru:'Bugün hangi içecek?',secenekler:'Çay | Kahve',liste:'Ali | Ayşe | Mehmet',kisiler:'Ali | Ayşe | Mehmet | Ece',zorluk:'normal'};
 const calls:any[]=[];const interaction:any={id:'interaction-1',commandName:name,user,channelId:channel,guildId:config().guildId,createdTimestamp:Date.now(),deferred:false,replied:false,appPermissions:{has:()=>true},client:{ws:{ping:42}},guild:{id:config().guildId,name:'TurkishPix',memberCount:123,premiumSubscriptionCount:2,premiumTier:1,createdTimestamp:1500000000000,iconURL:avatar,channels:{cache:new Collection([['text',{type:0}],['voice',{type:2}]])},members:{fetch:async()=>({joinedTimestamp:1600000000000,roles:{cache:new Collection([['r',{id:'r',name:'Üye'}]])}})}},options:{getString:(key:string)=>values[key]||null,getInteger:(key:string)=>key==='adet'?2:key==='yuz'?6:key==='dakika'?1:null,getUser:()=>selected},isChatInputCommand:()=>true,isButton:()=>false,isModalSubmit:()=>false,isStringSelectMenu:()=>false,isRepliable:()=>true,reply:async(payload:any)=>{calls.push({method:'reply',payload});interaction.replied=true;return {id:'123456789012345678'};},deferReply:async(payload:any)=>{calls.push({method:'defer',payload});interaction.deferred=true;},editReply:async(payload:any)=>{calls.push({method:'edit',payload});return {id:'123456789012345678'};},followUp:async(payload:any)=>{calls.push({method:'follow',payload});},...extra};return {interaction,calls};
}
function component(session:any,action:string,extra:any={}){return fakeInteraction('',{isChatInputCommand:()=>false,isButton:()=>true,isFromMessage:()=>true,customId:`fun:${session.id}:${session.state.revision}:${action}`,deferUpdate:async function(this:any){this.deferred=true;},showModal:async function(this:any,modal:any){this.modal=modal.toJSON();this.replied=true;},...extra});}
function validateMessage(message:any){assert.ok(message.embeds.length>0);let total=0;for(const e of message.embeds){assert.ok(e.title.length<=256);assert.ok(e.description.length<=4096);total+=e.title.length+e.description.length;for(const f of e.fields||[]){assert.ok(f.name.length<=256);assert.ok(f.value.length<=1024);total+=f.name.length+f.value.length;}}assert.ok(total<=6000);for(const row of message.components||[]){assert.ok(row.components.length<=5);for(const c of row.components){if(c.custom_id)assert.ok(c.custom_id.length<=100);if(c.label)assert.ok(c.label.length<=80);}}assert.deepEqual(message.allowedMentions,{parse:[]});}
test('Tam 30 yeni ve 45 toplam komut; Discord ad, seçenek ve zorunlu parametre kuralları sağlanır',()=>{
 assert.equal(entertainmentCommands.length,30);assert.equal(commands.length,45);assert.equal(new Set(commands.map(c=>c.name)).size,45);
 for(const c of commands){assert.ok(c.name.length<=32);assert.ok(c.description.length<=100);assert.ok(/^[\p{Ll}\p{N}_-]+$/u.test(c.name));let optional=false;for(const o of 'options' in c?c.options||[]:[]){assert.ok(o.name.length<=32);if(!o.required)optional=true;else assert.equal(optional,false,'Zorunlu seçenek önce gelmeli: '+c.name);}}
});
test('30 komutun gerçek bot yönlendirmesi çalışır; embed ve bileşenler Discord sınırlarına uyar',async()=>{
 for(const name of entertainmentNames){await pg.exec('DELETE FROM entertainment_sessions; DELETE FROM rate_limits;');const {interaction,calls}=fakeInteraction(name);assert.equal(await handleEntertainmentInteraction(interaction,settings),true,name);const response=[...calls].reverse().find(c=>c.method==='edit')?.payload;assert.ok(response?.embeds?.length,name+': '+JSON.stringify(response));validateMessage(response);if(['hafiza','refleks'].includes(name))assert.equal(calls.find(c=>c.method==='defer').payload.flags,MessageFlags.Ephemeral);}
});
test('Komut, kanal ve modül kapatma eski ayarlarla uyumludur; yeni ayarlar doğrulanır',()=>{
 const old:any=defaultCommunitySettings();delete old.entertainment;assert.equal(communitySettingsSchema.parse(old).entertainment.enabled,true);
 assert.throws(()=>checkEntertainment({...settings,enabled:false},'zar',channel),/kapalı/);assert.throws(()=>checkEntertainment({...settings,disabledCommands:['zar']},'zar',channel),/kapalı/);assert.throws(()=>checkEntertainment({...settings,channelIds:[otherChannel]},'zar',channel),/kanal/);
 assert.equal(communitySettingsSchema.safeParse({...old,entertainment:{...settings,disabledCommands:['sahte']}}).success,false);assert.equal(communitySettingsSchema.safeParse({...old,entertainment:{...settings,cooldownSeconds:0}}).success,false);
});
test('Listeler boş, fazla, tekrarlı ve uzun girdileri reddeder; karıştırma girdiyi korur',()=>{
 assert.deepEqual(listItems(' Ali | Ayşe ',2,10),['Ali','Ayşe']);for(const input of ['Tek','A | a','A | B | '+'x'.repeat(81)])assert.throws(()=>listItems(input,2,10));const list=['a','b','c'];assert.deepEqual([...shuffle(list)].sort(),list);assert.deepEqual(list,['a','b','c']);assert.ok(!safeText('@everyone **test**').includes('@everyone'));
 const date=new Date('2026-10-08T12:00:00Z');assert.equal(dailyValue('same',date),dailyValue('same',new Date('2026-10-08T17:00:00Z')));
});
test('Sayı oyunu geçersiz ve tekrarlı tahminlerde hak kaybetmez; ipucu, galibiyet ve son hak doğru çalışır',()=>{
 const state=createGame('sayi-tahmin','normal',()=>49);assert.equal(state.answer,50);assert.throws(()=>advanceGame(state,'guess','0'));const next=advanceGame(state,'guess','20');assert.match(next.message,/büyük/);assert.equal(state.attempts,0);assert.throws(()=>advanceGame(next,'guess','20'),/zaten/);assert.equal(advanceGame(next,'guess','50').result,'WIN');let s=state;for(let i=1;i<=6;i++)s=advanceGame(s,'guess',String(i));assert.equal(s.result,'LOSE');assert.match(s.message,/50/);
});
test('Türkçe kelime oyununda İ/ı dönüşümü, tekrar koruması ve altıncı hata sınırı doğrudur',()=>{
 let s=createGame('kelime-tahmin','normal',()=>4);assert.equal(s.answer,'BİLGİSAYAR');s=advanceGame(s,'guess','i');assert.ok(s.letters.includes('İ'));assert.equal(s.errors,0);assert.throws(()=>advanceGame(s,'guess','İ'));assert.equal(advanceGame(s,'guess','bilgisayar').result,'WIN');for(const letter of ['C','D','E','F','H','J'])s=advanceGame(s,'guess',letter);assert.equal(s.result,'LOSE');
});
test('Hafıza dizisi seçim aşamasında gizlenir; soru seçenekleri benzersiz ve cevap tekildir',()=>{
 const memory=createGame('hafiza');const session:any={id:'11111111-1111-1111-1111-111111111111',kind:'hafiza',state:memory,status:'ACTIVE',expires_at:new Date(Date.now()+300000)};assert.ok(entertainmentView(session).embeds[0].description.includes(memory.sequence));const next=advanceGame(memory,'ready');assert.ok(!entertainmentView({...session,state:next}).embeds[0].description.includes(memory.sequence));assert.equal(advanceGame(next,String(next.answer)).result,'WIN');
 for(const kind of ['bilmece','bilgi','tarih-sorusu','matematik'])for(let n=0;n<20;n++){const s=createGame(kind,'zor');assert.equal(new Set(s.choices).size,4);assert.equal(advanceGame(s,String(s.answer)).result,'WIN');assert.equal(advanceGame(s,String((s.answer+1)%4)).result,'LOSE');}
});
test('Refleks erken basışı reddeder, sonrasında ağ dahil süreyi ölçer ve tekrar skor üretmez',()=>{
 const ready=createGame('refleks','normal',()=>0,1000),waiting=advanceGame(ready,'start','',2000,()=>0);assert.equal(waiting.targetAt,5000);assert.equal(advanceGame(waiting,'hit','',4999).result,'LOSE');const result=advanceGame(waiting,'hit','',5210);assert.equal(result.elapsed,210);assert.equal(result.result,'WIN');assert.throws(()=>advanceGame(result,'hit','',5300),/tamamlandı/);
});
test('Zor XOX botu tüm olası insan hamlelerinde yenilmez; normal bot kazanma ve engelleme hamlesi yapar',()=>{
 function visit(board:string[]){for(let i=0;i<9;i++){if(board[i])continue;const b=[...board];b[i]='X';assert.notEqual(boardWinner(b),'X');if(boardWinner(b))continue;b[botMove(b,'zor',()=>0)]='O';if(!boardWinner(b))visit(b);}}
 visit(Array(9).fill(''));assert.equal(botMove(['O','O','','X','','','','',''],'normal'),2);assert.equal(botMove(['X','X','','O','','','','',''],'normal'),2);
});
test('Veritabanı oyunu yeniden yükler; yanlış üye, kanal ve eski revizyon engellenir; skor bir kere yazılır',async()=>{
 const s=await startEntertainment(actor,channel,createGame('sayi-tahmin','normal',()=>49));await assert.rejects(playEntertainment(s.id,friend,channel,0,'guess','50',settings),/üyeye ait/);await assert.rejects(playEntertainment(s.id,actor,otherChannel,0,'guess','50',settings),/başka/);
 const first=await playEntertainment(s.id,actor,channel,0,'guess','20',settings);assert.equal((await getEntertainmentSession(s.id))!.state.attempts,1);await assert.rejects(playEntertainment(s.id,actor,channel,0,'guess','50',settings),/ilerledi/);
 const finished=await playEntertainment(s.id,actor,channel,first.state.revision,'guess','50',settings);assert.equal(finished.state.awarded,20);assert.deepEqual((await entertainmentProfile(actor.id)).played,1);await assert.rejects(playEntertainment(s.id,actor,channel,finished.state.revision,'guess','50',settings));assert.equal((await entertainmentProfile(actor.id)).points,20);assert.equal((await entertainmentLeaderboard())[0].username,actor.username);
});
test('Günlük 500 puan tavanı farklı oyunlarda korunur; puansız oyun galibiyet olarak sayılır',async()=>{
 const s=await startEntertainment(actor,channel,createGame('bilgi'));await pg.query('INSERT INTO entertainment_results(session_id,guild_id,user_id,points) VALUES($1,$2,$3,495)',[s.id,config().guildId,actor.id]);await pg.query("UPDATE entertainment_sessions SET status='FINISHED' WHERE id=$1",[s.id]);
 const game=await startEntertainment(actor,channel,createGame('bilgi'));const end=await playEntertainment(game.id,actor,channel,0,String(game.state.answer),'',settings);assert.equal(end.state.awarded,5);
 const next=await startEntertainment(actor,channel,createGame('bilgi'));assert.equal((await playEntertainment(next.id,actor,channel,0,String(next.state.answer),'',settings)).state.awarded,0);assert.equal((await entertainmentProfile(actor.id)).wins,2);
});
test('Ankette tek oy, seçenek doğrulaması, creator/owner kapatma ve sonradan oy engeli uygulanır',async()=>{
 const state={kind:'anket',phase:'PLAY',revision:0,message:'',question:'Çay mı kahve mi?',choices:['Çay','Kahve'],counts:[0,0]},s=await startEntertainment(actor,channel,state,60);
 await assert.rejects(pollEntertainment(s.id,friend,channel,0,'4',settings),/Geçersiz/);await pollEntertainment(s.id,friend,channel,0,'1',settings);await assert.rejects(pollEntertainment(s.id,friend,channel,0,'0',settings),/zaten/);const voted=await pollEntertainment(s.id,actor,channel,0,'0',settings);assert.deepEqual(voted.state.counts,[1,1]);await assert.rejects(pollEntertainment(s.id,friend,channel,0,'close',settings),/yalnızca/);
 const closed=await pollEntertainment(s.id,owner,channel,0,'close',settings);assert.equal(closed.status,'FINISHED');await assert.rejects(pollEntertainment(s.id,actor,channel,1,'1',settings));assert.equal((await entertainmentProfile(actor.id)).played,0);
});
test('Süre dolması oyunu engeller ve ankete kapalı görünüm verir; 7 günlük detaylar silinir, skor kalır',async()=>{
 const s=await startEntertainment(actor,channel,createGame('bilgi'));await playEntertainment(s.id,actor,channel,0,String(s.state.answer),'',settings);
 const poll=await startEntertainment(actor,channel,{kind:'anket',phase:'PLAY',revision:0,message:'',question:'Test?',choices:['A','B'],counts:[0,0]},60);await attachEntertainmentMessage(poll.id,'123456789012345678');await pg.query("UPDATE entertainment_sessions SET expires_at=now()-interval '1 minute' WHERE id=$1",[poll.id]);await assert.rejects(pollEntertainment(poll.id,friend,channel,0,'0',settings),/süresi/);const expired=await expireEntertainmentSessions();assert.equal(expired.length,1);assert.equal(entertainmentView(expired[0]).components.length,0);
 await pg.query("UPDATE entertainment_sessions SET expires_at=now()-interval '8 days'");await expireEntertainmentSessions();assert.equal((await pg.query('SELECT id FROM entertainment_sessions')).rows.length,0);assert.equal((await entertainmentProfile(actor.id)).points,20);
});
test('Komut hız sınırı ve üç aktif oyun sınırı gerçek veritabanında uygulanır',async()=>{
 await entertainmentRate(actor,'zar',settings);await assert.rejects(entertainmentRate(actor,'zar',settings),/çok|sınır|bekle/i);for(let i=0;i<3;i++)await startEntertainment(actor,channel,createGame('bilgi'));await assert.rejects(startEntertainment(actor,channel,createGame('xox')),/en fazla 3/);
});
test('Gerçek düğme ve modal yönlendirmesi oyunu günceller; başkasına özel hata ve bozuk ID güvenli yanıt verir',async()=>{
 const s=await startEntertainment(actor,channel,createGame('sayi-tahmin','normal',()=>49)),open=component(s,'open');assert.equal(await handleEntertainmentInteraction(open.interaction,settings),true);assert.equal(open.interaction.modal.custom_id,`fun:${s.id}:0:guess`);
 const modal=component(s,'guess',{isButton:()=>false,isModalSubmit:()=>true,fields:{getTextInputValue:()=> '50'}});assert.equal(await handleEntertainmentInteraction(modal.interaction,settings),true);assert.equal((await entertainmentProfile(actor.id)).points,20);validateMessage(modal.calls.find(c=>c.method==='edit').payload);
 const fresh=await startEntertainment(actor,channel,createGame('xox')),wrong=component(fresh,'0',{user:{...friend,avatar:null}});await handleEntertainmentInteraction(wrong.interaction,settings);assert.equal(wrong.calls[0].payload.flags,MessageFlags.Ephemeral);assert.match(wrong.calls[0].payload.content,/üyeye ait/);
 const malformed=component(fresh,'0',{customId:'fun:broken'});await handleEntertainmentInteraction(malformed.interaction,settings);assert.match(malformed.calls[0].payload.content,/geçerli/);
});
test('Yardım kategorileri 45 komutu kapsar; mevcut siyasi düğmeler eğlence yönlendirmesine girmez',async()=>{
 const help=fakeInteraction('yardim');await handleEntertainmentInteraction(help.interaction,settings);validateMessage(help.calls[0].payload);const menu=fakeInteraction('',{isChatInputCommand:()=>false,isStringSelectMenu:()=>true,customId:'funhelp:category',values:['sistem'],update:async(payload:any)=>validateMessage(payload)});assert.equal(await handleEntertainmentInteraction(menu.interaction,settings),true);const other=fakeInteraction('',{isChatInputCommand:()=>false,isButton:()=>true,customId:'vote:test:yes'});assert.equal(await handleEntertainmentInteraction(other.interaction,settings),false);
});
test('Oyun iptali bir oturumu kapatır ve yeni oyun için yer açar; puan verilmez',async()=>{
 const first=await startEntertainment(actor,channel,createGame('xox'));await startEntertainment(actor,channel,createGame('bilgi'));await startEntertainment(actor,channel,createGame('kelime-tahmin'));const ended=await playEntertainment(first.id,actor,channel,0,'cancel','',settings);assert.equal(ended.status,'FINISHED');assert.equal(ended.state.awarded,0);assert.equal((await entertainmentProfile(actor.id)).points,0);await startEntertainment(actor,channel,createGame('bilmece'));
});
test('Aynı ankete eşzamanlı düğme yanıtları sırayla düzenlenir; eski toplam yeni sonucu ezmez',async()=>{
 const poll=await startEntertainment(actor,channel,{kind:'anket',phase:'PLAY',revision:0,message:'',question:'Test?',choices:['A','B'],counts:[0,0]}),edits:number[]=[];
 const first=component(poll,'0',{editReply:async(payload:any)=>{await new Promise(r=>setTimeout(r,20));edits.push(Number(/\*\*(\d+) oy\*\*/.exec(payload.embeds[0].description)![1]));}});
 const second=component(poll,'1',{user:{...friend,avatar:null},editReply:async(payload:any)=>{edits.push(Number(/\*\*(\d+) oy\*\*/.exec(payload.embeds[0].description)![1]));}});
 await Promise.all([handleEntertainmentInteraction(first.interaction,settings),handleEntertainmentInteraction(second.interaction,settings)]);assert.deepEqual(edits,[1,2]);assert.deepEqual((await getEntertainmentSession(poll.id))!.state.counts,[1,1]);
});
test('Markdown yoğun uzun takım isimleri Discord alan sınırını aşmaz ve üyeler kaybolmaz',async()=>{
 const people=Array.from({length:30},(_,i)=>i%2===0&&i<22?'*'.repeat(70)+i:'p'+i);assert.ok(people.join(' | ').length<=1000);const fake=fakeInteraction('takim',{options:{getString:()=>people.join(' | '),getInteger:()=>2,getUser:()=>null}});await handleEntertainmentInteraction(fake.interaction,settings);const message=fake.calls.find(c=>c.method==='edit').payload;validateMessage(message);assert.equal(message.embeds[0].fields.flatMap((f:any)=>f.value.split('\n')).length,30);
});
