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
// Title-art treats, drawn as vectors so their curves stay sharp at any zoom.
function titleTreat(g,can){
 g.save();g.translate(8,8);g.rotate(can?.32:.38);g.lineJoin='round';g.lineCap='round';
 if(can){
  const metal=g.createLinearGradient(-4,0,4,0);metal.addColorStop(0,'#647681');metal.addColorStop(.25,'#f5fcff');metal.addColorStop(.5,'#a7b8c4');metal.addColorStop(.8,'#eff8ff');metal.addColorStop(1,'#52616f');
  const red=g.createLinearGradient(-4,0,4,0);red.addColorStop(0,'#870b13');red.addColorStop(.3,'#ff4c35');red.addColorStop(.55,'#e91819');red.addColorStop(1,'#970c18');
  rounded(g,-4,-6,8,12,1.2,metal,'#243341');
  rounded(g,-3.9,-4.8,7.8,9.4,.7,red);
  // Broad cream ribbon and curled emblem echo the can on the home screen.
  g.fillStyle='#fff3dc';g.beginPath();g.moveTo(-2.8,-4.6);g.bezierCurveTo(4,-1.2,-3.9,1.5,1.8,4.5);g.lineTo(-.7,4.5);g.bezierCurveTo(-5,1.2,2,-.5,-3.5,-3.8);g.closePath();g.fill();
  g.strokeStyle='#fff9ea';g.lineWidth=.65;g.beginPath();g.arc(-1.3,-1.9,1.1,-.8,4.9);g.stroke();
  ellipse(g,0,-5.8,3.9,1,metal);g.strokeStyle='#354957';g.lineWidth=.35;g.stroke();
  ellipse(g,.7,-5.85,1,.35,'#465b68');ellipse(g,-.25,-5.9,.75,.28,'#e9f3f6');
  ellipse(g,0,5.65,3.7,.85,metal);g.strokeStyle='#334652';g.lineWidth=.4;g.stroke();
  g.strokeStyle='rgba(255,255,255,.6)';g.lineWidth=.4;g.beginPath();g.moveTo(-2.9,-4.3);g.lineTo(-2.9,3.7);g.stroke();
 }else{
  rounded(g,-.9,-1,1.8,8,0.85,'#ffedcb','#70503b');
  const candy=g.createRadialGradient(-1.8,-4.7,.3,0,-2.8,5.4);candy.addColorStop(0,'#ff6140');candy.addColorStop(.55,'#e92320');candy.addColorStop(1,'#930b16');
  ellipse(g,0,-2.8,5,5,'#fff0cf');g.strokeStyle='#57322c';g.lineWidth=.55;g.stroke();
  ellipse(g,0,-2.8,4.55,4.55,candy);
  g.save();g.beginPath();g.arc(0,-2.8,4.5,0,Math.PI*2);g.clip();g.strokeStyle='#fff1d7';g.lineWidth=1.3;g.beginPath();
  for(let n=0;n<=120;n++){const t=n/120*Math.PI*4.6,r=.12+n/120*4.9,px=Math.cos(t)*r,py=-2.8+Math.sin(t)*r;if(n===0)g.moveTo(px,py);else g.lineTo(px,py);}g.stroke();g.restore();
  g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=.65;g.beginPath();g.arc(0,-2.8,4,-2.7,-1.25);g.stroke();
 }
 g.restore();
}
function iceSprite(g,id,x,y,alpha){
 g.save();g.globalAlpha=alpha;g.translate(x,y);const outline='#173d64';
 if(id>=31&&id<=33){ // playful snow creature
  ellipse(g,8,10,7,5.6,'#a9efff');ellipse(g,5,7.2,3.3,3.5,'#d9fbff');ellipse(g,11,7.2,3.3,3.5,'#d9fbff');
  g.fillStyle='#193e62';g.beginPath();g.arc(5.4,7.5,.8,0,7);g.arc(10.6,7.5,.8,0,7);g.fill();g.strokeStyle=outline;g.lineWidth=.65;g.stroke();
  g.fillStyle='#8cc8e6';g.beginPath();g.moveTo(1.5,11);g.lineTo(-.4,14.5);g.lineTo(4,13.5);g.fill();g.beginPath();g.moveTo(14.5,11);g.lineTo(16.4,14.5);g.lineTo(12,13.5);g.fill();
 }else if(id>=34&&id<=41){ // ice moth
  g.fillStyle='#7be5f4';g.strokeStyle=outline;g.lineWidth=.65;g.beginPath();g.ellipse(5,8,5,3.8,-.55,0,7);g.ellipse(11,8,5,3.8,.55,0,7);g.fill();g.stroke();ellipse(g,8,8,2,4.8,'#e1ffff');g.fillStyle='#214f7a';g.fillRect(7.4,5,1.2,5);
 }else if(id>=42&&id<=45){ // warning icicle
  const pulse=id===45?1.25:1;g.shadowColor='#6af4ff';g.shadowBlur=2*pulse;g.fillStyle='#bffaff';g.beginPath();g.moveTo(8,1);g.lineTo(14,14);g.lineTo(8,12);g.lineTo(2,14);g.closePath();g.fill();g.shadowBlur=0;g.strokeStyle=outline;g.lineWidth=.6;g.stroke();
 }else if(id>=46&&id<=52){ // floating frost orb
  g.shadowColor='#66e8ff';g.shadowBlur=4;ellipse(g,6,8,4.5,6,'#7beafd');g.shadowBlur=0;ellipse(g,6,8,2.2,3.2,'#e6ffff');g.fillStyle='#285388';g.fillRect(5.2,7,1.6,3);
 }else if(id===80||id===89){ // red-and-cream spiral lollipop
  titleTreat(g,false);
 }else if(id>=81&&id<=83){ // keys: green, red, yellow — matched to their locks
  const colors=['#75dc82','#f16d66','#f4c85a'];g.strokeStyle=colors[id-81];g.shadowColor=colors[id-81];g.shadowBlur=2;g.lineWidth=2;g.beginPath();g.arc(5,6,3,0,7);g.moveTo(7.2,8.2);g.lineTo(14,14);g.lineTo(11,14);g.moveTo(12,12);g.lineTo(14,10);g.stroke();g.shadowBlur=0;
 }else if(id>=84&&id<=86){ // matching locks
  const colors=['#75dc82','#f16d66','#f4c85a'];rounded(g,2,6,12,9,1.6,colors[id-84],outline);g.strokeStyle='#efffff';g.lineWidth=1.2;g.beginPath();g.arc(8,6,3.5,Math.PI,0);g.stroke();g.fillStyle='#183d5b';g.fillRect(7.1,10,1.8,2.8);
 }else if(id===87){ // exit card
  rounded(g,1,3,14,10,1.2,'#f9d985',outline);g.fillStyle='#c85b62';g.fillRect(3,5,10,1.5);g.fillStyle='#263f56';g.font='bold 3.4px system-ui';g.textAlign='center';g.fillText('EXIT',8,11);
 }else if(id===88){ // soda can
  titleTreat(g,true);
 }else {g.restore();return false;}
 g.restore();return true;
}
function worldEnemy(g,level,id,x,y,alpha,flip=false){
 // Complete eight-frame walking boy for Map 04. His neutral artwork faces right;
 // the live horizontal velocity mirrors every frame when he turns left.
 if(level.theme==='L04'&&id>=52&&id<=59){
  const phase=(id-52)*Math.PI/4,stride=Math.sin(phase)*2.2,bob=Math.abs(Math.sin(phase))*.65;
  g.save();g.globalAlpha=alpha;g.translate(x+14.5,y+14.5+bob);if(flip)g.scale(-1,1);g.translate(-14.5,-14.5);
  const edge='#493426';g.lineCap='round';g.lineJoin='round';
  // Warm, rounded Alpine outfit; the cross stays unobstructed in every pose.
  g.strokeStyle='#f8e6bd';g.lineWidth=2.5;g.beginPath();g.moveTo(12,21);g.lineTo(10+stride,25);g.moveTo(17,21);g.lineTo(19-stride,25);g.stroke();
  rounded(g,6.5+stride,24,7,3.2,1.4,'#875434',edge);rounded(g,15.5-stride,24,7,3.2,1.4,'#875434',edge);
  g.strokeStyle='#e7b879';g.lineWidth=.55;g.beginPath();g.moveTo(9+stride,24.7);g.lineTo(11+stride,25);g.moveTo(18-stride,24.7);g.lineTo(20-stride,25);g.stroke();
  rounded(g,9,18,11,5,1.8,'#69513d',edge);
  g.strokeStyle='#fff2d9';g.lineWidth=3.4;g.beginPath();g.moveTo(9,14);g.lineTo(6-stride*.5,18);g.moveTo(20,14);g.lineTo(23+stride*.5,17.8);g.stroke();
  ellipse(g,6-stride*.5,18.5,1.65,1.6,'#ffcc9c');ellipse(g,23+stride*.5,18.3,1.65,1.6,'#ffcc9c');
  const vest=g.createLinearGradient(9,12,21,20);vest.addColorStop(0,'#ff6151');vest.addColorStop(.5,'#e93135');vest.addColorStop(1,'#a3192d');
  rounded(g,8.5,11,13,10,3.5,vest,edge);
  g.fillStyle='#fff8df';g.beginPath();g.moveTo(11,11);g.lineTo(14.7,13);g.lineTo(18.5,11);g.closePath();g.fill();
  // Equal-armed Swiss flag cross, large enough to read at game scale.
  g.fillStyle='#fffdf2';g.fillRect(13.8,13.7,2.3,6.1);g.fillRect(11.9,15.6,6.1,2.3);
  const skin=g.createRadialGradient(16,6,1,16,8,6.5);skin.addColorStop(0,'#ffe6bf');skin.addColorStop(1,'#e9a275');
  ellipse(g,16,7.5,6.2,5.7,skin);g.strokeStyle=edge;g.lineWidth=.6;g.stroke();
  ellipse(g,11,8.1,1.6,2,'#ffc998');ellipse(g,21.3,8.4,1.8,1.5,'#ffd2a5');
  ellipse(g,18.8,10,1.6,.8,'#ed9382');
  g.fillStyle='#855333';g.beginPath();g.moveTo(10.3,4.8);g.quadraticCurveTo(14,2.8,17,4.1);g.lineTo(15.6,6.1);g.lineTo(14.4,5.3);g.lineTo(12.3,7);g.lineTo(11.8,9);g.lineTo(10.6,7.4);g.closePath();g.fill();
  ellipse(g,18.3,7.3,1.15,1.55,'#fffdf0');ellipse(g,18.8,7.5,.55,.85,'#354b42');ellipse(g,18.95,7.15,.2,.28,'#fff');
  g.strokeStyle='#79513b';g.lineWidth=.55;g.beginPath();g.moveTo(17.2,5.5);g.quadraticCurveTo(18.3,4.8,19.2,5.4);g.stroke();
  g.fillStyle='#813e35';g.beginPath();g.moveTo(16.3,10);g.quadraticCurveTo(18.4,11.2,20.5,9.8);g.quadraticCurveTo(19,13.1,16.3,10);g.fill();
  g.strokeStyle='#fff8e7';g.lineWidth=.55;g.beginPath();g.moveTo(17,10.5);g.quadraticCurveTo(18.5,11,19.6,10.35);g.stroke();
  // Alpine felt hat with cream feather and red hatband.
  const felt=g.createLinearGradient(10,1,19,5);felt.addColorStop(0,'#8fba73');felt.addColorStop(1,'#376644');
  g.fillStyle=felt;g.strokeStyle=edge;g.lineWidth=.55;g.beginPath();g.moveTo(10,4.4);g.lineTo(12.3,.5);g.quadraticCurveTo(13,-.1,14.3,1.1);g.lineTo(17.8,.6);g.lineTo(20.6,4.8);g.closePath();g.fill();g.stroke();
  rounded(g,10.3,3.2,10,1.7,.4,'#b82731');ellipse(g,15.4,5,8.4,1.25,felt);g.strokeStyle=edge;g.lineWidth=.45;g.stroke();
  g.fillStyle='#fff4c9';g.beginPath();g.moveTo(11,3.6);g.quadraticCurveTo(6.5,2.4,7,-.1);g.quadraticCurveTo(10,-.4,11,3.6);g.fill();
  g.strokeStyle='#b39661';g.lineWidth=.3;g.beginPath();g.moveTo(11,3.6);g.lineTo(7.7,.7);g.stroke();
  g.restore();return true;
 }
 if(id<31||id>52)return false;
 // The original eight-frame wheel in Map 04 is a rolling Swiss cheese.
 if(level.theme==='L04'&&id>=36&&id<=43){
  g.save();g.globalAlpha=alpha;g.translate(x+14,y+14);g.rotate((43-id)*Math.PI/4);
  g.shadowColor='rgba(255,190,45,.55)';g.shadowBlur=3;
  const rind=g.createRadialGradient(-4,-5,1,0,0,13);rind.addColorStop(0,'#fff2a1');rind.addColorStop(.58,'#f6c83d');rind.addColorStop(1,'#b96c12');
  ellipse(g,0,0,12.2,12.2,rind);g.shadowBlur=0;g.strokeStyle='#5d3414';g.lineWidth=1;g.stroke();
  g.strokeStyle='#ffe981';g.lineWidth=1.2;g.beginPath();g.arc(0,0,10.4,-2.75,-.45);g.stroke();
  const holes=[[-4.8,-4.2,2.1],[4.3,-5.1,1.45],[5.1,2.7,2.25],[-3.2,5.1,1.55],[-6.5,1.5,1.15],[.4,-.2,1.35]];
  for(const [hx,hy,hr] of holes){ellipse(g,hx,hy,hr,hr*.82,'#a96318');g.strokeStyle='#6f3c12';g.lineWidth=.35;g.stroke();ellipse(g,hx-.45,hy-.45,hr*.48,hr*.3,'#d99122');}
  g.fillStyle='#fff6b2';g.beginPath();g.moveTo(-7.5,-8);g.quadraticCurveTo(-2,-12,3,-10.2);g.lineTo(1.7,-8.8);g.quadraticCurveTo(-3,-10.2,-6.5,-6.8);g.closePath();g.fill();
  g.restore();return true;
 }
 const palette={L03:['#f3a64f','#5a3226','#ffe1a0'],L08:['#f0c34f','#5d4119','#fff1a8'],L04:['#f06c50','#49223a','#ffd28b'],L11:['#ff784d','#451c2d','#ffd08e'],L05:['#ec86d1','#51275d','#ffd1f7'],L07:['#74db9a','#1d5a5b','#cfffb9'],L06:['#66d9ff','#283c85','#d9fbff'],L13:['#7ee7ce','#225564','#e2fff5'],L09:['#a69ce7','#30345d','#e4ddff'],L10:['#c6e7f0','#49667c','#f3ffff'],LMAIN:['#65dbf5','#20476e','#e6fbff']}[level.theme]||['#7ee7ff','#254d75','#edffff'];const [main,dark,light]=palette;g.save();g.globalAlpha=alpha;g.translate(x,y);g.strokeStyle=dark;g.lineWidth=.7;
 if(id<=33){g.fillStyle=main;g.beginPath();g.ellipse(8,9,6.6,5.5,0,0,7);g.fill();g.stroke();g.fillStyle=light;g.beginPath();g.arc(5.5,8,1.7,0,7);g.arc(10.5,8,1.7,0,7);g.fill();g.fillStyle=dark;g.fillRect(5,7.5,1,1.5);g.fillRect(10,7.5,1,1.5);g.strokeStyle=light;g.beginPath();g.moveTo(3,13);g.lineTo(13,13);g.stroke();}
 else if(id<=41){g.fillStyle=main;g.beginPath();g.ellipse(5,8,5,3.5,-.5,0,7);g.ellipse(11,8,5,3.5,.5,0,7);g.fill();g.stroke();g.fillStyle=light;g.beginPath();g.ellipse(8,8,2,4.6,0,0,7);g.fill();}
 else if(id<=45){g.fillStyle=main;g.beginPath();g.moveTo(8,1);g.lineTo(14,14);g.lineTo(8,12);g.lineTo(2,14);g.closePath();g.fill();g.stroke();g.fillStyle=light;g.fillRect(7.3,5,1.4,4);}
 else{g.shadowColor=main;g.shadowBlur=4;ellipse(g,6,8,4.5,5.5,main);g.shadowBlur=0;ellipse(g,6,8,2.1,2.8,light);g.fillStyle=dark;g.fillRect(5.3,7.1,1.4,2.2);}
 g.restore();return true;
}
function sprite(g,level,id,x,y,flip=false,alpha=1){if(hd&&(level.theme==='L02'||id>=80)&&iceSprite(g,id,x,y,alpha))return;if(hd&&worldEnemy(g,level,id,x,y,alpha,flip))return;const ref=level.spriteMap[id];if(!ref)return;const d=WILLY_ART.sprites[ref[0]]?.[ref[1]];if(!d)return;const im=renderShape(d,'s'+ref.join(':'));g.save();g.globalAlpha=alpha;if(flip){g.translate(x+d.w-8,y);g.scale(-1,1);g.drawImage(im,0,0,d.w,d.h);}else g.drawImage(im,x,y,d.w,d.h);g.restore();}
let map=null,mapId='',finale=new Image();finale.src='finale-original.png';
const materials=new Image();materials.src='materials-hd.png';materials.onload=()=>{mapId='';};
const iceBackdrop=new Image();iceBackdrop.src='ice-caves-backdrop.png';iceBackdrop.onload=()=>{mapId='';};
const finaleBackdrop=new Image();finaleBackdrop.src='finale-backdrop.png';finaleBackdrop.onload=()=>{mapId='';};
const scenicBackdrops={ruins:new Image(),lava:new Image(),alien:new Image(),station:new Image(),caves:new Image(),moon:new Image()};
scenicBackdrops.ruins.src='ruins-backdrop.png';scenicBackdrops.lava.src='lava-backdrop.png';scenicBackdrops.alien.src='alien-backdrop.png';
scenicBackdrops.station.src='station-backdrop.png';
scenicBackdrops.caves.src='crystal-caves-backdrop.png';
scenicBackdrops.moon.src='moon-backdrop.png';
Object.values(scenicBackdrops).forEach(image=>image.onload=()=>{mapId='';});
function scenicBackdrop(level){return ({LMAIN:scenicBackdrops.station,L06:scenicBackdrops.station,L13:scenicBackdrops.station,L03:scenicBackdrops.ruins,L08:scenicBackdrops.ruins,L04:scenicBackdrops.lava,L11:scenicBackdrops.lava,L05:scenicBackdrops.alien,L07:scenicBackdrops.alien,L10:scenicBackdrops.moon,L09:scenicBackdrops.caves})[level.theme]||null;}
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
function iceTile(g,level,i){
 const value=level.tiles[i],type=value>>6,x=i%40*16,y=Math.floor(i/40)*16;
 if(type===0)return;
 if(type===3){g.fillStyle='rgba(34,91,153,.88)';g.beginPath();g.moveTo(x+1,y);g.lineTo(x+15,y);g.lineTo(x+8,y+16);g.closePath();g.fill();g.fillStyle='#d7ffff';g.beginPath();g.moveTo(x+3,y+1);g.lineTo(x+12,y+1);g.lineTo(x+8,y+11);g.closePath();g.fill();return;}
 const above=i<40||((level.tiles[i-40]>>6)===0),left=i%40===0||((level.tiles[i-1]>>6)===0),right=i%40===39||((level.tiles[i+1]>>6)===0),bottom=i>=920||((level.tiles[i+40]>>6)===0);
 const grad=g.createLinearGradient(x,y,x+16,y+16);grad.addColorStop(0,'#c5faff');grad.addColorStop(.18,'#5bcce3');grad.addColorStop(1,'#19558e');rounded(g,x+.2,y+.2,15.6,15.6,1.6,grad,'#163f70');
 g.globalAlpha=.42;g.fillStyle='#efffff';g.beginPath();g.moveTo(x+2,y+3);g.lineTo(x+11,y+2);g.lineTo(x+7,y+7);g.closePath();g.fill();g.fillStyle='#1c5e98';g.beginPath();g.moveTo(x+15,y+7);g.lineTo(x+9,y+15);g.lineTo(x+15,y+15);g.closePath();g.fill();g.globalAlpha=1;
 if(above){g.strokeStyle='#f2ffff';g.lineWidth=1.1;g.beginPath();g.moveTo(x+1.5,y+1.5);g.lineTo(x+14.5,y+1.5);g.stroke();}if(left){g.strokeStyle='rgba(220,255,255,.75)';g.lineWidth=.7;g.beginPath();g.moveTo(x+1.4,y+2);g.lineTo(x+1.4,y+14);g.stroke();}if(right){g.strokeStyle='rgba(5,28,69,.55)';g.lineWidth=.8;g.beginPath();g.moveTo(x+15,y+2);g.lineTo(x+15,y+14);g.stroke();}if(bottom){g.fillStyle='rgba(3,24,64,.32)';g.fillRect(x+1,y+13.9,14,1.3);}
 if(type===2){g.globalAlpha=.3;g.fillStyle='#edfdfd';g.fillRect(x+2,y+4,12,1.4);g.globalAlpha=1;}
}
function modernWorldTiles(g,level){
 const palettes={L01:['#80485b','#2d1c37','#ffc28e'],LMAIN:['#1d4e75','#0a243e','#8ee9f5'],L03:['#d79a42','#704022','#ffe0a0'],L08:['#c49735','#5e4315','#fff0a8'],L04:['#7b3738','#211b2d','#ffb05c'],L11:['#793332','#1d1726','#ff9d54'],L05:['#7a4a8e','#281c45','#f2b4ff'],L07:['#356e70','#163d4d','#a7f0c7'],L06:['#274f79','#152446','#70efff'],L13:['#3a6171','#192b3a','#9cf0df'],L09:['#4e5469','#1d2435','#b7c5df'],L10:['#657c91','#26384d','#e6f4ff']}[level.theme];if(!palettes)return;
 for(let i=0;i<960;i++){
  const type=level.tiles[i]>>6;if(type!==1&&type!==2&&type!==3)continue;const x=i%40*16,y=Math.floor(i/40)*16;
  if(type===3){g.fillStyle=palettes[0];g.beginPath();g.moveTo(x+1,y);g.lineTo(x+15,y);g.lineTo(x+8,y+16);g.closePath();g.fill();g.strokeStyle=palettes[2];g.lineWidth=.6;g.stroke();continue;}
  const grad=g.createLinearGradient(x,y,x+16,y+16);grad.addColorStop(0,palettes[2]);grad.addColorStop(.15,palettes[0]);grad.addColorStop(1,palettes[1]);rounded(g,x+.2,y+.2,15.6,15.6,1.5,grad,palettes[1]);
  g.globalAlpha=.22;g.fillStyle='#fff';g.fillRect(x+1.2,y+1.2,13.6,1.2);g.globalAlpha=1;g.strokeStyle='rgba(6,14,31,.45)';g.lineWidth=.55;g.beginPath();g.moveTo(x+2,y+13);g.lineTo(x+14,y+4);g.stroke();
  if(type===2){g.globalAlpha=.46;g.fillStyle=palettes[2];g.fillRect(x+3,y+6.5,10,1.5);g.globalAlpha=1;}
 }
}
// Keep the original station wayfinding above the upper walkway.
function stationSigns(g){
 g.save();g.textAlign='center';g.textBaseline='middle';
 for(const [label,x,width] of [['EARTH',208,64],['MOON',352,48],['MARS',576,48]]){
  rounded(g,x,2,width,29,2.5,'#0b253e','#76d9f4');
  rounded(g,x+1.5,3.5,width-3,12,1.5,'#174665');
  g.fillStyle='#e5fbff';g.font='bold 8px system-ui';g.fillText(label,x+width/2,10);
  g.strokeStyle='#9aebff';g.lineWidth=2;g.lineCap='round';g.lineJoin='round';
  const cx=x+width/2;g.beginPath();g.moveTo(cx,18);g.lineTo(cx,26);g.moveTo(cx-4,22);g.lineTo(cx,26);g.lineTo(cx+4,22);g.stroke();
 }
 rounded(g,16,49,108,12,2,'#0b253e','#76d9f4');g.font='bold 6.5px system-ui';g.fillStyle='#d9f7ff';g.fillText('GALACTIC TRAIN  →',70,55);
 g.restore();
}
function prepare(level){
 const key=level.id+':'+hd;if(key===mapId)return;mapId=key;
 map=document.createElement('canvas');map.width=2560;map.height=1536;const g=map.getContext('2d');g.scale(4,4);g.fillStyle=hd?COLORS[0]:'#000';g.fillRect(0,0,640,384);g.imageSmoothingEnabled=hd;
 if(level.id===1){
  if(hd&&finaleBackdrop.complete&&finaleBackdrop.naturalWidth){g.drawImage(finaleBackdrop,0,0,640,384);modernWorldTiles(g,level);}
  else if(hd&&WILLY_ART.finale){g.drawImage(renderShape(WILLY_ART.finale,'finale'),0,0,640,384);if(materials.complete&&materials.naturalWidth){const p=new Path2D();for(const [color,loops] of WILLY_ART.finale.paths)if(color===4||color===12)for(const loop of loops)contour(p,loop);g.save();g.clip(p,'evenodd');g.fillStyle=materialPattern(g,2);g.fillRect(0,0,640,384);g.restore();}}
  else if(finale.complete&&finale.naturalWidth)g.drawImage(finale,0,0,640,384);else{mapId='';return;}
 }
 else{
  const scenic=hd&&scenicBackdrop(level);
  if(hd&&level.theme==='L02'&&iceBackdrop.complete&&iceBackdrop.naturalWidth){g.globalAlpha=.42;g.drawImage(iceBackdrop,0,0,640,384);g.globalAlpha=1;g.fillStyle='rgba(4,25,63,.18)';g.fillRect(0,0,640,384);}
  else if(scenic?.complete&&scenic.naturalWidth){g.globalAlpha=.48;g.drawImage(scenic,0,0,640,384);g.globalAlpha=1;g.fillStyle='rgba(4,12,29,.22)';g.fillRect(0,0,640,384);}
  for(let i=0;i<960;i++){if(hd&&level.theme==='L02'){iceTile(g,level,i);continue;}if(scenic&&(level.tiles[i]>>6)===0)continue;const index=level.tiles[i]&63,desc=WILLY_ART.tiles[level.theme]?.[index];if(!desc)continue;g.drawImage(renderShape(desc,'t'+level.theme+':'+index),i%40*16,Math.floor(i/40)*16,16,16);}
  if(scenic)modernWorldTiles(g,level);
  if(hd&&level.theme==='LMAIN')stationSigns(g);
 }
 if(hd&&level.id!==1&&level.theme!=='L02'&&!scenicBackdrop(level)){materialLayers(g,level);if(level.theme==='L11')lavaMaterials(g,level);g.fillStyle='rgba(5,15,32,.17)';g.fillRect(0,0,640,384);wallMaterials(g,level);}
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
 g.save();g.translate(p.x+6,p.y+9.8);g.scale(.78,.78);if(p.face<0)g.scale(-1,1);
 if(p.invincible>0&&!god&&Math.floor(time*14)%2===0)g.globalAlpha=.55;
 const run=p.grounded&&Math.abs(p.vx)>1?Math.sin(time*19):0,outline='#243140';
 if(god){g.strokeStyle='#ffeeab';g.lineWidth=.65;g.globalAlpha=.9;g.beginPath();g.ellipse(0,-.3,10,11,0,0,Math.PI*2);g.stroke();}
 ellipse(g,0,8,6.6,1,'rgba(0,0,0,.3)');
 rounded(g,-3+run*1.6,4,2.5,3,1,'#facb97',outline);rounded(g,1-run*1.6,4,2.5,3,1,'#facb97',outline);
 rounded(g,-4+run*1.6,6,4,2,1,'#d64f44',outline);rounded(g,.5-run*1.6,6,4,2,1,'#ef7259',outline);
 rounded(g,-4,1,8,4,1.2,'#51a65c',outline);g.fillStyle='#82cd69';g.fillRect(-3,1.2,5,.6);
 rounded(g,-4,-4,8,7,2,'#dd584c',outline);rounded(g,-3.5,-3.6,3.7,4,1.4,'#fa8571');
 if(level.theme==='L02'){g.fillStyle='#79d9e4';g.strokeStyle=outline;g.lineWidth=.45;g.beginPath();g.moveTo(-4,-2);g.lineTo(4,-2);g.lineTo(3,-.2);g.lineTo(-1,.4);g.lineTo(-3.5,1.5);g.closePath();g.fill();g.stroke();}
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
  const done=game.done.includes(d.id),near=game.nearDoor?.id===d.id;
  if(hd&&game.level.theme==='LMAIN'){
   const hues=['#5fd2f3','#e998da','#f4bd69','#78e4ad','#8da4ff'],hue=hues[d.id%hues.length];g.save();g.translate(d.x,d.y);g.shadowColor=near?'#fff1a9':hue;g.shadowBlur=near?7:3;rounded(g,.5,.5,15,31,2.5,'#142e48',hue);g.shadowBlur=0;rounded(g,3,4,10,23,2,'#071928',hue);g.globalAlpha=.55;g.fillStyle=hue;g.beginPath();g.ellipse(8,15.5,3.5,8,0,0,Math.PI*2);g.fill();g.globalAlpha=1;g.fillStyle='#e7fbff';g.beginPath();g.arc(8,15.5,1.4,0,Math.PI*2);g.fill();g.restore();
  }
  g.save();g.font='bold 4.5px system-ui';g.textAlign='center';g.textBaseline='middle';const number=d.id===1?'FINAL':String(d.id).padStart(2,'0'),width=Math.max(16,g.measureText(number).width+5);rounded(g,d.x+8-width/2,d.y-8,width,6.5,1.5,'#091d30',done?'#45f08d':near?'#ffe299':'#76bfdc');g.fillStyle=done?'#82dfae':near?'#ffe299':'#edfaff';g.fillText(number,d.x+8,d.y-4.75);g.restore();
  if(done){g.strokeStyle='#45f08d';g.lineWidth=1.1;g.strokeRect(d.x+.5,d.y+.5,15,31);completionBadge(g,d.x+8,d.y+16,time);}
 }
 if(game.index){const d=game.level.exit,{ready,near}=game.exitStatus();if(hd){g.save();g.translate(d.x,d.y);const hue=game.level.theme==='L02'?'#71e7ff':'#bd8bff';g.shadowColor=ready?'#b9ffb1':hue;g.shadowBlur=ready?7:3;rounded(g,1,2,14,29,3,ready?'#4fbd94':'#352866','#e8d4ff');g.shadowBlur=0;rounded(g,3,5,10,23,2,ready?'#d3ffe1':hue,'#1d2149');g.fillStyle=ready?'#74dd98':'#202751';g.fillRect(5,7,6,18);g.fillStyle='#e7ffff';g.beginPath();g.arc(10,16,1.1,0,7);g.fill();g.restore();}g.strokeStyle=ready?'#b5f5b2':'#d5b39a';g.lineWidth=near?1.2:.6;g.strokeRect(d.x+.5,d.y+.5,15,31);g.fillStyle=ready?'#c4ffbb':'#e3cab7';g.font='bold 4px system-ui';g.textAlign='center';g.fillText('EXIT',d.x+8,d.y+8);if(ready){g.globalAlpha=.12+Math.sin(time*4)*.06;g.fillStyle='#afff97';g.fillRect(d.x,d.y,16,32);g.globalAlpha=1;}else{g.strokeStyle='#e8b489';g.lineWidth=.7;g.strokeRect(d.x+6,d.y+15,4,3);g.beginPath();g.arc(d.x+8,d.y+15,1.4,Math.PI,0);g.stroke();}}
 for(const i of game.items)if(!i.taken)sprite(g,game.level,i.sprite,i.x,i.y);
 for(const e of game.enemies){
  if(!e.alive)continue;const period=e.animation.reduce((a,f)=>a+f[0],0);let t=Math.floor(time*12)%period,frame=e.animation[0][1];for(const f of e.animation){frame=f[1];if(t<f[0])break;t-=f[0];}
  const turnBoy=game.level.theme==='L04'&&frame>=52&&frame<=59;
  sprite(g,game.level,frame,e.x,e.y,turnBoy&&e.dirX<0,e.flash>0?.45:1);
  if(e.contact===1&&hd){g.strokeStyle='rgba(216,255,255,.8)';g.lineWidth=.35;g.beginPath();g.moveTo(e.x,e.y);g.lineTo(e.x+e.w,e.y);g.stroke();}
 }
 if(game.checkpoint){const p=game.checkpoint.player;g.strokeStyle='#7aefbc';g.lineWidth=1;g.beginPath();g.moveTo(p.x+6,p.y+16);g.lineTo(p.x+6,p.y-4);g.stroke();g.fillStyle='#7aefbc';g.beginPath();g.moveTo(p.x+6,p.y-4);g.lineTo(p.x+16,p.y);g.lineTo(p.x+6,p.y+4);g.fill();}
 hero(g,game.player,time,game.cooldown>.15,game.god,game.level);
 for(const s of game.shots){rounded(g,s.x,s.y,s.w,s.h,1.3,'#fff1b9');g.fillStyle='#ff9d50';g.fillRect(s.x+(s.vx>0?-4:6),s.y+.7,4,1.5);}
 g.restore();
}
return {draw,setHD(on){hd=!!on;mapId='';},prepare,sprite};
})();
