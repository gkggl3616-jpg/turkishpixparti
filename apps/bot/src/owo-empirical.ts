import {mineProfiles,wilson} from './owo-math';
export type Ledger={message_id:string;game:string;phase:string;player_id?:string|null;net?:string|number|null;bet?:string|number|null;state:any;source_created_at?:Date|string};
type Frame={message_id:string;phase:string;score:number|null;soft:boolean|null;source_edited_at:Date|string;recorded_at?:Date|string;state?:any};
const settled=(phase:string)=>['WIN','LOSS','PUSH'].includes(phase);
function resultRates(rows:Ledger[]){const known=rows.filter(r=>settled(r.phase)),wins=known.filter(r=>r.phase==='WIN').length,losses=known.filter(r=>r.phase==='LOSS').length,pushes=known.filter(r=>r.phase==='PUSH').length;return {games:known.length,wins,losses,pushes,rate:known.length?wins/known.length:null,interval:wilson(wins,known.length)};}
export function blackjackObserved(rows:Ledger[],frames:Frame[]){
 const outcomes=new Map(rows.filter(r=>r.game==='BLACKJACK'&&settled(r.phase)).map(r=>[r.message_id,r]));
 const active=frames.filter(f=>f.phase==='ACTIVE'&&f.score!==null&&f.score>=2&&f.score<=21&&outcomes.has(f.message_id)).sort((a,b)=>new Date(a.source_edited_at).getTime()-new Date(b.source_edited_at).getTime());
 const bins=new Map<string,{score:number;soft:boolean|null;rows:Map<string,Ledger>}>(),first=new Map<string,Frame>();
 for(const f of active){if(!first.has(f.message_id))first.set(f.message_id,f);const key=f.score+':'+f.soft,b= bins.get(key)||{score:f.score!,soft:f.soft,rows:new Map()};b.rows.set(f.message_id,outcomes.get(f.message_id)!);bins.set(key,b);}
 const byScore=[...bins.values()].map(b=>({score:b.score,soft:b.soft,...resultRates([...b.rows.values()])})).sort((a,b)=>a.score-b.score||Number(a.soft)-Number(b.soft));
 const initial=[...first.values()],thresholds=Array.from({length:19},(_,n)=>n+3).map(threshold=>{const below=resultRates(initial.filter(f=>f.score!<threshold).map(f=>outcomes.get(f.message_id)!)),above=resultRates(initial.filter(f=>f.score!>=threshold).map(f=>outcomes.get(f.message_id)!));return {threshold,below,above,difference:below.rate!==null&&above.rate!==null?above.rate-below.rate:null,adequate:below.games>=20&&above.games>=20};});
 const best=thresholds.filter(t=>t.adequate&&t.difference!==null).sort((a,b)=>Math.abs(b.difference!)-Math.abs(a.difference!))[0]||null;
 const terminal=new Map<number,Ledger[]>();for(const row of outcomes.values()){const score=row.state.score;if(Number.isInteger(score)){const entries=terminal.get(score)||[];entries.push(row);terminal.set(score,entries);}}
 return {byScore,thresholds,best,observedActiveGames:first.size,terminalScores:[...terminal].map(([score,r])=>({score,...resultRates(r)})).sort((a,b)=>a.score-b.score),
  notice:'Oranlar taranan OwO sonuçlarıdır. El toplamı, hamle sırasında gerçekten gözlenmiş kayıttan sonuca bağlanır; aynı oyun bir el satırında bir kez sayılır. Eşik karşılaştırması ilk gözlenen aktif elden yapılır. Son el tablosu ayrıdır; geçmiş düzenlemeler geri getirilemez. Gözlenen ilişki, o sayıda durmanın kazanmayı artırdığını kanıtlamaz.'};
}
// Infer only visible transitions; Discord does not expose another app's button clicks.
export function blackjackActions(rows:Ledger[],frames:Frame[],score:number|null,soft:boolean|null,dealer:number|null){
 const outcomes=new Map(rows.filter(r=>r.game==='BLACKJACK'&&settled(r.phase)).map(r=>[r.message_id,r])),groups=new Map<string,Frame[]>();
 for(const f of frames){const group=groups.get(f.message_id)||[];group.push(f);groups.set(f.message_id,group);}
 const hit=new Map<string,Ledger>(),stand=new Map<string,Ledger>();
 for(const [id,group] of groups){const outcome=outcomes.get(id);if(!outcome)continue;group.sort((a,b)=>new Date(a.source_edited_at).getTime()-new Date(b.source_edited_at).getTime());
 for(let n=0;n<group.length-1;n++){const f=group[n],next=group[n+1],cards=f.state?.cards,after=next.state?.cards;
 if(f.phase!=='ACTIVE'||f.score!==score||f.soft!==soft||f.state?.dealer!==dealer||!cards?.length||!after?.length)continue;
 const same=cards.length===after.length&&cards.every((c:number,k:number)=>c===after[k]);
 if(after.length>cards.length&&cards.every((c:number,k:number)=>c===after[k]))hit.set(id,outcome);
 else if(same&&settled(next.phase)&&Number(f.score)<21)stand.set(id,outcome);
 }}
 return {hit:resultRates([...hit.values()]),stand:resultRates([...stand.values()]),notice:'Hamleler gözlenen kart değişiminden çıkarılır; tıklama kaydı değildir.'};
}
export function advisorText(observation:any,rows:Ledger[],frames:Frame[]){
 if(!observation)return 'Senin oyun mesajın bekleniyor.';
 if(observation.phase!=='ACTIVE')return 'Sonuç: '+observation.phase+' · '+(observation.net===null?'net tutar bilinmiyor':'net '+observation.net);
 if(observation.game==='MINES'){
 const report=observedReport(rows,frames,observation.mines),candidates=report.mines.cells.filter((c:any)=>observation.board[c.position-1]==='HIDDEN'&&c.revealed>=20).sort((a:any,b:any)=>a.mines/a.revealed-b.mines/b.revealed);
 const rowsText=report.mines.cells.map((c:any)=>c.position+': '+(c.revealed?'mayın %'+(100*c.mines/c.revealed).toFixed(1)+' (n='+c.revealed+')':'veri yok')).join(' · ');
 return (candidates.length?'Geçmişte en düşük gözlenen mayın oranı: '+candidates[0].position+'. hücre.':'Hücre önermek için aynı mayın sayısında en az 20 açıklanmış örnek gerekli.')+'\n'+rowsText+'\nAçık elmas/mayınlar mesajdan okunur; kapalı hücreler yalnız geçmiş frekansıdır. Sonraki tahta konumu kesin bilinemez.';
 }
 if(observation.game==='BLACKJACK'){
 const data=blackjackActions(rows,frames,observation.score,observation.soft,observation.dealer),enough=data.hit.games>=20&&data.stand.games>=20;
 const detail='El '+observation.score+' · krupiye '+(observation.dealer??'?')+'\nKart çek: '+(data.hit.rate===null?'veri yok':(100*data.hit.rate).toFixed(1)+'% kazanım')+' (n='+data.hit.games+')\nPas: '+(data.stand.rate===null?'veri yok':(100*data.stand.rate).toFixed(1)+'% kazanım')+' (n='+data.stand.games+')';
 const separated=enough&&((data.hit.interval!.low>data.stand.interval!.high)||(data.stand.interval!.low>data.hit.interval!.high));
 const decision=observation.score===21?'Pas: görünen el toplamı 21.':separated?(data.hit.rate!>data.stand.rate!?'Kart çek':'Pas')+' · taramada benzer ellerin gözlenen sonucu daha yüksek.':'Kart çek / Pas seçimi için yeterli ayrışmış örnek yok; kesin hamle üretilmedi.';
 return decision+'\n'+detail+'\n'+data.notice+' Geçmiş oranlar nedensel veya garantili kazanç değildir.';
 }
 if(observation.game==='COINFLIP'){
 const coin=rows.filter(r=>r.game==='COINFLIP'&&settled(r.phase));return ['HEADS','TAILS'].map(choice=>{const data=resultRates(coin.filter(r=>r.state.choice===choice));return choice+': '+data.wins+'/'+data.games+' gözlenen kazanım';}).join(' · ')+'\nÖnceki sonuç bir sonraki yazı/turayı belirlemez.';
 }
 return observation.advice;
}
function canonical(positions:number[]){const variants:string[]=[];for(let flip=0;flip<2;flip++)for(let rotation=0;rotation<4;rotation++){const transformed=positions.map(p=>{let r=Math.floor((p-1)/3),c=(p-1)%3;if(flip)c=2-c;for(let k=0;k<rotation;k++){const old=r;r=c;c=2-old;}return r*3+c+1;});variants.push(transformed.sort((a,b)=>a-b).join('-'));}return variants.sort()[0];}
export function minesPatterns(rows:Ledger[],mines?:number|null){
 const full=rows.filter(r=>r.game==='MINES'&&settled(r.phase)&&r.state.board?.length===9&&r.state.board.every((c:string)=>['SAFE','MINE','HIT'].includes(c))&&(mines==null||r.state.mines===mines)).map(r=>({id:r.message_id,mines:r.state.mines,positions:r.state.board.flatMap((c:string,n:number)=>['MINE','HIT'].includes(c)?[n+1]:[])})).filter(r=>r.positions.length===r.mines);
 const exact=new Map<string,{mines:number;positions:number[];count:number}>(),geometry=new Map<string,number>();for(const row of full){const key=row.mines+':'+row.positions.join('-'),v=exact.get(key)||{mines:row.mines,positions:row.positions,count:0};v.count++;exact.set(key,v);const g=row.mines+':'+canonical(row.positions);geometry.set(g,(geometry.get(g)||0)+1);}
 return {completeBoards:full.length,distinctLayouts:exact.size,repeated:[...exact.values()].filter(r=>r.count>1).sort((a,b)=>b.count-a.count).slice(0,5),maxGeometricRepeat:Math.max(0,...geometry.values()),evidence:full.length<30?'Örnek yetersiz':'Betimleyici tekrar analizi',notice:'Aynı veya döndürülmüş/yansıtılmış tahta tekrarları sayılır. Tekrar görmek sabit senaryo veya sonraki gizli mayınları bulma kanıtı değildir; bilinmeyen hücreler örüntü hesabına girmez.'};
}
export function observedReport(rows:Ledger[],frames:Frame[],mineCount?:number|null){
 const games=[...new Set(rows.map(r=>r.game))].map(game=>{const records=rows.filter(r=>r.game===game),rates=resultRates(records),money=records.filter(r=>settled(r.phase)&&r.net!==null&&r.net!==undefined),net=money.reduce((n,r)=>n+BigInt(r.net!),0n),bet=money.reduce((n,r)=>n+BigInt(r.bet||0),0n);return {game,...rates,unknown:records.filter(r=>!settled(r.phase)).length,moneyKnown:money.length,moneyUnknown:rates.games-money.length,net:net.toString(),knownBets:bet.toString(),roi:bet>0n?Number(net)/Number(bet):null};});
 const byProfit=games.filter(g=>g.moneyKnown>0).sort((a,b)=>BigInt(a.net)===BigInt(b.net)?0:BigInt(a.net)>BigInt(b.net)?-1:1),best=byProfit[0]||null;
 const boards=rows.filter(r=>r.game==='MINES'&&settled(r.phase)).map(r=>({messageId:r.message_id,board:r.state.board||[],selected:r.state.selected||[],mines:r.state.mines})),counts=[...new Set(boards.map(b=>b.mines).filter(n=>Number.isInteger(n)))];
 return {games,bestGame:best?{...best,profitable:BigInt(best.net)>0n}:null,blackjack:blackjackObserved(rows,frames),mines:mineProfiles(boards,mineCount??boards.find(b=>Number.isInteger(b.mines))?.mines??null),mineCohorts:counts.map(m=>mineProfiles(boards,m)),patterns:minesPatterns(rows,mineCount),records:rows.length,notice:'Yalnız seçilen tarih dönemindeki taranan mesajlar. Bilinmeyen sonuçlar başarısız veya sıfır kazanç sayılmaz. En yüksek gözlenen net, gelecekte en iyi oyun demek değildir.'};
}
