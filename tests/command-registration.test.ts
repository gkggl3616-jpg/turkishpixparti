import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CommandRegistrar,commandRetryDelay} from '../apps/bot/src/command-registration';
import {DiscordAPIError} from '../packages/core/src/discord';

test('Discord Retry-After is honored without repeatedly overwriting guild commands',async()=>{
 let clock=0,puts=0,posts=0;const deleted:string[]=[];
 const request:any=async(path:string,init:any={})=>{
  if(init.method==='POST'){posts++;return {name:JSON.parse(init.body).name};}
  if(init.method==='DELETE'){deleted.push(path);return null;}
  if(init.method==='PUT'){puts++;if(puts===1)throw new DiscordAPIError(429,null,'PUT',path,120);return [{name:'bilet'}];}
  return [{name:'osint',id:'111111111111111111'},{name:'proxy',id:'222222222222222222'},{name:'tempmail',id:'333333333333333333'},{name:'retain-this-command',id:'444444444444444444'}];
 };
 const registrar=new CommandRegistrar(request,()=>clock),global=[{name:'kur'}],guild=[{name:'bilet',contexts:[0],integration_types:[0]}];
 const first=await registrar.sync('1557484052133707896','888888888888888888',global,guild,()=>{});
 assert.equal(first.ready,false);assert.equal(first.globalsReady,true);assert.ok(first.retryMs!>=120000);assert.equal(posts,1);assert.equal(puts,1);assert.equal(deleted.length,3);assert.ok(!deleted.some(p=>p.endsWith('444444444444444444')));
 clock=119999;await registrar.sync('1557484052133707896','888888888888888888',global,guild,()=>{});assert.equal(puts,1);
 clock=121001;assert.equal((await registrar.sync('1557484052133707896','888888888888888888',global,guild,()=>{})).ready,true);
 assert.equal(posts,1);assert.equal(puts,2);assert.equal(deleted.length,3);
});
test('Partly completed global registration resumes at the failed command',async()=>{
 let clock=0,first=0,second=0;
 const request:any=async(path:string,init:any={})=>{
  if(init.method==='POST'){const name=JSON.parse(init.body).name;if(name==='kur'){first++;return {name};}second++;if(second===1)throw new DiscordAPIError(503,null,'POST',path);return {name};}
  if(init.method==='PUT')return [{name:'guild-command'}];return [];
 };
 const registrar=new CommandRegistrar(request,()=>clock),global=[{name:'kur'},{name:'inv'}],guild=[{name:'guild-command'}];
 assert.equal((await registrar.sync('app','guild',global,guild,()=>{})).ready,false);assert.equal(registrar.hasGlobal('kur'),true);
 clock=31000;assert.equal((await registrar.sync('app','guild',global,guild,()=>{})).ready,true);assert.equal(first,1);assert.equal(second,2);
});
test('Long Discord cooldowns are never shortened by the local retry ceiling',()=>{
 assert.ok(commandRetryDelay(new DiscordAPIError(429,null,'PUT','route',3600),1)>=3600000);
 assert.ok(commandRetryDelay(new Error('network'),1)>=30000);
});
