'use client';
import {useEffect} from 'react';
export default function OsintActivity({csrf}:{csrf?:string}){
 useEffect(()=>{if(!csrf)return;const abort=new AbortController();let lastInteraction=Date.now(),inflight=false;
  const interacted=()=>{lastInteraction=Date.now();};async function beat(){if(document.hidden||inflight||Date.now()-lastInteraction>300000)return;inflight=true;try{await fetch('/api/osint/activity',{method:'POST',headers:{'x-csrf-token':csrf!},signal:abort.signal,cache:'no-store'});}catch{/* Heartbeat cannot block the workspace. */}finally{inflight=false;}}
  const events=['pointerdown','keydown','scroll'];for(const name of events)window.addEventListener(name,interacted,{passive:true});document.addEventListener('visibilitychange',beat);void beat();const timer=setInterval(()=>void beat(),30000);return()=>{abort.abort();clearInterval(timer);for(const name of events)window.removeEventListener(name,interacted);document.removeEventListener('visibilitychange',beat);};
 },[csrf]);return null;
}
