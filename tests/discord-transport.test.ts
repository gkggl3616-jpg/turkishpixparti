import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {discordRequest,DiscordAPIError,isDiscordMissing,discordBotIdentity,discordErrorDetails} from '../packages/core/src/discord';
import {BackgroundTasks} from '../apps/bot/src/background';
import {safeInteraction} from '../apps/bot/src/interaction-errors';
const originalFetch=globalThis.fetch;
process.env.DISCORD_BOT_TOKEN='test-transport-token';
beforeEach(()=>{globalThis.fetch=originalFetch;});after(()=>{globalThis.fetch=originalFetch;});
test('404 kaynağı ve Discord kodu korunur; hata içinde token veya özel yanıt gövdesi bulunmaz',async()=>{
 globalThis.fetch=async()=>Response.json({code:10008,message:'private response must not leak'},{status:404});
 await assert.rejects(discordRequest('/channels/111111111111111111/messages/222222222222222222'),(e:unknown)=>e instanceof DiscordAPIError&&isDiscordMissing(e,10008)&&!isDiscordMissing(e,10003)&&e.message.includes('mesajı silinmiş')&&!JSON.stringify(discordErrorDetails(e)).includes('private')&&!JSON.stringify(e).includes('test-transport-token'));
 globalThis.fetch=async()=>Response.json({code:10003},{status:404});await assert.rejects(discordRequest('/channels/111111111111111111'),(e:any)=>isDiscordMissing(e,10003)&&e.message.includes('kanalı silinmiş'));
});
test('429 Retry-After beklenir; başarılı sonuç yalnızca bir kez döner',async()=>{
 let calls=0;const start=Date.now();globalThis.fetch=async()=>++calls===1?Response.json({retry_after:0.05},{status:429,headers:{'Retry-After':'0.05'}}):Response.json({id:'saved'});
 assert.deepEqual(await discordRequest('/channels/111111111111111111/messages',{method:'POST',body:'{}'}),{id:'saved'});assert.equal(calls,2);assert.ok(Date.now()-start>=40);
});
test('Geçici GET hatası yeniden denenir; belirsiz POST yeniden gönderilip kayıt çoğaltılmaz',async()=>{
 let calls=0;globalThis.fetch=async()=>++calls===1?Response.json({}, {status:503}):Response.json({ok:true});assert.deepEqual(await discordRequest('/users/@me'),{ok:true});assert.equal(calls,2);
 calls=0;globalThis.fetch=async()=>{calls++;return Response.json({}, {status:503});};await assert.rejects(discordRequest('/channels/111111111111111111/messages',{method:'POST',body:'{}'}),/503/);assert.equal(calls,1);
});
test('Aynı anda yapılan aynı GET tek HTTP isteği kullanır; sonuç nesneleri birbirini değiştirmez',async()=>{
 let calls=0;let resolve!:()=>void;const gate=new Promise<void>(r=>{resolve=r;});globalThis.fetch=async()=>{calls++;await gate;return Response.json({roles:['member']});};const first=discordRequest('/guilds/111111111111111111/roles'),second=discordRequest('/guilds/111111111111111111/roles');resolve();const [a,b]=await Promise.all([first,second]);assert.equal(calls,1);a.roles.push('modified');assert.deepEqual(b.roles,['member']);
});
test('Bot kimliği kısa süre tutulur; üyelik ve yetki sorguları yeniden okunur',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({id:'bot',roles:['member']});};await discordBotIdentity();await discordBotIdentity();assert.equal(calls,1);await discordRequest('/guilds/111111111111111111/members/222222222222222222');await discordRequest('/guilds/111111111111111111/members/222222222222222222');assert.equal(calls,3);
});
test('Yavaş görev başka modülü durdurmaz; aynı görev üst üste çalışmaz ve kapasite korunur',async()=>{
 const events:any[]=[],tasks=new BackgroundTasks(2,(...e)=>events.push(e));let unblock!:()=>void,fast=0;const slow=new Promise<void>(r=>{unblock=r;});assert.equal(tasks.run('slow',0,()=>slow),true);assert.equal(tasks.run('slow',0,()=>slow),false);assert.equal(tasks.run('fast',0,async()=>{fast++;}),true);assert.equal(tasks.run('third',0,async()=>{}),false);
 await new Promise(r=>setTimeout(r,0));assert.equal(fast,1);assert.equal(tasks.snapshot().slow.running,true);assert.equal(tasks.run('failure',0,async()=>{throw Error('private');}),true);await new Promise(r=>setTimeout(r,0));assert.equal(events[0][0],'BOT_TASK_FAILED');assert.ok(!JSON.stringify(events).includes('private'));unblock();await tasks.stop();assert.equal(tasks.run('after-stop',0,async()=>{}),false);
});
test('Bozuk veya süresi dolmuş interaction botu düşürmez ve ikinci yanıt hatası dışarı taşmaz',async()=>{
 const i={commandName:'bilet',isRepliable:()=>true,deferred:true,editReply:async()=>{throw {code:10008};}};await assert.doesNotReject(safeInteraction(i,async()=>{throw {code:50013};}));let replies=0;await safeInteraction({...i,editReply:async()=>{replies++;}},async()=>{throw {code:10062};});assert.equal(replies,0);
});
