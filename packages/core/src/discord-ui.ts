import {config} from './config';
import {theme} from './presentation';
export const COMPONENTS_V2=32768;
export const uiText=(content:string)=>({type:10,content});
export const uiSeparator=()=>({type:14,divider:true,spacing:1});
export const uiRow=(...components:any[])=>({type:1,components});
export const uiButton=(custom_id:string,label:string,style=2,disabled=false)=>({type:2,custom_id,label,style,disabled});
export function discordCard(title:string,subtitle:string,body:any[],color=theme.cyan,thumbnail?:string){
 const header=uiText('## '+title+'\n'+subtitle);
 return {flags:COMPONENTS_V2,components:[{type:17,accent_color:color,components:[{type:9,components:[header],accessory:{type:11,media:{url:thumbnail||config().appUrl+'/brand/turkishpix-bot.png'},description:'TurkishPix'}},uiSeparator(),...body]}],allowedMentions:{parse:[]}};
}
/** Quotes untrusted message text without executing its Markdown or mentions. */
export function messageQuote(content:string|null|undefined,max=1100){
 if(content===null||content===undefined)return '*İçerik bot tarafından görülmedi.*';
 if(!content)return '*Yazı yok; dosya veya görsel olabilir.*';
 const value=content.replace(/`/g,'ˋ').replace(/@/g,'＠').replace(/\u0000/g,'').slice(0,max);
 return '```text\n'+value+'\n```'+(content.length>max?'\n-# Tam metin Ayrıntılar düğmesinde.':'');
}
