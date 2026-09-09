'use strict';
(()=>{
 let installPrompt=null;
 const install=document.getElementById('installWeb'),fullscreen=document.getElementById('fullscreen');
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;install.hidden=false;});
 install.addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;install.hidden=true;});
 addEventListener('appinstalled',()=>{installPrompt=null;install.hidden=true;});
 fullscreen.addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch(e){}
 });
 document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'×':'⛶';fullscreen.setAttribute('aria-label',document.fullscreenElement?'Exit full screen':'Full screen');});
 if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
})();
