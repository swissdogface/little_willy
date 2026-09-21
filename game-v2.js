'use strict';
(()=>{
const $=id=>document.getElementById(id),canvas=$('scene'),ctx=canvas.getContext('2d',{alpha:false});
let prefs={god:false,gentle:false,music:true,musicVolume:100,sound:true,hd:true,checkpoints:false,tutorialSeen:false},progress={done:[],last:0,best:{},assistedBest:{}};
try{Object.assign(prefs,JSON.parse(localStorage.getItem('willy-v2-prefs')||'{}'));Object.assign(progress,JSON.parse(localStorage.getItem('willy-v2-progress')||'{}'));}catch(e){}
prefs.difficulty=['easy','medium','hard'].includes(prefs.difficulty)?prefs.difficulty:prefs.gentle?'easy':'medium';prefs.gentle=prefs.difficulty==='easy';
prefs.musicVolume=Number.isFinite(prefs.musicVolume)?Math.max(0,Math.min(100,prefs.musicVolume)):100;
if(!Array.isArray(progress.done))progress.done=[];
for(const field of ['best','assistedBest'])if(!progress[field]||typeof progress[field]!=='object'||Array.isArray(progress[field]))progress[field]={};
const totalBest=field=>Object.values(progress[field]).reduce((sum,n)=>sum+(Number.isFinite(n)&&n>0?n:0),0);
let scoreAssisted=false;
const game=new WillyEngine.Game(WILLY_LEVELS,{...prefs,done:progress.done});WillyRenderer.setHD(prefs.hd);
let mode='intro',W=960,H=432,dpr=1,clock=0,last=0,acc=0,toastTimer=0,keys={},jumpPress=false,upPress=false,shootPress=false,cam={x:0,y:0};
let ac=null,musicBus=null,fxBus=null,nextBeat=0,beat=0,musicNodes=[];
const melodies=[
 [0,7,12,7,4,7,11,7,2,7,14,11,4,2,0,-1],
 [0,3,7,12,10,7,3,7,5,8,12,8,7,3,2,-1],
 [0,4,7,9,12,9,7,4,2,5,9,12,11,7,4,-1],
 [0,7,10,12,7,3,5,7,10,14,12,10,7,5,3,-1],
 [0,2,7,9,14,12,9,7,4,7,11,14,12,7,4,-1],
 [0,7,3,10,12,10,7,3,5,12,8,7,3,2,0,-1]
];
function persist(){try{localStorage.setItem('willy-v2-prefs',JSON.stringify(prefs));localStorage.setItem('willy-v2-progress',JSON.stringify(progress));}catch(e){}}
function audioStart(){try{if(!ac){ac=new(window.AudioContext||window.webkitAudioContext)();musicBus=ac.createGain();musicBus.gain.value=prefs.music?.12*prefs.musicVolume/100:0;musicBus.connect(ac.destination);fxBus=ac.createGain();fxBus.gain.value=.12;fxBus.connect(ac.destination);nextBeat=ac.currentTime;}if(ac.state==='suspended')ac.resume().catch(()=>{});if(prefs.music&&window.WillySoundtrack){window.WillySoundtrack.preload(ac,'theme');window.WillySoundtrack.preload(ac,'victory');}}catch(e){}}
function note(freq,t,length,volume,type,bus){if(!ac)return;const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.001,t+length);o.connect(g);g.connect(bus);o.start(t);o.stop(t+length+.02);o.onended=()=>{o.disconnect();g.disconnect();};}
function music(){
 if(ac&&window.WillySoundtrack){const track=window.WillySoundtrack.select(mode,game.index,game.level.theme);if(window.WillySoundtrack.update(ac,musicBus,track,prefs.music&&!document.hidden&&mode!=='pause'&&mode!=='intro'&&ac.state==='running'))return;}
 if(!ac||ac.state!=='running'||document.hidden||!prefs.music||mode==='pause')return;
 if(nextBeat<ac.currentTime-.2)nextBeat=ac.currentTime;
 const theme=game.index===0?0:Number(game.level.theme.slice(1))%6,root=[48,50,48,45,53,43][theme],minor=[false,true,false,true,false,true][theme];
 while(nextBeat<ac.currentTime+.12){
  const n=beat%32,bar=Math.floor(beat/32)%4,chord=[0,minor?8:5,minor?3:9,7][bar];
  if(n%2===0){const pitch=melodies[theme][n/2];if(pitch>=0)note(440*2**((root+24+pitch-69)/12),nextBeat,.23,.28,'triangle',musicBus);}
  if(n%4===0){const bass=root+chord;note(440*2**((bass-69)/12),nextBeat,.34,.38,'sine',musicBus);note(80,nextBeat,.055,.14,'triangle',musicBus);}
  if(n%4===2){const third=minor?3:4,arp=[0,third,7,12][Math.floor(n/4)%4];note(440*2**((root+12+chord+arp-69)/12),nextBeat,.16,.12,'sine',musicBus);}
  nextBeat+=60/[108,100,112,118,96,104][theme]/4;beat++;
 }
}
function sound(type){
 if(type==='complete'&&prefs.music&&ac&&window.WillySoundtrack?.playOneShot(ac,musicBus,'victory'))return;
 if(!prefs.sound)return;if(!ac)audioStart();if(!ac)return;
 if(type==='hurt'){
  // Midrange impact remains audible on phone speakers, even with music muted.
  const t=ac.currentTime,o=ac.createOscillator(),envelope=ac.createGain();o.type='triangle';
  o.frequency.setValueAtTime(880,t);o.frequency.exponentialRampToValueAtTime(210,t+.30);
  envelope.gain.setValueAtTime(0,t);envelope.gain.linearRampToValueAtTime(.40,t+.006);envelope.gain.exponentialRampToValueAtTime(.001,t+.40);
  o.connect(envelope);envelope.connect(ac.destination);o.start(t);o.stop(t+.42);
  if(musicBus&&prefs.music){const volume=.12*prefs.musicVolume/100;musicBus.gain.cancelScheduledValues(t);musicBus.gain.setTargetAtTime(volume*.2,t,.012);musicBus.gain.setTargetAtTime(volume,t+.35,.12);}o.onended=()=>{o.disconnect();envelope.disconnect();};
  note(190,t,.14,.6,'sine',fxBus);return;
 }
 const p={jump:[370,550],shoot:[890,320],collect:[740,1100],heart:[523,659,784],card:[523,659,784],unlock:[440,660],hurt:[150,65],respawn:[220,330],complete:[523,659,784,1046],defeat:[170,90],impact:[280],forbidden:[190,120]};
 (p[type]||[]).forEach((f,i)=>note(f,ac.currentTime+(type==='respawn'?.32:0)+i*.045,type==='shoot'?.065:.12,.35,type==='shoot'?'sawtooth':'triangle',fxBus));
}
function toast(text){$('toast').textContent=text;$('toast').style.opacity=1;toastTimer=3.5;}
function exitMessage(status){
 const missing=[];if(status.missingCard)missing.push('exit card');
 if(missing.length)return (status.near?'Door locked · ':'Still needed: ')+missing.join(' and ');
 return status.near?'Exit ready · Press EXIT ↑':'Go to the EXIT door · Press EXIT ↑ there';
}
function resetInputs(){keys={};jumpPress=false;upPress=false;shootPress=false;document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));}
function sync(){
 $('homeScore').textContent=totalBest('best').toLocaleString('en-US');$('homeAssisted').textContent=totalBest('assistedBest').toLocaleString('en-US');$('homeProgress').textContent=progress.done.length+' / 24';
 $('levelNumber').textContent=game.index?'ORIGINAL MAP · '+String(game.index).padStart(2,'0'):'EARTH II · '+progress.done.length+' / 24 COMPLETED';$('levelTitle').textContent=game.level.name;
 $('hearts').textContent=prefs.god?'∞':'♥'.repeat(Math.max(0,game.player.hp));
 const mins=Math.floor(game.time/60),secs=String(Math.floor(game.time%60)).padStart(2,'0');$('timeInfo').textContent=mins+':'+secs;
 $('scoreInfo').textContent=(game.collected*100).toLocaleString('en-US');
 $('godQuick').textContent='God: '+(prefs.god?'on':'off');$('godQuick').setAttribute('aria-pressed',String(prefs.god));$('musicQuick').textContent=prefs.music?'♫ On':'♫ Off';$('musicQuick').setAttribute('aria-pressed',String(prefs.music));
 $('keysInfo').innerHTML=game.keys.map((n,i)=>`<span class="key-count key-${['green','red','yellow'][i]} ${n>0?'available':'missing'}" aria-label="${['Green','Red','Yellow'][i]} key: ${n>0?'available':'not held'}"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="6" r="3.4"/><path d="M8.6 8.5 16 16m-3.1-3.1 2.8-2.8m-1.4 4.2 2.8-2.8"/></svg><b aria-hidden="true">${n>0?'✓':'–'}</b></span>`).join('');
 $('exitInfo').innerHTML=game.card?'<span class="exit-card-token">EXIT</span><b>✓</b>':'<span class="exit-card-token empty">EXIT</span><b>–</b>';
 const exit=game.exitStatus();$('enterDoor').hidden=false;$('enterDoor').textContent=game.index?'EXIT ↑':'DOOR ↑';$('enterDoor').setAttribute('aria-label',game.index?'Open exit':'Enter door');$('enterDoor').classList.toggle('exit-ready',!!game.index&&exit.ready&&exit.near);
 const completedDoor=game.nearDoor&&game.done.includes(game.nearDoor.id);$('hint').textContent=game.index?exitMessage(exit):(game.nearDoor?'Door '+String(game.nearDoor.id).padStart(2,'0')+(completedDoor?' · COMPLETED ✓ · Press ↑ to replay':' · Press ↑ to enter'):'Walk to a door · Press ↑ to enter');
 $('continue').hidden=!progress.last;$('continue').textContent='Play Level '+String(progress.last).padStart(2,'0')+' again';
 $('checkpointQuick').hidden=!game.index||!prefs.checkpoints;$('checkpointQuick').textContent=game.checkpoint?'⚑ Saved':'⚑ Save';document.body.dataset.mode=mode;document.body.dataset.level=String(game.index);document.body.dataset.music=String(prefs.music);document.body.dataset.god=String(prefs.god);
}
function start(index){scoreAssisted=prefs.god||prefs.gentle||prefs.checkpoints;audioStart();if(ac&&window.WillySoundtrack)window.WillySoundtrack.cancelOneShot(ac);game.setCheckpoints(prefs.checkpoints);game.setDifficulty(prefs.difficulty);game.load(index);game.god=prefs.god;mode='play';$('home').hidden=true;$('modal').hidden=true;$('hud').hidden=false;resetInputs();WillyRenderer.prepare(game.level);cam.x=game.level.camera.x;cam.y=game.level.camera.y;progress.last=index;persist();beat=0;if(ac)nextBeat=ac.currentTime;sync();last=performance.now();acc=0;if(!prefs.tutorialSeen)help();}
function home(){if(ac&&window.WillySoundtrack)window.WillySoundtrack.cancelOneShot(ac);mode='home';resetInputs();$('home').hidden=false;$('modal').hidden=true;$('hud').hidden=true;persist();sync();}
function showModal(html){resetInputs();$('panel').innerHTML=html;$('modal').hidden=false;sync();}
function resume(){mode=$('home').hidden?'play':'home';$('modal').hidden=true;resetInputs();last=performance.now();acc=0;audioStart();sync();}
function toggleGod(){prefs.god=!prefs.god;if(prefs.god)scoreAssisted=true;game.setGod(prefs.god);persist();sync();toast(prefs.god?'God Mode on · Willy is invincible':'God Mode off');}
function toggleMusic(){prefs.music=!prefs.music;audioStart();if(musicBus){musicBus.gain.cancelScheduledValues(ac.currentTime);musicBus.gain.setTargetAtTime(prefs.music?.12*prefs.musicVolume/100:0,ac.currentTime,.03);nextBeat=ac.currentTime;if(!prefs.music&&window.WillySoundtrack)window.WillySoundtrack.cancelOneShot(ac);}persist();sync();}
function options(paused=false){
 mode=paused?'pause':'settings';
 showModal(`<div class="eyebrow">LITTLE WILLY · SETTINGS</div><h2>${paused?'Pause':'Your Adventure'}</h2><div class="row"><div><strong>God Mode</strong><small>Invincible. Find the exit card; keys still open matching locks.</small></div><button id="godSetting" class="switch" aria-pressed="${prefs.god}">${prefs.god?'On':'Off'}</button></div><div class="row"><div><strong>Music</strong><small>Adventure music for every world, victory and the finale.</small></div><button id="musicSetting" class="switch" aria-pressed="${prefs.music}">${prefs.music?'On':'Off'}</button></div><div class="row music-volume"><label for="musicVolume"><strong>Music volume</strong><small>Only music · Sound effects stay unchanged.</small></label><div class="volume-control"><input id="musicVolume" type="range" min="0" max="100" step="1" value="${prefs.musicVolume}" aria-valuetext="${prefs.musicVolume}%"><output id="musicVolumeValue" for="musicVolume">${prefs.musicVolume}%</output></div></div><div class="row"><div><strong>Sound Effects</strong><small>Shots, jumps, hits and collected items.</small></div><button id="soundSetting" class="switch" aria-pressed="${prefs.sound}">${prefs.sound?'On':'Off'}</button></div><div class="row"><div><label for="difficultySetting"><strong>Difficulty</strong></label><small>Easy: 6 hearts, slower enemies · Medium: 4 hearts · Hard: 3 hearts, faster enemies.<br>Starting hearts apply on the next level or restart. God Mode works with every difficulty.</small></div><select id="difficultySetting" aria-label="Difficulty">${['easy','medium','hard'].map(d=>'<option value="'+d+'" '+(prefs.difficulty===d?'selected':'')+'>'+d[0].toUpperCase()+d.slice(1)+'</option>').join('')}</select></div><div class="row"><div><strong>Graphics</strong><small>Smoother outlines, new gradients and cartoon Willy.</small></div><button id="hdSetting" class="switch" aria-pressed="${prefs.hd}">${prefs.hd?'HD':'DOS Pixels'}</button></div><div class="row"><div><strong>Checkpoints</strong><small>Save on safe solid ground with ⚑ Save or C. Death restores that point, items and keys. Restart Level clears it. Checkpoints last for this level visit.</small></div><button id="checkpointSetting" class="switch" aria-pressed="${prefs.checkpoints}">${prefs.checkpoints?'On':'Off'}</button></div><div class="instructions">← → / A D: move · Space: jump · S / J: shoot · ↑ / W: door<br>↓: drop through a thin platform · G: God Mode · M: music · Esc: pause</div><div class="panel-actions"><button id="helpSetting" class="secondary">How to Play</button><button id="resume" class="primary">${paused?'Continue':'Back'}</button>${paused?'<button id="restart" class="secondary">Restart Level</button><button id="hub" class="secondary">Space Station</button><button id="menu" class="secondary">Main Menu</button>':''}</div>`);
 $('checkpointSetting').onclick=()=>{prefs.checkpoints=!prefs.checkpoints;if(prefs.checkpoints)scoreAssisted=true;game.setCheckpoints(prefs.checkpoints);persist();options(paused);};$('godSetting').onclick=()=>{toggleGod();options(paused);};$('musicSetting').onclick=()=>{toggleMusic();options(paused);};$('soundSetting').onclick=()=>{prefs.sound=!prefs.sound;audioStart();persist();options(paused);};$('difficultySetting').onchange=()=>{prefs.difficulty=$('difficultySetting').value;prefs.gentle=prefs.difficulty==='easy';if(prefs.gentle)scoreAssisted=true;game.setDifficulty(prefs.difficulty);persist();sync();};$('hdSetting').onclick=()=>{prefs.hd=!prefs.hd;WillyRenderer.setHD(prefs.hd);persist();options(paused);};$('resume').onclick=resume;$('helpSetting').onclick=()=>help();
 $('musicVolume').oninput=()=>{
  prefs.musicVolume=Math.max(0,Math.min(100,Number($('musicVolume').value)||0));audioStart();
  if(musicBus){musicBus.gain.cancelScheduledValues(ac.currentTime);musicBus.gain.setTargetAtTime(prefs.music?.12*prefs.musicVolume/100:0,ac.currentTime,.03);}
  const label=prefs.musicVolume+'%';$('musicVolumeValue').textContent=label;$('musicVolume').setAttribute('aria-valuetext',label);persist();
 };
 if(paused){$('restart').onclick=()=>start(game.index);$('hub').onclick=()=>start(0);$('menu').onclick=home;}
}
function levels(){mode='levels';const ids=[...Array.from({length:23},(_,i)=>i+2),1],finalUnlocked=ids.slice(0,23).every(n=>progress.done.includes(n));showModal(`<div class="eyebrow">THE ORIGINAL WORLDS</div><h2>Choose Worlds</h2><p>The same maps and themes as in 1993. The final level unlocks after the other 23 levels.</p><button id="hubSelect" class="secondary wide-button">Enter Earth II Space Station →</button><div class="level-grid">${ids.map(n=>`<button class="level-card ${progress.done.includes(n)?'done':''}" data-level="${n}" ${n===1&&!finalUnlocked?'disabled':''}><strong>${n===1?'FINAL'+(finalUnlocked?'':' 🔒'):String(n).padStart(2,'0')}${progress.done.includes(n)?' ✓':''}</strong>${WILLY_LEVELS[n].name.replace(' · Final','')}${n===2?'<small class="start-tag">★ START HERE</small>':''}</button>`).join('')}</div><div class="panel-actions"><button id="closeLevels" class="secondary">Back</button></div>`);$('hubSelect').onclick=()=>start(0);$('closeLevels').onclick=resume;document.querySelectorAll('#panel [data-level]').forEach(b=>b.onclick=()=>start(Number(b.dataset.level)));}
function help(step=0){
 const pages=[['Welcome to Earth II','Start with World 02: The Ice Caves. You can also explore the space station and choose any unlocked door.'],['Move, jump and shoot','Use the on-screen arrows, JUMP and SHOOT. Keyboard: ← → or A/D to move, Space to jump, S/J to shoot. Press DOOR ↑ or W near a station door.'],['Unlock the exit','Find the exit card, then head to the EXIT. Cans and lollipops are optional: each is worth 100 points, including in World 20. Finish the world to save your best score. Coloured keys open matching locks. Each world has one floating heart: collect it for +1 health. Spikes and dangerous floors cost one heart, followed by a short recovery period.'],['Your pace, your adventure','Checkpoints are optional in Settings. Turn them on, then press ⚑ Save or C on safe solid ground. They restore your items and keys after a death. God Mode is also available.']];
 mode='help';showModal('<div class="eyebrow">HOW TO PLAY · '+(step+1)+' / '+pages.length+'</div><h2>'+pages[step][0]+'</h2><p class="help-copy">'+pages[step][1]+'</p><div class="help-dots">'+pages.map((_,i)=>'<span class="'+(i===step?'active':'')+'"></span>').join('')+'</div><div class="panel-actions"><button id="helpNext" class="primary">'+(step===3?'Let’s play →':'Next →')+'</button><button id="helpSkip" class="secondary">Skip guide</button></div>');
 const end=()=>{prefs.tutorialSeen=true;persist();resume();};$('helpSkip').onclick=end;$('helpNext').onclick=()=>step===3?end():help(step+1);
}
function savePoint(){if(mode!=='play')return;toast(game.saveCheckpoint()?'Checkpoint saved · Items and keys secured':'Find safe solid ground, away from enemies, to save.');sync();}
function finish(){
 mode='complete';progress.done=game.done;progress.last=0;
 const score=game.collected*100,category=scoreAssisted||game.usedCheckpoint?'assistedBest':'best',previous=Number(progress[category][game.index])||0,newBest=score>previous;
 progress[category][game.index]=Math.max(previous,score);persist();
 const mins=Math.floor(game.time/60),secs=Math.floor(game.time%60),duration=mins+':'+String(secs).padStart(2,'0'),number=String(game.index).padStart(2,'0');
 const assists=[prefs.god?'God Mode':null,game.usedCheckpoint?'Checkpoints':null,prefs.difficulty==='easy'?'Easy difficulty':prefs.difficulty==='hard'?'Hard difficulty':null].filter(Boolean).join(' · ')||'Standard adventure';
 const url='https://little-willy.netlify.app/?world='+game.index;
 const message='I scored '+score+' points ('+(category==='best'?'standard':'assisted')+')! I completed World '+number+' — '+game.level.name+' in Little Willy! '+progress.done.length+'/24 worlds explored. Play this world: '+url;
 showModal('<div class="score-result"><span>'+(newBest?'NEW PERSONAL BEST!':'WORLD SCORE')+'</span><strong>'+score.toLocaleString('en-US')+'</strong><small>'+game.collected+' pickups × 100 points · '+(category==='best'?'Standard':'Assisted')+' record</small></div><div class="victory-mark" aria-hidden="true">★</div><div class="eyebrow">'+(game.index===1?'FAMILY REUNITED':'ANOTHER WORLD CONQUERED')+'</div><h2>'+game.level.name+'</h2><p>'+(game.index===1?'Mom and your sister are free. You did it!':'Exit unlocked. Adventure accomplished!')+'</p><div class="victory-stats"><div><strong>'+duration+'</strong><small>Time played</small></div><div><strong>'+(game.retries||0)+'</strong><small>Retries</small></div><div><strong>'+progress.done.length+'/24</strong><small>Worlds completed</small></div></div><progress class="world-progress" value="'+progress.done.length+'" max="24" aria-label="Worlds completed"></progress><p>'+assists+'</p><div class="panel-actions"><button id="nextHub" class="primary">To Space Station →</button><button id="shareWin" class="secondary">Share achievement ↗</button><button id="again" class="secondary">Play Again</button></div><p id="shareStatus" role="status"></p><textarea id="shareText" aria-label="Copy your achievement and link" readonly hidden></textarea>');
 $('nextHub').onclick=()=>start(0);$('again').onclick=()=>start(game.index);
 $('shareWin').onclick=async()=>{try{if(navigator.share){await navigator.share({title:'Little Willy · World '+number+' complete',text:message,url});return;}if(navigator.clipboard){await navigator.clipboard.writeText(message);$('shareStatus').textContent='Achievement and link copied!';return;}}catch(e){if(e.name==='AbortError')return;}const field=$('shareText');field.hidden=false;field.value=message;field.focus();field.select();$('shareStatus').textContent='Copy this message to share your adventure.';};
}
function introEnd(){if(mode!=='intro')return;home();const shared=Number(new URLSearchParams(location.search).get('world'));if(Number.isInteger(shared)&&shared>=2&&shared<=24){$('recommended').textContent='Play shared World '+String(shared).padStart(2,'0')+' →';$('recommended').onclick=()=>start(shared);}}
// Try autoplay on load; retain gesture recovery when the browser blocks sound.
document.addEventListener('pointerdown',()=>audioStart(),{once:true,capture:true});
document.addEventListener('click',()=>audioStart(),{once:true,capture:true});
document.addEventListener('keydown',()=>audioStart(),{once:true,capture:true});
 $('start').onclick=()=>start(0);$('recommended').onclick=()=>start(2);$('checkpointQuick').onclick=savePoint;$('continue').onclick=()=>start(progress.last);$('levelSelect').onclick=levels;$('settings').onclick=()=>{audioStart();options(false);};$('pause').onclick=()=>options(true);$('godQuick').onclick=toggleGod;$('musicQuick').onclick=toggleMusic;
const pointers=new Map();
const steeringOrigins=new Map();
// Slide a held steering finger between arrows without lifting it during a jump.
function steerPointer(e){
 const previous=pointers.get(e.pointerId);if(previous!=='left'&&previous!=='right')return;
 const origin=steeringOrigins.get(e.pointerId);
 // A short thumb swipe reverses direction even without crossing both buttons.
 const delta=origin===undefined?0:e.clientX-origin;
 const next=Math.abs(delta)>=12?(delta<0?'left':'right'):previous;
 if(origin===undefined)steeringOrigins.set(e.pointerId,e.clientX);
 if(Math.abs(delta)>=12||delta*(previous==='left'?-1:1)>0)steeringOrigins.set(e.pointerId,e.clientX);
 if(next===previous)return;pointers.delete(e.pointerId);pointers.set(e.pointerId,next);
 for(const k of ['left','right']){keys[k]=Array.from(pointers.values()).includes(k);document.querySelector('[data-key="'+k+'"]').classList.toggle('pressed',keys[k]);}
}
document.querySelectorAll('[data-key]').forEach(b=>{
 b.addEventListener('pointerdown',e=>{e.preventDefault();audioStart();b.setPointerCapture(e.pointerId);const k=b.dataset.key;pointers.set(e.pointerId,k);if(k==='left'||k==='right')steeringOrigins.set(e.pointerId,e.clientX);if(k==='jump'&&!keys.jump)jumpPress=true;if(k==='up'&&!keys.up)upPress=true;if(k==='shoot')shootPress=true;keys[k]=true;b.classList.add('pressed');});
 b.addEventListener('pointermove',steerPointer);
 const end=e=>{const k=pointers.get(e.pointerId);pointers.delete(e.pointerId);steeringOrigins.delete(e.pointerId);if(k&&!Array.from(pointers.values()).includes(k)){keys[k]=false;document.querySelector('[data-key="'+k+'"]').classList.remove('pressed');}};b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('lostpointercapture',end);
});
const keyMap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowDown:'down',ArrowUp:'up',KeyW:'up',Space:'jump',KeyS:'shoot',KeyJ:'shoot',Comma:'left',Period:'right'};
window.addEventListener('keydown',e=>{
 if(mode==='intro'){introEnd();return;}
 if(['Escape','KeyG','KeyM'].includes(e.code)&&!e.repeat){e.preventDefault();if(e.code==='KeyG')toggleGod();else if(e.code==='KeyM')toggleMusic();else if(mode==='play')options(true);else if(mode==='pause'||mode==='settings'||mode==='levels')resume();return;}
 if(mode!=='play')return;if(e.code==='KeyC'&&!e.repeat){e.preventDefault();savePoint();return;}const k=keyMap[e.code];if(k){e.preventDefault();audioStart();if(k==='jump'&&!keys.jump)jumpPress=true;if(k==='up'&&!keys.up)upPress=true;if(k==='shoot')shootPress=true;keys[k]=true;}
});window.addEventListener('keyup',e=>{const k=keyMap[e.code];if(k){e.preventDefault();keys[k]=false;}});
function pause(){if(mode==='play')options(true);resetInputs();persist();if(ac)ac.suspend();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',()=>{if(mode==='play')pause();});
window.WillyApp={pause,back(){if(mode==='play')options(true);else if(mode==='intro')introEnd();else if(mode==='complete')home();else resume();}};
function resize(){W=innerWidth;H=innerHeight;dpr=Math.min(devicePixelRatio||1,3);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);last=performance.now();acc=0;}window.addEventListener('resize',resize);resize();
function frame(now){
 const elapsed=Math.min(.075,(now-last)/1000||0);last=now;clock+=elapsed;if(toastTimer>0){toastTimer-=elapsed;if(toastTimer<=0)$('toast').style.opacity=0;}
 if(mode==='play'){
  acc+=elapsed;while(acc>=1/120){game.step(1/120,{...keys,jump:jumpPress,jumpHeld:keys.jump,up:upPress,shoot:keys.shoot||shootPress});jumpPress=false;upPress=false;shootPress=false;acc-=1/120;
   const events=game.events.splice(0);for(const e of events){sound(e.type);if(e.type==='enter'){start(e.index);break;}if(e.type==='complete'){finish();break;}if(e.type==='exitInfo')toast(exitMessage(e));if(e.type==='heart')toast('+1 heart');if(e.type==='card')toast('Exit card found · '+exitMessage(game.exitStatus()));if(e.type==='unlock')toast('Lock opened');if(e.type==='lockedFinale')toast('The final level unlocks after the other 23 levels.');if(e.type==='respawn')toast(e.checkpoint?'Back at your checkpoint · Items and keys restored':'New attempt · The level starts over.');}
   if(mode!=='play'){acc=0;break;}
  }sync();
 }
 music();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0b1423';ctx.fillRect(0,0,W,H);
 if($('home').hidden&&mode!=='intro'){
  const hudTop=H<=440?66:72,hintBand=H<=440?34:36,h=H-hudTop-hintBand-83,scale=Math.max(1,h/170),vw=W/scale,vh=h/scale;
  const targetX=WillyEngine.clamp(game.player.x+6-vw/2,0,Math.max(0,640-vw)),targetY=WillyEngine.clamp(game.player.y+8-vh*.48,0,Math.max(0,384-vh));
  const t=1-Math.exp(-elapsed*9);cam.x+=(targetX-cam.x)*t;cam.y+=(targetY-cam.y)*t;
  WillyRenderer.draw(ctx,game,{x:0,y:hudTop+hintBand,w:W,h,scale,camX:cam.x,camY:cam.y},clock);
 }
 requestAnimationFrame(frame);
}
introEnd();sync();if(prefs.music)audioStart();requestAnimationFrame(frame);
})();
