export function swipeTarget(step,dx,dy){
  if(Math.abs(dx)<85||Math.abs(dx)<Math.abs(dy)*1.7)return null;
  const pages=['jobs','companion','briefing'],index=pages.indexOf(step);
  if(index<0)return null;
  // On the conversation: left opens the list; right opens the camera.
  if(step==='companion'&&dx>0)return 'camera';
  return pages[index+(dx<0?-1:1)]||null;
}
export function bindVisitSwipes(root,{getStep,canNavigate,navigate,openCamera}){
  let start=null;
  const down=event=>{start=null;if(event.pointerType!=='touch'||event.isPrimary===false||event.target.closest('button,a,input,textarea,select,summary,dialog,audio,video,[data-no-swipe]'))return;start={x:event.clientX,y:event.clientY,id:event.pointerId};};
  const up=event=>{const from=start;start=null;if(!from||event.pointerId!==from.id||!canNavigate())return;const target=swipeTarget(getStep(),event.clientX-from.x,event.clientY-from.y);if(target==='camera')openCamera?.();else if(target)navigate(target);};
  const cancel=()=>{start=null;};
  root.addEventListener('pointerdown',down,{passive:true});root.addEventListener('pointerup',up,{passive:true});root.addEventListener('pointercancel',cancel);
  return()=>{root.removeEventListener('pointerdown',down);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',cancel);};
}
