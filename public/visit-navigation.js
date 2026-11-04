export function swipeTarget(step,dx,dy){
  if(Math.abs(dx)<64||Math.abs(dx)<Math.abs(dy)*1.5)return null;
  const pages=['jobs','companion','briefing'],index=pages.indexOf(step);
  if(index<0)return null;
  // On the conversation: left opens the work list; right opens job files.
  if(step==='companion'&&dx>0)return 'files';
  return pages[index+(dx<0?-1:1)]||null;
}
export function bindVisitSwipes(root,{getStep,canNavigate,navigate,openFiles}){
  let start=null;
  const blocked='button,a,input,textarea,select,summary,dialog,audio,video,[data-no-swipe]';
  const cancel=()=>{start=null;};
  const down=event=>{
    start=null;
    if(event.touches.length!==1||event.target.closest?.(blocked)||!canNavigate())return;
    const touch=event.touches[0];
    start={x:touch.clientX,y:touch.clientY,id:touch.identifier,step:getStep(),horizontal:false};
  };
  const move=event=>{
    if(!start)return;
    if(event.touches.length!==1){cancel();return;}
    const touch=Array.from(event.touches).find(item=>item.identifier===start.id);
    if(!touch){cancel();return;}
    const dx=Math.abs(touch.clientX-start.x),dy=Math.abs(touch.clientY-start.y);
    if(!start.horizontal&&dy>12&&dy>dx){cancel();return;}
    if(dx>12&&dx>dy*1.5)start.horizontal=true;
    // Keep vertical scrolling native. Once horizontal, prevent scroll takeover.
    if(start.horizontal&&event.cancelable)event.preventDefault();
  };
  const up=event=>{
    const from=start;start=null;
    if(!from||event.touches.length||getStep()!==from.step||!canNavigate())return;
    const touch=Array.from(event.changedTouches).find(item=>item.identifier===from.id);
    if(!touch)return;
    const target=swipeTarget(from.step,touch.clientX-from.x,touch.clientY-from.y);
    if(target==='files')openFiles?.();else if(target)navigate(target);
  };
  root.addEventListener('touchstart',down,{passive:true});
  root.addEventListener('touchmove',move,{passive:false});
  root.addEventListener('touchend',up,{passive:true});
  root.addEventListener('touchcancel',cancel);
  return()=>{
    root.removeEventListener('touchstart',down);root.removeEventListener('touchmove',move);
    root.removeEventListener('touchend',up);root.removeEventListener('touchcancel',cancel);
  };
}

// Return only from the right edge of an unzoomed source sheet. Interior drags
// and multi-touch belong to scrolling/panning; the explicit Back control remains.
export function bindSourceReturn(dialog,{canReturn=()=>true,onReturn=()=>dialog.close()}={}){
  let start=null;
  const down=e=>{start=null;if(e.touches.length!==1||!canReturn()||e.target.closest?.('button,a,input,textarea,select'))return;const t=e.touches[0];if(t.clientX<dialog.getBoundingClientRect().right-28)return;start={x:t.clientX,y:t.clientY,id:t.identifier};};
  const move=e=>{if(e.touches.length!==1)start=null;};
  const up=e=>{const from=start;start=null;if(!from||e.touches.length||!canReturn())return;const t=Array.from(e.changedTouches).find(t=>t.identifier===from.id);if(!t)return;const dx=t.clientX-from.x,dy=t.clientY-from.y;if(dx< -64&&Math.abs(dx)>Math.abs(dy)*1.5)onReturn();};
  const cancel=()=>{start=null;};dialog.addEventListener('touchstart',down,{passive:true});dialog.addEventListener('touchmove',move,{passive:true});dialog.addEventListener('touchend',up,{passive:true});dialog.addEventListener('touchcancel',cancel);
  return()=>{dialog.removeEventListener('touchstart',down);dialog.removeEventListener('touchmove',move);dialog.removeEventListener('touchend',up);dialog.removeEventListener('touchcancel',cancel);};
}
