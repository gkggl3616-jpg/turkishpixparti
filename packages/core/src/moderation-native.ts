import {config} from './config';
import {database} from './db';
import {discordRequest} from './discord';
import {type ContentModerationSettings} from './moderation-policy';
export const NATIVE_RULE_NAME='TurkishPix • Chat Kalkanı';
export function nativeModerationRule(settings:ContentModerationSettings,securityEnabled:boolean){
 const keywords:string[]=[],regex:string[]=[];
 if(settings.modes.PROFANITY==='DELETE')keywords.push('amk','amq','aq','siktir','sikerim','sikeyim','orospu','orospu çocuğu','yarrak','götveren','motherfucker','fuck','fucking');
 if(settings.modes.RACISM==='DELETE')keywords.push('nigger','niggers','kike','kikes','raghead','ragheads');
 if(settings.modes.NAZI==='DELETE'){regex.push('(?i)^\\s*(heil[\\s._*-]*hitler|sieg[\\s._*-]*heil|hitler haklıydı|yaşasın nazizm|white power)[!\\s]*$');if(settings.strictSymbols)regex.push('^\\s*[卐卍]+\\s*$');}
 // Empty keyword lists still need a valid, inert trigger if every category is off.
 const allowed=new Set(settings.allowedTerms.map(s=>s.toLocaleLowerCase('tr-TR')));const selected=[...new Set(keywords)].filter(s=>!allowed.has(s));
 return {name:NATIVE_RULE_NAME,event_type:1,trigger_type:1,enabled:securityEnabled&&settings.enabled&&settings.nativeAutoMod&&(selected.length+regex.length>0),trigger_metadata:{keyword_filter:selected,regex_patterns:regex.length?regex:['^a\\b\\B$']},actions:[{type:1,metadata:{custom_message:'Mesajın TurkishPix sohbet korumasına takıldı. Küfür, nefret söylemi ve Nazi propagandası yasaktır.'}}],exempt_roles:settings.excludedRoleIds,exempt_channels:settings.excludedChannelIds};
}
let lastKey='',lastCheck=0;
export async function syncNativeModeration(settings:ContentModerationSettings,securityEnabled:boolean,manageGuild:boolean,botId:string){
 const rule=nativeModerationRule(settings,securityEnabled),key=JSON.stringify({guild:config().guildId,rule,manageGuild});if(key===lastKey&&Date.now()-lastCheck<300000)return;
 lastKey=key;lastCheck=Date.now();let status:any;
 try{
  if(!manageGuild)status={enabled:false,reason:'MANAGE_GUILD_MISSING'};
  else{
   const path=`/guilds/${config().guildId}/auto-moderation/rules`,rules=await discordRequest(path);
   // Only the rule created by this bot is managed; other moderation rules are preserved.
   const owned=rules.find((r:any)=>r.name===NATIVE_RULE_NAME&&r.creator_id===botId);
   if(!owned&&!rule.enabled)status={enabled:false,reason:'DISABLED'};
   else if(!owned&&rules.filter((r:any)=>r.trigger_type===1).length>=6)status={enabled:false,reason:'NATIVE_RULE_LIMIT'};
   else{const {trigger_type,...patch}=rule;const result=await discordRequest(path+(owned?'/'+owned.id:''),{method:owned?'PATCH':'POST',body:JSON.stringify(owned?patch:rule),headers:{'X-Audit-Log-Reason':encodeURIComponent('TurkishPix chat protection settings')}});status={enabled:result.enabled,ruleId:result.id,reason:result.enabled?'ACTIVE':'DISABLED'};}
  }
 }catch{status={enabled:false,reason:'NATIVE_SYNC_FAILED'};lastCheck=Date.now()-240000;}
 await database().query("INSERT INTO integration_status(name,status) VALUES('automod',$1) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",[status]);console.log('TurkishPix Discord AutoMod:',status.reason);
 return status;
}
