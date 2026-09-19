'use strict';
// Decode only requested tracks; the service worker caches complete responses.
window.WillySoundtrack=(()=>{
 const files={
  theme:'music-little-willy-theme.mp3',station:'music-space-station.mp3',ice:'music-crystal-caves.mp3',
  ruins:'music-sunlit-ruins.mp3',lava:'music-lava-leap.mp3',alien:'music-strange-little-planet.mp3',
  maze:'music-golden-maze.mp3',neon:'music-neon-circuit.mp3',final:'music-one-more-door.mp3',
  ending:'music-home-together.mp3',victory:'music-little-victory.mp3'
 };
 const themes={L01:'final',L02:'ice',L03:'ruins',L04:'lava',L05:'alien',L06:'neon',L07:'alien',L08:'maze',L09:'ice',L10:'alien',L11:'lava',L13:'neon'};
 const buffers=new Map(),pending=new Map(),failed=new Set();let active=null,wanted=null,sting=null,stingToken=0,holdUntil=0;
 function stop(ac){if(!active)return;const old=active;active=null;old.gain.gain.cancelScheduledValues(ac.currentTime);old.gain.gain.setTargetAtTime(0,ac.currentTime,.16);old.source.stop(ac.currentTime+.8);}
 function load(ac,key){
  if(!files[key]||failed.has(key))return Promise.reject(Error('Music unavailable'));
  if(buffers.has(key))return Promise.resolve(buffers.get(key));
  if(pending.has(key))return pending.get(key);
  const request=fetch(files[key]).then(r=>{if(!r.ok)throw Error('Music unavailable');return r.arrayBuffer();}).then(b=>ac.decodeAudioData(b)).then(b=>{buffers.set(key,b);return b;}).catch(e=>{failed.add(key);throw e;}).finally(()=>pending.delete(key));
  pending.set(key,request);return request;
 }
 function cancelOneShot(ac){stingToken++;holdUntil=0;if(!sting)return;const old=sting;sting=null;try{old.source.stop(ac.currentTime);}catch(e){}old.source.disconnect();old.gain.disconnect();}
 function update(ac,bus,key,enabled){
  wanted=enabled?key:null;
  if(!wanted){stop(ac);cancelOneShot(ac);return false;}
  if(sting&&ac.currentTime<holdUntil)return true;
  if(sting)cancelOneShot(ac);
  if(active?.key!==key)stop(ac);
  if(!files[key]||failed.has(key))return false;
  if(!buffers.has(key)){
   load(ac,key).catch(()=>{});
   return true;
  }
  if(!active){const source=ac.createBufferSource(),gain=ac.createGain();source.buffer=buffers.get(key);source.loop=true;gain.gain.setValueAtTime(0,ac.currentTime);gain.gain.linearRampToValueAtTime(3,ac.currentTime+.8);source.connect(gain);gain.connect(bus);source.onended=()=>{source.disconnect();gain.disconnect();};source.start();active={key,source,gain};}
  return true;
 }
 function playOneShot(ac,bus,key){
  if(!files[key]||failed.has(key))return false;
  const token=++stingToken;
  load(ac,key).then(buffer=>{
   if(token!==stingToken)return;stop(ac);if(sting)cancelOneShot(ac);
   const source=ac.createBufferSource(),gain=ac.createGain();source.buffer=buffer;gain.gain.value=3;source.connect(gain);gain.connect(bus);sting={source,gain};holdUntil=ac.currentTime+(buffer.duration||10);source.onended=()=>{if(sting?.source===source)sting=null;source.disconnect();gain.disconnect();};source.start();
  }).catch(()=>{});
  return true;
 }
 return {
  update,playOneShot,cancelOneShot,preload(ac,key){load(ac,key).catch(()=>{});},
  select(mode,index,theme){if(mode==='complete')return index===1?'ending':'theme';if(['home','settings','levels','intro','help'].includes(mode))return 'theme';if(index===0)return 'station';return themes[theme]||null;}
 };
})();
