import {currencyCampaignStatus,snapshotCurrencyCampaign,applyCurrencyCampaignBatch,DomainError,RELEASE_VERSION} from '@turkishpix/core';
let running=false,done=false,lastAttempt=0;
export async function runCurrencyGrant(guild:any){
 if(running||done||Date.now()-lastAttempt<30000)return;running=true;lastAttempt=Date.now();
 try{
  let status=await currencyCampaignStatus();
  if(!status){
   const members=new Map<string,any>();let after:string|undefined;
   for(let page=0;page<20;page++){
    const batch=await guild.members.list({limit:1000,after});
    for(const member of batch.values())if(!member.user.bot)members.set(member.id,{id:member.id,username:member.user.username,avatar:member.user.avatar});
    if(batch.size<1000)break;
    const next=[...batch.keys()].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1).at(-1);if(!next||next===after)throw new DomainError('MEMBER_LIST_INCOMPLETE','Üye listesi tamamlanamadı.');after=next;
    if(page===19)throw new DomainError('MEMBER_LIST_INCOMPLETE','Üye listesi sınırı aşıldı.');
   }
   status=await snapshotCurrencyCampaign([...members.values()]);
  }
  if(status.status==='DONE'){done=true;console.log('COMMUNITY_CURRENCY_READY',JSON.stringify({version:RELEASE_VERSION,amount:50000,paid:status.paid,recipients:status.recipients,repeated:false}));return;}
  for(let batch=0;batch<200;batch++){
   const result=await applyCurrencyCampaignBatch();
   if(result.done){done=true;console.log('COMMUNITY_CURRENCY_READY',JSON.stringify({version:RELEASE_VERSION,...result,repeated:false}));break;}
  }
 }catch(e){console.error('COMMUNITY_CURRENCY_PENDING',e instanceof DomainError?e.code:(e as any)?.code||'INTERNAL');}
 finally{running=false;}
}
