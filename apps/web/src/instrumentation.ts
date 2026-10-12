export async function register(){
 if(process.env.NEXT_RUNTIME!=='nodejs'||process.env.OSINT_ONLY!=='true')return;
 const {liveInboxTick}=await import('../../../packages/core/src/osint-live-inbox');
 const {probeOsintProviders}=await import('../../../packages/core/src/osint-admin');
 const {loadServerSettings}=await import('../../../packages/core/src/setup');
 const state=globalThis as typeof globalThis&{osintInboxWorker?:NodeJS.Timeout};
 if(state.osintInboxWorker)return;
 let busy=false;
 state.osintInboxWorker=setInterval(async()=>{if(busy)return;busy=true;try{await loadServerSettings();await liveInboxTick();}catch(e){console.error('OSINT_INBOX_WORKER',e instanceof Error?e.name:'ERROR');}finally{busy=false;}},1000);
 state.osintInboxWorker.unref();
 let probing=false;
 const probe=async()=>{if(probing)return;probing=true;try{await loadServerSettings();await probeOsintProviders();}catch(e){console.error('OSINT_SOURCE_CHECK',e instanceof Error?e.name:'ERROR');}finally{probing=false;}};
 setTimeout(()=>void probe(),5000).unref();
 setInterval(()=>void probe(),15*60000).unref();
}
