'use strict';
// Decode only requested tracks; the service worker caches complete responses.
window.WillySoundtrack=(()=>{
 const files={theme:'music-little-willy-theme.mp3',station:'music-space-station.mp3',ice:'music-crystal-caves.mp3'};
 const buffers=new Map(),pending=new Set(),failed=new Set();let active=null,wanted=null;
 function stop(ac){if(!active)return;const old=active;active=null;old.gain.gain.cancelScheduledValues(ac.currentTime);old.gain.gain.setTargetAtTime(0,ac.currentTime,.16);old.source.stop(ac.currentTime+.8);}
 function update(ac,bus,key,enabled){
  wanted=enabled?key:null;
  if(!wanted){stop(ac);return false;}
  if(active?.key!==key)stop(ac);
  if(failed.has(key))return false;
  if(!buffers.has(key)){
   if(!pending.has(key)){pending.add(key);fetch(files[key]).then(r=>{if(!r.ok)throw Error('Music unavailable');return r.arrayBuffer();}).then(b=>ac.decodeAudioData(b)).then(b=>buffers.set(key,b)).catch(()=>failed.add(key)).finally(()=>pending.delete(key));}
   return true;
  }
  if(!active){const source=ac.createBufferSource(),gain=ac.createGain();source.buffer=buffers.get(key);source.loop=true;gain.gain.setValueAtTime(0,ac.currentTime);gain.gain.linearRampToValueAtTime(3,ac.currentTime+.8);source.connect(gain);gain.connect(bus);source.onended=()=>{source.disconnect();gain.disconnect();};source.start();active={key,source,gain};}
  return true;
 }
 return {update,select(mode,index,theme){if(['home','settings','levels','intro'].includes(mode))return 'theme';if(index===0)return 'station';return theme==='L02'?'ice':null;}};
})();
