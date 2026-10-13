import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {owoPeriod} from '../apps/bot/src/owo-period';
import {blackjackObserved,minesPatterns,observedReport,type Ledger} from '../apps/bot/src/owo-empirical';
import {approvedOcrUrl,ocrLines,readOwoImage,sourceImages} from '../apps/bot/src/owo-ocr';
import {renderMinesStatistics} from '../apps/bot/src/owo-render';
import {mineProfiles} from '../apps/bot/src/owo-math';
test('Month-anchored Istanbul periods honor day boundaries, shortened month end and valid dates',()=>{
 assert.equal(owoPeriod('2026-10-03').key,'2026-10-01');assert.equal(owoPeriod(new Date('2026-10-03T21:00:00Z')).key,'2026-10-04');assert.equal(owoPeriod('2026-10-31').end.toISOString(),'2026-10-31T21:00:00.000Z');assert.equal(owoPeriod('2028-02-29').key,'2028-02-28');assert.equal(owoPeriod('2028-02-29').end.toISOString(),'2028-02-29T21:00:00.000Z');assert.throws(()=>owoPeriod('2026-02-30'),{code:'OWO_DATE'});assert.throws(()=>owoPeriod('13/10/2026'),{code:'OWO_DATE'});
});
const row=(id:string,phase:string,score:number,net:number|null=phase==='WIN'?10:phase==='LOSS'?-10:0):Ledger=>({message_id:id,game:'BLACKJACK',phase,net,bet:10,state:{score,soft:false},source_created_at:new Date()});
test('Blackjack empirical win rates link observed intermediate scores to outcomes, dedupe edits and exclude unknowns',()=>{
 const rows=[row('one','LOSS',27),row('two','WIN',20),row('unknown','UNKNOWN',17)],frames=[{message_id:'one',phase:'ACTIVE',score:17,soft:false,source_edited_at:new Date(1)},{message_id:'one',phase:'ACTIVE',score:17,soft:false,source_edited_at:new Date(2)},{message_id:'two',phase:'ACTIVE',score:17,soft:false,source_edited_at:new Date(1)},{message_id:'unknown',phase:'ACTIVE',score:17,soft:false,source_edited_at:new Date(1)}];
 const r=blackjackObserved(rows,frames);assert.equal(r.byScore[0].games,2);assert.equal(r.byScore[0].rate,0.5);assert.equal(r.observedActiveGames,2);assert.equal(r.best,null);assert.equal(r.terminalScores.find(r=>r.score===27)!.rate,0);
 const empty=blackjackObserved(rows,[]);assert.equal(empty.byScore.length,0);assert.equal(empty.observedActiveGames,0);assert.ok(empty.terminalScores.length>0);
});
test('Threshold comparisons use first observed game state and observed outcomes, without a standard deck formula',()=>{
 const rows:Ledger[]=[],frames:any[]=[];for(let n=0;n<40;n++){const score=n<20?15:19;rows.push(row(String(n),n<20?'LOSS':'WIN',n<20?25:19));frames.push({message_id:String(n),phase:'ACTIVE',score,soft:false,source_edited_at:new Date(1)});frames.push({message_id:String(n),phase:'ACTIVE',score:20,soft:false,source_edited_at:new Date(2)});}
 const r=blackjackObserved(rows,frames);assert.ok(r.best?.adequate);assert.equal(r.best!.above.rate,1);assert.equal(r.best!.below.rate,0);assert.equal(r.best!.above.games,20);assert.equal(r.best!.below.games,20);
});
const board=['SAFE','MINE','SAFE','SAFE','SAFE','MINE','HIT','SAFE','SAFE'];
test('Mines pattern counts require fully exposed boards, preserve mine-count cohorts and report repeats descriptively',()=>{
 const rows:Ledger[]=Array.from({length:4},(_,n)=>({message_id:String(n),game:'MINES',phase:'LOSS',net:-10,bet:10,state:{board,mines:3,selected:[5,7]}}));rows.push({message_id:'hidden',game:'MINES',phase:'WIN',state:{board:['HIDDEN',...board.slice(1)],mines:3}});
 const p=minesPatterns(rows,3);assert.equal(p.completeBoards,4);assert.equal(p.distinctLayouts,1);assert.equal(p.repeated[0].count,4);assert.equal(p.evidence,'Örnek yetersiz');assert.equal(minesPatterns(rows,4).completeBoards,0);
});
test('Observed game profit comparisons count only known money and avoid converting unknown outcomes into zero losses',()=>{
 const r=observedReport([row('won','WIN',20),{...row('missing','WIN',21),net:null}, {...row('cf','LOSS',0),game:'COINFLIP'}],[]);assert.equal(r.bestGame!.game,'BLACKJACK');assert.equal(r.bestGame!.net,'10');assert.equal(r.games.find(g=>g.game==='BLACKJACK')!.moneyUnknown,1);assert.equal(r.bestGame!.profitable,true);
 const negative=observedReport([row('loss','LOSS',27)],[]);assert.equal(negative.bestGame!.profitable,false);
});
test('OCR source allowlist rejects redirects to arbitrary hosts, userinfo, HTTP and unsupported input signatures',async()=>{
 assert.ok(approvedOcrUrl('https://cdn.discordapp.com/attachments/123/image.png').includes('discordapp'));
 for(const url of ['http://cdn.discordapp.com/a.png','https://cdn.discordapp.com.evil.test/a.png','https://u:p@cdn.discordapp.com/a.png','https://127.0.0.1/a.png'])assert.throws(()=>approvedOcrUrl(url),{code:'OWO_OCR_HOST'});
 await assert.rejects(()=>readOwoImage(Buffer.from('<svg/>')),{code:'OWO_OCR_FORMAT'});await assert.rejects(()=>readOwoImage(Buffer.alloc(9*1024*1024)),{code:'OWO_OCR_SIZE'});
 assert.equal(sourceImages({attachments:[],embeds:[{image:{url:'https://cdn.discordapp.com/a.png'}},{image:{url:'https://cdn.discordapp.com/a.png'}}]}).length,1);
});
test('OCR rejects low-confidence numeric words but does not let a low-confidence separator invalidate correct text',()=>{
 const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
 const r=ocrLines(header+'5\t1\t1\t1\t1\t1\t0\t0\t20\t10\t95\tBet:\n5\t1\t1\t1\t1\t2\t0\t0\t20\t10\t20\t250000\n5\t1\t1\t1\t2\t1\t0\t0\t20\t10\t96\tYou\n5\t1\t1\t1\t2\t2\t0\t0\t20\t10\t94\twon\n5\t1\t1\t1\t2\t3\t0\t0\t20\t10\t4\t|\n');assert.ok(!r.trustedText.includes('250000'));assert.match(r.trustedText,/You won/);assert.equal(r.status,'PARTIAL');
});
test('Real Tesseract reads rendered OwO labels and amounts, and the 3×3 statistics artifact renders as PNG',async()=>{
 const fixture=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240"><rect width="800" height="240" fill="white"/><g font-family="DejaVu Sans" font-size="32" fill="black"><text x="30" y="55">Blackjack Player [17]</text><text x="30" y="110">Bet: 250000</text><text x="30" y="165">You won 250000 cowoncy</text></g></svg>')).png().toBuffer();
 const result=await readOwoImage(fixture);assert.match(result.text,/Blackjack/);assert.match(result.text,/250000/);assert.ok(result.trustedText.length>0);
 const png=await renderMinesStatistics(mineProfiles([{board,selected:[5,7],mines:3}],3),'2026-10-13 → 2026-10-15','Kişisel'),meta=await sharp(png).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,960);assert.equal(meta.height,918);
});
