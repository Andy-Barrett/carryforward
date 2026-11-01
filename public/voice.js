import {startLiveVoice} from './live-voice.js';
import {requestReview} from './review-request.js';
import {watchCaptureInterruptions} from './capture-lifecycle.js';
import {transcriptionWav,AUDIO_LIMITS,validateAudioOriginal} from './audio.js';
import {saveAudio,listAudioByJob,updateAudioTranscription} from './jobstore.js';
import {hashBytes,newEvidenceId} from './evidence.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
const recovery=new Map();
export async function mountVoice(root,{db,jobId,enabled,onTranscript,onEvidenceSaved,onCaptureState,onRecordingState,liveEnabled=false,onPreview,onLiveDraft,onVoiceState,onInputLevel,onNewDemo}){
  let clips=await listAudioByJob(db,jobId),message='',busy=false,recorder=null,stream=null,timer=null,interrupted=false,releaseInterruptions=()=>{};
  let live=null,disposed=false,micCheck=null;
  const urls=[];
  const stop=()=>{if(live){live.stop();return;}if(recorder&&recorder.state!=='inactive')recorder.stop();else stream?.getTracks().forEach(t=>t.stop());};
  const observer=new MutationObserver(()=>{if(!root.isConnected){interrupted=true;stop();observer.disconnect();for(const url of urls)URL.revokeObjectURL(url);}});
  observer.observe(document.body,{childList:true,subtree:true});
  async function keep(blob,name,wasInterrupted,options={}){
    validateAudioOriginal(blob.type,blob.size);
    recovery.set(jobId,{blob,name});
    const bytes=new Uint8Array(await blob.arrayBuffer());
    let wav=null,conversionError=null;
    try{wav=await transcriptionWav(blob);}catch(error){conversionError=error.message;}
    const record={id:options.id||newEvidenceId(),jobId,name,mime:blob.type||'application/octet-stream',originalSha256:await hashBytes(bytes),blob,addedAt:new Date().toISOString(),interrupted:wasInterrupted,wavBlob:wav?new Blob([wav],{type:'audio/wav'}):null,wavSha256:wav?await hashBytes(wav):null,conversionError,transcription:null};
    await saveAudio(db,record);recovery.delete(jobId);
    if(options.transcription){const result={...options.transcription,provenance:{...options.transcription.provenance,inputSha256:record.wavSha256}};await updateAudioTranscription(db,record.id,jobId,result);record.transcription=result;}
    clips=await listAudioByJob(db,jobId);
    await onEvidenceSaved?.();
    message=conversionError?`Original saved locally. ${conversionError}`:'Voice clip saved locally. Listen, then transcribe or type your notes.';
    return record;
  }
  let consentDialog=null;
  function beginLive() {
    if(busy||disposed||consentDialog)return;
    const dialog=document.createElement('dialog');consentDialog=dialog;dialog.className='cf-flow-dialog';
    const title=document.createElement('h2');title.textContent='Talk live with Meta';
    const note=document.createElement('p');note.textContent='Use a fictional job only. New microphone audio streams to Meta for up to 30 seconds. Review the words before Send. Send shares this job’s saved text for a check and spoken follow-up. Existing audio and photo bytes are not sent.';
    let accepted=false;
    const start=document.createElement('button');start.type='button';start.textContent='Start live demo';
    const check=document.createElement('button');check.type='button';check.textContent='Check microphone locally';check.onclick=()=>{accepted=true;dialog.close();runLive(true);};
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();
    start.onclick=()=>{accepted=true;dialog.close();runLive();};
    const full=clips.length>=AUDIO_LIMITS.clipsPerJob;
    start.disabled=full;
    const limit=document.createElement('p');limit.textContent=full?'This visit has five saved clips. Start a fresh fictional visit to keep testing; existing recordings stay saved.':'';
    const fresh=document.createElement('button');fresh.type='button';fresh.textContent='Start fresh fictional visit';fresh.hidden=!full||!onNewDemo;
    fresh.onclick=()=>{accepted=true;dialog.close();run(async()=>{await onNewDemo();});};
    dialog.addEventListener('close',()=>{consentDialog=null;dialog.remove();if(!accepted)onPreview?.('Live mode cancelled. Local recording and text are available.',true);});dialog.append(title,note,limit,start,check,fresh,cancel);root.append(dialog);dialog.showModal();
  }
  async function runLive(localCheck=false) {
    if(busy||disposed)return;
    if(!localCheck&&clips.length>=AUDIO_LIMITS.clipsPerJob){message='This job already has five clips. Use text or another fictional demo job.';draw();onPreview?.(message,true);return;}
    busy=true;onCaptureState?.(true);onVoiceState?.('connecting');
    root.querySelector('#voice-record').disabled=true;
    root.querySelector('[role=status]').textContent='Connecting live speech…';
    try {
      live=startLiveVoice({jobId,audioId:newEvidenceId(),localCheck,onLevel:onInputLevel,
        onStatus:text=>{if(root.isConnected){root.querySelector('[role=status]').textContent=text;onPreview?.(text,true);}},
        onPreview:text=>{if(root.isConnected){root.querySelector('[role=status]').textContent=text||'Listening…';onPreview?.(text);}},
        onState:state=>{if(root.isConnected){onVoiceState?.(state);if(state==='listening')root.querySelector('#voice-stop').disabled=false;}},
        onComplete:async result=>{
          let clip=null;
          try{if(result.localCheck){micCheck=result.wav?new Blob([result.wav],{type:'audio/wav'}):null;message=result.error||'Microphone check recorded locally. Play it below. This temporary clip disappears when you leave or reload.';}
            else {if(result.wav)clip=await keep(new Blob([result.wav],{type:'audio/wav'}),'Live voice answer '+new Date().toLocaleTimeString(),result.interrupted,{id:result.transcription?.audioId,transcription:result.transcription});
            message=result.error||'Live transcript saved. Review the words, then Send.';}
          }catch(error){message=error.message;}
          live=null;busy=false;onCaptureState?.(false);onRecordingState?.(false);onVoiceState?.('ready');if(root.isConnected){draw();if(result.error||result.localCheck)onPreview?.(message,true);}
          if(clip?.transcription?.transcript&&root.isConnected&&!disposed)await onLiveDraft?.({clip,text:clip.transcription.transcript});
        },
      });
      root.querySelector('#voice-stop').disabled=false;
      await live.ready;
      if(disposed||!root.isConnected)await live?.dispose();
    }catch(error){live=null;busy=false;onCaptureState?.(false);onRecordingState?.(false);onVoiceState?.('ready');message=error.message;if(root.isConnected){draw();onPreview?.(message,true);}}
  }
  async function run(action){if(busy)return;busy=true;try{await action();}catch(e){message=e.message;}finally{busy=false;if(root.isConnected)draw();}}
  function draw(){
    for(const url of urls)URL.revokeObjectURL(url);urls.length=0;
    let checkHtml='';if(micCheck){const url=URL.createObjectURL(micCheck);urls.push(url);checkHtml=`<p>Temporary microphone check · local only</p><audio aria-label="Microphone check playback" controls preload="metadata" src="${url}"></audio>`;}
    const pending=recovery.get(jobId);let recoveryHtml='';
    if(pending){const recoveryUrl=URL.createObjectURL(pending.blob);urls.push(recoveryUrl);recoveryHtml=`<p>New audio is not safely saved. Keep this page open.</p><a href="${recoveryUrl}" download="recovered-voice-clip">Download unsaved recording</a>`;}
    root.innerHTML=`<fieldset><legend>Voice answer · saved on this device</legend><p>${liveEnabled?'Record locally, or choose the live fictional demo. Live mode sends new speech to Meta after confirmation. Review the words before Send.':'Record up to 30 seconds, then listen and review the words before using them. Local recordings stay here until you request transcription.'} Text is always available.</p><div class="interview-actions"><button type="button" id="voice-record">Record voice answer</button>${liveEnabled?'<button type="button" id="voice-live">Talk live with Meta</button>':''}<button type="button" id="voice-stop" disabled>Stop recording</button></div><label>Upload a short audio clip<input type="file" id="voice-upload" accept="audio/*"></label><p role="status">${esc(message)}</p>${checkHtml}${recoveryHtml}${clips.map(c=>{const url=URL.createObjectURL(c.blob);urls.push(url);return `<article class="source"><strong>${esc(c.name)}${c.interrupted?' · interrupted recording':''}</strong><p>Saved locally · ${esc(c.id)}</p><audio controls preload="metadata" src="${url}"></audio>${c.conversionError?`<p>${esc(c.conversionError)}</p>`:''}${enabled&&c.wavBlob?`<label class="checkline"><input type="checkbox" data-synthetic-audio="${esc(c.id)}">Send this synthetic demonstration clip to Meta for transcription.</label><button type="button" data-transcribe="${esc(c.id)}">Transcribe with Meta</button>`:''}<label>Review or type the transcript<textarea rows="3" maxlength="4000" data-audio-text="${esc(c.id)}">${esc(c.transcription?.transcript||'')}</textarea></label><button type="button" data-use-audio="${esc(c.id)}">Use reviewed transcript in answer</button>${c.transcription?`<p>${esc(c.transcription.provenance.model)} · ${esc(c.transcription.provenance.latencyMs)} ms</p>`:''}</article>`;}).join('')}</fieldset>`;
    root.querySelector('#voice-record').disabled=busy||clips.length>=AUDIO_LIMITS.clipsPerJob;
    root.querySelector('#voice-record').onclick=async()=>{
      if(busy)return;
      if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder){message='Microphone recording is unavailable here. Upload a clip or use text.';draw();return;}
      busy=true;onCaptureState?.(true);
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:true});
        if(!root.isConnected){stream.getTracks().forEach(t=>t.stop());busy=false;onCaptureState?.(false);return;}
        const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
        recorder=new MediaRecorder(stream,type?{mimeType:type}:undefined);const chunks=[];let bytes=0;interrupted=false;
        recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>AUDIO_LIMITS.originalBytes)stop();}};
        recorder.onerror=()=>{interrupted=true;stop();};
        recorder.onstop=async()=>{
          onRecordingState?.(false);
          clearTimeout(timer);releaseInterruptions();stream.getTracks().forEach(t=>t.stop());
          try{await keep(new Blob(chunks,{type:recorder.mimeType}),`Voice answer ${new Date().toLocaleTimeString()}`,interrupted);}catch(error){message=error.message;}
          busy=false;onCaptureState?.(false);if(root.isConnected)draw();
        };
        recorder.start(500);
        onRecordingState?.(true);
        releaseInterruptions=watchCaptureInterruptions({page:document,windowTarget:window,tracks:stream.getTracks(),onInterrupt:()=>{interrupted=true;stop();}});
        if(document.visibilityState==='hidden'){interrupted=true;stop();}
        timer=setTimeout(stop,30000);
        root.querySelector('#voice-record').disabled=true;root.querySelector('#voice-stop').disabled=false;
        root.querySelector('[role=status]').textContent='Recording… Stops automatically after 30 seconds. Stop before reviewing your answer.';
      }catch(error){releaseInterruptions();clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());busy=false;onCaptureState?.(false);onRecordingState?.(false);message=`Microphone unavailable: ${error.message}. Upload a clip or use text.`;draw();}
    };
    if(root.querySelector('#voice-live')){root.querySelector('#voice-live').disabled=busy;root.querySelector('#voice-live').onclick=beginLive;}
    root.querySelector('#voice-stop').onclick=stop;
    root.querySelector('#voice-upload').onchange=e=>{const f=e.target.files[0];if(f)run(()=>keep(f,f.name,false));};
    for(const button of root.querySelectorAll('[data-transcribe]'))button.onclick=()=>run(async()=>{
      const clip=clips.find(c=>c.id===button.dataset.transcribe);
      if(!root.querySelector(`[data-synthetic-audio="${clip.id}"]`).checked)throw new Error('Confirm that this clip is synthetic demonstration data before sending it.');
      const bytes=new Uint8Array(await clip.wavBlob.arrayBuffer());
      if(await hashBytes(bytes)!==clip.wavSha256)throw new Error('Saved transcription audio hash changed.');
      root.querySelector('[role=status]').textContent='Transcribing with Meta… The original clip stays saved.';
      const result=await requestReview('/api/transcribe',{synthetic:true,jobId,audioId:clip.id,audioBase64:base64(bytes),sha256:clip.wavSha256},{timeoutMs:110000});
      if(result.jobId!==jobId||result.audioId!==clip.id)throw new Error('Transcript belongs to another voice clip.');
      await updateAudioTranscription(db,clip.id,jobId,result);clips=await listAudioByJob(db,jobId);message='Transcript saved. Listen and correct it before using it in an answer.';
    });
    for(const button of root.querySelectorAll('[data-use-audio]'))button.onclick=()=>run(async()=>{
      const clip=clips.find(c=>c.id===button.dataset.useAudio),text=root.querySelector(`[data-audio-text="${clip.id}"]`).value.trim();
      if(!text)throw new Error('Review or type the transcript first.');
      await onTranscript({clip,text});
    });
  }
  draw();
  return {start:()=>liveEnabled?beginLive():root.querySelector('#voice-record')?.click(),stop,dispose:()=>{disposed=true;consentDialog?.close();live?.dispose();interrupted=true;stop();releaseInterruptions();observer.disconnect();onRecordingState?.(false);for(const url of urls)URL.revokeObjectURL(url);}};
}
