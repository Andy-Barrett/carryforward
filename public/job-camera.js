// Open within the original user gesture: awaiting storage or permission here
// loses iOS picker activation. Admission and its atomic save happen afterwards.
export function bindJobCamera(input,{canOpen=()=>true,onOpening=()=>{},onFiles,onError=()=>{},onState=()=>{}}={}){
  let alive=true,opened=false,saving=false;
  const ready=()=>{opened=false;onState(false);};
  input.oncancel=ready;
  input.onchange=async()=>{
    const files=Array.from(input.files||[]);opened=false;
    if(!alive||!files.length){ready();return;}
    saving=true;onState(true);
    try{await onFiles(files);}catch(error){if(alive)onError(error);}
    finally{input.value='';saving=false;if(alive)ready();}
  };
  return {open(){
    if(!alive||opened||saving||!canOpen())return false;
    onOpening();opened=true;onState(true);input.value='';
    try{input.click();return true;}catch(error){ready();onError(error);return false;}
  },busy:()=>opened||saving,dispose(){alive=false;input.onchange=null;input.oncancel=null;}};
}
