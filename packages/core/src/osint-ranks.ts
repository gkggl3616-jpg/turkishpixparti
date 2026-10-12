/** Turkish labels for the EXISTING Discord XP levels. Does not change XP awards or usage quotas. */
export const osintRanks=[
 {minLevel:0,title:'Acemi',short:'I',description:'Araştırma ağına yeni katıldın.',color:'#91a8b5'},
 {minLevel:5,title:'Deneyimli',short:'II',description:'Temel analiz ve kaynak taramalarında deneyim kazandın.',color:'#72adcf'},
 {minLevel:10,title:'Analist',short:'Veri kaynaklarını ilişkilendiren araştırmacı.',color:'#a49be2'},
 {minLevel:20,title:'Kıdemli Analist',short:'IV',description:'Gelişmiş ağ ve tehdit verilerinde uzman.',color:'#daa97a'},
 {minLevel:40,title:'Baş Analist',short:'V',description:'Araştırma ağının en üst erişim kademesi.',color:'#d6bf88'}
] as const;
export function osintRank(level:number){
 const current=[...osintRanks].reverse().find(r=>level>=r.minLevel)||osintRanks[0];
 const next=osintRanks.find(r=>r.minLevel>level);
 return {name:current.title,grade:current.short,accent:current.color,description:current.description,requiredLevel:current.minLevel,nextRank:next?.title??null,nextRankLevel:next?.minLevel??null};
}
export function osintXpProgress(xp:number){
 const level=Math.floor(Math.sqrt(Math.max(xp,0)/100)),start=level*level*100,end=(level+1)*(level+1)*100;
 return {level,currentLevelXp:start,nextLevelXp:end,intoLevel:Math.max(0,xp-start),toNextLevel:Math.max(0,end-xp),percent:Math.min(100,Math.max(0,Math.round(100*(xp-start)/(end-start))))};
}
