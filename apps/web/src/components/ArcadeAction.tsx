'use client';
import {useEffect,useRef,useState} from 'react';
import type {GameResult} from './ArcadeGames';
type ActionGame='snake'|'breaker'|'space';
type Dot={x:number;y:number;vx:number;vy:number;life:number;color:string};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function ActionRound({game,seed,onEnd}:{game:ActionGame;seed:number;onEnd:(result:GameResult)=>void}){
 const surface=useRef<HTMLCanvasElement>(null),keys=useRef(new Set<string>()),directionInput=useRef<(key:string)=>void>(()=>{}),paused=useRef(false),launch=useRef(false),[isPaused,setPaused]=useState(false),[hud,setHud]=useState({score:0,lives:3,time:0,stage:'Hazır'}),[error,setError]=useState('');
 useEffect(()=>{
  const canvas=surface.current!,ctx=canvas.getContext('2d');if(!ctx){setError('Tarayıcın oyun çizimini desteklemiyor.');return;}const c=ctx;
  let value=seed,frame=0,last=0,elapsed=0,score=0,lives=game==='snake'?1:3,stopped=false,hudTime=0;
  const random=()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;};
  const dots:Dot[]=[],held=keys.current;let px=480,py=455,pointer=false,pointerStart={x:0,y:0};
  const burst=(x:number,y:number,color:string,count=16)=>{for(let n=0;n<count;n++){const a=random()*Math.PI*2,speed=40+random()*180;dots.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:.3+random()*.5,color});}};
  const finish=(won:boolean)=>{if(stopped)return;stopped=true;onEnd({outcome:won?'WIN':'LOSE',score:Math.min(100000,Math.floor(score))});};
  // Snake: a fixed grid, one queued turn per tick, and food outside the body.
  let snake=[{x:8,y:6},{x:7,y:6},{x:6,y:6}],direction={x:1,y:0},queued={x:1,y:0},tick=0,eaten=0;
  const foodCell=()=>{const free=Array.from({length:216},(_,i)=>({x:i%18,y:Math.floor(i/18)})).filter(cell=>!snake.some(s=>s.x===cell.x&&s.y===cell.y));return free[Math.floor(random()*free.length)];};let food=foodCell();
  const turn=(x:number,y:number)=>{if(x!==-direction.x||y!==-direction.y)queued={x,y};};
  directionInput.current=key=>{if(key==='arrowleft')turn(-1,0);if(key==='arrowright')turn(1,0);if(key==='arrowup')turn(0,-1);if(key==='arrowdown')turn(0,1);};
  // Breaker: three layouts, two power-ups, and a paddle angle on each bounce.
  type Brick={x:number;y:number;hp:number;color:string};let bricks:Brick[]=[],level=1,bx=480,by=475,bvx=240,bvy=-340,flying=false,wide=0,fire=0;
  const powers:{x:number;y:number;kind:string}[]=[];
  const buildBricks=()=>{bricks=[];for(let y=0;y<4;y++)for(let x=0;x<8;x++)bricks.push({x:104+x*96,y:65+y*39,hp:level>1&&(x+y)%3===0?2:1,color:['#ff89b6','#ffd074','#70dfff','#a49aff'][y]});};buildBricks();
  // Space: formations, collectible shields / double shot, and three boss fights.
  type Enemy={x:number;y:number;vx:number;vy:number;hp:number;boss:boolean;size:number;age:number};
  const enemies:Enemy[]=[],shots:{x:number;y:number;vy:number;enemy:boolean}[]=[],drops:{x:number;y:number;kind:string}[]=[];
  let wave=1,spawn=0,shotClock=0,shield=0,double=0,invincible=0,bossSpawned=false,bossDefeated=false;
  const point=(event:PointerEvent)=>{const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*960,y:(event.clientY-rect.top)/rect.height*540};};
  const pointerDown=(e:PointerEvent)=>{canvas.focus();canvas.setPointerCapture(e.pointerId);pointerStart=point(e);pointer=true;if(game!=='snake'){px=clamp(pointerStart.x,35,925);if(game==='space')py=clamp(pointerStart.y,100,485);}launch.current=true;};
  const pointerMove=(e:PointerEvent)=>{if(game==='snake'||(!pointer&&e.pointerType!=='mouse'))return;const p=point(e);px=clamp(p.x,35,925);if(game==='space'&&pointer)py=clamp(p.y,100,485);};
  const pointerUp=(e:PointerEvent)=>{if(game==='snake'){const p=point(e),dx=p.x-pointerStart.x,dy=p.y-pointerStart.y;if(Math.max(Math.abs(dx),Math.abs(dy))>18)turn(Math.abs(dx)>Math.abs(dy)?Math.sign(dx):0,Math.abs(dy)>=Math.abs(dx)?Math.sign(dy):0);}pointer=false;};
  const keyboard=(e:KeyboardEvent)=>{const key=e.key.toLowerCase();if(['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d',' '].includes(key)){e.preventDefault();held.add(key);if(key===' ')launch.current=true;if(game==='snake'){if(key==='arrowleft'||key==='a')turn(-1,0);if(key==='arrowright'||key==='d')turn(1,0);if(key==='arrowup'||key==='w')turn(0,-1);if(key==='arrowdown'||key==='s')turn(0,1);}}};
  const keyUp=(e:KeyboardEvent)=>held.delete(e.key.toLowerCase()),blur=()=>{held.clear();pointer=false;},visibility=()=>{if(document.hidden){paused.current=true;setPaused(true);blur();}};
  canvas.addEventListener('keydown',keyboard);canvas.addEventListener('keyup',keyUp);canvas.addEventListener('blur',blur);canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',blur);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);canvas.focus();
  function draw(timestamp:number){
   if(stopped)return;const dt=last?Math.min((timestamp-last)/1000,.025):0;last=timestamp;if(paused.current||document.hidden){frame=requestAnimationFrame(draw);return;}elapsed+=dt;
   c.fillStyle='#080e21';c.fillRect(0,0,960,540);for(let i=0;i<65;i++){const x=(i*137+17)%960,y=(i*83+elapsed*(game==='space'?35:5))%540;c.fillStyle=i%3?'#364868':'#7397bc';c.fillRect(x,y,i%3?1:2,i%3?1:2);}
   if(held.has('arrowleft')||held.has('a'))px-=dt*650;if(held.has('arrowright')||held.has('d'))px+=dt*650;px=clamp(px,35,925);
   if(game==='snake'){
    if(held.has('arrowleft'))turn(-1,0);if(held.has('arrowright'))turn(1,0);if(held.has('arrowup'))turn(0,-1);if(held.has('arrowdown'))turn(0,1);
    tick+=dt;if(tick>=.16-Math.min(.075,eaten*.004)){tick=0;direction=queued;const head={x:snake[0].x+direction.x,y:snake[0].y+direction.y},ate=head.x===food.x&&head.y===food.y;
     if(head.x<0||head.x>=18||head.y<0||head.y>=12||snake.slice(0,ate?snake.length:-1).some(s=>s.x===head.x&&s.y===head.y)){burst(156+snake[0].x*36,54+snake[0].y*36,'#ff89b6');finish(false);return;}
     snake.unshift(head);if(ate){eaten++;score+=100+eaten*10;burst(174+food.x*36,72+food.y*36,'#ffd074');if(eaten===20){finish(true);return;}food=foodCell();}else snake.pop();
    }
    c.strokeStyle='#24354a';c.lineWidth=1;for(let x=0;x<=18;x++){c.beginPath();c.moveTo(156+x*36,54);c.lineTo(156+x*36,486);c.stroke();}for(let y=0;y<=12;y++){c.beginPath();c.moveTo(156,54+y*36);c.lineTo(804,54+y*36);c.stroke();}
    c.shadowColor='#ffd074';c.shadowBlur=18;c.fillStyle='#ffd074';c.beginPath();c.arc(174+food.x*36,72+food.y*36,10+Math.sin(elapsed*5)*2,0,Math.PI*2);c.fill();
    snake.forEach((s,i)=>{c.fillStyle=i?'#53bfa5':'#b2ffce';c.shadowColor='#6effb5';c.shadowBlur=i?5:18;c.beginPath();c.roundRect(159+s.x*36,57+s.y*36,30,30,8);c.fill();if(!i){c.shadowBlur=0;c.fillStyle='#143631';c.fillRect(168+s.x*36+direction.x*6,64+s.y*36+direction.y*6,4,4);c.fillRect(178+s.x*36+direction.x*6,74+s.y*36+direction.y*6,4,4);}});c.shadowBlur=0;if(elapsed>=180){finish(false);return;}
   }else if(game==='breaker'){
    wide=Math.max(0,wide-dt);fire=Math.max(0,fire-dt);const width=wide?185:125;px=clamp(px,width/2+8,952-width/2);
    if(!flying){bx=px;by=474;if(launch.current){launch.current=false;flying=true;}}else{
     const oldY=by;bx+=bvx*dt;by+=bvy*dt;if(bx<10||bx>950){bx=clamp(bx,10,950);bvx=-bvx;}if(by<10){by=10;bvy=Math.abs(bvy);}
     if(bvy>0&&by>=483&&oldY<483&&Math.abs(bx-px)<width/2+8){by=482;const angle=clamp((bx-px)/(width/2),-.95,.95)*1.05,speed=430+level*35;bvx=Math.sin(angle)*speed;bvy=-Math.cos(angle)*speed;burst(bx,490,'#66d8ff',5);}
     for(const brick of bricks){if(brick.hp&&bx>brick.x-8&&bx<brick.x+88+8&&by>brick.y-8&&by<brick.y+28+8){brick.hp=fire?0:brick.hp-1;score+=brick.hp?25:100;burst(bx,by,brick.color);if(!fire){if(oldY<brick.y||oldY>brick.y+28)bvy=-bvy;else bvx=-bvx;}if(!brick.hp&&random()<.2)powers.push({x:brick.x+44,y:brick.y+14,kind:random()<.5?'wide':'fire'});break;}}
     if(by>550){lives--;if(!lives){finish(false);return;}flying=false;launch.current=false;bvy=-360;bvx=200;}
    }
    for(const brick of bricks)if(brick.hp){c.shadowBlur=10;c.shadowColor=brick.color;c.fillStyle=brick.hp>1?'#faf0cf':brick.color;c.beginPath();c.roundRect(brick.x,brick.y,88,28,6);c.fill();c.shadowBlur=0;c.fillStyle='#ffffff25';c.fillRect(brick.x+5,brick.y+4,78,3);}
    for(let i=powers.length-1;i>=0;i--){const p=powers[i];p.y+=dt*140;c.fillStyle=p.kind==='wide'?'#7fe1aa':'#ffae68';c.beginPath();c.roundRect(p.x-14,p.y-12,28,24,5);c.fill();c.fillStyle='#0d1830';c.font='bold 17px sans-serif';c.textAlign='center';c.fillText(p.kind==='wide'?'↔':'✦',p.x,p.y+6);if(p.y>=478&&p.y<515&&Math.abs(p.x-px)<width/2+12){if(p.kind==='wide')wide=15;else fire=8;powers.splice(i,1);}else if(p.y>550)powers.splice(i,1);}
    c.fillStyle=wide?'#7fe1aa':'#93dfff';c.shadowBlur=20;c.shadowColor=c.fillStyle;c.beginPath();c.roundRect(px-width/2,491,width,14,7);c.fill();c.fillStyle=fire?'#ffb870':'#fff3bd';c.beginPath();c.arc(bx,by,8,0,Math.PI*2);c.fill();c.shadowBlur=0;
    if(!flying){c.fillStyle='#aabdd7';c.font='16px sans-serif';c.textAlign='center';c.fillText('Dokun veya boşluk tuşuna bas',480,350);}
    if(bricks.every(b=>!b.hp)){if(level===3){finish(true);return;}level++;flying=false;launch.current=false;powers.length=0;buildBricks();}if(elapsed>=240){finish(false);return;}
   }else{
    if(held.has('arrowup')||held.has('w'))py-=dt*420;if(held.has('arrowdown')||held.has('s'))py+=dt*420;py=clamp(py,100,485);shield=Math.max(0,shield-dt);double=Math.max(0,double-dt);invincible=Math.max(0,invincible-dt);
    shotClock-=dt;if(shotClock<=0){shotClock=double?.13:.2;for(const offset of double?[-12,12]:[0])shots.push({x:px+offset,y:py-20,vy:-640,enemy:false});}
    const waveTime=elapsed-(wave-1)*30;spawn-=dt;
    if(waveTime<20&&spawn<=0){spawn=Math.max(.35,.95-wave*.15);const formation=random()<.35;for(let j=0;j<(formation?3:1);j++)enemies.push({x:formation?220+j*220:60+random()*840,y:-35-j*24,vx:formation?Math.sin(elapsed)*45:(random()-.5)*80,vy:50+wave*22+random()*35,hp:formation?2:1,boss:false,size:formation?20:16,age:0});}
    if(waveTime>=20&&!bossSpawned){bossSpawned=true;enemies.push({x:480,y:80,vx:0,vy:0,hp:30+wave*15,boss:true,size:46,age:0});}
    for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];e.age+=dt;if(e.boss){e.x=480+Math.sin(e.age*1.15)*320;e.y=85+Math.sin(e.age*2)*12;if(Math.floor(e.age*1.6)!==Math.floor((e.age-dt)*1.6))for(const off of [-60,0,60])shots.push({x:e.x+off,y:e.y+38,vy:190+wave*20,enemy:true});}else{e.x+=e.vx*dt;e.y+=e.vy*dt;}
     c.save();c.translate(e.x,e.y);c.fillStyle=e.boss?'#af88ff':'#f58da7';c.shadowColor=c.fillStyle;c.shadowBlur=12;c.beginPath();c.moveTo(0,e.size);c.lineTo(e.size,-e.size*.5);c.lineTo(0,-e.size);c.lineTo(-e.size,-e.size*.5);c.closePath();c.fill();c.shadowBlur=0;if(e.boss){c.fillStyle='#2b254a';c.fillRect(-50,-66,100,5);c.fillStyle='#d4b0ff';c.fillRect(-50,-66,100*e.hp/(30+wave*15),5);}c.restore();
     if(!invincible&&Math.hypot(e.x-px,e.y-py)<e.size+18){if(!shield)lives--;invincible=1.5;burst(px,py,'#ffb1bf');if(!e.boss)e.hp=0;}
     if(e.hp<=0||e.y>570){if(e.hp<=0){score+=e.boss?1500:100;burst(e.x,e.y,e.boss?'#b799ff':'#ff89b6',e.boss?40:12);if(e.boss)bossDefeated=true;else if(random()<.18)drops.push({x:e.x,y:e.y,kind:random()<.5?'shield':'double'});}enemies.splice(i,1);}
    }
    for(let i=shots.length-1;i>=0;i--){const shot=shots[i];shot.y+=shot.vy*dt;let hit=false;
     if(shot.enemy){if(!invincible&&Math.hypot(shot.x-px,shot.y-py)<21){if(!shield)lives--;invincible=1.5;burst(px,py,'#ffa1bb');hit=true;}}
     else for(const enemy of enemies)if(enemy.hp>0&&Math.abs(shot.x-enemy.x)<enemy.size&&Math.abs(shot.y-enemy.y)<enemy.size+10){enemy.hp--;hit=true;burst(shot.x,shot.y,'#66d8ff',3);break;}
     c.fillStyle=shot.enemy?'#ffad7e':'#82eeff';c.shadowBlur=10;c.shadowColor=c.fillStyle;c.fillRect(shot.x-2,shot.y-7,4,14);c.shadowBlur=0;if(hit||shot.y<-20||shot.y>560)shots.splice(i,1);
    }
    for(let i=drops.length-1;i>=0;i--){const drop=drops[i];drop.y+=dt*95;c.strokeStyle=drop.kind==='shield'?'#7fe1aa':'#ffd074';c.lineWidth=2;c.beginPath();c.arc(drop.x,drop.y,14,0,Math.PI*2);c.stroke();c.fillStyle=c.strokeStyle;c.font='18px sans-serif';c.textAlign='center';c.fillText(drop.kind==='shield'?'◇':'Ⅱ',drop.x,drop.y+6);if(Math.hypot(drop.x-px,drop.y-py)<30){if(drop.kind==='shield')shield=8;else double=10;drops.splice(i,1);}else if(drop.y>560)drops.splice(i,1);}
    if(!invincible||Math.floor(elapsed*10)%2){c.save();c.translate(px,py);c.fillStyle='#aff2ff';c.shadowBlur=20;c.shadowColor='#66d8ff';c.beginPath();c.moveTo(0,-24);c.lineTo(20,19);c.lineTo(0,11);c.lineTo(-20,19);c.closePath();c.fill();c.fillStyle='#ffa96b';c.fillRect(-4,16,8,12+Math.sin(elapsed*35)*5);c.shadowBlur=0;if(shield){c.strokeStyle='#7fe1aa';c.lineWidth=2;c.beginPath();c.arc(0,0,34,0,Math.PI*2);c.stroke();}c.restore();}
    if(lives<=0){finish(false);return;}if(bossDefeated){if(wave===3){finish(true);return;}wave++;elapsed=(wave-1)*30;bossSpawned=false;bossDefeated=false;enemies.length=0;shots.length=0;spawn=0;}if(waveTime>=75){finish(false);return;}
   }
   for(let i=dots.length-1;i>=0;i--){const p=dots[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;c.globalAlpha=Math.max(0,Math.min(1,p.life*2));c.fillStyle=p.color;c.fillRect(p.x,p.y,3,3);if(p.life<=0)dots.splice(i,1);}c.globalAlpha=1;
   hudTime-=dt;if(hudTime<=0){hudTime=.1;setHud({score:Math.floor(score),lives,time:Math.floor(elapsed),stage:game==='snake'?eaten+' / 20 küre':game==='breaker'?'Dalga '+level+' / 3':'Filo '+wave+' / 3'+(shield?' · Kalkan':double?' · Çift atış':'')});}frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);return()=>{stopped=true;cancelAnimationFrame(frame);held.clear();launch.current=false;canvas.removeEventListener('keydown',keyboard);canvas.removeEventListener('keyup',keyUp);canvas.removeEventListener('blur',blur);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',blur);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);};
 },[game,seed,onEnd]);
 return <div className="action-round flying-round"><div className="arcade-hud"><span><b>{hud.score}</b> skor</span><span className="arcade-lives">{'♥'.repeat(hud.lives)}</span><span>{hud.stage}</span><span>{hud.time} sn</span></div>{error?<p role="alert">{error}</p>:<div className="action-canvas"><canvas ref={surface} width={960} height={540} tabIndex={0} aria-label={game==='snake'?'Neon Yılan oyun alanı':game==='breaker'?'Tuğla Kıran oyun alanı':'Uzay Savunması oyun alanı'}/>{isPaused&&<div className="arcade-pause">Oyun duraklatıldı<button className="button primary" onClick={()=>{paused.current=false;setPaused(false);surface.current?.focus();}}>Devam et</button></div>}</div>}<div className="arcade-pad">{[['arrowleft','←'],...(game==='breaker'?[]:[['arrowup','↑'],['arrowdown','↓']]),['arrowright','→']].map(([key,label])=><button key={key} aria-label={{arrowleft:'Sola',arrowright:'Sağa',arrowup:'Yukarı',arrowdown:'Aşağı'}[key]} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);keys.current.add(key);directionInput.current(key);}} onPointerUp={()=>keys.current.delete(key)} onPointerCancel={()=>keys.current.delete(key)} onLostPointerCapture={()=>keys.current.delete(key)}>{label}</button>)}{game==='breaker'&&<button className="launch-button" aria-label="Topu fırlat" onClick={()=>{launch.current=true;surface.current?.focus();}}>Fırlat</button>}</div><div className="action-tools"><p className="arcade-control-note">{game==='snake'?'20 küre topla · Duvara ve kendi izine çarpma.':game==='breaker'?'Raket: fare / dokunma / yönler · Yeşil ↔ geniş raket · Turuncu ✦ ateş topu.':'Otomatik ateş · Yeşil ◇ kalkan · Altın Ⅱ çift atış.'}</p><button className="button ghost small" onClick={()=>{paused.current=!paused.current;setPaused(paused.current);if(!paused.current)surface.current?.focus();}}>{isPaused?'▶ Devam et':'Ⅱ Duraklat'}</button></div></div>;
}
