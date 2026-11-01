import {LIVE_MODEL,LIVE_LIMITS,transcriptAssembly} from './live-protocol.js';
import {watchCaptureInterruptions} from './capture-lifecycle.js';

export function pcmWav(packets) {
  const size=packets.reduce((sum,bytes)=>sum+bytes.byteLength,0);
  if(!size||size%2||size>LIVE_LIMITS.totalBytes)throw Error('No complete local audio was captured. Use text or record again.');
  const out=new Uint8Array(44+size),v=new DataView(out.buffer);
  const word=(at,text)=>[...text].forEach((c,i)=>out[at+i]=c.charCodeAt(0));
  word(0,'RIFF');v.setUint32(4,out.length-8,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,size,true);
  let offset=44;for(const bytes of packets){out.set(new Uint8Array(bytes),offset);offset+=bytes.byteLength;}return out;
}

// A user gesture starts capture. The microphone is checked locally before a
// provider socket is opened; localCheck never opens a provider connection.
export function startLiveVoice({jobId,audioId,onPreview,onState,onComplete,onStatus,onLevel,localCheck=false}) {
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Audio||!globalThis.AudioWorkletNode||!navigator.mediaDevices?.getUserMedia)throw Error('Live speech is unavailable here. Record locally or use text.');
  const audioSession=navigator.audioSession,previousType=audioSession?.type;
  const context=new Audio();let stream=null,node=null,source=null,socket=null,release=()=>{},timer=null,signalTimer=null;
  const packets=[],assembly=transcriptAssembly();let active=true,stopping=false,interrupted=false,ready=false,sessionId=null,localBytes=0,finishPromise=null,stopPromise=null;
  let signalPackets=0,signalResolve=null,signalReject=null,peak=0;
  const started=Date.now();
  const cleanup=async()=>{
    clearTimeout(timer);clearTimeout(signalTimer);release();
    signalReject?.(Error('Microphone check stopped.'));signalResolve=null;signalReject=null;
    stream?.getTracks().forEach(t=>t.stop());source?.disconnect();node?.disconnect();
    try{await stage(context.close(),'Audio cleanup timed out.',1000);}catch{}
    try{if(audioSession&&previousType&&audioSession.type==='play-and-record')audioSession.type=previousType;}catch{}
    onLevel?.(null);
  };
  async function finish(error=null,done=null) {
    if(finishPromise)return finishPromise;
    active=false;stopping=true;interrupted=interrupted||!!error;
    finishPromise=(async()=>{
      await cleanup();if(socket?.readyState===WebSocket.OPEN)socket.close(1000);
      onState?.('ready');
      const wav=packets.length?pcmWav(packets):null;
      const complete=!!done&&!error&&!assembly.unfinished&&!!assembly.finalText.trim();
      const failure=error||(localCheck?null:complete?null:!assembly.finalText.trim()?'No words came back. Listen to the saved clip or use text; nothing was added as testimony.':'Some words did not finish. Review the local recording.');
      await onComplete({wav,interrupted,error:failure,localCheck,peak,
        transcription:complete?{jobId,audioId,transcript:assembly.finalText,provenance:{model:LIVE_MODEL,sessionId,latencyMs:Date.now()-started,audioDurationMs:localBytes/32,transport:'realtime',complete:true}}:null});
    })();return finishPromise;
  }
  async function stop(wasInterrupted=false) {
    if(stopping||!active)return stopPromise;
    stopping=true;interrupted=wasInterrupted;clearTimeout(timer);release();
    stopPromise=(async()=>{
      if(node){await new Promise(resolve=>{const timeout=setTimeout(resolve,300);node._stopped=()=>{clearTimeout(timeout);resolve();};node.port.postMessage('stop');});}
      stream?.getTracks().forEach(t=>t.stop());source?.disconnect();node?.disconnect();
      if(localCheck){await finish();return;}
      if(!ready){await finish('Live setup cancelled. Nothing was sent to Meta.');return;}
      onState?.('reviewing');
      if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'endStream'}));else{await finish('Live speech stopped before connecting.');return;}
      timer=setTimeout(()=>finish('Final words did not arrive. Your recording stays local.'),15000);
    })();return stopPromise;
  }
  async function stage(promise,message,ms=5000) {
    let timeout;try{return await Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error(message)),ms);})]);}finally{clearTimeout(timeout);}
  }
  async function begin() {
    try {
      // Resume in the gesture, then again after permission changes the iOS route.
      onStatus?.('Starting local audio…');
      await stage(context.resume(),'Local audio did not start. Close this test and tap Start again.');
      onStatus?.('Loading live audio capture…');
      await stage(context.audioWorklet.addModule('/pcm-worklet.js'),'Live audio capture did not load. Use local recording or text.');
      if(!active)throw Error('Live speech cancelled.');
      onStatus?.('Waiting for microphone permission…');
      const requested=navigator.mediaDevices.getUserMedia({audio:true,video:false});
      requested.then(value=>{if(!active)value.getTracks().forEach(track=>track.stop());},()=>{});
      stream=await stage(requested,'Microphone permission did not finish. Allow it on the phone or use text.',15000);
      if(!active||document.visibilityState==='hidden')throw Error('Return to the visit and start recording explicitly.');
      try{if(audioSession)audioSession.type='play-and-record';}catch{}
      await stage(context.resume(),'The microphone audio engine did not resume. Use local recording or text.');
      source=context.createMediaStreamSource(stream);node=new AudioWorkletNode(context,'carryforward-pcm',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      const signal=new Promise((resolve,reject)=>{
        signalResolve=resolve;signalReject=reject;
        signalTimer=setTimeout(()=>reject(Error('No microphone signal reached live capture. Nothing was sent to Meta. Use local recording or text.')),6000);
      });
      node.port.onmessage=event=>{
        if(event.data.type==='stopped'){node._stopped?.();return;}
        if(event.data.type==='limit'){stop();return;}
        if(event.data.type!=='pcm'||!active)return;
        const bytes=event.data.bytes,view=new DataView(bytes);let sum=0,framePeak=0;
        for(let i=0;i<bytes.byteLength;i+=2){const value=view.getInt16(i,true)/32768;sum+=value*value;framePeak=Math.max(framePeak,Math.abs(value));}
        peak=Math.max(peak,framePeak);const rms=Math.sqrt(sum/(bytes.byteLength/2));
        onLevel?.({rms,peak:framePeak});
        if(rms>0.0002&&++signalPackets>=2){clearTimeout(signalTimer);signalResolve?.();signalResolve=null;signalReject=null;}
        // Preflight audio is discarded. Only post-handshake PCM is saved/sent.
        if(!localCheck&&!ready)return;
        if(localBytes+bytes.byteLength>LIVE_LIMITS.totalBytes){stop();return;}
        packets.push(bytes);localBytes+=bytes.byteLength;
        if(!localCheck&&socket?.readyState===WebSocket.OPEN&&ready){if(socket.bufferedAmount>LIVE_LIMITS.backlogBytes){finish('Connection too slow. Your audio stays local.');return;}socket.send(bytes);}
      };
      release=watchCaptureInterruptions({page:document,windowTarget:window,tracks:stream.getTracks(),onInterrupt:()=>stop(true)});
      source.connect(node);const mute=context.createGain();mute.gain.value=0;node.connect(mute);mute.connect(context.destination);
      onStatus?.('Checking the microphone locally. Say “testing” now; nothing is being sent.');
      await signal;
      if(!active||stopping)throw Error('Microphone check cancelled.');
      if(localCheck){onState?.('listening');onStatus?.('Microphone signal detected. Speak for this local playback check.');timer=setTimeout(()=>stop(),5000);return;}
      const url=new URL('/api/voice/live',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
      onStatus?.('Microphone signal detected. Connecting to Meta…');
      socket=new WebSocket(url);socket.binaryType='arraybuffer';
      const connected=new Promise((resolve,reject)=>{
        const deadline=setTimeout(()=>reject(Error('Live speech could not connect. Use local recording.')),15000);
        socket.onopen=()=>socket.send(JSON.stringify({type:'start',version:1,synthetic:true,jobId,audioId}));
        socket.onmessage=event=>{try{
          const data=JSON.parse(event.data);
          if(data.type==='ready'){
            if(ready||data.model!==LIVE_MODEL||typeof data.sessionId!=='string')throw Error('Speech session mismatch.');
            ready=true;sessionId=data.sessionId;clearTimeout(deadline);resolve();return;
          }
          if(data.type==='error')throw Error(typeof data.message==='string'?data.message:'Speech service stopped.');
          if(data.type==='done'){finish(null,data).catch(()=>{});return;}
          if(!ready)throw Error('Words arrived before the session was ready.');
          assembly.accept(data);if(data.type==='transcript'||data.type==='speechComplete')onPreview?.(assembly.preview);
        }catch(error){clearTimeout(deadline);if(!ready)reject(error);else finish(error.message).catch(()=>{});}};
        socket.onerror=()=>{clearTimeout(deadline);if(!ready)reject(Error('Live speech connection unavailable.'));else finish('Live speech connection stopped.').catch(()=>{});};
        socket.onclose=()=>{clearTimeout(deadline);if(!ready)reject(Error('Live speech connection closed.'));else if(active)finish('Speech stream ended before all words arrived.').catch(()=>{});};
      });
      await connected;
      if(!active||document.visibilityState==='hidden')throw Error('Live speech cancelled. Start explicitly after returning.');
      onState?.('listening');onStatus?.('Listening live with Meta. Say your fictional visit update now.');timer=setTimeout(()=>stop(),30000);
    } catch(error) { active=false;await cleanup();try{socket?.close();}catch{}throw error; }
  }
  return {ready:begin(),stop:()=>stop(),dispose:()=>{interrupted=true;return finish('Live speech interrupted. Review any saved audio.');}};
}
