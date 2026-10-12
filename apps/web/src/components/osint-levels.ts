export const RANKS=[
 {level:0,name:'Acemi',code:'INITIATE'},
 {level:5,name:'Deneyimli',code:'OPERATOR'},
 {level:10,name:'Analist',code:'ANALYST'},
 {level:20,name:'Uzman',code:'SPECIALIST'},
 {level:40,name:'Elit',code:'ELITE'}
] as const;
export function rankOf(level:number){return [...RANKS].reverse().find(r=>Number.isFinite(level)&&level>=r.level)||RANKS[0];}
export function levelProgress(xp:number,level:number){
 const previousXp=100*level*level,nextXp=100*(level+1)*(level+1);
 const percent=Math.max(0,Math.min(100,100*(xp-previousXp)/Math.max(1,nextXp-previousXp)));
 return {previousXp,nextXp,remaining:Math.max(0,nextXp-xp),percent};
}
