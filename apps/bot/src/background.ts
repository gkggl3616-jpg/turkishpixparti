import {discordErrorDetails} from '@turkishpix/core';
type Task={running?:Promise<void>;started:number;finished?:number;duration?:number};
/** Single-flight tasks share bounded capacity, without blocking other modules. */
export class BackgroundTasks {
 private tasks=new Map<string,Task>();private stopping=false;
 constructor(private capacity=6,private report:(name:string,data:any)=>void=(name,data)=>console.error(name,JSON.stringify(data))){}
 run(name:string,interval:number,work:()=>Promise<unknown>){
  const old=this.tasks.get(name),now=Date.now();if(this.stopping||old?.running||old&&now-old.started<interval||[...this.tasks.values()].filter(t=>t.running).length>=this.capacity)return false;
  const task:Task={started:now};this.tasks.set(name,task);
  task.running=Promise.resolve().then(work).then(()=>{}).catch(e=>{this.report('BOT_TASK_FAILED',{task:name,...discordErrorDetails(e)});}).finally(()=>{task.duration=Date.now()-task.started;task.finished=Date.now();task.running=undefined;if(task.duration>15000)this.report('BOT_TASK_SLOW',{task:name,durationMs:task.duration});});return true;
 }
 snapshot(){return Object.fromEntries([...this.tasks].map(([name,t])=>[name,{running:!!t.running,durationMs:t.duration??null}]));}
 async stop(timeout=10000){this.stopping=true;let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([Promise.all([...this.tasks.values()].map(t=>t.running)),new Promise(resolve=>{timer=setTimeout(resolve,timeout);})]);}finally{if(timer)clearTimeout(timer);}}
}
