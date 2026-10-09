// Pure rules shared by the browser and server-authoritative Discord games.
import type {ArcadeBoardGame} from './arcade-policy';
type RNG=(max:number)=>number;
type Base={score:number;moves:number;done:boolean;result?:'WIN'|'LOSE'|'DRAW'};
export type TileBoard=Base&{kind:'2048';board:number[]};
export type MineBoard=Base&{kind:'mines';bombs:number[];opened:number[];flags:number[];flagMode:boolean;armed:boolean};
export type ConnectBoard=Base&{kind:'connect4';board:number[]};
export type ArcadeBoard=TileBoard|MineBoard|ConnectBoard;
const defaultRNG:RNG=max=>Math.floor(Math.random()*max);
function addTile(board:number[],rng:RNG){const empty=board.flatMap((v,i)=>v?[]:[i]);if(empty.length)board[empty[rng(empty.length)]]=rng(10)===0?4:2;}
export function createArcadeBoard(kind:ArcadeBoardGame,rng=defaultRNG):ArcadeBoard{
 const base={score:0,moves:0,done:false};
 if(kind==='2048'){const board=Array(16).fill(0);addTile(board,rng);addTile(board,rng);return {...base,kind,board};}
 if(kind==='mines')return {...base,kind,bombs:[],opened:[],flags:[],flagMode:false,armed:false};
 return {...base,kind,board:Array(42).fill(0)};
}
export function mergeTiles(board:number[],direction:string){
 if(!['left','right','up','down'].includes(direction))throw Error('Bir yön seç.');
 const next=[...board];let gained=0;
 for(let lane=0;lane<4;lane++){
  const indices=Array.from({length:4},(_,i)=>direction==='left'?lane*4+i:direction==='right'?lane*4+3-i:direction==='up'?i*4+lane:(3-i)*4+lane);
  const values=indices.map(i=>board[i]).filter(Boolean),merged:number[]=[];
  for(let i=0;i<values.length;i++){if(values[i]===values[i+1]){merged.push(values[i]*2);gained+=values[i]*2;i++;}else merged.push(values[i]);}
  indices.forEach((index,i)=>next[index]=merged[i]||0);
 }
 return {board:next,gained,changed:next.some((v,i)=>v!==board[i])};
}
export function canMoveTiles(board:number[]){return board.some(v=>!v)||board.some((v,i)=>(i%4<3&&v===board[i+1])||(i<12&&v===board[i+4]));}
export function mineNeighbors(index:number){const x=index%4,y=Math.floor(index/4),neighbors:number[]=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if((dx||dy)&&nx>=0&&nx<4&&ny>=0&&ny<4)neighbors.push(ny*4+nx);}return neighbors;}
export function mineCount(s:MineBoard,index:number){return mineNeighbors(index).filter(i=>s.bombs.includes(i)).length;}
export function connectWinner(board:number[]){
 for(let y=0;y<6;y++)for(let x=0;x<7;x++){const player=board[y*7+x];if(!player)continue;for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){const ex=x+3*dx,ey=y+3*dy;if(ex<0||ex>=7||ey>=6)continue;if([1,2,3].every(n=>board[(y+n*dy)*7+x+n*dx]===player))return player;}}
 return board.every(Boolean)?3:0;
}
export function dropConnect(board:number[],column:number,player:number){if(!Number.isInteger(column)||column<0||column>6)return false;for(let y=5;y>=0;y--)if(!board[y*7+column]){board[y*7+column]=player;return true;}return false;}
const columnOrder=[3,2,4,1,5,0,6];
function evaluateConnect(board:number[]){
 let score=0;for(let y=0;y<6;y++)score+=board[y*7+3]===2?6:board[y*7+3]===1?-6:0;
 for(let y=0;y<6;y++)for(let x=0;x<7;x++)for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){
  const ex=x+3*dx,ey=y+3*dy;if(ex<0||ex>=7||ey>=6)continue;const cells=[0,1,2,3].map(n=>board[(y+n*dy)*7+x+n*dx]);const a=cells.filter(v=>v===1).length,b=cells.filter(v=>v===2).length;
  if(!a)score+=[0,1,8,70,10000][b];if(!b)score-=[0,1,10,90,10000][a];
 }return score;
}
function searchConnect(board:number[],depth:number,bot:boolean,alpha:number,beta:number):number{
 const winner=connectWinner(board);if(winner)return winner===2?100000+depth:winner===1?-100000-depth:0;if(!depth)return evaluateConnect(board);
 let best=bot?-Infinity:Infinity;for(const column of columnOrder){const next=[...board];if(!dropConnect(next,column,bot?2:1))continue;const score=searchConnect(next,depth-1,!bot,alpha,beta);best=bot?Math.max(best,score):Math.min(best,score);if(bot)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(beta<=alpha)break;}return best;
}
export function connectBotColumn(board:number[]){let best=-Infinity,selected=-1;for(const column of columnOrder){const next=[...board];if(!dropConnect(next,column,2))continue;const score=searchConnect(next,3,false,-Infinity,Infinity);if(score>best){best=score;selected=column;}}return selected;}
export function advanceArcadeBoard(previous:ArcadeBoard,action:string,rng=defaultRNG):ArcadeBoard{
 if(previous.done)throw Error('Bu tur tamamlandı.');const s=structuredClone(previous);
 if(action==='cancel'){s.done=true;s.result='LOSE';return s;}
 if(s.kind==='2048'){
  const moved=mergeTiles(s.board,action);if(!moved.changed)throw Error('Bu yönde taşlar hareket etmiyor. Başka bir yön seç.');s.board=moved.board;s.score+=moved.gained;s.moves++;addTile(s.board,rng);
  if(s.board.some(v=>v>=2048)){s.done=true;s.result='WIN';}else if(!canMoveTiles(s.board)){s.done=true;s.result='LOSE';}return s;
 }
 if(s.kind==='mines'){
  if(action==='flag'){s.flagMode=!s.flagMode;return s;}
  if(!/^\d{1,2}$/.test(action)||Number(action)>15)throw Error('Bir kare seç.');const index=Number(action);if(s.opened.includes(index))throw Error('Bu kare zaten açık.');
  if(s.flagMode){if(s.flags.includes(index))s.flags=s.flags.filter(i=>i!==index);else{if(s.flags.length>=4)throw Error('En fazla dört bayrak koyabilirsin.');s.flags.push(index);}return s;}
  if(s.flags.includes(index))throw Error('Önce bu karenin bayrağını kaldır.');
  if(!s.armed){const forbidden=[index,...mineNeighbors(index)],pool=Array.from({length:16},(_,i)=>i).filter(i=>!forbidden.includes(i));for(let n=0;n<4;n++)s.bombs.push(pool.splice(rng(pool.length),1)[0]);s.armed=true;}
  s.moves++;if(s.bombs.includes(index)){s.done=true;s.result='LOSE';s.opened.push(index);return s;}
  const queue=[index];while(queue.length){const cell=queue.pop()!;if(s.opened.includes(cell)||s.flags.includes(cell)||s.bombs.includes(cell))continue;s.opened.push(cell);if(!mineCount(s,cell))queue.push(...mineNeighbors(cell));}
  s.score=s.opened.length*100;if(s.opened.length===12){s.done=true;s.result='WIN';s.score+=500;}return s;
 }
 if(!/^[0-6]$/.test(action)||!dropConnect(s.board,Number(action),1))throw Error('Boş yeri olan bir sütun seç.');s.moves++;let winner=connectWinner(s.board);
 if(!winner){dropConnect(s.board,connectBotColumn(s.board),2);winner=connectWinner(s.board);}
 s.score=s.moves*20;if(winner){s.done=true;s.result=winner===1?'WIN':winner===2?'LOSE':'DRAW';if(winner===1)s.score+=1000;}return s;
}
