import {createHash} from 'node:crypto';
export type Cell='HIDDEN'|'SAFE'|'MINE'|'HIT'|'UNKNOWN';
export type Game='MINES'|'BLACKJACK'|'WSG'|'COINFLIP'|'SLOTS'|'BATTLE';
export type Observation={game:Game;playerId:string|null;phase:'ACTIVE'|'WIN'|'LOSS'|'PUSH'|'UNKNOWN';bet:number|null;payout:number|null;net:number|null;board:Cell[];mines:number|null;cashOut:number|null;next:number|null;failure:number|null;steps:number|null;dealer:number|null;score:number|null;advice:string;evidence:'COMPONENTS'|'TEXT'|'IMAGE_ONLY';signature:string};
const id=/^\d{17,20}$/;
function integer(s:string|undefined){if(!s)return null;const v=Number(s.replace(/[,_ .]/g,''));return Number.isSafeInteger(v)&&v>=0?v:null;}
function amount(text:string,label:string){return integer(new RegExp('(?:'+label+')\\s*[:：]?\\s*[~`*$ ]*([0-9][0-9,_. ]*)','i').exec(text)?.[1]?.trim());}
const collection=(v:any):any[]=>Array.isArray(v)?v:typeof v?.values==='function'?[...v.values()]:[];
function cell(button:any):Cell{const emoji=button.emoji?.name||button.data?.emoji?.name||'',label=button.label||button.data?.label||'',v=emoji+' '+label;if(/💥|💣.*💥|explos|explod|blast/i.test(v))return 'HIT';if(/💣|bomb|mine(?!s)/i.test(v))return 'MINE';if(/💎|diamond|gem/i.test(v))return 'SAFE';if(/\?|question|hidden|unopened/i.test(v))return 'HIDDEN';return 'UNKNOWN';}
export function minesRisk(board:Cell[],mines:number|null,bet:number|null,cashOut:number|null,next:number|null){
 const opened=board.filter(c=>c==='SAFE').length,hidden=board.filter(c=>c==='HIDDEN').length;
 if(!board.length||board.some(c=>c==='UNKNOWN')||mines===null||mines<1||mines>=board.length||hidden+opened!==board.length)return 'Kapalı kareler/oyun verisi eksik; güvenli konum önerilemez.';
 const safe=hidden-mines;if(safe<0)return 'Tahta ile mayın sayısı tutarsız; hamle yorumu yapılmadı.';
 const chance=safe/hidden,expected=next===null?null:chance*next;
 return 'Her kapalı kare eşit: güvenli çıkma '+(chance*100).toFixed(2)+'%, mayın '+((1-chance)*100).toFixed(2)+'%. Konum tahmini yapılamaz.'+(cashOut===null?'':' Mevcut Cash Out '+cashOut.toLocaleString('tr-TR')+(bet===null?'':' (net '+(cashOut-bet).toLocaleString('tr-TR')+').'))+(expected===null?'':' Bir sonraki adımın koşullu beklenen ödemesi '+expected.toLocaleString('tr-TR',{maximumFractionDigits:2})+'.')+' Cash Out, devam etmeye göre sonucu sabitler; hamle seçimi sende.';
}
/** Parse only fields that Discord actually exposes. Hidden buttons never reveal mine positions. */
export function analyzeOwoMessage(message:any):Observation|null{
 const embeds=collection(message.embeds).slice(0,10).map(e=>e.toJSON?.()||e),text=[message.content||'',...embeds.flatMap(e=>[e.title||'',e.description||'',...collection(e.fields).slice(0,25).map(f=>(f.name||'')+': '+(f.value||''))])].join('\n').slice(0,20000);
 const game:Game|null=/mines game|touched a mine|\bmines\s*:/i.test(text)?'MINES':/blackjack|\bdealer\b/i.test(text)?'BLACKJACK':/snail garden|snailgarden|\bWSG\b|failure chance/i.test(text)?'WSG':/coinflip|flipped a coin/i.test(text)?'COINFLIP':/slots|slot machine/i.test(text)?'SLOTS':/you won in \d+ turns|battle|streak.*xp|xp.*streak/i.test(text)?'BATTLE':null;
 if(!game)return null;
 const direct=/<@!?(\d{17,20})>[^\n]{0,100}(?:playing|touched|cashed|won|lost)/i.exec(text)?.[1],mentions=[...new Set([...text.matchAll(/<@!?(\d{17,20})>/g)].map(m=>m[1]))],interaction=message.interactionMetadata?.user?.id||message.interaction?.user?.id,playerId=direct||(mentions.length===1?mentions[0]:id.test(interaction||'')?interaction:null);
 const rawRows=collection(message.components).map(r=>collection(r.components||r.data?.components)),grid=rawRows.filter(r=>r.length===3&&r.every(b=>(b.type||b.data?.type)===2)).slice(0,3),board=game==='MINES'&&grid.length===3?grid.flat().map(cell):[];
 const phase:Observation['phase']=/touched a mine|you lost|you lose|lost (?:the game|[0-9])|bust|explod|💥/i.test(text)||board.includes('HIT')?'LOSS':/cashed out|you won|you win|won (?:the game|[0-9])/i.test(text)?'WIN':/tie|push|draw/i.test(text)?'PUSH':/is playing|your turn|cash out|dealer|failure chance|plant/i.test(text)?'ACTIVE':'UNKNOWN';
 const bet=amount(text,'Bet|Wager|Bahis'),cashOut=amount(text,'Cash Out'),next=amount(text,'Next'),mines=amount(text,'Mines'),steps=amount(text,'Steps'),failureRaw=/Failure Chance\s*[:：]?\s*([0-9]+(?:[.,][0-9]+)?)\s*%/i.exec(text)?.[1],failure=failureRaw?Number(failureRaw.replace(',','.')):null;
 const explicit=amount(text,'Payout|Payment|Total Won|Paid|Ödeme'),payout=phase==='LOSS'&&bet!==null?0:phase==='PUSH'?bet:phase==='WIN'?(explicit??(game==='MINES'?cashOut:null)):null,net=payout!==null&&bet!==null?payout-bet:null;
 const dealerRaw=/Dealer\s*\[\s*(10|[2-9]|[AJQK])(?:\s*\+?\s*\?)?\s*\]/i.exec(text)?.[1],dealer=dealerRaw?(/[JQK]/i.test(dealerRaw)?10:/A/i.test(dealerRaw)?11:Number(dealerRaw)):null;
 const scoreRaw=/\b(?:Player|You|Score|Total)\s*[:：]?\s*\[?\s*(\d{1,2})/i.exec(text)?.[1]||/<@!?\d{17,20}>[^\n]{0,70}\[\s*(\d{1,2})\s*\]/.exec(text)?.[1],score=scoreRaw?Number(scoreRaw):null;
 const images=embeds.some(e=>e.image?.url)||collection(message.attachments).some(a=>/^image\//.test(a.contentType||a.content_type||''));
 let advice='Ödeme veya sonuç açıkça okunamadı; net kazanç uydurulmadı.';
 if(phase==='LOSS')advice='Kaybedilmiş oyun. Üstte kalan eski Cash Out/Next tutarları kazanılmış para değildir.';
 else if(phase==='WIN'||phase==='PUSH')advice=net===null?'Oyun tamamlanmış; kesin ödeme alanı yok, net tutar bilinmiyor.':'Gözlenen ödeme '+payout?.toLocaleString('tr-TR')+' · net '+net.toLocaleString('tr-TR')+'.';
 else if(game==='MINES')advice=minesRisk(board,mines,bet,cashOut,next);
 else if(game==='BLACKJACK')advice=score===null||dealer===null?'El/dealer skoru eksik; hamle önerisi verilmedi.':'Skor '+score+' · dealer açık kartı '+dealer+'. Asın 1/11 durumu, kart bileşimi ve oyun kuralları bilinmeden kesin temel strateji önerilemez. 21 üzeri el kaybeder; 21 tamamlanmış eldir.';
 else if(game==='WSG')advice=failure===null?'Failure Chance okunamadı; risk tahmini yapılmadı.':'Gösterilen sonraki adım kayıp riski %'+failure+'. Kapalı RNG sonucu önceden bilinmez; bir çarpan kârlılık garantisi değildir.';
 else if(game==='COINFLIP'||game==='SLOTS')advice='Kazanma olasılığı ve ödeme dağılımı doğrulanmadan EV veya kazanç sıralaması hesaplanamaz.';
 else if(game==='BATTLE')advice='Battle/XP bilgisi cowoncy kazancı değildir. Raster savaş görselindeki hayvan/kart özelliklerine OCR bağlanmadı.';
 const evidence:Observation['evidence']=board.length?'COMPONENTS':images&&bet===null&&score===null?'IMAGE_ONLY':'TEXT';
 const result={game,playerId,phase,bet,payout,net,board,mines,cashOut,next,failure,steps,dealer,score,advice,evidence};
 return {...result,signature:createHash('sha256').update(JSON.stringify(result)).digest('hex')};
}
