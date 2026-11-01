// Local spoken output is separate from model inference and never starts a mic.
export function createLocalSpeaker() {
  let cancelCurrent=()=>{};
  function stop(){cancelCurrent();cancelCurrent=()=>{};globalThis.speechSynthesis?.cancel();}
  function speak(text,{onState,onError}={}) {
    stop();
    if(typeof text!=='string'||!text.trim()||text.length>8000)throw Error('This response is unavailable for local readout. Read it on screen.');
    const bridge=globalThis.webkit?.messageHandlers?.carryForwardSpeech;
    if(bridge){
      const id=crypto.randomUUID();let started=false;
      const clear=()=>{clearTimeout(timer);window.removeEventListener('carryforward-speech',listen);};
      const listen=event=>{if(event.detail?.id!==id)return;const state=event.detail.state;
        if(state==='speaking'){started=true;clearTimeout(timer);onState?.('speaking');}
        if(state==='ready'||state==='error'){clear();cancelCurrent=()=>{};onState?.('ready');if(state==='error')onError?.(Error('Local speech could not play. Read the response on screen.'));}
      };
      const timer=setTimeout(()=>{if(!started){clear();bridge.postMessage({action:'stop',id});onState?.('ready');onError?.(Error('Local speech did not start. Read the response on screen.'));}},5000);
      cancelCurrent=()=>{clear();bridge.postMessage({action:'stop',id});};
      window.addEventListener('carryforward-speech',listen);bridge.postMessage({action:'speak',id,text});return;
    }
    const synth=globalThis.speechSynthesis,voice=synth?.getVoices().find(v=>v.localService===true);
    if(!synth||!voice||typeof SpeechSynthesisUtterance==='undefined')throw Error('A local speech voice is unavailable. Read the response on screen.');
    const speech=new SpeechSynthesisUtterance(text);speech.voice=voice;
    speech.onstart=()=>onState?.('speaking');speech.onend=()=>onState?.('ready');
    speech.onerror=()=>{onState?.('ready');onError?.(Error('Local speech stopped. Read the response on screen.'));};
    cancelCurrent=()=>{speech.onstart=null;speech.onend=null;speech.onerror=null;synth.cancel();};synth.speak(speech);
  }
  return {speak,stop};
}
