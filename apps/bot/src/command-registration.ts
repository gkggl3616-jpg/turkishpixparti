import {discordRequest,DiscordAPIError} from '../../../packages/core/src/discord';
import {DomainError} from '../../../packages/core/src/config';

export function commandRetryDelay(error:unknown,failures=1){
 const retry=error instanceof DiscordAPIError&&Number.isFinite(error.retryAfter)?error.retryAfter*1000:0;
 return Math.max(retry+1000,Math.min(15*60_000,30_000*2**Math.min(5,Math.max(0,failures-1))));
}
/** Each successful stage is retained; throttled registration never stops XP or delivery workers. */
export class CommandRegistrar {
 private globals=new Set<string>();private guild='';private cleaned=false;
 private retryAt=0;private failures=0;
 constructor(private request:typeof discordRequest=discordRequest,private now=()=>Date.now()){}
 resetGuild(){this.guild='';}
 hasGlobal(name:string){return this.globals.has(name);}
 async sync(clientId:string,guildId:string,globalCommands:any[],guildCommands:any[],validateGuild:(saved:any[])=>void){
  const globalReady=()=>globalCommands.every(c=>this.globals.has(c.name));
  if(this.now()<this.retryAt)return {ready:false,globalsReady:globalReady(),retryMs:this.retryAt-this.now()};
  try{
   for(const command of globalCommands){
    if(this.globals.has(command.name))continue;
    const saved=await this.request('/applications/'+clientId+'/commands',{method:'POST',body:JSON.stringify(command)});
    if(saved?.name!==command.name)throw new DomainError('COMMAND_REGISTRATION_FAILED','Genel komut kaydı doğrulanamadı.');
    this.globals.add(command.name);
   }
   if(!this.cleaned){
    const old=await this.request('/applications/'+clientId+'/commands');
    if(!Array.isArray(old))throw new DomainError('COMMAND_REGISTRATION_FAILED','Komut listesi doğrulanamadı.');
    for(const command of old)if(['osint','proxy','tempmail'].includes(command.name)&&/^\d{17,20}$/.test(command.id))await this.request('/applications/'+clientId+'/commands/'+command.id,{method:'DELETE'});
    this.cleaned=true;
   }
   if(this.guild!==guildId){
    const saved=await this.request('/applications/'+clientId+'/guilds/'+guildId+'/commands',{method:'PUT',body:JSON.stringify(guildCommands.map(({contexts,integration_types,...c})=>c))});
    if(!Array.isArray(saved)||saved.length!==guildCommands.length)throw new DomainError('COMMAND_REGISTRATION_FAILED','Sunucu komut kaydı doğrulanamadı.');
    validateGuild(saved);this.guild=guildId;
   }
   this.failures=0;this.retryAt=0;return {ready:true,globalsReady:true,retryMs:0};
  }catch(error){
   const retryMs=commandRetryDelay(error,++this.failures);this.retryAt=this.now()+retryMs;
   return {ready:false,globalsReady:globalReady(),error,retryMs};
  }
 }
}
