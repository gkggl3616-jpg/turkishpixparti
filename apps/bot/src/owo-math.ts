/** Descriptive statistics and explicit models, never a hidden-board predictor. */
export function wilson(successes:number,trials:number){
 if(!Number.isInteger(trials)||trials<1||!Number.isInteger(successes)||successes<0||successes>trials)return null;
 const z=1.959963984540054,p=successes/trials,d=1+z*z/trials,center=(p+z*z/(2*trials))/d,half=z*Math.sqrt(p*(1-p)/trials+z*z/(4*trials*trials))/d;
 return {rate:p,low:Math.max(0,center-half),high:Math.min(1,center+half),trials,successes};
}
export function handValue(cards:number[]){let total=cards.reduce((n,c)=>n+(c===1?1:Math.min(c,10)),0),soft=false;if(cards.includes(1)&&total+10<=21){total+=10;soft=true;}return {total,soft};}
export function cardRanks(text:string):number[]{return [...text.matchAll(/<a?:((?:10|[2-9ajqk])[schd]f?):\d{17,20}>/gi)].map(m=>{const r=/^(10|[2-9ajqk])/i.exec(m[1])![1].toLowerCase();return r==='a'?1:['j','q','k'].includes(r)?10:Number(r);});}
export function blackjackRisk(score:number|null,soft:boolean|null){
 if(score===null||!Number.isInteger(score)||score<2||score>21||soft===null)return null;
 const values=[1,2,3,4,5,6,7,8,9,10],weights=[1,1,1,1,1,1,1,1,1,4];
 const after=(v:number)=>{let n=score+(v===1&&!soft&&score+11<=21?11:v);if(soft&&n>21)n-=10;return n;};
 const bustWeights=values.reduce((n,v,index)=>n+(after(v)>21?weights[index]:0),0);
 return {bust:bustWeights/13,safe:1-bustWeights/13,soft,score,level:bustWeights/13>=0.6?'Yüksek':bustWeights/13>=0.3?'Orta':'Düşük',model:'13 rank ağırlıklı, yerine koymalı standart kart modeli; gerçek deste bileşimi bilinmediğinden yaklaşık. Bu, sonraki kartta 21 aşma riski; oyunu kaybetme olasılığı değildir.',outcomes:values.map((rank,index)=>({rank,probability:weights[index]/13,total:after(rank),bust:after(rank)>21}))};
}
type BoardRecord={playerId?:string|null;messageId?:string;board:string[];selected?:number[];mines?:number|null};
export function mineProfiles(records:BoardRecord[],filterMines?:number|null){
 const input=records.filter(r=>r.board?.length===9&&(filterMines==null||r.mines===filterMines)),cells=Array.from({length:9},(_,i)=>({position:i+1,revealed:0,safe:0,mines:0,selected:0,successfulSelections:0}));
 for(const row of input)for(const c of cells){const value=row.board[c.position-1];if(['SAFE','MINE','HIT'].includes(value)){c.revealed++;if(value==='SAFE')c.safe++;else c.mines++;if(row.selected?.includes(c.position)||value==='HIT'){c.selected++;if(value==='SAFE')c.successfulSelections++;}}}
 return {boards:input.length,mines:filterMines??null,cells:cells.map(c=>({...c,revealInterval:wilson(c.safe,c.revealed),selectionInterval:wilson(c.successfulSelections,c.selected),sample:c.selected<30?'Az örnek':'Gözlemsel örnek'})),notice:'%95 Wilson aralığı betimleyicidir; seçilen kareler seçim yanlılığı taşır. Bağımsız rastgele yeni tahtadaki gizli konumları göstermez. Farklı mayın sayıları ayrı karşılaştırılır.'};
}
export function profileSummary(profile:ReturnType<typeof mineProfiles>){const center=profile.cells[4],c=center.selectionInterval;return !c?'Orta (5): doğrulanmış kişisel seçim örneği yok.':`Orta (5): ${c.successes}/${c.trials} güvenli seçim (%${(100*c.rate).toFixed(1)}); %95 aralık %${(100*c.low).toFixed(1)}–%${(100*c.high).toFixed(1)}. ${center.sample}. Sonraki hamleyi tahmin etmez.`;}
export function publishedGambleModel(game:string){
 const distribution=game==='COINFLIP'?[{probability:0.5,multiplier:0},{probability:0.5,multiplier:2}]:game==='SLOTS'?[{probability:0.515,multiplier:0},{probability:0.2,multiplier:1},{probability:0.2,multiplier:2},{probability:0.05,multiplier:3},{probability:0.025,multiplier:4},{probability:0.01,multiplier:10}]:null;
 if(!distribution)return null;const rtp=distribution.reduce((sum,c)=>sum+c.probability*c.multiplier,0);
 return {distribution,rtp,netExpectation:rtp-1,source:'https://github.com/ChristopherBThai/Discord-OwO-Bot/tree/9aec92b274bae64ea078fc04540398713e7f7928/src/commands/commandList/gamble',notice:'Yayıncı açık kaynak snapshot modeli; canlı bot veya özel kaynak hesabının dağılımını doğrulamaz. Kısa bir sonuç serisiyle geleceği tahmin edemez.'};
}
