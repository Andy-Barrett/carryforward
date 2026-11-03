// Keep capture within the original gesture. Admission uses the same atomic
// photo/event save for a native camera result and the ordinary file picker.
export function bindJobCamera(input,{jobId,canOpen=()=>true,onOpening=()=>{},onFiles,onError=()=>{},onState=()=>{},
  eventTarget=globalThis.window,nativeBridge=()=>globalThis.window?.webkit?.messageHandlers?.carryForwardCamera}={}){
  let alive=true,opened=false,saving=false,pending=null;
  const ready=()=>{opened=false;onState(false);};
  const admit=async files=>{
    opened=false;
    if(!alive||!files.length){ready();return;}
    saving=true;onState(true);
    try{await onFiles(files);}catch(error){if(alive)onError(error);}
    finally{input.value='';saving=false;if(alive)ready();}
  };
  input.oncancel=ready;
  input.onchange=()=>admit(Array.from(input.files||[]));
  const nativeResult=async event=>{
    const detail=event.detail;
    if(!alive||!pending||detail?.id!==pending.id||detail.jobId!==jobId)return;
    pending=null;
    if(detail.state==='cancel'){ready();return;}
    if(detail.state==='error'){ready();onError(new Error(String(detail.message||'The camera could not open. Tap Photo to try again.').slice(0,300)));return;}
    try{
      if(detail.state!=='photo'||detail.mime!=='image/jpeg'||typeof detail.dataBase64!=='string'||!detail.dataBase64.length||detail.dataBase64.length>6_666_668)throw Error('The camera returned an unsupported or oversized photo. Nothing was saved.');
      const bytes=Uint8Array.from(atob(detail.dataBase64),c=>c.charCodeAt(0));
      if(!bytes.length||bytes.length>5_000_000)throw Error('The photo exceeds the 5 MB limit. Nothing was saved.');
      const name=typeof detail.name==='string'&&/^camera-[A-Za-z0-9-]+\.jpg$/.test(detail.name)?detail.name:'camera-photo.jpg';
      await admit([new File([bytes],name,{type:'image/jpeg'})]);
    }catch(error){ready();if(alive)onError(error);}
  };
  const cancelNative=()=>{if(pending){try{pending.bridge.postMessage({action:'cancel',id:pending.id,jobId});}catch{}pending=null;}ready();};
  eventTarget?.addEventListener('carryforward:camera',nativeResult);
  eventTarget?.addEventListener('pagehide',cancelNative);
  return {open({swipe=false}={}){
    if(!alive||opened||saving||!canOpen())return false;
    onOpening();opened=true;onState(true);input.value='';
    try{
      const bridge=swipe&&jobId&&nativeBridge();
      if(bridge){const id=crypto.randomUUID();pending={id,bridge};bridge.postMessage({action:'open',id,jobId});}
      else if(swipe&&typeof input.showPicker==='function')input.showPicker();
      else input.click();
      return true;
    }catch(error){pending=null;ready();onError(error?.name==='NotAllowedError'?new Error('The camera could not open from that swipe. Tap Photo to take it.'):error);return false;}
  },busy:()=>opened||saving,dispose(){
    cancelNative();alive=false;input.onchange=null;input.oncancel=null;
    eventTarget?.removeEventListener('carryforward:camera',nativeResult);eventTarget?.removeEventListener('pagehide',cancelNative);
  }};
}
