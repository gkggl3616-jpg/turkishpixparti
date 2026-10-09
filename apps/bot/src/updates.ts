import {config,brightEmbed,theme} from '@turkishpix/core';
import {releases,currentRelease,findRelease} from '../../../packages/core/src/releases';
export function updatesView(version=currentRelease.version,page=0){
 const release=findRelease(version)||currentRelease;
 const pages=Math.ceil(release.features.length/2);
 page=Math.max(0,Math.min(pages-1,Number.isFinite(page)?Math.floor(page):0));
 const fields=release.features.slice(page*2,page*2+2).map(feature=>({name:'✦ '+feature.title,value:(feature.description+'\n'+feature.commands.map(command=>'`'+command+'`').join('\n')+(feature.note?'\n◇ '+feature.note:'')+'\n[İlgili sayfayı aç]('+config().appUrl+feature.path+')').slice(0,1024)}));
 const embed=brightEmbed('✨ Güncellemeler · v'+release.version,release.summary+'\n**'+release.date.split('-').reverse().join('.')+'** · Sayfa **'+(page+1)+' / '+pages+'**',fields,theme.purple);
 embed.footer={text:'TurkishPix • Yeni özellikleri ve komutları keşfet'};
 return {embeds:[embed],components:[
  {type:1,components:[{type:3,custom_id:'updates:release',placeholder:'Bir sürüm seç',options:releases.map(r=>({label:'v'+r.version+' · '+r.title,value:r.version,description:r.summary.slice(0,100),default:r.version===release.version}))}]},
  {type:1,components:[{type:2,style:2,custom_id:`updates:page:${release.version}:${page-1}`,label:'Önceki',disabled:page===0},{type:2,style:2,custom_id:`updates:page:${release.version}:${page+1}`,label:'Sonraki',disabled:page===pages-1},{type:2,style:5,label:'Tüm güncellemeler',url:config().appUrl+'/guncellemeler#v'+release.version},{type:2,style:2,custom_id:'help:page:home:0',label:'Komut rehberi'}]}
 ],allowedMentions:{parse:[]}};
}
export async function handleUpdatesInteraction(i:any){
 if(i.isChatInputCommand()&&i.commandName==='guncellemeler'){await i.reply(updatesView(i.options.getString('surum')||undefined));return true;}
 if(i.isStringSelectMenu()&&i.customId==='updates:release'){await i.update(updatesView(i.values[0]));return true;}
 if(i.isButton()&&i.customId.startsWith('updates:page:')){const [, ,version,page]=i.customId.split(':');await i.update(updatesView(version,Number(page)));return true;}
 return false;
}
