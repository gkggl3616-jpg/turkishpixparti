'use client';
import {useEffect,useRef,useState} from 'react';
import type {ArcadeGame} from '../../../../packages/core/src/arcade-policy';
export type GameResult={outcome:'WIN'|'LOSE'|'QUIT';score:number};
export function seeded(seed:number){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)|0;return (seed>>>0)/4294967296;};}
export function MemoryRound({seed,onEnd}:{seed:number;onEnd:(result:GameResult)=>void}){
 const [cards]=useState(()=>{const deck=Array.from({length:16},(_,i)=>i%8),random=seeded(seed);for(let i=15;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}),[open,setOpen]=useState<number[]>([]),[matched,setMatched]=useState<number[]>([]),[moves,setMoves]=useState(0),[finished,setFinished]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),icons=['🌙','🌿','⭐','💎','🔥','🪐','🌊','⚡'];
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 function choose(index:number){
  if(finished||open.length===2||open.includes(index)||matched.includes(index))return;
  const next=[...open,index];setOpen(next);if(next.length<2)return;setMoves(n=>n+1);
  timer.current=setTimeout(()=>{if(cards[next[0]]===cards[next[1]]){const all=[...matched,...next];setMatched(all);if(all.length===16){setFinished(true);onEnd({outcome:'WIN',score:Math.max(100,1600-(moves+1)*30)});}}setOpen([]);},650);
 }
 return <div className="memory-round"><div className="arcade-hud"><span><b>{matched.length/2}</b> / 8 çift</span><span><b>{moves}</b> hamle</span><span>HAFIZA BAHÇESİ</span></div><div className="memory-grid">{cards.map((value,index)=>{const visible=open.includes(index)||matched.includes(index);return <button key={index} className={'memory-card '+(visible?'flipped ':'')+(matched.includes(index)?'matched':'')} onClick={()=>choose(index)} disabled={finished||matched.includes(index)} aria-label={visible?icons[value]:'Kapalı kart '+(index+1)}><span>{visible?icons[value]:'✦'}</span></button>;})}</div><p className="arcade-control-note">İki kart seç. Aynı simgeler eşleşince açık kalır.</p></div>;
}

type Object3D={x:number;y:number;z:number;gold:boolean;hit:boolean;speed:number};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
function multiply(a:number[],b:number[]){const result=new Array(16).fill(0);for(let column=0;column<4;column++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)result[column*4+row]+=a[k*4+row]*b[column*4+k];return result;}
function orbitRenderer(canvas:HTMLCanvasElement){
 const context=canvas.getContext('webgl',{antialias:true,alpha:false});if(!context)return null;const gl:WebGLRenderingContext=context;
 const shader=(type:number,code:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('WebGL shader');return shader;};
 const vertex=shader(gl.VERTEX_SHADER,'attribute vec3 position;uniform mat4 matrix;varying float shade;void main(){gl_Position=matrix*vec4(position,1.0);shade=.55+position.y*.3+position.z*.18;}'),fragment=shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform vec3 color;varying float shade;void main(){gl_FragColor=vec4(color*(.7+shade*.3),1.0);}'),program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('WebGL link');
 const coords:number[]=[];for(const face of [[[1,0,0],[0,1,0],[0,0,1]],[[-1,0,0],[0,1,0],[0,0,-1]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]]]){const [normal,u,v]=face;const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>normal.map((n,i)=>(n+u[i]*a+v[i]*b)*.5));for(const index of [0,1,2,0,2,3])coords.push(...corners[index]);}
 const buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(coords),gl.STATIC_DRAW);gl.useProgram(program);const location=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);gl.enable(gl.DEPTH_TEST);
 const matrix=gl.getUniformLocation(program,'matrix'),color=gl.getUniformLocation(program,'color'),f=1/Math.tan(Math.PI/6),near=.1,far=100,projection=[f/(960/540),0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
 function box(x:number,y:number,z:number,size:number,angle:number,rgb:number[]){const c=Math.cos(angle),s=Math.sin(angle),model=[c*size,0,-s*size,0,0,size,0,0,s*size,0,c*size,0,x,y,z-7,1];gl.uniformMatrix4fv(matrix,false,new Float32Array(multiply(projection,model)));gl.uniform3fv(color,new Float32Array(rgb));gl.drawArrays(gl.TRIANGLES,0,36);}
 return {draw(objects:Object3D[],x:number,y:number,time:number,lives:number){gl.viewport(0,0,960,540);gl.clearColor(.025,.035,.09,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);for(let i=0;i<18;i++){const z=4-((i*4+time*9)%72);box(-4,-2.7,z,.11,0,[.22,.35,.65]);box(4,-2.7,z,.11,0,[.22,.35,.65]);box(-4,2.7,z,.11,0,[.22,.35,.65]);box(4,2.7,z,.11,0,[.22,.35,.65]);}for(const o of objects)if(!o.hit)box(o.x,o.y,o.z,o.gold?.45:.85,time*(o.gold?2:.6),o.gold?[1,.73,.18]:[.61,.35,.93]);box(x,y,0,.42,time*.7,lives>0?[.3,.88,1]:[1,.2,.3]);},dispose(){gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}

export function FlyingRound({game,seed,onEnd}:{game:Exclude<ArcadeGame,'memory'>;seed:number;onEnd:(result:GameResult)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),keys=useRef(new Set<string>()),[hud,setHud]=useState({score:0,lives:3,seconds:60}),[error,setError]=useState('');
 useEffect(()=>{
  const surface=canvas.current!,random=seeded(seed),orbit=game==='orbit'?orbitRenderer(surface):null,ctx=game==='neon'?surface.getContext('2d'):null;
  if(!orbit&&!ctx){setError('Bu cihaz oyun çizimini desteklemiyor. Başka bir tarayıcı kullan.');return;}
  let frame=0,stopped=false,last=0,time=0,spawn=0,score=0,lives=3,x=0,y=0,lastHud=-1;const objects:Object3D[]=[];
  const move=(e:PointerEvent)=>{if(e.buttons===0&&e.pointerType!=='touch')return;const rect=surface.getBoundingClientRect();x=clamp((e.clientX-rect.left)/rect.width*8-4,-3.5,3.5);y=clamp(2-((e.clientY-rect.top)/rect.height)*4,-1.9,1.9);};
  const down=(e:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d','W','A','S','D'].includes(e.key)){e.preventDefault();keys.current.add(e.key.toLowerCase());}},up=(e:KeyboardEvent)=>keys.current.delete(e.key.toLowerCase()),blur=()=>keys.current.clear();
  surface.addEventListener('blur',blur);surface.addEventListener('keydown',down);surface.addEventListener('keyup',up);surface.addEventListener('pointermove',move);surface.addEventListener('pointerdown',move);window.addEventListener('blur',blur);surface.focus();
  function finish(){if(stopped)return;stopped=true;onEnd({outcome:lives>0?'WIN':'LOSE',score:Math.floor(score+time*10)});}
  function draw(timestamp:number){
   if(stopped)return;const dt=last?Math.min((timestamp-last)/1000,.05):0;last=timestamp;if(document.hidden){frame=requestAnimationFrame(draw);return;}time+=dt;spawn-=dt;
   const held=keys.current;if(held.has('a')||held.has('arrowleft'))x-=dt*5;if(held.has('d')||held.has('arrowright'))x+=dt*5;if(held.has('w')||held.has('arrowup'))y+=dt*3;if(held.has('s')||held.has('arrowdown'))y-=dt*3;x=clamp(x,-3.5,3.5);y=clamp(y,-1.9,1.9);
   if(spawn<=0){spawn=game==='orbit'?.65:.42;objects.push({x:random()*7-3.5,y:random()*3.4-1.7,z:game==='orbit'?-48:-9,gold:random()<.4,hit:false,speed:game==='orbit'?12:2.7+random()*1.7});}
   for(const object of objects){object.z+=dt*object.speed;if(!object.hit&&Math.abs(object.z)<.5&&Math.hypot(object.x-x,object.y-y)<(object.gold?.7:.8)){object.hit=true;if(object.gold)score+=100;else lives--;}}
   while(objects.length&&objects[0].z>7)objects.shift();
   if(orbit)orbit.draw(objects,x,y,time,lives);
   if(ctx){
    const c=ctx;c.fillStyle='#090e25';c.fillRect(0,0,960,540);c.strokeStyle='#25234b';for(let i=0;i<14;i++){const sx=(i*83)%960,sy=(i*173+time*40)%540;c.fillStyle='#5f6294';c.fillRect(sx,sy,2,2);}c.strokeStyle='#202448';for(let row=0;row<10;row++){c.beginPath();c.moveTo(0,row*64+(time*30)%64);c.lineTo(960,row*64+(time*30)%64);c.stroke();}
    for(const object of objects)if(!object.hit){const ox=480+object.x*105,oy=440+object.z*45-object.y*55;c.save();c.translate(ox,oy);c.rotate(time*.8);c.shadowBlur=18;c.shadowColor=object.gold?'#ffc95f':'#b488ff';c.fillStyle=c.shadowColor;if(object.gold){c.beginPath();for(let k=0;k<10;k++){const a=k*Math.PI/5,r=k%2?9:20;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();}else c.fillRect(-23,-23,46,46);c.restore();}
    c.save();c.translate(480+x*105,440-y*55);c.shadowBlur=25;c.shadowColor='#5fe7ff';c.fillStyle='#a7f0ff';c.beginPath();c.moveTo(0,-20);c.lineTo(16,16);c.lineTo(0,8);c.lineTo(-16,16);c.closePath();c.fill();c.restore();
   }
   const seconds=Math.ceil(Math.max(0,60-time));if(seconds!==lastHud){lastHud=seconds;setHud({score:Math.floor(score+time*10),lives,seconds});}else setHud(previous=>previous.lives!==lives?{...previous,lives,score:Math.floor(score+time*10)}:previous);
   if(lives<=0||time>=60){finish();return;}frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);return ()=>{stopped=true;cancelAnimationFrame(frame);keys.current.clear();orbit?.dispose();surface.removeEventListener('blur',blur);surface.removeEventListener('keydown',down);surface.removeEventListener('keyup',up);surface.removeEventListener('pointermove',move);surface.removeEventListener('pointerdown',move);window.removeEventListener('blur',blur);};
 },[game,seed,onEnd]);
 return <div className="flying-round"><div className="arcade-hud"><span><b>{hud.score}</b> skor</span><span className="arcade-lives">{'♥'.repeat(Math.max(0,hud.lives))}</span><span><b>{hud.seconds}</b> saniye</span></div>{error?<p role="alert">{error}</p>:<canvas width="960" height="540" ref={canvas} tabIndex={0} aria-label={game==='orbit'?'Üç boyutlu yörünge oyunu':'İki boyutlu neon kaçış oyunu'}/>}<div className="arcade-pad">{[['arrowleft','←'],['arrowup','↑'],['arrowdown','↓'],['arrowright','→']].map(([key,label])=><button key={key} aria-label={label==='←'?'Sola':label==='→'?'Sağa':label==='↑'?'Yukarı':'Aşağı'} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);keys.current.add(key);}} onPointerUp={()=>keys.current.delete(key)} onPointerCancel={()=>keys.current.delete(key)} onLostPointerCapture={()=>keys.current.delete(key)}>{label}</button>)}</div><p className="arcade-control-note">WASD / ok tuşları · Ekrana dokunarak veya alttaki düğmelerle hareket et.</p></div>;
}
