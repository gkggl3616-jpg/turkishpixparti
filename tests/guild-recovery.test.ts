import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGuildRecovery} from '../apps/bot/src/guild-recovery';

function setup(){
 const cache=new Map<string,any>();let calls:string[]=[];
 const guild:any={id:'target',available:true,memberCount:42,members:{me:null,fetchMe:async()=>{calls.push('member');guild.members.me={id:'bot'};}},roles:{fetch:async()=>calls.push('roles')},channels:{fetch:async()=>calls.push('channels')}};
 const client:any={isReady:()=>true,guilds:{cache,fetch:async(options:any)=>{assert.equal(options.guild,'target');assert.equal(options.cache,false);calls.push('guild');return guild;}}};
 return {cache,client,guild,calls};
}
test('Missing Gateway guild is cached only after REST membership, roles and channels are verified',async()=>{
 const s=setup(),recover=createGuildRecovery(s.client,()=> 'target');
 assert.equal(await recover(),s.guild);assert.deepEqual(s.calls,['guild','member','roles','channels']);assert.equal(s.cache.get('target'),s.guild);
 await recover();assert.equal(s.calls.length,4);
});
test('Missing access does not populate the guild cache; retries are throttled and recover after access returns',async()=>{
 const s=setup();let now=0;const original=s.client.guilds.fetch;
 s.client.guilds.fetch=async()=>{s.calls.push('denied');throw {code:50001,message:'secret request details'};};
 const recover=createGuildRecovery(s.client,()=> 'target',()=>now);
 assert.equal(await recover(),null);assert.equal(s.cache.size,0);await recover();assert.deepEqual(s.calls,['denied']);
 now=30000;s.client.guilds.fetch=original;assert.equal(await recover(),s.guild);
});
test('Incomplete hydration never enables guild workers; disconnected and parallel calls do not probe REST',async()=>{
 const s=setup();s.client.isReady=()=>false;const recover=createGuildRecovery(s.client,()=> 'target');assert.equal(await recover(),null);assert.equal(s.calls.length,0);
 s.client.isReady=()=>true;s.guild.channels.fetch=async()=>{throw {code:50013};};const [a,b]=await Promise.all([recover(),recover()]);assert.equal(a,null);assert.equal(b,null);assert.equal(s.cache.size,0);
});
