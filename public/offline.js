const status=document.querySelector('#connection-status');
let connectionCheck=0;
async function connection(){
 const check=++connectionCheck;
 if(!navigator.onLine){status.textContent='Offline · Saved jobs and local capture remain available. AI review and API delivery need a connection.';return;}
 status.textContent='Checking service connection… Saved jobs remain available.';
 try{const response=await fetch('/api/config',{signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error('Unavailable');
  if(check===connectionCheck)status.textContent='Service reachable · AI review and API delivery require a working connection.';
 }catch{if(check===connectionCheck)status.textContent='Service unavailable · Saved jobs and local capture remain available. AI review and API delivery are unavailable.';}
}
window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
if('serviceWorker' in navigator){
 navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(async registration=>{
  if(registration.active)status.dataset.offlineShell='ready';
  else registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')status.textContent+=' App shell saved; reopen once to enable offline startup.';});});
 }).catch(()=>{status.textContent+=' Offline startup unavailable; keep this page open.';});
}
