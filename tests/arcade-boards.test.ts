import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArcadeBoard,advanceArcadeBoard,mergeTiles,canMoveTiles,mineNeighbors,mineCount,connectWinner,connectBotColumn,dropConnect,type TileBoard,type MineBoard,type ConnectBoard} from '../packages/core/src/arcade-boards';
const base={score:0,moves:0,done:false};
test('2048 zincirleri her hamlede yalnız bir kez birleşir; yön ve toplam korunur',()=>{
 const board=[2,2,2,2,4,4,8,0,0,0,0,0,0,0,0,0],original=[...board];
 const left=mergeTiles(board,'left');assert.deepEqual(left.board.slice(0,8),[4,4,0,0,8,8,0,0]);assert.equal(left.gained,16);assert.deepEqual(board,original);
 assert.deepEqual(mergeTiles(board,'right').board.slice(0,4),[0,0,4,4]);assert.equal(left.board.reduce((a,b)=>a+b,0),board.reduce((a,b)=>a+b,0));
 assert.deepEqual(mergeTiles([2,0,0,0,2,0,0,0,4,0,0,0,4,0,0,0],'down').board.filter((_,i)=>i%4===0),[0,0,4,8]);
 const same:TileBoard={...base,kind:'2048',board:[2,...Array(15).fill(0)]};assert.throws(()=>advanceArcadeBoard(same,'left'),/hareket etmiyor/);assert.equal(same.moves,0);
 const won=advanceArcadeBoard({...same,board:[1024,1024,...Array(14).fill(0)]},'left',()=>0);assert.equal(won.result,'WIN');assert.equal(won.score,2048);
 assert.equal(canMoveTiles([2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]),false);
 assert.equal(canMoveTiles([2,2,2,4,4,2,4,2,2,4,2,4,4,2,4,2]),true);
});
test('Mayınlarda her başlangıç ve çevresi güvenlidir; boş kareler yayılır, bayraklar patlamaz',()=>{
 for(let i=0;i<16;i++)for(let seed=0;seed<15;seed++){
  let n=seed+1;const rng=(max:number)=>{n=(n*1664525+1013904223)>>>0;return Math.floor(n/4294967296*max);};
  const first=advanceArcadeBoard(createArcadeBoard('mines'),String(i),rng) as MineBoard;
  assert.equal(first.bombs.length,4);assert.equal(new Set(first.bombs).size,4);assert.ok(!first.bombs.some(b=>[i,...mineNeighbors(i)].includes(b)));assert.ok(first.opened.includes(i));
  let solved=first;for(let cell=0;cell<16&&!solved.done;cell++)if(!solved.bombs.includes(cell)&&!solved.opened.includes(cell))solved=advanceArcadeBoard(solved,String(cell),rng) as MineBoard;
  assert.equal(solved.result,'WIN');assert.equal(solved.opened.length,12);assert.equal(solved.score,1700);
 }
 let s=advanceArcadeBoard(createArcadeBoard('mines'),'flag') as MineBoard;s=advanceArcadeBoard(s,'4') as MineBoard;assert.deepEqual(s.flags,[4]);assert.equal(s.armed,false);
 s=advanceArcadeBoard(s,'flag') as MineBoard;assert.throws(()=>advanceArcadeBoard(s,'4'),/bayrağını kaldır/);
 s=advanceArcadeBoard(s,'0',()=>0) as MineBoard;const bomb=s.bombs[0],lost=advanceArcadeBoard(s,String(bomb)) as MineBoard;assert.equal(lost.result,'LOSE');assert.ok(mineCount(s,0)===0);assert.throws(()=>advanceArcadeBoard(lost,'1'),/tamamlandı/);
});
test('Dörtlü Bağla yatay/dikey/çapraz kazanır; bot kazanma ve engelleme hamlesini yapar',()=>{
 for(const cells of [[35,36,37,38],[7,14,21,28],[0,8,16,24],[6,12,18,24]]){const b=Array(42).fill(0);cells.forEach(i=>b[i]=1);assert.equal(connectWinner(b),1);}
 const win=Array(42).fill(0);[35,36,37].forEach(i=>win[i]=2);assert.equal(connectBotColumn(win),3);
 const block=Array(42).fill(0);[35,36,37].forEach(i=>block[i]=1);assert.equal(connectBotColumn(block),3);assert.equal(block[38],0);
 const filled=Array(42).fill(0);for(let y=0;y<6;y++)filled[y*7]=y%2+1;const s:ConnectBoard={...base,kind:'connect4',board:filled};assert.throws(()=>advanceArcadeBoard(s,'0'),/sütun/);assert.equal(dropConnect(filled,7,1),false);
 const next=advanceArcadeBoard(createArcadeBoard('connect4'),'3') as ConnectBoard;assert.equal(next.board.filter(Boolean).length,2);assert.equal(next.moves,1);
});
