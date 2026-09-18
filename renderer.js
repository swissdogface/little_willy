'use strict';
window.WillyRenderer=(()=>{
const COLORS=['#0b1020','#244ab8','#329653','#29afb3','#a23a3a','#a437a2','#a5743a','#b1bfcc','#536477','#667fff','#81e487','#8ee9e5','#fa7a68','#ec8dd7','#ffe49b','#f4fcff'];
const CLASSIC=['#000000','#0000aa','#00aa00','#00aaaa','#aa0000','#aa00aa','#aa5500','#aaaaaa','#555555','#5555ff','#55ff55','#55ffff','#ff5555','#ff55ff','#ffff55','#ffffff'];
const cache=new Map();let hd=true;
function tint(hex,amount){return '#'+hex.slice(1).match(/../g).map(v=>Math.round(Math.max(0,Math.min(255,parseInt(v,16)+amount))).toString(16).padStart(2,'0')).join('');}
function distance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function simplify(points){if(points.length<3)return points;let d=.58,i=0;for(let k=1;k<points.length-1;k++){const v=distance(points[k],points[0],points.at(-1));if(v>d){d=v;i=k;}}return i?simplify(points.slice(0,i+1)).slice(0,-1).concat(simplify(points.slice(i))):[points[0],points.at(-1)];}
function contour(path,flat){
 let p=[];for(let i=0;i<flat.length;i+=2)p.push([flat[i],flat[i+1]]);
 if(p.length>6){const half=Math.floor(p.length/2);p=simplify(p.slice(0,half+1)).slice(0,-1).concat(simplify(p.slice(half).concat([p[0]])).slice(0,-1));}
 if(p.length<3)return;
 for(let i=0;i<p.length;i++){
  const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];
  const ra=Math.min(.5,Math.hypot(a[0]-b[0],a[1]-b[1])*.25),rc=Math.min(.5,Math.hypot(c[0]-b[0],c[1]-b[1])*.25);
  const al=Math.hypot(a[0]-b[0],a[1]-b[1])||1,cl=Math.hypot(c[0]-b[0],c[1]-b[1])||1;
  const x=b[0]+(a[0]-b[0])*ra/al,y=b[1]+(a[1]-b[1])*ra/al;
  if(i===0)path.moveTo(x,y);else path.lineTo(x,y);
  path.quadraticCurveTo(b[0],b[1],b[0]+(c[0]-b[0])*rc/cl,b[1]+(c[1]-b[1])*rc/cl);
 }path.closePath();
}
function renderShape(desc,key){
 const id=(hd?'hd:':'dos:')+key;if(cache.has(id))return cache.get(id);
 const c=document.createElement('canvas'),scale=hd?6:1;c.width=desc.w*scale;c.height=desc.h*scale;const g=c.getContext('2d');g.scale(scale,scale);
 if(!hd){for(let y=0;y<desc.h;y++)for(let x=0;x<desc.w;x++)if(desc.rows[y][x]>=0){g.fillStyle=CLASSIC[desc.rows[y][x]];g.fillRect(x,y,1,1);}}
 else for(const [color,loops] of desc.paths){
  const p=new Path2D();for(const loop of loops)contour(p,loop);
  const grad=g.createLinearGradient(0,0,desc.w*.3,desc.h);grad.addColorStop(0,tint(COLORS[color],13));grad.addColorStop(.48,COLORS[color]);grad.addColorStop(1,tint(COLORS[color],-14));g.fillStyle=color===0||desc.paths.length===1?COLORS[color]:grad;
  g.strokeStyle=COLORS[color];g.lineWidth=.15;g.stroke(p);g.fill(p,'evenodd');
 }
 cache.set(id,c);return c;
}
function sprite(g,level,id,x,y,flip=false,alpha=1){const ref=level.spriteMap[id];if(!ref)return;const d=WILLY_ART.sprites[ref[0]]?.[ref[1]];if(!d)return;const im=renderShape(d,'s'+ref.join(':'));g.save();g.globalAlpha=alpha;if(flip){g.translate(x+d.w-8,y);g.scale(-1,1);g.drawImage(im,0,0,d.w,d.h);}else g.drawImage(im,x,y,d.w,d.h);g.restore();}
let map=null,mapId='',finale=new Image();finale.src='finale-original.png';
const materials=new Image();materials.src='materials-hd.png';materials.onload=()=>{mapId='';};
const materialCache=new Map();
function materialPattern(g,id){
 if(!materialCache.has(id)){const c=document.createElement('canvas');c.width=384;c.height=384;const s=materials.naturalWidth/4;c.getContext('2d').drawImage(materials,id%4*s,Math.floor(id/4)*s,s,s,0,0,384,384);materialCache.set(id,c);}
 const p=g.createPattern(materialCache.get(id),'repeat');p.setTransform(new DOMMatrix().scale(1/6));return p;
}
function materialLayers(g,level){
 if(!materials.complete||!materials.naturalWidth)return;
 const rules={LMAIN:[[3,[1,9],27,27]],L02:[[0,[3,11],0,15]],L03:[[1,[6,14],0,17],[1,[6,14],48,62],[13,[7,8],18,19],[13,[7,8],42,43]],L04:[[6,[2,10],0,62],[2,[4,12],0,62],[4,[5,13,9],12,35]],L05:[[5,[4,12],0,59],[4,[5,13],0,59]],L06:[[11,[3,11],0,59],[14,[5,13],0,59]],L07:[[7,[6,14,5],0,59],[0,[3,11],0,59]],L08:[[9,[6,14],0,59],[14,[5,13],0,59]],L09:[[13,[7,8],0,25]],L10:[[8,[7,8],0,59],[9,[6,14],0,59]],L11:[[5,[4,12],0,59],[13,[7,8],0,59]],L13:[[10,[7,8],0,56]]}[level.theme]||[];
 for(const [mat,colors,lo,hi] of rules){
  const mask=new Path2D();
  for(let i=0;i<960;i++){
   const index=level.tiles[i]&63;if(index<lo||index>hi)continue;const desc=WILLY_ART.tiles[level.theme]?.[index];if(!desc)continue;
   // Mask material inside the original motif colours, at original tile positions.
   const local=new Path2D();for(const [color,loops] of desc.paths)if(colors.includes(color))for(const loop of loops)contour(local,loop);
   mask.addPath(local,new DOMMatrix().translate(i%40*16,Math.floor(i/40)*16));
  }
  g.save();g.clip(mask,'evenodd');g.fillStyle=materialPattern(g,mat);g.fillRect(0,0,640,384);g.restore();
 }
}
function prepare(level){
 const key=level.id+':'+hd;if(key===mapId)return;mapId=key;
 map=document.createElement('canvas');map.width=2560;map.height=1536;const g=map.getContext('2d');g.scale(4,4);g.fillStyle=hd?COLORS[0]:'#000';g.fillRect(0,0,640,384);g.imageSmoothingEnabled=hd;
 if(level.id===1){
  if(hd&&WILLY_ART.finale){g.drawImage(renderShape(WILLY_ART.finale,'finale'),0,0,640,384);if(materials.complete&&materials.naturalWidth){const p=new Path2D();for(const [color,loops] of WILLY_ART.finale.paths)if(color===4||color===12)for(const loop of loops)contour(p,loop);g.save();g.clip(p,'evenodd');g.fillStyle=materialPattern(g,2);g.fillRect(0,0,640,384);g.restore();}}
  else if(finale.complete&&finale.naturalWidth)g.drawImage(finale,0,0,640,384);else{mapId='';return;}
 }
 else{
  for(let i=0;i<960;i++){const index=level.tiles[i]&63,desc=WILLY_ART.tiles[level.theme]?.[index];if(!desc)continue;g.drawImage(renderShape(desc,'t'+level.theme+':'+index),i%40*16,Math.floor(i/40)*16,16,16);}
 }
 if(hd&&level.id!==1){materialLayers(g,level);if(level.theme==='L11')lavaMaterials(g,level);g.fillStyle='rgba(5,15,32,.17)';g.fillRect(0,0,640,384);wallMaterials(g,level);}
 // Add fine lighting to exposed original surfaces, without changing their outlines.
 if(hd){
  g.lineWidth=.35;
  for(let i=0;i<960;i++){
   const type=level.tiles[i]>>6;if(type!==1&&type!==2)continue;const x=i%40*16,y=Math.floor(i/40)*16;
   if(i<40||(level.tiles[i-40]>>6)===0){g.strokeStyle='rgba(218,248,255,.32)';g.beginPath();g.moveTo(x+.5,y+.4);g.lineTo(x+15.5,y+.4);g.stroke();}
   if(i>=920||(level.tiles[i+40]>>6)===0){g.fillStyle='rgba(0,5,20,.2)';g.fillRect(x,y+14.8,16,1.2);}
  }
 }
}
function wallMaterials(g,level){
 if(!materials.complete||!materials.naturalWidth)return;
 const mat={LMAIN:3,L02:12,L03:13,L04:2,L05:4,L06:11,L07:7,L08:9,L09:13,L10:9,L13:10}[level.theme];if(mat===undefined)return;
 for(let i=0;i<960;i++){
  if((level.tiles[i]>>6)!==1)continue;
  const x=i%40*16,y=Math.floor(i/40)*16,index=level.tiles[i]&63,desc=WILLY_ART.tiles[level.theme][index];
  let material=mat;
  if(level.theme==='L07'){const cyan=desc.rows.flat().filter(c=>c===3||c===11).length;if(cyan>100)material=0;}
  g.save();g.beginPath();g.rect(x,y,16,16);g.clip();g.fillStyle=materialPattern(g,material);g.fillRect(x,y,16,16);g.restore();
  g.strokeStyle='rgba(5,15,25,.58)';g.lineWidth=.65;g.strokeRect(x+.35,y+.35,15.3,15.3);
  g.strokeStyle='rgba(229,254,255,.65)';g.lineWidth=.45;g.beginPath();g.moveTo(x+.9,y+15);g.lineTo(x+.9,y+.9);g.lineTo(x+15,y+.9);g.stroke();
  if(level.theme==='LMAIN'){
   g.strokeStyle='#b7e9ff';g.lineWidth=1;g.beginPath();g.moveTo(x+4,y+12);g.lineTo(x+12,y+4);g.lineTo(x+8,y+4);g.moveTo(x+12,y+4);g.lineTo(x+12,y+8);g.stroke();
  }else if(level.theme==='L02'&&index===5){
   g.strokeStyle='#2d53a4';g.lineWidth=1.8;g.strokeRect(x+1,y+1,14,14);g.strokeStyle='#cbfbff';g.lineWidth=.5;g.strokeRect(x+2.3,y+2.3,11.4,11.4);
  }else if(level.theme==='L05'||level.theme==='L06'||level.theme==='L09'){
   let accent=level.theme==='L05'?'#e9c7fc':level.theme==='L06'?'#f394dd':COLORS[desc.rows.flat().find(c=>c>=9&&c!==15)||14];
   g.strokeStyle=accent;g.lineWidth=.75;g.strokeRect(x+1.5,y+1.5,13,13);
  }else if(level.theme==='L13'){
   g.strokeStyle='#304658';g.lineWidth=.5;g.strokeRect(x+3,y+4,10,8);g.fillStyle='#89e4d7';g.fillRect(x+4,y+5,5,3);g.fillStyle='#f3bc76';g.fillRect(x+11,y+5,1,1);g.fillStyle='#4c6676';for(let q=0;q<3;q++)g.fillRect(x+4+q*2.5,y+10,1.5,.6);
  }
 }
}
function lavaMaterials(g,level){
 if(!materials.complete||!materials.naturalWidth)return;
 for(let i=0;i<960;i++){
  const value=level.tiles[i],idx=value&63,type=value>>6,desc=WILLY_ART.tiles.L11[idx],p=new Path2D();
  if(type===3)continue;
  for(const [color,loops] of desc.paths)if([0,4,6,12,14].includes(color))for(const loop of loops)contour(p,loop);
  g.save();g.translate(i%40*16,Math.floor(i/40)*16);g.clip(p,'evenodd');g.translate(-(i%40*16),-Math.floor(i/40)*16);g.fillStyle=materialPattern(g,5);g.fillRect(0,0,640,384);g.fillStyle=type===1?'rgba(255,147,73,.16)':'rgba(12,8,26,.56)';g.fillRect(0,0,640,384);g.restore();
 }
}
function rounded(g,x,y,w,h,r,fill,stroke){g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=.6;g.stroke();}}
function ellipse(g,x,y,rx,ry,fill){g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fillStyle=fill;g.fill();}
function completionBadge(g,x,y,time){
 const pulse=1+Math.sin(time*4)*.06;g.save();g.translate(x,y);g.scale(pulse,pulse);g.shadowColor='#1cff75';g.shadowBlur=3;g.fillStyle='#16b85f';g.beginPath();g.arc(0,0,6.5,0,Math.PI*2);g.fill();g.shadowBlur=0;g.strokeStyle='#f3fff7';g.lineWidth=1.8;g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo(-3.2,0);g.lineTo(-.7,2.7);g.lineTo(3.8,-2.8);g.stroke();g.restore();
}
function hero(g,p,time,shooting,god,level){
 if(!hd){sprite(g,level,(p.face<0?0:12)+(p.grounded&&Math.abs(p.vx)>1?Math.floor(time*15)%8:0),p.x-2,p.y);return;}
 g.save();g.translate(p.x+6,p.y+8);if(p.face<0)g.scale(-1,1);
 if(p.invincible>0&&!god&&Math.floor(time*14)%2===0)g.globalAlpha=.55;
 const run=p.grounded&&Math.abs(p.vx)>1?Math.sin(time*19):0,outline='#243140';
 if(god){g.strokeStyle='#ffeeab';g.lineWidth=.65;g.globalAlpha=.9;g.beginPath();g.ellipse(0,-.3,10,11,0,0,Math.PI*2);g.stroke();}
 ellipse(g,0,8,6.6,1,'rgba(0,0,0,.3)');
 rounded(g,-3+run*1.6,4,2.5,3,1,'#facb97',outline);rounded(g,1-run*1.6,4,2.5,3,1,'#facb97',outline);
 rounded(g,-4+run*1.6,6,4,2,1,'#d64f44',outline);rounded(g,.5-run*1.6,6,4,2,1,'#ef7259',outline);
 rounded(g,-4,1,8,4,1.2,'#51a65c',outline);g.fillStyle='#82cd69';g.fillRect(-3,1.2,5,.6);
 rounded(g,-4,-4,8,7,2,'#dd584c',outline);rounded(g,-3.5,-3.6,3.7,4,1.4,'#fa8571');
 ellipse(g,-3.5,-6.1,1.1,1.3,'#e0a471');
 rounded(g,-4,-10.8,8.7,7.3,2.7,'#ffe0ad',outline);ellipse(g,4,-6.7,1.3,1.3,'#ffdbab');
 g.fillStyle='#e5ae39';g.strokeStyle=outline;g.lineWidth=.5;g.beginPath();g.moveTo(-4.5,-6.6);g.lineTo(-5.1,-10.8);g.quadraticCurveTo(-3.5,-14,0,-12);g.lineTo(2,-13);g.lineTo(1.5,-11.8);g.quadraticCurveTo(5,-12,5,-9.8);g.lineTo(2,-9.7);g.lineTo(1.5,-8.6);g.lineTo(-1,-9.9);g.lineTo(-2.5,-7.8);g.closePath();g.fill();g.stroke();
 g.strokeStyle='#fff1a9';g.lineWidth=.7;g.beginPath();g.moveTo(-3.4,-10.7);g.quadraticCurveTo(-1.8,-12,1,-10.9);g.stroke();
 ellipse(g,2.5,-7.7,.75,1.05,'#fff');ellipse(g,2.8,-7.6,.38,.72,'#1a3b4b');g.strokeStyle='#a56447';g.lineWidth=.4;g.beginPath();g.moveTo(1.5,-4.7);g.quadraticCurveTo(2.8,-4.1,3.6,-5);g.stroke();
 rounded(g,1,-2,5.2,2.7,1.3,'#ffdaa8',outline);
 rounded(g,4,-2.8,5.4,2.7,.6,'#698698',outline);rounded(g,7,-2.2,4,.9,.2,'#b8e9eb');rounded(g,5,-.8,1.8,2.5,.4,'#435969',outline);
 if(shooting){g.fillStyle='#fff1ad';g.beginPath();g.moveTo(11,-2);g.lineTo(15,-3.7);g.lineTo(13,-1.6);g.lineTo(15,0);g.lineTo(11,-.5);g.closePath();g.fill();}
 g.restore();
}
function draw(g,game,view,time){
 prepare(game.level);g.save();g.beginPath();g.rect(view.x,view.y,view.w,view.h);g.clip();g.fillStyle='#08101c';g.fillRect(view.x,view.y,view.w,view.h);g.translate(view.x-view.camX*view.scale,view.y-view.camY*view.scale);g.scale(view.scale,view.scale);g.imageSmoothingEnabled=hd;
 if(map)g.drawImage(map,0,0,640,384);
 for(const e of game.level.extras)sprite(g,game.level,e.sprite,e.x,e.y);
 for(const d of game.level.doors){
  const done=game.done.includes(d.id),near=game.nearDoor?.id===d.id;g.fillStyle=done?'#82dfae':near?'#ffe299':'#d4e8f5';g.font='bold 5px system-ui';g.textAlign='center';g.fillText(d.id===1?'FINAL':String(d.id).padStart(2,'0'),d.x+8,d.y-3);
  if(d.id===2&&!done){g.fillStyle='#ffe299';g.font='bold 5px system-ui';g.fillText('★ START HERE',d.x+8,d.y-10);g.strokeStyle='#ffe299';g.lineWidth=1;g.strokeRect(d.x,d.y,16,32);}
  if(done){g.strokeStyle='#45f08d';g.lineWidth=1.1;g.strokeRect(d.x+.5,d.y+.5,15,31);completionBadge(g,d.x+8,d.y+16,time);}
 }
 if(game.index){const d=game.level.exit,{ready,near}=game.exitStatus();g.strokeStyle=ready?'#b5f5b2':'#d5b39a';g.lineWidth=near?1.2:.6;g.strokeRect(d.x+.5,d.y+.5,15,31);g.fillStyle=ready?'#c4ffbb':'#e3cab7';g.font='bold 4px system-ui';g.textAlign='center';g.fillText('EXIT',d.x+8,d.y+8);if(ready){g.globalAlpha=.12+Math.sin(time*4)*.06;g.fillStyle='#afff97';g.fillRect(d.x,d.y,16,32);g.globalAlpha=1;}else{g.strokeStyle='#e8b489';g.lineWidth=.7;g.strokeRect(d.x+6,d.y+15,4,3);g.beginPath();g.arc(d.x+8,d.y+15,1.4,Math.PI,0);g.stroke();}}
 for(const i of game.items)if(!i.taken)sprite(g,game.level,i.sprite,i.x,i.y);
 for(const e of game.enemies){
  if(!e.alive)continue;const period=e.animation.reduce((a,f)=>a+f[0],0);let t=Math.floor(time*12)%period,frame=e.animation[0][1];for(const f of e.animation){frame=f[1];if(t<f[0])break;t-=f[0];}
  sprite(g,game.level,frame,e.x,e.y,false,e.flash>0?.45:1);
  if(e.contact===1&&hd){g.strokeStyle='rgba(216,255,255,.8)';g.lineWidth=.35;g.beginPath();g.moveTo(e.x,e.y);g.lineTo(e.x+e.w,e.y);g.stroke();}
 }
 if(game.checkpoint){const p=game.checkpoint.player;g.strokeStyle='#7aefbc';g.lineWidth=1;g.beginPath();g.moveTo(p.x+6,p.y+16);g.lineTo(p.x+6,p.y-4);g.stroke();g.fillStyle='#7aefbc';g.beginPath();g.moveTo(p.x+6,p.y-4);g.lineTo(p.x+16,p.y);g.lineTo(p.x+6,p.y+4);g.fill();}
 hero(g,game.player,time,game.cooldown>.15,game.god,game.level);
 for(const s of game.shots){rounded(g,s.x,s.y,s.w,s.h,1.3,'#fff1b9');g.fillStyle='#ff9d50';g.fillRect(s.x+(s.vx>0?-4:6),s.y+.7,4,1.5);}
 g.restore();
}
return {draw,setHD(on){hd=!!on;mapId='';},prepare,sprite};
})();
