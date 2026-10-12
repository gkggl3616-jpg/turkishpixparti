import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MessageFlags,PermissionFlagsBits} from 'discord.js';
import {executeModerationAction,handleModerationInteraction} from '../apps/bot/src/moderation-actions';
import {guildCommands,globalCommands} from '../packages/core/src/commands';
import {helpEntries} from '../apps/bot/src/help';
const actorId='111111111111111111',targetId='222222222222222222',botId='333333333333333333',ownerId='444444444444444444';
function fixture(){
 const calls:any[]=[],edits:any[]=[],dm:any[]=[];
 const user:any={id:targetId,username:'Üye',bot:false,send:async(value:any)=>{calls.push('dm');dm.push(value);return {edit:async(v:any)=>{edits.push(v);}};}};
 const target:any={id:targetId,roles:{highest:{position:1}},bannable:true,kickable:true,ban:async(v:any)=>calls.push(['ban',v]),kick:async(v:any)=>calls.push(['kick',v])};
 const actor:any={id:actorId,user:{username:'Yetkili'},permissions:{has:()=>true},roles:{highest:{comparePositionTo:(r:any)=>3-r.position}}};
 const bot:any={id:botId,permissions:{has:()=>true}};
 const guild:any={name:'TurkishPix',ownerId,client:{user:{id:botId}},roles:{fetch:async()=>calls.push('roles')},members:{fetch:async(options:any)=>{calls.push(['fetch',options]);return options.user===actorId?actor:options.user===botId?bot:target;}}};
 guild.fetch=async()=>guild;
 return {guild,user,target,actor,bot,calls,edits,dm};
}
test('Ban refreshes permissions, DMs before removal, retains messages and records optional reason',async()=>{
 const f=fixture(),result=await executeModerationAction(f.guild,actorId,f.user,'ban','  Tekrarlanan ihlal  ');
 assert.equal(result.dm,'sent');assert.equal(result.reason,'Tekrarlanan ihlal');assert.equal(f.calls[0],'roles');
 const fetched=f.calls.filter(c=>Array.isArray(c)&&c[0]==='fetch');assert.equal(fetched.length,3);assert.ok(fetched.every(c=>c[1].force===true));
 const ban=f.calls.find(c=>Array.isArray(c)&&c[0]==='ban');assert.equal(ban[1].deleteMessageSeconds,0);assert.match(ban[1].reason,/Yetkili.*111111111111111111.*Tekrarlanan ihlal/);
 assert.ok(f.calls.indexOf('dm')<f.calls.indexOf(ban));assert.equal(f.dm[0].embeds[0].fields[0].value,'TurkishPix');assert.match(f.edits[0].embeds[0].title,/yasaklandın/);
});
test('Closed DMs do not stop a ban; empty reason receives a truthful default',async()=>{
 const f=fixture();f.user.send=async()=>{throw {code:50007};};const result=await executeModerationAction(f.guild,actorId,f.user,'ban','  ');
 assert.equal(result.dm,'unavailable');assert.equal(result.reason,'Sebep belirtilmedi.');assert.ok(f.calls.some(c=>c[0]==='ban'));
});
test('Kick works without reason and does not send unsolicited DMs',async()=>{
 const f=fixture();f.actor.permissions.has=(p:bigint)=>p===PermissionFlagsBits.KickMembers;
 const result=await executeModerationAction(f.guild,actorId,f.user,'kick');assert.equal(result.reason,'Sebep belirtilmedi.');assert.ok(f.calls.some(c=>c[0]==='kick'));assert.equal(f.dm.length,0);
});
test('Runtime permission checks reject a stale allowed interaction before sending DM',async()=>{
 const f=fixture();f.actor.permissions.has=()=>false;
 await assert.rejects(executeModerationAction(f.guild,actorId,f.user,'ban'),(e:any)=>e.code==='FORBIDDEN');assert.equal(f.dm.length,0);assert.ok(!f.calls.some(c=>c[0]==='ban'));
 f.actor.permissions.has=()=>true;f.bot.permissions.has=()=>false;
 await assert.rejects(executeModerationAction(f.guild,actorId,f.user,'ban'),(e:any)=>e.code==='BOT_PERMISSION');assert.equal(f.dm.length,0);
});
test('Equal/higher actor roles and unmanageable bot roles cannot be bypassed',async()=>{
 const f=fixture();f.target.roles.highest.position=3;
 await assert.rejects(executeModerationAction(f.guild,actorId,f.user,'kick'),(e:any)=>e.code==='ACTOR_HIERARCHY');
 f.target.roles.highest.position=1;f.target.bannable=false;
 await assert.rejects(executeModerationAction(f.guild,actorId,f.user,'ban'),(e:any)=>e.code==='BOT_HIERARCHY');assert.equal(f.dm.length,0);
});
test('Guild owner can act above own role; self, owner and our bot remain protected',async()=>{
 const f=fixture();f.guild.ownerId=actorId;f.target.roles.highest.position=9;
 await executeModerationAction(f.guild,actorId,f.user,'kick');assert.ok(f.calls.some(c=>c[0]==='kick'));
 for(const [id,code] of [[actorId,'SELF_MODERATION'],[ownerId,'OWNER_PROTECTED'],[botId,'BOT_PROTECTED']]){
  const g=fixture();g.user.id=id;
  await assert.rejects(executeModerationAction(g.guild,actorId,g.user,'ban'),(e:any)=>e.code===code);assert.equal(g.calls.length,0);
 }
});
test('A failed ban corrects the pending notice and never returns a success result',async()=>{
 const f=fixture();f.target.ban=async()=>{throw {code:50013};};
 await assert.rejects(executeModerationAction(f.guild,actorId,f.user,'ban'),(e:any)=>e.code===50013);assert.match(f.edits[0].embeds[0].title,/tamamlanmadı/);assert.equal(f.edits.length,1);
});
test('A DM edit failure after a successful ban does not falsely fail the action',async()=>{
 const f=fixture();f.user.send=async()=>({edit:async()=>{throw {code:50007};}});
 const result=await executeModerationAction(f.guild,actorId,f.user,'ban');assert.equal(result.dm,'sent');assert.ok(f.calls.some(c=>c[0]==='ban'));
});
test('Bot targets skip DMs; overlong reasons are rejected without acting',async()=>{
 const f=fixture();f.user.bot=true;const result=await executeModerationAction(f.guild,actorId,f.user,'ban');assert.equal(result.dm,'bot');assert.equal(f.dm.length,0);
 const g=fixture();await assert.rejects(executeModerationAction(g.guild,actorId,g.user,'ban','x'.repeat(501)),(e:any)=>e.code==='INVALID_REASON');assert.equal(g.dm.length,0);assert.ok(!g.calls.some(c=>c[0]==='ban'));
});
test('A missing target produces an actionable error without attempting removal',async()=>{
 const f=fixture(),fetch=f.guild.members.fetch;f.guild.members.fetch=async(o:any)=>{if(o.user===targetId)throw {code:10007};return fetch(o);};
 await assert.rejects(executeModerationAction(f.guild,actorId,f.user,'kick'),(e:any)=>e.code==='MEMBER_NOT_FOUND');assert.equal(f.dm.length,0);
});
test('Command replies are private and report closed DM accurately',async()=>{
 const f=fixture(),responses:any[]=[];f.user.send=async()=>{throw {code:50007};};
 const i:any={isChatInputCommand:()=>true,commandName:'ban',guild:f.guild,user:{id:actorId},options:{getUser:()=>f.user,getString:()=>null},deferReply:async(v:any)=>responses.push(v),editReply:async(v:any)=>responses.push(v)};
 assert.equal(await handleModerationInteraction(i),true);assert.equal(responses[0].flags,MessageFlags.Ephemeral);assert.match(responses[1].embeds[0].fields[2].value,/Gönderilemedi.*tamamlandı/);assert.deepEqual(responses[1].allowedMentions.parse,[]);
});
test('Kick/ban preserve every guild command, use separate global quota and appear in help',()=>{
 assert.equal(guildCommands.length,100);assert.equal(globalCommands.length,5);
 for(const name of ['kick','ban']){const c:any=globalCommands.find(c=>c.name===name);assert.equal(c.default_member_permissions,name==='kick'?'2':'4');assert.deepEqual(c.contexts,[0]);assert.equal(c.options[0].name,'uye');assert.equal(c.options[0].required,true);assert.equal(c.options[1].name,'reason');assert.equal(c.options[1].required,false);assert.equal(c.options[1].max_length,500);assert.ok(helpEntries('feature-yonetim').some(e=>e.key===name));}
});
