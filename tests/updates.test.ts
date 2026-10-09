import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {commands} from '../packages/core/src/commands';
import {RELEASE_VERSION} from '../packages/core/src/config';
import {releases,currentRelease,releaseMatches} from '../packages/core/src/releases';
import {updatesView,handleUpdatesInteraction} from '../apps/bot/src/updates';
import {commandCategory,commandHelpView} from '../apps/bot/src/help';
import {setTestDatabase} from '../packages/core/src/db';
import {GET} from '../apps/web/src/app/api/updates/route';
test('Güncellemeler komutu 100 komut sınırında kaydedilir ve rehberden bulunur',()=>{
 assert.equal(commands.length,100);assert.equal(new Set(commands.map(c=>c.name)).size,100);
 const command=commands.find(c=>c.name==='guncellemeler')!;assert.ok(command);assert.equal(commandCategory(command.name),'guncellemeler');
 assert.equal(currentRelease.version,RELEASE_VERSION);assert.equal(new Set(releases.map(r=>r.version)).size,releases.length);
 assert.equal((commandHelpView('guncellemeler').components[1].components[2] as any).url,process.env.APP_URL?process.env.APP_URL+'/guncellemeler':'http://localhost:3000/guncellemeler');
 for(const release of releases)for(const feature of release.features){assert.ok(existsSync(new URL('../apps/web/src/app'+feature.path+'/page.tsx',import.meta.url)));for(const usage of feature.commands){const parts=usage.slice(1).split(' '),root=commands.find(c=>c.name===parts[0]);assert.ok(root,usage);}}
 assert.ok(releaseMatches(releases.find(r=>r.version==='2.11.0')!,'50.000'));assert.ok(releaseMatches(releases.find(r=>r.version==='2.11.0')!,'3D'));assert.ok(!releaseMatches(releases[1],'olmayan-özellik'));
});
test('Sürüm seçimi ve tüm sayfalar Discord sınırlarına uyar; bozuk sayfa güvenle düzeltilir',()=>{
 for(const release of releases)for(const page of [-10,0,1,2,999,NaN]){
  const view=updatesView(release.version,page),embed=view.embeds[0];assert.ok(embed.title.includes(release.version));
  const textSize=(embed.title?.length||0)+(embed.description?.length||0)+(embed.footer?.text.length||0)+(embed.author?.name.length||0)+embed.fields.reduce((n:number,f:any)=>n+f.name.length+f.value.length,0);assert.ok(textSize<6000);
  for(const field of embed.fields){assert.ok(field.name.length<=256);assert.ok(field.value.length<=1024);}
  for(const row of view.components){assert.ok(row.components.length<=5);for(const component of row.components as any[]){assert.ok(!component.custom_id||component.custom_id.length<=100);assert.ok(!component.options||component.options.length<=25);for(const option of component.options||[]){assert.ok(option.label.length<=100);assert.ok(option.description.length<=100);}}}
  assert.deepEqual(view.allowedMentions,{parse:[]});
 }
 assert.ok(updatesView('unknown').embeds[0].title.includes(currentRelease.version));
});
test('Güncellemeler herkese açık cevaplanır; sürüm menüsü ve sayfa düğmeleri çalışır',async()=>{
 let reply:any,updated:any;
 const base:any={isChatInputCommand:()=>false,isStringSelectMenu:()=>false,isButton:()=>false,reply:async(v:any)=>reply=v,update:async(v:any)=>updated=v};
 assert.equal(await handleUpdatesInteraction({...base,isChatInputCommand:()=>true,commandName:'guncellemeler',options:{getString:()=>null}}),true);assert.equal(reply.flags,undefined);
 assert.equal(await handleUpdatesInteraction({...base,isStringSelectMenu:()=>true,customId:'updates:release',values:['2.11.0']}),true);assert.ok(updated.embeds[0].title.includes('2.11.0'));
 assert.equal(await handleUpdatesInteraction({...base,isButton:()=>true,customId:'updates:page:2.11.0:1'}),true);assert.ok(updated.embeds[0].description.includes('2 / 2'));
 assert.equal(await handleUpdatesInteraction({...base,isButton:()=>true,customId:'unrelated:button'}),false);
});
test('Herkese açık durum eski heartbeat ile bağlı göstermez ve özel bilgileri sızdırmaz',async()=>{
 const previous=process.env.DATABASE_URL;process.env.DATABASE_URL='postgresql://test.invalid/test';
 let row={updated_at:new Date(),status:{version:RELEASE_VERSION,connected:true,configuredGuild:true,commandsRegistered:true,registeredVersion:RELEASE_VERSION,botId:'private-id',guilds:['private-guild'],permissions:{secret:'private-data'}}};
 setTestDatabase({query:async()=>({rows:[row] as any[],rowCount:1})});
 try{let response=await GET(),raw=await response.text(),data=JSON.parse(raw);assert.ok(data.bot.connected);assert.ok(data.bot.commandsRegistered);assert.equal(data.releases[0].version,RELEASE_VERSION);assert.ok(!raw.includes('private-'));assert.equal(response.headers.get('cache-control'),'no-store');
  row.status.configuredGuild=false;data=await(await GET()).json();assert.equal(data.bot.commandsRegistered,false);assert.equal(data.bot.registeredVersion,null);
  row.updated_at=new Date(Date.now()-60000);data=await(await GET()).json();assert.equal(data.bot.connected,false);assert.equal(data.bot.commandsRegistered,false);
 }finally{if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;}
});
