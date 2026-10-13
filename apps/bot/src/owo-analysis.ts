import {createHash} from 'node:crypto';
import {cardRanks,handValue} from './owo-math';
export type Cell='HIDDEN'|'SAFE'|'MINE'|'HIT'|'UNKNOWN';
export type Game='MINES'|'BLACKJACK'|'WSG'|'COINFLIP'|'SLOTS'|'BATTLE'|`CATALOG:${string}`;
export type Observation={game:Game;playerId:string|null;playerName:string|null;identity:'EXPLICIT'|'AVATAR'|'COMMAND_MATCH'|'UNKNOWN';phase:'ACTIVE'|'WIN'|'LOSS'|'PUSH'|'UNKNOWN';bet:number|null;payout:number|null;net:number|null;board:Cell[];selected:number[];mines:number|null;cashOut:number|null;next:number|null;failure:number|null;steps:number|null;dealer:number|null;score:number|null;soft:boolean|null;cards:number[];choice:'HEADS'|'TAILS'|null;advice:string;evidence:'COMPONENTS'|'TEXT'|'IMAGE_ONLY'|'OCR';ocr?:{status:string;confidence:number;text:string;trustedText:string};signature:string};
const id=/^\d{17,20}$/;
const collection=(v:any):any[]=>Array.isArray(v)?v:typeof v?.values==='function'?[...v.values()]:[];
export function normalizeOwoName(s:string){return s.normalize('NFKC').replace(/<a?:[\w]+:\d{17,20}>/g,'').replace(/[*`~]/g,'').trim().toLocaleLowerCase('en-US').slice(0,128);}
function plain(s:string){return s.replace(/<a?:[\w]+:\d{17,20}>/g,' ').replace(/[*`~]/g,'').replace(/[^\S\n]+/g,' ');}
function integer(s:string|undefined){if(!s)return null;const v=Number(s.replace(/[,_ .]/g,''));return Number.isSafeInteger(v)&&v>=0?v:null;}
function amount(text:string,label:string){return integer(new RegExp('(?:'+label+')\\s*[:：]?\\s*[~`*$ ]*([0-9][0-9,_. ]*)','i').exec(text)?.[1]?.trim());}
function avatarId(embeds:any[]){
 const candidates=embeds.map(e=>e.author?.icon_url||e.author?.iconURL).filter(Boolean).flatMap(s=>{try{const u=new URL(s);return ['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)?[/^\/avatars\/(\d{17,20})\//.exec(u.pathname)?.[1]||/^\/guilds\/\d{17,20}\/users\/(\d{17,20})\/avatars\//.exec(u.pathname)?.[1]].filter(Boolean):[];}catch{return [];}});
 return new Set(candidates).size===1?candidates[0] as string:null;
}
function cell(button:any):Cell{const v=(button.emoji?.name||button.data?.emoji?.name||'')+' '+(button.label||button.data?.label||'');if(/💥|explos|explod|blast|boom/i.test(v))return 'HIT';if(/💣|bomb|mine(?!s)/i.test(v))return 'MINE';if(/💎|diamond|gem/i.test(v))return 'SAFE';if(/\?|question|hidden|unopened/i.test(v))return 'HIDDEN';return 'UNKNOWN';}
export function signatureFor(observation:Omit<Observation,'signature'>|Observation){const {signature:_,...data}=observation as Observation;return createHash('sha256').update(JSON.stringify(data)).digest('hex');}
export function minesRisk(board:Cell[],mines:number|null,bet:number|null,cashOut:number|null,next:number|null){
 return 'Görünen tahta kaydedildi. Hücre oranları bu dönemde taranan sonuçlardan hesaplanır; kapalı hücreye kesin konum atanmaz.';
}
/** Read fields Discord exposes, including author/footer and custom card emoji names. */
export function analyzeOwoMessage(message:any):Observation|null{
 const embeds=collection(message.embeds).slice(0,10).map(e=>e.toJSON?.()||e),fields=embeds.flatMap(e=>collection(e.fields).slice(0,25));
 const raw=[message.content||'',...embeds.flatMap(e=>[e.title||'',e.author?.name||'',e.description||'',...collection(e.fields).slice(0,25).map(f=>(f.name||'')+': '+(f.value||'')),e.footer?.text||''])].join('\n').slice(0,20000),text=plain(raw);
 const game:Game|null=/mines game|touched a mine|\bmines\s*:/i.test(text)?'MINES':/blackjack|\bdealer\b/i.test(text)?'BLACKJACK':/snail garden|snailgarden|\bWSG\b|failure chance/i.test(text)?'WSG':/coinflip|flipped a coin|the coin spins/i.test(text)?'COINFLIP':/slots|slot machine/i.test(text)?'SLOTS':/you won in \d+ turns|goes into battle|battle|streak.*xp|xp.*streak/i.test(text)?'BATTLE':null;
 if(!game)return null;
 const direct=/<@!?(\d{17,20})>[^\n]{0,100}(?:playing|started|touched|cashed|won|lost)/i.exec(text)?.[1],mentions=[...new Set([...text.matchAll(/<@!?(\d{17,20})>/g)].map(m=>m[1]))],interaction=message.interactionMetadata?.user?.id||message.interaction?.user?.id;
 const explicit=direct||(mentions.length===1?mentions[0]:id.test(interaction||'')?interaction:null),avatar=avatarId(embeds),playerId=explicit||avatar;
 const playerField=game==='BLACKJACK'?fields.find(f=>!/^dealer\b/i.test(plain(f.name||''))&&/\[\s*\d{1,2}\s*\]/.test(plain(f.name||''))):null;
 let playerName:string|null=playerField?normalizeOwoName(plain(playerField.name).split('[')[0]):null;
 if(!playerName&&game==='BLACKJACK')playerName=normalizeOwoName(embeds.map(e=>e.author?.name||'').find(s=>/you bet/i.test(s))?.split(/,?\s*you bet/i)[0]||'')||null;
 if(!playerName&&['COINFLIP','SLOTS'].includes(game)){const line=text.split('\n').find(s=>/\b(?:spent|bet)\b/i.test(s));playerName=line?normalizeOwoName(line.split(/\b(?:spent|bet)\b/i)[0].replace(/^\s*[|\s]+/,''))||null:null;}
 const rawRows=collection(message.components).map(r=>collection(r.components||r.data?.components)),grid=rawRows.filter(r=>r.length===3&&r.every(b=>(b.type||b.data?.type)===2)).slice(0,3),buttons=grid.flat(),board=game==='MINES'&&grid.length===3?buttons.map(cell):[];
 const selected=board.flatMap((c,index)=>c==='HIT'||c==='SAFE'&&(buttons[index]?.style||buttons[index]?.data?.style)===3?[index+1]:[]);
 // Both-bust and tied games return the stake in the published Blackjack implementation.
 const phase:Observation['phase']=/you both bust|you tied|\b(?:result|status)[:\s]+(?:tie|push|draw)\b|^\s*(?:tie|push|draw)\s*$/im.test(text)?'PUSH':/touched a mine|you lost|you lose|lost (?:the game|[0-9])|lost it all|won nothing|you bust|went bust|explod|💥/i.test(text)||board.includes('HIT')?'LOSS':/cashed out|you won|you win|\band won\b|won (?:the game|[0-9])/i.test(text)?'WIN':/is playing|started a mines|your turn|cash out|dealer|failure chance|plant|the coin spins|\bbet\b/i.test(text)?'ACTIVE':'UNKNOWN';
 const bet=amount(text,'Bet|Wager|Bahis|spent'),cashOut=amount(text,'Cash Out'),next=amount(text,'Next'),mines=amount(text,'Mines'),steps=amount(text,'Steps'),failureRaw=/Failure Chance\s*[:：]?\s*([0-9]+(?:[.,][0-9]+)?)\s*%/i.exec(text)?.[1],fv=failureRaw?Number(failureRaw.replace(',','.')):NaN,failure=Number.isFinite(fv)&&fv>=0&&fv<=100?fv:null;
 const displayed=amount(text,'Payout|Payment|Total Won|Paid|Ödeme'),won=amount(text,'(?:you |and )?won');
 let payout:number|null=phase==='LOSS'&&bet!==null?0:phase==='PUSH'?bet:phase==='WIN'?(displayed??(game==='MINES'?cashOut:['COINFLIP','SLOTS'].includes(game)?won:null)):null;
 // The official source's Blackjack footer is net winnings; the credited payment is bet + winnings.
 if(game==='BLACKJACK'&&phase==='WIN'&&payout===null&&bet!==null&&won!==null&&/to play blackjack/i.test(text))payout=Number.isSafeInteger(bet+won)?bet+won:null;
 if(game==='BATTLE')payout=null;
 const net=payout!==null&&bet!==null?payout-bet:null;
 const dealerField=fields.find(f=>/^dealer\b/i.test(plain(f.name||''))),dealerCards=cardRanks(dealerField?.value||'');
 const dealerRaw=/Dealer\s*\[\s*(\d{1,2}|[AJQK])(?:\s*\+?\s*\?)?\s*\]/i.exec(text)?.[1],dealer=dealerRaw?(/[JQK]/i.test(dealerRaw)?10:/A/i.test(dealerRaw)?11:Number(dealerRaw)):dealerCards[0]??null;
 const scoreRaw=playerField?/\[\s*(\d{1,2})\s*\]/.exec(plain(playerField.name))?.[1]:/\b(?:Player|You|Score|Total)\s*[:：]?\s*\[?\s*(\d{1,2})/i.exec(text)?.[1]||/<@!?\d{17,20}>[^\n]{0,70}\[\s*(\d{1,2})\s*\]/.exec(text)?.[1],score=scoreRaw?Number(scoreRaw):null;
 const cards=cardRanks(playerField?.value||''),value=cards.length?handValue(cards):null;
 const soft:boolean|null=value?value.total===score?value.soft:null:playerField?/\]\s*\*/.test(playerField.name):/\[\s*\d{1,2}\s*\]\s*\*/.test(raw)?true:null;
 const choice:'HEADS'|'TAILS'|null=game==='COINFLIP'?/chose\s+heads/i.test(text)?'HEADS':/chose\s+tails/i.test(text)?'TAILS':null:null;
 const images=embeds.some(e=>e.image?.url)||collection(message.attachments).some(a=>/^image\//.test(a.contentType||a.content_type||''));
 let advice='Ödeme veya sonuç açıkça okunamadı; net kazanç uydurulmadı.';
 if(phase==='LOSS')advice='Kaybedilmiş oyun.'+(game==='MINES'?' Üstte kalan eski Cash Out/Next tutarları kazanılmış para değildir.':'')+(net===null?' Kesin ödeme bilinmiyor.':' Net '+net.toLocaleString('tr-TR')+' cowoncy.');
 else if(phase==='WIN'||phase==='PUSH')advice=game==='BATTLE'?'Battle/XP bilgisi cowoncy kazancı değildir. Görsel metni OCR kuyruğunda okunur; düşük güvenli alanlar kesin sonuç sayılmaz.':net===null?'Oyun tamamlanmış; kesin ödeme alanı yok, net tutar bilinmiyor.':'Gözlenen ödeme '+payout?.toLocaleString('tr-TR')+' · net '+net.toLocaleString('tr-TR')+'.';
 else if(game==='MINES')advice=minesRisk(board,mines,bet,cashOut,next);
 else if(game==='BLACKJACK')advice='Gözlenen el '+(score??'?')+' · '+(soft===null?'As durumu bilinmiyor':soft?'soft':'hard')+'. Kazanma/kaybetme oranları taranan sonuç ve kaydedilmiş ara ellerden hesaplanır; hazır deste yüzdesi kullanılmaz.';
 else if(game==='WSG')advice=failure===null?'Failure Chance okunamadı; risk tahmini yapılmadı.':'Gösterilen sonraki adım kayıp riski %'+failure+'. Kapalı RNG sonucu önceden bilinmez; bir çarpan kârlılık garantisi değildir.';
 else if(game==='COINFLIP'||game==='SLOTS')advice='Kazanma oranı ve net sonuç yalnız taranan mesajlardan hesaplanır. Örnek sayısı belirtilir; bilinmeyen sonuçlar başarı veya kayıp sayılmaz.';
 else if(game==='BATTLE')advice='Battle/XP bilgisi cowoncy kazancı değildir. Görsel metni OCR kuyruğunda okunur; düşük güvenli alanlar kesin sonuç sayılmaz.';
 const evidence:Observation['evidence']=board.length?'COMPONENTS':images&&bet===null&&score===null?'IMAGE_ONLY':'TEXT';
 const result={game,playerId,playerName,identity:explicit?'EXPLICIT' as const:avatar?'AVATAR' as const:'UNKNOWN' as const,phase,bet,payout,net,board,selected,mines,cashOut,next,failure,steps,dealer,score,soft,cards,choice,advice,evidence};
 return {...result,signature:signatureFor(result)};
}
