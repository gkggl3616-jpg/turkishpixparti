import type {Client,Guild} from 'discord.js';

// A ready Gateway can briefly lack GUILD_CREATE. Verify membership over REST
// before restoring the target guild and letting guild-specific workers run.
export function createGuildRecovery(client:Client,guildId:()=>string,clock:()=>number=Date.now){
 let lastAttempt=-Infinity,running=false;
 return async():Promise<Guild|null>=>{
  if(!client.isReady())return null;
  const id=guildId(),cached=client.guilds.cache.get(id);
  if(cached?.available&&cached.members.me)return cached;
  if(running||clock()-lastAttempt<30000)return null;
  running=true;lastAttempt=clock();
  try{
   const guild=await client.guilds.fetch({guild:id,force:true,cache:false});
   await guild.members.fetchMe();
   await guild.roles.fetch();
   await guild.channels.fetch();
   client.guilds.cache.set(id,guild);
   console.log('CONFIGURED_GUILD_READY',JSON.stringify({guildId:id,source:'rest',memberCount:guild.memberCount}));
   return guild;
  }catch(e){
   const code=(e as any)?.code;
   // No exception text: REST errors can include request headers or payloads.
   console.error('CONFIGURED_GUILD_PENDING',JSON.stringify({guildId:id,gatewayGuilds:client.guilds.cache.size,code:typeof code==='number'||typeof code==='string'?code:'INTERNAL',membershipBlocked:code===10004||code===50001||code===50013}));
   return null;
  }finally{running=false;}
 };
}
