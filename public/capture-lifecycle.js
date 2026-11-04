// Stop at an interruption boundary; never automatically restart a microphone.
export function watchCaptureInterruptions({page,windowTarget,tracks,onInterrupt}) {
  let active=true;
  const interrupt=()=>{if(!active)return;active=false;onInterrupt();};
  const visibility=()=>{if(page.visibilityState==='hidden')interrupt();};
  page.addEventListener('visibilitychange',visibility);
  windowTarget.addEventListener('pagehide',interrupt);
  for(const track of tracks)track.addEventListener('ended',interrupt);
  return ()=>{active=false;page.removeEventListener('visibilitychange',visibility);
    windowTarget.removeEventListener('pagehide',interrupt);
    for(const track of tracks)track.removeEventListener('ended',interrupt);};
}
