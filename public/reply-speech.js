import {speechText} from './speech-text.js';
import {createLocalSpeaker} from './local-speech.js';
const MAX_BYTES=4_320_000;
const encode=bytes=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
export function nativePcmSink({id,jobId,turnId,onStart,onError,playbackRate=1,bridge=globalThis.webkit?.messageHandlers?.carryForwardSpeechAudio,events=window,timeoutMs=95000}){
  let ended=false,sequence=0,resolve,reject,failure=null;const completion=new Promise((a,b)=>{resolve=a;reject=b;});completion.catch(()=>{});
  const listen=event=>{if(event.detail?.id!==id||event.detail.jobId!==jobId||event.detail.turnId!==turnId)return;
    if(event.detail.state==='playing')onStart();
    if(event.detail.state==='ready'){cleanup();resolve();}
    if(event.detail.state==='error')fail('Spoken audio was interrupted. The reply stays on screen.');
  };
  const timer=setTimeout(()=>fail('Spoken audio did not finish in time.'),timeoutMs);
  function cleanup(){clearTimeout(timer);events.removeEventListener('carryforward-speech-audio',listen);}
  function fail(message){failure=Error(message);ended=true;cleanup();bridge.postMessage({action:'stop',id,jobId,turnId});onError?.(failure);reject(failure);}
  function stop(){if(ended)return;ended=true;cleanup();bridge.postMessage({action:'stop',id,jobId,turnId});resolve();}
  events.addEventListener('carryforward-speech-audio',listen);bridge.postMessage({action:'begin',id,jobId,turnId,sampleRate:24000,playbackRate});
  return {push:async bytes=>{if(failure)throw failure;if(ended)throw Error('Speech cancelled');bridge.postMessage({action:'chunk',id,jobId,turnId,sequence:sequence++,pcmBase64:encode(bytes)});},finish:()=>{if(!ended)bridge.postMessage({action:'end',id,jobId,turnId});return completion;},stop};
}
export function browserPcmSink({onStart,playbackRate=1,Audio=globalThis.AudioContext||globalThis.webkitAudioContext}){
  if(!Audio)throw Error('Streaming playback is unavailable');const context=new Audio(),sources=new Set();let next=0,started=false,ended=false,cancelled=false,resolve,reject;
  const completion=new Promise((a,b)=>{resolve=a;reject=b;});completion.catch(()=>{});
  const finish=()=>{if(ended&&!sources.size){context.close().catch(()=>{});resolve();}};
  return {async push(bytes){if(cancelled)throw Error('Speech cancelled');let timer;try{await Promise.race([context.resume(),new Promise((_,fail)=>{timer=setTimeout(()=>fail(Error('Audio output is unavailable')),3000);})]);}finally{clearTimeout(timer);}
    if(cancelled)throw Error('Speech cancelled');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),buffer=context.createBuffer(1,bytes.length/2,24000),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
    const source=context.createBufferSource();source.buffer=buffer;source.playbackRate.value=playbackRate;source.connect(context.destination);sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();finish();};next=Math.max(context.currentTime+0.03,next);source.start(next);next+=buffer.duration/playbackRate;if(!started){started=true;onStart();}
  },finish(){ended=true;finish();return completion;},stop(){cancelled=true;for(const source of sources){source.onended=null;source.stop();source.disconnect();}sources.clear();context.close().catch(()=>{});resolve();}};
}
// Only server-authorized generated replies can use the network voice. Old/local
// summaries and unavailable providers use local speech without sending new text.
export function createReplySpeaker({jobId,getConfig=()=>({}),local=createLocalSpeaker(),fetchImpl=fetch,makeSink,fallbackToLocal=true,page=globalThis.document,windowTarget=globalThis.window}={}){
  let epoch=0,current=null;
  function stop(){epoch++;const previous=current;current=null;previous?.abort.abort();previous?.sink?.stop();local.stop();}
  const hidden=()=>{if(page?.visibilityState==='hidden')stop();},leaving=()=>stop();page?.addEventListener('visibilitychange',hidden);windowTarget?.addEventListener('pagehide',leaving);
  async function speak(text,{onState,onError,onTiming,onOutput,speech}={}){
    stop();const identity=epoch,valid=()=>epoch===identity&&page?.visibilityState!=='hidden',abort=new AbortController();let started=false,sink=null;
    current={abort,sink:null};const mark=name=>{if(valid())onTiming?.(name,Date.now());};
    function fallback(error){if(!valid())return;if(!fallbackToLocal){onState?.('ready');onError?.(Error('Sarah is unavailable. '+(error?.message||'A current voice playback grant is required.')+' The text remains on screen.'));return;}mark('localFallbackAt');onOutput?.({provider:'local',model:'system-speech'});local.speak(speechText(text),{onState:state=>{if(!valid())return;if(state==='speaking')mark('firstPlayableAt');if(state==='ready')mark('completedAt');onState?.(state);},onError:error=>{if(valid())onError?.(error);}});}
    const config=getConfig()?.speech;
    if(!config?.enabled||!speech||(speech.displayText||speech.text)!==text||speech.jobId!==jobId){try{fallback();}catch(error){onState?.('ready');onError?.(error);}return;}
    let timer=setTimeout(()=>abort.abort(),90000);
    try{
      mark('ttsRequestedAt');const id=crypto.randomUUID();
      const response=await fetchImpl('/api/speech',{method:'POST',headers:{'Content-Type':'application/json','X-CarryForward-Intent':'speech'},body:JSON.stringify({jobId,turnId:speech.turnId,token:speech.token,requestId:id,voice:config.selectedVoice||config.defaultVoice||'sarah'}),signal:abort.signal,redirect:'error'});
      if(!response.ok){const body=await response.json().catch(()=>null),reason=typeof body?.error==='string'?body.error:body?.error?.message;throw Error(typeof reason==='string'?reason.slice(0,240):'Expressive voice is unavailable');}
      if(response.headers.get('x-carryforward-speech-id')!==id||response.headers.get('x-carryforward-sample-rate')!=='24000'||!/^audio\/pcm/.test(response.headers.get('content-type')||'')||!response.body)throw Error('Unexpected spoken audio response');
      if(!valid())return;
      const suppliedRate=Number(response.headers.get('x-carryforward-playback-rate'));const playbackRate=[1,1.15,1.4].includes(suppliedRate)?suppliedRate:1;
      const onStart=()=>{if(valid()&&!started){started=true;mark('firstPlayableAt');onState?.('speaking');}};
      sink=(makeSink||((options)=>globalThis.webkit?.messageHandlers?.carryForwardSpeechAudio?nativePcmSink(options):browserPcmSink(options)))({id,jobId,turnId:speech.turnId,onStart,playbackRate});current.sink=sink;
      const reader=response.body.getReader();let bytes=0,first=true,remainder=null;
      try{while(true){const part=await reader.read();if(!valid()||abort.signal.aborted)break;if(part.done)break;if(!part.value?.length)continue;
        if(first){first=false;mark('firstByteAt');onOutput?.({provider:'ElevenLabs',model:response.headers.get('x-carryforward-speech-model')||'unknown',voice:response.headers.get('x-carryforward-speech-voice')||'unknown'});}bytes+=part.value.length;if(bytes>MAX_BYTES)throw Error('Spoken audio exceeded its limit');
        let value=part.value;if(remainder){const joined=new Uint8Array(value.length+1);joined[0]=remainder[0];joined.set(value,1);value=joined;}
        remainder=value.length%2?value.slice(-1):null;if(remainder)value=value.subarray(0,-1);
        for(let at=0;at<value.length;at+=16384){if(!valid())break;await sink.push(value.subarray(at,at+16384));}
      }}finally{await reader.cancel().catch(()=>{});}
      if(!valid())return;if(!bytes||remainder)throw Error('Incomplete spoken audio');await sink.finish();if(!valid())return;mark('completedAt');onState?.('ready');
    }catch(error){sink?.stop();if(!valid())return;if(!started){try{fallback(error);}catch(localError){onState?.('ready');onError?.(localError);}}else{onState?.('ready');onError?.(Error('The spoken reply was interrupted. Read it on screen or hold to continue.'));}}
    finally{clearTimeout(timer);if(current?.abort===abort)current=null;}
  }
  return {speak,stop,dispose(){stop();page?.removeEventListener('visibilitychange',hidden);windowTarget?.removeEventListener('pagehide',leaving);}};
}
