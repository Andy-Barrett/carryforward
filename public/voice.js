import {watchCaptureInterruptions} from './capture-lifecycle.js';
import {transcriptionWav,AUDIO_LIMITS,validateAudioOriginal} from './audio.js';
import {saveAudio,listAudioByJob,updateAudioTranscription} from './jobstore.js';
import {hashBytes,newEvidenceId} from './evidence.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
const recovery=new Map();
export async function mountVoice(root,{db,jobId,enabled,onTranscript,onEvidenceSaved,onCaptureState}){
  let clips=await listAudioByJob(db,jobId),message='',busy=false,recorder=null,stream=null,timer=null,interrupted=false,releaseInterruptions=()=>{};
  const urls=[];
  const stop=()=>{if(recorder&&recorder.state!=='inactive')recorder.stop();else stream?.getTracks().forEach(t=>t.stop());};
  const observer=new MutationObserver(()=>{if(!root.isConnected){interrupted=true;stop();observer.disconnect();for(const url of urls)URL.revokeObjectURL(url);}});
  observer.observe(document.body,{childList:true,subtree:true});
  async function keep(blob,name,wasInterrupted){
    validateAudioOriginal(blob.type,blob.size);
    recovery.set(jobId,{blob,name});
    const bytes=new Uint8Array(await blob.arrayBuffer());
    let wav=null,conversionError=null;
    try{wav=await transcriptionWav(blob);}catch(error){conversionError=error.message;}
    const record={id:newEvidenceId(),jobId,name,mime:blob.type||'application/octet-stream',originalSha256:await hashBytes(bytes),blob,addedAt:new Date().toISOString(),interrupted:wasInterrupted,wavBlob:wav?new Blob([wav],{type:'audio/wav'}):null,wavSha256:wav?await hashBytes(wav):null,conversionError,transcription:null};
    await saveAudio(db,record);recovery.delete(jobId);clips=await listAudioByJob(db,jobId);
    await onEvidenceSaved?.();
    message=conversionError?`Original saved locally. ${conversionError}`:'Voice clip saved locally. Listen, then transcribe or type your notes.';
  }
  async function run(action){if(busy)return;busy=true;try{await action();}catch(e){message=e.message;}finally{busy=false;if(root.isConnected)draw();}}
  function draw(){
    for(const url of urls)URL.revokeObjectURL(url);urls.length=0;
    const pending=recovery.get(jobId);let recoveryHtml='';
    if(pending){const recoveryUrl=URL.createObjectURL(pending.blob);urls.push(recoveryUrl);recoveryHtml=`<p>New audio is not safely saved. Keep this page open.</p><a href="${recoveryUrl}" download="recovered-voice-clip">Download unsaved recording</a>`;}
    root.innerHTML=`<fieldset><legend>Voice answer · saved on this device</legend><p>Record up to 30 seconds, then listen and review the words before using them. Recording stays local until you explicitly request transcription. Text is always available.</p><div class="interview-actions"><button type="button" id="voice-record">Record voice answer</button><button type="button" id="voice-stop" disabled>Stop recording</button></div><label>Upload a short audio clip<input type="file" id="voice-upload" accept="audio/*"></label><p role="status">${esc(message)}</p>${recoveryHtml}${clips.map(c=>{const url=URL.createObjectURL(c.blob);urls.push(url);return `<article class="source"><strong>${esc(c.name)}${c.interrupted?' · interrupted recording':''}</strong><p>Saved locally · ${esc(c.id)}</p><audio controls preload="metadata" src="${url}"></audio>${c.conversionError?`<p>${esc(c.conversionError)}</p>`:''}${enabled&&c.wavBlob?`<label class="checkline"><input type="checkbox" data-synthetic-audio="${esc(c.id)}">Send this synthetic demonstration clip to Meta for transcription.</label><button type="button" data-transcribe="${esc(c.id)}">Transcribe with Meta</button>`:''}<label>Review or type the transcript<textarea rows="3" maxlength="4000" data-audio-text="${esc(c.id)}">${esc(c.transcription?.transcript||'')}</textarea></label><button type="button" data-use-audio="${esc(c.id)}">Use reviewed transcript in answer</button>${c.transcription?`<p>${esc(c.transcription.provenance.model)} · ${esc(c.transcription.provenance.latencyMs)} ms</p>`:''}</article>`;}).join('')}</fieldset>`;
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
          clearTimeout(timer);releaseInterruptions();stream.getTracks().forEach(t=>t.stop());
          try{await keep(new Blob(chunks,{type:recorder.mimeType}),`Voice answer ${new Date().toLocaleTimeString()}`,interrupted);}catch(error){message=error.message;}
          busy=false;onCaptureState?.(false);if(root.isConnected)draw();
        };
        recorder.start(500);
        releaseInterruptions=watchCaptureInterruptions({page:document,windowTarget:window,tracks:stream.getTracks(),onInterrupt:()=>{interrupted=true;stop();}});
        if(document.visibilityState==='hidden'){interrupted=true;stop();}
        timer=setTimeout(stop,30000);
        root.querySelector('#voice-record').disabled=true;root.querySelector('#voice-stop').disabled=false;
        root.querySelector('[role=status]').textContent='Recording… Stops automatically after 30 seconds. Stop before reviewing your answer.';
      }catch(error){releaseInterruptions();clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());busy=false;onCaptureState?.(false);message=`Microphone unavailable: ${error.message}. Upload a clip or use text.`;draw();}
    };
    root.querySelector('#voice-stop').onclick=stop;
    root.querySelector('#voice-upload').onchange=e=>{const f=e.target.files[0];if(f)run(()=>keep(f,f.name,false));};
    for(const button of root.querySelectorAll('[data-transcribe]'))button.onclick=()=>run(async()=>{
      const clip=clips.find(c=>c.id===button.dataset.transcribe);
      if(!root.querySelector(`[data-synthetic-audio="${clip.id}"]`).checked)throw new Error('Confirm that this clip is synthetic demonstration data before sending it.');
      const bytes=new Uint8Array(await clip.wavBlob.arrayBuffer());
      if(await hashBytes(bytes)!==clip.wavSha256)throw new Error('Saved transcription audio hash changed.');
      root.querySelector('[role=status]').textContent='Transcribing with Meta… The original clip stays saved.';
      const response=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json','X-CarryForward-Intent':'review'},body:JSON.stringify({synthetic:true,jobId,audioId:clip.id,audioBase64:base64(bytes),sha256:clip.wavSha256})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Transcription failed.');
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
}
