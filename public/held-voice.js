import {pcmWav} from './live-voice.js';
import {wavSignal} from './audio.js';
import {watchCaptureInterruptions} from './capture-lifecycle.js';

// Capture starts in the press gesture. Nothing leaves the phone until release.
// First words are retained; there is no spoken microphone preflight.
export function startHeldVoice({onState,onComplete,onLevel},deps={}) {
  const Audio=deps.Audio||globalThis.AudioContext||globalThis.webkitAudioContext;
  const MediaNode=deps.MediaNode||globalThis.AudioWorkletNode;
  const media=deps.mediaDevices||navigator.mediaDevices;
  const page=deps.page||document,windowTarget=deps.windowTarget||window;
  if(!Audio||!MediaNode||!media?.getUserMedia)throw Error('Microphone unavailable on this device.');
  const context=new Audio(),audioSession=deps.audioSession||navigator.audioSession;
  const packets=[];let stream,node,source,mute,timer,release=()=>{},active=true,finished=false,finishing=null;
  let localBytes=0;const started=Date.now(),previous=audioSession?.type;let phase='opening';
  async function cleanup(){clearTimeout(timer);release();stream?.getTracks().forEach(t=>t.stop());source?.disconnect();node?.disconnect();mute?.disconnect();
    try{await context.close();}catch{}try{if(audioSession?.type==='play-and-record')audioSession.type=previous&&previous!=='play-and-record'?previous:'playback';}catch{}onLevel?.(null);}
  async function finish(cancelled=false,error=null){
    if(finished)return finishing||Promise.resolve();
    finished=true;
    finishing=(async()=>{
      clearTimeout(timer);release();
      if(node&&active){await new Promise(resolve=>{const stopTimer=setTimeout(resolve,250);node._stopped=()=>{clearTimeout(stopTimer);resolve();};node.port.postMessage('stop');});}
      active=false;await cleanup();
      const wav=packets.length?pcmWav(packets):null;
      const signal=wav?wavSignal(wav):null,quiet=!signal||signal.veryQuiet;
      await onComplete({wav,cancelled,diagnostic:{phase,samples:localBytes/2,audioMs:localBytes/32,elapsedMs:Date.now()-started,rms:signal?.rms||0,peak:signal?.peak||0},error:error||(!cancelled&&(quiet||localBytes<6400)?(!localBytes&&phase!=='recording'?'The microphone was still opening. Keep holding until it turns red.':'I didn’t catch that. Hold while you speak, then release.'):null)});
    })();return finishing;
  }
  async function begin(){try{
    onState?.('connecting');try{if(audioSession)audioSession.type='play-and-record';}catch{}
    const resumed=context.resume();resumed.catch(()=>{});
    const worklet=context.audioWorklet.addModule('/pcm-worklet.js');worklet.catch(()=>{});
    phase='permission';const requested=media.getUserMedia({audio:true,video:false});
    requested.then(value=>{if(finished)value.getTracks().forEach(t=>t.stop());},()=>{});
    let permissionTimer;try{stream=await Promise.race([requested,new Promise((_,reject)=>{permissionTimer=setTimeout(()=>reject(Error('Allow the microphone, then hold to speak again.')),15000);})]);}finally{clearTimeout(permissionTimer);}
    if(finished){stream.getTracks().forEach(t=>t.stop());return;}
    // Acquiring the iOS input can change the route/session after the initial
    // gesture resume. Reassert recording intent after that route transition.
    try{if(audioSession)audioSession.type='play-and-record';}catch{}
    phase='worklet';await worklet;
    if(finished)return;
    // Do not await the pre-route resume promise: iOS can leave it pending
    // when getUserMedia changes the audio route. Resume the current route.
    phase='resuming';await context.resume();if(finished||page.visibilityState==='hidden'){await finish(true);return;}
    source=context.createMediaStreamSource(stream);node=new MediaNode(context,'carryforward-pcm',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    node.port.onmessage=event=>{
      if(event.data.type==='stopped'){node._stopped?.();return;}
      if(event.data.type==='limit'){finish(false).catch(()=>{});return;}
      if(event.data.type!=='pcm'||!active)return;
      const bytes=event.data.bytes;if(!(bytes instanceof ArrayBuffer)||bytes.byteLength%2||localBytes+bytes.byteLength>960000){finish(true,'Recording stopped at its size limit.').catch(()=>{});return;}
      packets.push(bytes);localBytes+=bytes.byteLength;
      const view=new DataView(bytes);let sum=0,peak=0;for(let i=0;i<bytes.byteLength;i+=2){const v=view.getInt16(i,true)/32768;sum+=v*v;peak=Math.max(peak,Math.abs(v));}onLevel?.({rms:Math.sqrt(sum/(bytes.byteLength/2)),peak});
    };
    source.connect(node);mute=context.createGain();mute.gain.value=0;node.connect(mute);mute.connect(context.destination);
    release=watchCaptureInterruptions({page,windowTarget,tracks:stream.getTracks(),onInterrupt:()=>finish(true).catch(()=>{})});
    phase='recording';onState?.('listening');timer=setTimeout(()=>finish(false).catch(()=>{}),30000);
  }catch(error){await finish(true,error.message);}}
  return {ready:begin(),stop:()=>finish(false),cancel:()=>finish(true)};
}

// Pointer and keyboard holds each own one capture. Cancellation never submits.
export function bindHoldToSpeak(control,{start,onError=()=>{},windowTarget=window,page=document}){
  let handle=null,pressed=false,identity=null,disposed=false;
  const end=cancel=>{if(!pressed)return;pressed=false;identity=null;control.setAttribute('aria-pressed','false');const current=handle;handle=null;Promise.resolve(cancel?current?.cancel():current?.stop()).catch(onError);};
  const begin=()=>{if(disposed||pressed||control.disabled)return;pressed=true;control.setAttribute('aria-pressed','true');try{handle=start();if(!handle){pressed=false;control.setAttribute('aria-pressed','false');}}catch(error){pressed=false;control.setAttribute('aria-pressed','false');onError(error);}};
  const down=e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();if(pressed)return;identity=e.pointerId;begin();if(pressed){try{control.setPointerCapture(e.pointerId);}catch{}}};
  const up=e=>{if(identity!==e.pointerId)return;e.preventDefault();end(false);};
  const cancel=e=>{if(identity===e.pointerId)end(true);};
  const keydown=e=>{if(![' ','Enter'].includes(e.key)||e.repeat)return;e.preventDefault();begin();};
  const keyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();end(false);}};
  const blur=()=>end(true),hidden=()=>{if(page.visibilityState==='hidden')end(true);},menu=e=>e.preventDefault();
  control.addEventListener('pointerdown',down);windowTarget.addEventListener('pointerup',up);control.addEventListener('pointercancel',cancel);control.addEventListener('lostpointercapture',cancel);
  control.addEventListener('keydown',keydown);control.addEventListener('keyup',keyup);control.addEventListener('contextmenu',menu);windowTarget.addEventListener('blur',blur);page.addEventListener('visibilitychange',hidden);
  return ()=>{disposed=true;end(true);control.removeEventListener('pointerdown',down);windowTarget.removeEventListener('pointerup',up);control.removeEventListener('pointercancel',cancel);control.removeEventListener('lostpointercapture',cancel);control.removeEventListener('keydown',keydown);control.removeEventListener('keyup',keyup);control.removeEventListener('contextmenu',menu);windowTarget.removeEventListener('blur',blur);page.removeEventListener('visibilitychange',hidden);};
}
