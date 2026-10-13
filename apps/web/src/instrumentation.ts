export async function register(){
 if(process.env.NEXT_RUNTIME!=='nodejs'||process.env.OSINT_ONLY!=='true')return;
 const {liveInboxTick}=await import('../../../packages/core/src/osint-live-inbox');
 const {probeOsintProviders}=await import('../../../packages/core/src/osint-admin');
 const {probeSocialProviders}=await import('../../../packages/core/src/osint-social');
 const {loadServerSettings}=await import('../../../packages/core/src/setup');
 const {refreshOsintGuildMembers}=await import('../../../packages/core/src/osint-live-admin');
 const state=globalThis as typeof globalThis&{osintInboxWorker?:NodeJS.Timeout};
 if(state.osintInboxWorker)return;
 let busy=false;
 state.osintInboxWorker=setInterval(async()=>{if(busy)return;busy=true;try{await loadServerSettings();await liveInboxTick();}catch(e){console.error('OSINT_INBOX_WORKER',e instanceof Error?e.name:'ERROR');}finally{busy=false;}},1000);
 state.osintInboxWorker.unref();
 let memberBusy=false,lastMemberState='';const memberProbe=async()=>{if(memberBusy)return;memberBusy=true;try{await loadServerSettings();const summary=await refreshOsintGuildMembers(),key=JSON.stringify([summary.state,summary.members,summary.complete,summary.stale]);if(key!==lastMemberState){lastMemberState=key;console.log('OSINT_GUILD_MEMBERS',JSON.stringify(summary));}}catch(e){console.error('OSINT_GUILD_MEMBERS',e instanceof Error?e.name:'ERROR');}finally{memberBusy=false;}};
 setTimeout(()=>void memberProbe(),3000).unref();setInterval(()=>void memberProbe(),30000).unref();
 let probing=false;
 const probe=async()=>{if(probing)return;probing=true;try{await loadServerSettings();await probeOsintProviders(['cloudflare','mullvad']);}catch(e){console.error('OSINT_SOURCE_CHECK',e instanceof Error?e.name:'ERROR');}finally{probing=false;}};
 let socialBusy=false;const socialProbe=async()=>{if(socialBusy)return;socialBusy=true;try{await loadServerSettings();await probeSocialProviders();}catch(e){console.error('OSINT_SOCIAL_CHECK',e instanceof Error?e.name:'ERROR');}finally{socialBusy=false;}};
 setTimeout(()=>void socialProbe(),8000).unref();
 setInterval(()=>void socialProbe(),60*60000).unref();
 setTimeout(()=>void probe(),5000).unref();
 setInterval(()=>void probe(),15*60000).unref();
}
