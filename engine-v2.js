(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
// Keep the 16-pixel drawing and foot position; hair is outside the solid hitbox.
const HEAD_INSET=2,CORNER_ASSIST=4;
class Game {
 constructor(levels,options={}){this.levels=levels;this.god=!!options.god;this.gentle=!!options.gentle;this.done=options.done||[];this.events=[];this.load(0);}
 emit(type,data={}){this.events.push({type,...data});}
 load(index){
  this.checkpoint=null;this.usedCheckpoint=false;this.retries=0;this.nearDoor=null;this.index=clamp(index,0,this.levels.length-1);this.level=this.levels[this.index];this.time=0;this.complete=false;this.events=[];this.shots=[];this.sparks=[];this.keys=[0,0,0];this.card=false;this.collected=0;this.cooldown=0;this.jumpBuffer=0;this.drop=0;this.doorCooldown=0;this.wasNearExit=false;
  this.items=this.level.items.map((i,id)=>({...i,id,w:16,h:16,taken:false}));
  this.enemies=this.level.enemies.map((e,id)=>({...e,id,alive:true,flash:0,dx:0,dy:0,dirX:[1,-1,0,0,1,-1,1,-1][e.direction]||0,dirY:[0,0,-1,1,-1,-1,1,1][e.direction]||0}));
  this.player={x:this.level.spawn.x+2,y:this.level.spawn.y,w:12,h:16,vx:0,vy:0,face:this.level.facing===12?1:-1,hp:this.gentle?6:4,invincible:1.4,grounded:false,coyote:0,ride:null};
 }
 setGod(on){this.god=!!on;this.emit('god');}
 setGentle(on){this.gentle=!!on;this.player.hp=Math.min(this.player.hp,this.gentle?6:4);}
 snapshot(){return {index:this.index};}
 setCheckpoints(on){this.checkpoints=!!on;if(!on)this.checkpoint=null;}
 saveCheckpoint(){
  const p=this.player,body=this.playerBody();
  const floor=this.tilesNear({x:p.x,y:p.y+p.h,w:p.w,h:1});
  if(!this.checkpoints||!this.index||this.complete||!p.grounded||p.ride!==null||this.blocked(body)||!floor.some(t=>t.kind===1)||this.tilesNear({...body,x:body.x-8,y:body.y-8,w:body.w+16,h:body.h+17}).some(t=>t.kind===3)||this.enemies.some(e=>e.alive&&e.contact!==1&&overlap({...body,x:body.x-24,y:body.y-24,w:body.w+48,h:body.h+48},e)))return false;
  this.checkpoint=JSON.parse(JSON.stringify({player:p,items:this.items,enemies:this.enemies,keys:this.keys,card:this.card,collected:this.collected}));
  this.usedCheckpoint=true;this.emit('checkpoint');return true;
 }
 exitStatus(){
  const remaining=0,missingCard=!this.card;
  if(!this.index)return {remaining,missingCard,ready:false,atDoor:false,near:false};
  const door={...this.level.exit,w:16,h:32},body=this.playerBody();
  // A short reach beside the door makes the button usable without pixel-perfect
  // overlap. Keep the door's vertical span, and reject reaching through a wall.
  const atDoor=overlap(body,door);let near=overlap(body,{...door,x:door.x-6,w:28});
  if(near&&!atDoor){
   const from=body.x+body.w/2,to=clamp(from,door.x,door.x+door.w),y=clamp(body.y+body.h/2,door.y,door.y+door.h-.1);
   for(let x=Math.min(from,to);x<=Math.max(from,to);x+=1)if(this.blocked({x,y,w:.5,h:.5})){near=false;break;}
  }
  return {remaining,missingCard,ready:!missingCard&&remaining===0,atDoor,near};
 }
 restart(){
  const saved=this.checkpoints&&this.checkpoint,elapsed=this.time,retries=(this.retries||0)+1,used=this.usedCheckpoint;
  this.load(this.index);this.time=elapsed;this.retries=retries;this.usedCheckpoint=used;
  if(saved){const state=JSON.parse(JSON.stringify(saved));Object.assign(this,state);this.checkpoint=saved;Object.assign(this.player,{hp:this.gentle?6:4,invincible:2,vx:0,vy:0,ride:null});}
  this.emit('respawn',{checkpoint:!!saved});
 }
 hurt(fatal=false){
  const p=this.player;if(this.god||p.invincible>0)return;
  p.hp=fatal?0:p.hp-1;p.invincible=this.gentle?1.8:1.15;this.emit('hurt');
  if(p.hp<=0){this.restart();return true;}return false;
 }
 tilesNear(rect){
  const result=[];const x0=clamp(Math.floor(rect.x/16),0,39),x1=clamp(Math.floor((rect.x+rect.w-.001)/16),0,39),y0=clamp(Math.floor(rect.y/16),0,23),y1=clamp(Math.floor((rect.y+rect.h-.001)/16),0,23);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const kind=this.level.tiles[y*40+x]>>6;if(kind)result.push({x:x*16,y:y*16,w:16,h:16,kind});}
  for(const i of this.items)if(i.kind===2&&!i.taken&&overlap(rect,i))result.push({...i,kind:1});
  return result;
 }
 unlock(){for(const i of this.items)if(i.kind===2&&!i.taken&&this.keys[i.sprite-84]>0&&overlap({...this.player,x:this.player.x-2,y:this.player.y-2,w:16,h:20},i)){i.taken=true;this.keys[i.sprite-84]--;this.emit('unlock');}}
 playerBody(x=this.player.x,y=this.player.y){return {x,y:y+HEAD_INSET,w:this.player.w,h:this.player.h-HEAD_INSET};}
 blocked(body){return this.tilesNear(body).some(t=>t.kind===1&&overlap(body,t));}
 moveX(dx){
  if(!dx)return;
  const p=this.player,oldX=p.x;p.x=clamp(p.x+dx,0,640-p.w);
  const body=this.playerBody(),hits=this.tilesNear(body).filter(t=>t.kind===1&&overlap(body,t));
  if(!hits.length)return;
  // Align with a nearby open lip while jumping/falling. Test both the vertical
  // adjustment and horizontal sweep so this cannot move through a closed wall.
  if(!p.grounded&&p.vy!==0){
   const candidates=[...new Set(hits.flatMap(t=>[t.y-p.h,t.y+t.h-HEAD_INSET]))]
    .filter(y=>Math.abs(y-p.y)<=CORNER_ASSIST&&y+HEAD_INSET>=0)
    .sort((a,b)=>Math.abs(a-p.y)-Math.abs(b-p.y));
   for(const y of candidates){
    const target=this.playerBody(p.x,y),vertical={...this.playerBody(oldX,Math.min(y,p.y)),h:body.h+Math.abs(y-p.y)},horizontal={...this.playerBody(Math.min(oldX,p.x),y),w:p.w+Math.abs(p.x-oldX)};
    if(!this.blocked(target)&&!this.blocked(vertical)&&!this.blocked(horizontal)){p.y=y;return;}
   }
  }
  p.x=dx>0?Math.min(...hits.map(t=>t.x-p.w)):Math.max(...hits.map(t=>t.x+t.w));p.vx=0;
 }
 moveY(dy,oldFeet){
  const p=this.player,oldY=p.y,wasGrounded=p.grounded;p.y+=dy;p.grounded=false;p.ride=null;
  const surfaces=this.tilesNear(this.playerBody()).concat(this.enemies.filter(e=>e.alive&&e.contact===1).map(e=>({...e,kind:2,platform:e})));
  let floor=null;
  for(const t of surfaces){
   if(!overlap(this.playerBody(),t))continue;
   if(dy>=0&&oldFeet<=t.y+Math.max(1,t.platform?Math.abs(t.platform.dy)+1:1)&&!(t.kind===2&&this.drop>0)){
    if(!floor||t.y<floor.y)floor=t;
   }else if(dy<0&&t.kind===1){p.y=Math.max(p.y,t.y+t.h-HEAD_INSET);p.vy=0;}
  }
  // A falling body may miss a shaft by a few pixels. Slide past the lip only
  // when both the sideways sweep and the complete downward path are clear.
  if(floor&&floor.kind===1&&dy>0&&!wasGrounded){
   const candidates=[floor.x-p.w,floor.x+floor.w].filter(x=>x>=0&&x+p.w<=640&&Math.abs(x-p.x)<=4&&(!p.vx||(x-p.x)*p.vx>=0)).sort((a,b)=>Math.abs(a-p.x)-Math.abs(b-p.x));
   for(const x of candidates){
    const sideways={...this.playerBody(Math.min(x,p.x),oldY),w:p.w+Math.abs(x-p.x)},downward={...this.playerBody(x,oldY),h:p.h-HEAD_INSET+dy};
    if(this.blocked(sideways)||this.tilesNear(downward).some(t=>overlap(downward,t)))continue;
    if(this.enemies.some(e=>e.alive&&e.contact===1&&overlap(downward,e)))continue;
    p.x=x;floor=null;break;
   }
  }
  if(floor){p.y=floor.y-p.h;p.vy=0;p.grounded=true;p.ride=floor.platform?floor.platform.id:null;if(floor.kind===3&&!this.god&&p.invincible<=0)return this.hurt(true);}
  if(p.y<0){p.y=0;p.vy=Math.max(0,p.vy);}
  if(p.y>400){if(this.god){p.x=this.level.spawn.x+2;p.y=this.level.spawn.y;p.vy=0;}else{this.restart();return true;}}
 }
 step(dt,input={}){
  if(this.complete)return;dt=clamp(dt,0,1/30);this.time+=dt;const p=this.player;
  p.invincible=Math.max(0,p.invincible-dt);this.cooldown=Math.max(0,this.cooldown-dt);this.drop=Math.max(0,this.drop-dt);this.doorCooldown=Math.max(0,this.doorCooldown-dt);
  for(const e of this.enemies){
   if(!e.alive)continue;const ox=e.x,oy=e.y;e.flash=Math.max(0,e.flash-dt);
   if(e.mode!==0){
    const speed=(e.contact===1?36:44)*(this.gentle&&e.contact!==1?.75:1);
    e.x+=e.dirX*speed*dt;e.y+=e.dirY*speed*dt;
    if(e.dirX&&e.x>=e.right){e.x=e.right;e.dirX=-1;}if(e.dirX&&e.x<=e.left){e.x=e.left;e.dirX=1;}
    if(e.dirY&&e.y>=e.bottom){e.y=e.bottom;e.dirY=-1;}if(e.dirY&&e.y<=e.top){e.y=e.top;e.dirY=1;}
   }
   e.dx=e.x-ox;e.dy=e.y-oy;
  }
  if(p.ride!==null){const lift=this.enemies[p.ride];if(lift?.alive){this.moveX(lift.dx);p.y+=lift.dy;}}
  if(p.grounded)p.coyote=.085;else p.coyote=Math.max(0,p.coyote-dt);
  this.jumpBuffer=input.jump?.12:Math.max(0,this.jumpBuffer-dt);
  const under=this.tilesNear({x:p.x,y:p.y+p.h,w:p.w,h:1});
  if(input.down&&p.grounded&&!under.some(t=>t.kind===1||t.kind===3)&&(p.ride!==null||under.some(t=>t.kind===2))){this.drop=.2;p.y+=1;p.grounded=false;p.coyote=0;}
  if(this.jumpBuffer>0&&p.coyote>0){p.vy=-300;p.grounded=false;p.ride=null;p.coyote=0;this.jumpBuffer=0;this.emit('jump');}
  const dir=(input.right?1:0)-(input.left?1:0);p.vx=dir*104;if(dir)p.face=dir;
  this.unlock();this.moveX(p.vx*dt);
  const oldFeet=p.y+p.h;p.vy=Math.min(330,p.vy+600*dt);if(this.moveY(p.vy*dt,oldFeet))return;
  if(input.shoot&&this.cooldown<=0){this.cooldown=.23;this.shots.push({x:p.x+(p.face>0?p.w:-6),y:p.y+7,w:6,h:3,vx:p.face*300,life:1.8});this.emit('shoot');}
  for(const s of this.shots){
   s.life-=dt;const dx=s.vx*dt;const steps=Math.max(1,Math.ceil(Math.abs(dx)/3));
   for(let k=0;k<steps&&s.life>0;k++){
    s.x+=dx/steps;
    if(s.x<0||s.x>640||this.tilesNear(s).some(t=>t.kind===1&&overlap(s,t))){s.life=0;this.emit('impact',{x:s.x,y:s.y});break;}
    for(const e of this.enemies)if(e.alive&&e.contact===0&&overlap(s,e)){
     s.life=0;e.flash=.12;
     if(e.hp>0&&e.hp<255){e.hp--;if(!e.hp){e.alive=false;this.emit('defeat',{x:e.x+e.w/2,y:e.y+e.h/2});}}
     this.emit('impact',{x:s.x,y:s.y});break;
    }
   }
  }
  this.shots=this.shots.filter(s=>s.life>0);
  for(const e of this.enemies)if(e.alive&&e.contact===0&&overlap({...p,x:p.x+1,y:p.y+2,w:p.w-2,h:p.h-3},{...e,x:e.x+2,y:e.y+2,w:Math.max(1,e.w-4),h:Math.max(1,e.h-4)}))if(this.hurt())return;
  for(const i of this.items){
   if(i.taken||i.kind===2||!overlap(p,{...i,x:i.x+2,y:i.y+2,w:12,h:12}))continue;
   if(i.kind===0){
    this.collected++;
   }else if(i.kind===1)this.keys[i.sprite-81]++;
   else if(i.kind===3)this.card=true;
   i.taken=true;this.emit(i.kind===3?'card':'collect',{x:i.x,y:i.y});
  }
  if(this.index===0){
   const door=this.level.doors.find(d=>Math.abs(p.x+6-(d.x+8))<14&&Math.abs(p.y-(d.y))<22);
   this.nearDoor=door||null;
   if(door&&input.up&&this.doorCooldown<=0){this.doorCooldown=.5;if(door.id===1&&!Array.from({length:23},(_,i)=>i+2).every(id=>this.done.includes(id)))this.emit('lockedFinale');else this.emit('enter',{index:door.id});}
  }else{
   const exit=this.exitStatus();
   if(exit.ready&&(exit.atDoor||(exit.near&&input.up))){
    this.complete=true;if(!this.done.includes(this.index))this.done.push(this.index);this.emit('complete');
   }else if((input.up||(exit.near&&!this.wasNearExit))&&this.doorCooldown<=0){
    this.emit('exitInfo',exit);this.doorCooldown=.5;
   }
   this.wasNearExit=exit.near;
  }
 }
}
if(typeof module!=='undefined')module.exports={Game,clamp,overlap};else root.WillyEngine={Game,clamp,overlap};
})(globalThis);
