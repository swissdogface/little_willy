'use strict';
// Remastered art is keyed by the ORIGINAL source bank, never by a level-local ID.
window.WillyModernArt=(()=>{
 const sheets={};
 function sheet(name,file,columns,rows){
  const image=new Image(),data={image,columns,rows,frames:[],ready:false};sheets[name]=data;
  image.onload=()=>{
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const g=canvas.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);const pixels=g.getImageData(0,0,canvas.width,canvas.height).data;
   const cw=canvas.width/columns,ch=canvas.height/rows,W=canvas.width,H=canvas.height,seen=new Uint8Array(W*H),queue=new Int32Array(W*H);
   // Follow each silhouette across nominal cell boundaries: never cut off wings/hair.
   for(let start=0;start<W*H;start++){
    if(seen[start]||pixels[start*4+3]<40)continue;
    let head=0,tail=1,l=W,t=H,r=0,b=0;queue[0]=start;seen[start]=1;
    while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
     for(const n of [x>0?p-1:-1,x<W-1?p+1:-1,y>0?p-W:-1,y<H-1?p+W:-1])if(n>=0&&!seen[n]&&pixels[n*4+3]>=40){seen[n]=1;queue[tail++]=n;}
    }
    if(tail<100)continue;
    const index=Math.min(rows-1,Math.floor((t+b)/2/ch))*columns+Math.min(columns-1,Math.floor((l+r)/2/cw));
    if(!data.frames[index]||data.frames[index].area<tail)data.frames[index]={x:Math.max(0,l-2),y:Math.max(0,t-2),w:Math.min(W-1,r+2)-Math.max(0,l-2)+1,h:Math.min(H-1,b+2)-Math.max(0,t-2)+1,area:tail};
   }
   if(data.frames.filter(Boolean).length!==columns*rows)return;
   data.ready=true;
  };image.src=file;
 }
 sheet('hero','willy-character-atlas.png',2,2);sheet('run','willy-run-atlas.png',4,2);sheet('enemies','enemy-character-atlas.png',4,4);
 function atlas(g,name,n,x,y,w,h,flip=false,motion=null){
  const s=sheets[name];if(!s.ready)return false;const f=s.frames[n];if(!f)return false;
  const scale=(name==='hero'||name==='run')?Math.min(w/Math.max(...s.frames.map(f=>f.w)),h/Math.max(...s.frames.map(f=>f.h))):Math.min(w/f.w,h/f.h),dw=f.w*scale,dh=f.h*scale;
  g.save();g.translate(x+w/2,y+h);if(flip)g.scale(-1,1);g.imageSmoothingEnabled=true;
  if(motion){const im=animatedFrame(s,n,motion.kind,motion.phase);g.drawImage(im,-dw/2,-dh,dw,dh);}else g.drawImage(s.image,f.x,f.y,f.w,f.h,-dw/2,-dh,dw,dh);g.restore();return true;
 }

 // Animation lives entirely in the renderer; physics and collision boxes never change.
 const travel=new WeakMap(),cycles=new Map(),TAU=Math.PI*2;
 function gait(entity,time){
  if(!entity)return {distance:0,moving:false};
  let s=travel.get(entity);if(!s){s={x:entity.x,y:entity.y,distance:0,time,moving:false,grounded:entity.grounded,landed:-10};travel.set(entity,s);}
  if(time!==s.time){const d=Math.hypot(entity.x-s.x,entity.y-s.y);s.moving=d>.002&&d<24;if(s.moving)s.distance+=d;if(entity.grounded&&!s.grounded)s.landed=time;s.grounded=entity.grounded;s.x=entity.x;s.y=entity.y;s.time=time;}
  return s;
 }
 function deform(kind,u,v,phase){
  const wave=Math.sin(phase),edge=Math.max(0,(Math.abs(u-.5)-.19)/.31);let x=u,y=v;
  if(['green-alien','purple-alien','bat','insect','moth'].includes(kind)){
   // Fold the wing tips about their roots, leaving faces and eyes stable.
   const wing=edge*Math.max(0,1-Math.abs(v-.48)/.35);
   y+=wave*.18*wing;x+=(.5-u)*(.14+.12*wave)*wing;
   if(v<.24)x+=Math.sin(phase*.5)*.015*(.24-v)/.24;
  }else if(['knight','robot','imp','skeleton','snow','gold-bug'].includes(kind)){
   const leg=Math.max(0,(v-.62)/.38),side=u<.5?1:-1;
   x+=wave*.08*leg*side;y-=Math.max(0,wave*side)*.055*leg;
   if(v>.4&&v<.7)x+=wave*.018*edge;
  }else if(['orange-alien','worm'].includes(kind)){
   const lower=Math.max(0,(v-.55)/.45);y-=lower*(.025+.025*Math.sin(phase+u*TAU));
   x+=Math.sin(phase+u*TAU)*.022*lower;
   if(v<.4)x+=Math.sin(phase*.5)*.022*(.4-v)/.4;
  }else if(kind==='plant'){
   x+=Math.sin(phase)*.035*Math.sin(v*Math.PI);
   y+=(v-.48)*Math.sin(phase)*.035*Math.max(0,1-v/.8);
  }else if(kind==='wizard'){
   x+=Math.sin(phase+v*4)*.027*Math.max(0,(v-.45)/.55);
  }else if(kind==='rocket'){
   x+=Math.sin(phase*2)*.035*Math.max(0,(.4-u)/.4);
  }
  return [Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y))];
 }
 function animatedFrame(sheet,index,kind,phase){
  const frame=((Math.floor(phase/TAU*16)%16)+16)%16,key=kind+':'+frame;
  if(cycles.has(key))return cycles.get(key);
  const f=sheet.frames[index],canvas=document.createElement('canvas');canvas.width=160;canvas.height=Math.max(32,Math.round(160*f.h/f.w));
  const c=canvas.getContext('2d'),cols=8,rows=10,W=canvas.width,H=canvas.height;
  // Small connected triangles articulate wings/limbs; cached frames cost one draw during play.
  function tri(src){const dst=src.map(([u,v])=>deform(kind,u,v,frame/16*TAU).map((n,i)=>n*(i?H:W)));
   const [a,b,d]=src.map(([u,v])=>[u*W,v*H]),[A,B,D]=dst;
   const det=(b[0]-a[0])*(d[1]-a[1])-(d[0]-a[0])*(b[1]-a[1]);
   const xx=((B[0]-A[0])*(d[1]-a[1])-(D[0]-A[0])*(b[1]-a[1]))/det;
   const xy=((D[0]-A[0])*(b[0]-a[0])-(B[0]-A[0])*(d[0]-a[0]))/det;
   const yx=((B[1]-A[1])*(d[1]-a[1])-(D[1]-A[1])*(b[1]-a[1]))/det;
   const yy=((D[1]-A[1])*(b[0]-a[0])-(B[1]-A[1])*(d[0]-a[0]))/det;
   c.save();c.beginPath();const cx=(A[0]+B[0]+D[0])/3,cy=(A[1]+B[1]+D[1])/3;
   dst.forEach(([x,y],i)=>{const dx=x-cx,dy=y-cy,len=Math.hypot(dx,dy)||1;c[i?'lineTo':'moveTo'](x+dx/len*.3,y+dy/len*.3);});c.closePath();c.clip();
   c.transform(xx,yx,xy,yy,A[0]-xx*a[0]-xy*a[1],A[1]-yx*a[0]-yy*a[1]);c.drawImage(sheet.image,f.x,f.y,f.w,f.h,0,0,W,H);c.restore();
  }
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=[x/cols,y/rows],b=[(x+1)/cols,y/rows],c=[(x+1)/cols,(y+1)/rows],d=[x/cols,(y+1)/rows];tri([a,b,c]);tri([a,c,d]);}
  cycles.set(key,canvas);return canvas;
 }

 function family(ref){
  if(!ref)return null;const [bank,n]=ref;
  if(bank==='WILLY')return n<=21?'hero':n<=26?'insect':n>=29&&n<=30?'rocket':null;
  if(bank==='LMAIN')return n<2?'lift':n===2?'sign-arrow':null;
  if(bank==='L01')return n===0?'lift':n<=3?'clock':n<=11?'go-sign':'stone';
  if(bank==='L02')return n<=2?'green-alien':n<=10?'purple-alien':n<=14?'ice-lift':'gold-bug';
  if(bank==='L03')return n<=3?'orange-alien':n<=12?'stone-lift':n<=16?'plant':n<=20?'green-alien':'coffin';
  if(bank==='L04')return n<=4?'vent':n<=12?'swiss-cheese':n>=21&&n<=28?'swiss-boy':null;
  if(bank==='L05')return 'neon-lift';
  if(bank==='L06')return n<=4?'robot':'ufo';
  if(bank==='L07')return 'worm';
  if(bank==='L09')return n>=6&&n<=11?'wizard':n>=12?'bat':null;
  if(bank==='L10')return n<=3?'earth':n<=7?'energy-arrow':'knight';
  if(bank==='L11')return n===0?'cloud':n>=7&&n<=12?'imp':n===13?'leaf-lift':n>=14?'bat':null;
  if(bank==='L13')return n===0?'lab-lift':n<=8?'cursor':n<=12?'face-panel':[13,14,15,16,21,22,23,24,28].includes(n)?'skeleton':'disk';
  return null;
 }
 const characters={'green-alien':0,'purple-alien':1,'orange-alien':2,knight:3,bat:4,robot:5,imp:6,skeleton:7,insect:8,rocket:9,worm:10,plant:11,snow:12,moth:13,'gold-bug':14,wizard:15};
 function round(g,x,y,w,h,r,fill,stroke){g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=.6;g.stroke();}}
 function oval(g,x,y,rx,ry,fill){g.fillStyle=fill;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();}
 function gradient(g,top,bottom,h){const c=g.createLinearGradient(0,0,0,h);c.addColorStop(0,top);c.addColorStop(1,bottom);return c;}
 function object(g,kind,w,h,phase){
  const metal=gradient(g,'#e2f7ff','#466e89',h),dark='#162c40',cyan='#93f6ff',gold='#ffd375';
  if(kind.endsWith('lift')||kind==='lift'){
   const tint=kind==='neon-lift'?'#eda4ff':kind==='leaf-lift'?'#a0ef90':cyan;
   round(g,.4,.5,w-.8,h-1,Math.min(2,h/3),metal,dark);
   round(g,1.4,1.3,w-2.8,Math.max(1,h*.18),.7,'#eaffff');
   round(g,2,h*.42,w-4,Math.max(1.2,h*.35),1,gradient(g,tint,'#256279',h));
   for(const x of [2,w-3])oval(g,x,h-2,.6,.6,dark);
   return;
  }
  if(kind==='earth'){
   const r=Math.min(w,h)/2-.5,cx=w/2,cy=h/2;
   const sea=g.createRadialGradient(cx-r*.4,cy-r*.5,.2,cx,cy,r);sea.addColorStop(0,'#5de0f5');sea.addColorStop(.5,'#177bb7');sea.addColorStop(1,'#082754');
   oval(g,cx,cy,r,r,sea);g.save();g.beginPath();g.arc(cx,cy,r-.5,0,7);g.clip();g.translate(cx,cy);g.scale(r,r);g.rotate(phase*.025);
   g.fillStyle='#7cca88';g.beginPath();g.moveTo(-.8,-.55);g.bezierCurveTo(-.4,-.9,-.05,-.5,-.2,-.3);g.lineTo(-.4,-.15);g.lineTo(-.2,.03);g.lineTo(-.28,.24);g.lineTo(-.43,.15);g.lineTo(-.6,-.12);g.lineTo(-.83,-.21);g.closePath();g.fill();
   g.beginPath();g.moveTo(-.27,.15);g.bezierCurveTo(.15,.2,.16,.42,-.3,.88);g.lineTo(-.43,.41);g.closePath();g.fill();
   g.beginPath();g.moveTo(.12,-.65);g.bezierCurveTo(.6,-.86,1,-.5,.83,-.15);g.lineTo(.48,-.02);g.lineTo(.37,.22);g.lineTo(.19,.2);g.lineTo(.07,-.08);g.lineTo(.34,-.31);g.lineTo(.03,-.4);g.closePath();g.fill();oval(g,.65,.52,.22,.12,'#b7d698');
   g.strokeStyle='#e4fbff';g.globalAlpha=.58;g.lineWidth=.065;for(const y of [-.55,.04,.45]){g.beginPath();g.moveTo(-.85,y);g.bezierCurveTo(-.35,y-.12,.1,y+.18,.65,y+.08);g.stroke();}g.restore();
   g.strokeStyle='#9ceaff';g.lineWidth=.55;g.beginPath();g.arc(cx,cy,r,0,7);g.stroke();return;
  }
  if(kind==='energy-arrow'||kind==='sign-arrow'){
   const cy=h/2;round(g,3,cy-1.1,w-6,2.2,1,kind==='energy-arrow'?gold:metal,dark);
   const heads=kind==='energy-arrow'?[0,1]:[1];for(const end of heads){g.save();if(!end){g.translate(w,0);g.scale(-1,1);}g.fillStyle=metal;g.strokeStyle=dark;g.lineWidth=.4;g.beginPath();g.moveTo(w-7,.6);g.lineTo(w-.4,cy);g.lineTo(w-7,h-.6);g.lineTo(w-5,cy);g.closePath();g.fill();g.stroke();g.restore();}return;
  }
  if(kind==='cursor'){
   g.fillStyle=metal;g.strokeStyle='#087582';g.lineWidth=.7;g.beginPath();g.moveTo(w*.45,.5);g.lineTo(w-1,h*.75);g.lineTo(w*.6,h*.65);g.lineTo(w*.57,h-1);g.lineTo(w*.35,h-1);g.lineTo(w*.35,h*.64);g.lineTo(1,h*.78);g.closePath();g.fill();g.stroke();return;
  }
  if(kind==='ufo'||kind==='cloud'){
   if(kind==='cloud'){for(let i=0;i<6;i++)oval(g,w*(i+.6)/6,h*(.55+(i%2)*.1),w/7,h*(.3+(i%2)*.1),gradient(g,'#f1fbff','#96b4cf',h));}
   else{oval(g,w/2,h*.52,w*.32,h*.38,gradient(g,'#b0f7ff','#2d769e',h));oval(g,w/2,h*.72,w*.48,h*.2,metal);for(let i=0;i<5;i++)oval(g,w*(i+1)/6,h*.73,1,.7,Math.floor(phase*2+i)%5===0?gold:cyan);}
   return;
  }
  if(kind==='disk'||kind==='face-panel'||kind==='stone'){
   round(g,.5,.5,w-1,h-1,2,metal,dark);round(g,2,2,w-4,h*.5,1,gradient(g,'#345879','#0c2039',h));
   if(kind==='face-panel'){for(const x of [w*.3,w*.7]){oval(g,x,h*.3,w*.1,h*.15,'#8eebf1');oval(g,x,h*.32,w*.04,h*.09,dark);}g.strokeStyle=cyan;g.lineWidth=1;g.beginPath();g.moveTo(w*.3,h*.74);g.quadraticCurveTo(w*.5,h*(.75+Math.sin(phase)*.06),w*.7,h*.74);g.stroke();}
   else if(kind==='disk'){round(g,w*.17,h*.64,w*.66,h*.26,1,'#d5eaf2',dark);round(g,w*.27,3,w*.3,h*.24,.5,'#9cb6c5');}
   return;
  }
  if(kind==='go-sign'){round(g,1,1,w-9,h-2,2,metal,dark);g.fillStyle=gold;g.font='bold '+h*.52+'px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText('GO!',w*.4,h*.52);objectArrow(g,w,h);return;}
  if(kind==='vent'){round(g,0,h*.62,w,h*.38,1,dark,'#678494');for(let i=0;i<3;i++)oval(g,w*(i+1)/4,h*(.25+.08*Math.sin(phase+i)),w*.1,h*.19,'#c4dbe5');return;}
  if(kind==='clock'){
   round(g,w*.12,0,w*.76,h,2,gradient(g,'#b55949','#462437',h),dark);oval(g,w/2,h*.48,w*.3,h*.37,'#ffecc1');g.strokeStyle=dark;g.lineWidth=1;g.beginPath();g.moveTo(w*.5,h*.2);g.lineTo(w*.5,h*.48);g.lineTo(w*(.5+.18*Math.cos(phase)),h*(.48+.18*Math.sin(phase)));g.stroke();return;
  }
  if(kind==='coffin'){
   g.fillStyle=gradient(g,'#c05b55','#4b2133',h);g.strokeStyle='#ffcc88';g.lineWidth=1;g.beginPath();g.moveTo(w*.24,1);g.lineTo(w*.76,1);g.lineTo(w*.94,h*.22);g.lineTo(w*.75,h-1);g.lineTo(w*.25,h-1);g.lineTo(w*.06,h*.22);g.closePath();g.fill();g.stroke();
   g.strokeStyle=gold;g.lineWidth=1.5;g.beginPath();g.moveTo(w*.5,h*.22);g.lineTo(w*.5,h*.76);g.moveTo(w*.3,h*.4);g.lineTo(w*.7,h*.4);g.stroke();return;
  }
 }
 function objectArrow(g,w,h){g.fillStyle='#d6f6ff';g.beginPath();g.moveTo(w-9,1);g.lineTo(w,h/2);g.lineTo(w-9,h-1);g.closePath();g.fill();}
 function entityFamily(level,entity,id){return family(level.spriteMap[entity?.animation?.[0]?.[1]??id]);}
 function sprite(g,level,id,x,y,flip=false,alpha=1,time=0,entity=null){
  const ref=level.spriteMap[id],kind=entityFamily(level,entity,id);if(!kind||kind==='swiss-boy'||kind==='swiss-cheese'||id>=80)return false;
  const desc=WILLY_ART.sprites[ref[0]]?.[ref[1]];if(!desc)return false;
  const w=entity?.w||Math.max(8,desc.w-8),h=entity?.h||desc.h,phase=time*5+(entity?.id||0);
  if(entity?.dirX)flip=kind==='knight'?entity.dirX>0:entity.dirX<0;
  g.save();g.globalAlpha=alpha;
  if(kind==='hero'){hero(g,{...entity,x,y,face:flip?-1:1,vx:entity?.dx?40:0,grounded:true},time,false,false,entity);g.restore();return sheets.hero.ready;}
  if(Object.hasOwn(characters,kind)){
   const frame=characters[kind],walk=gait(entity,time),flying=['purple-alien','green-alien','bat','insect','moth','wizard'].includes(kind);
   const beat=flying?time*(kind==='insect'?25:kind==='wizard'?3:13)+(entity?.id||0)*1.7:walk.moving?walk.distance/22*TAU:['knight','robot','imp','skeleton','snow','gold-bug'].includes(kind)?0:time*2+(entity?.id||0);
   const bob=flying?(Math.sin(beat*.5)+1)*.35:0;
   const ok=atlas(g,'enemies',frame,x,y+bob,w,h-bob,flip,{kind,phase:beat});g.restore();return ok;
  }
  g.translate(x,y);object(g,kind,w,h,phase);g.restore();return true;
 }
 function hero(g,p,time,shooting,god,track=p){
  if(!sheets.hero.ready)return false;
  const walk=gait(track,time),running=p.grounded&&walk.moving&&Math.abs(p.vx)>1;
  const sheet=running&&sheets.run.ready?'run':'hero',frame=sheet==='run'?Math.floor(walk.distance/4)%8:!p.grounded?(p.vy>25?1:3):0;
  const breath=(p.grounded&&!running?(1+Math.sin(time*2.6))*.12:0)+Math.max(0,1-(time-walk.landed)/.12)*.65;
  g.save();if(p.invincible>0&&!god&&Math.floor(time*14)%2===0)g.globalAlpha=.55;
  if(god){g.strokeStyle='#ffe9a3';g.lineWidth=.6;g.beginPath();g.ellipse(p.x+6,p.y+8,9,9,0,0,7);g.stroke();}
  atlas(g,sheet,frame,p.x-4,p.y+breath,20,16-breath,p.face<0);
  if(shooting){const x=p.x+(p.face>0?15:-3);oval(g,x,p.y+7,2,1,'#fff3b1');}
  g.restore();return true;
 }
 return {family,entityFamily,sprite,hero,gait,deform,ready:()=>Object.values(sheets).every(s=>s.ready)};
})();
