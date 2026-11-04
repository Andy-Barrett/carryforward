import { createHash } from 'node:crypto';
import { inspectWav } from '../public/audio.js';
export const TRANSCRIBE_MODEL='muse-voice-transcribe-1.0';
export async function transcribeWithMeta(input,{token,fetchImpl=fetch}={}){
  if(!token)throw new Error('Guarded transcription is disabled');
  if(input?.synthetic!==true||typeof input.jobId!=='string'||!input.jobId||input.jobId.length>300||typeof input.audioId!=='string'||!input.audioId||input.audioId.length>200)throw new Error('Only identified synthetic job clips are authorized');
  if(typeof input.audioBase64!=='string'||input.audioBase64.length>2000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.audioBase64))throw new Error('Invalid audio encoding');
  const bytes=Buffer.from(input.audioBase64,'base64'),audio=inspectWav(bytes);
  if(createHash('sha256').update(bytes).digest('hex')!==input.sha256)throw new Error('Audio hash mismatch');
  const started=Date.now();
  const response=await fetchImpl('http://127.0.0.1:4421/v1/asr/transcribe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({model:TRANSCRIBE_MODEL,audioBase64:input.audioBase64,sha256:input.sha256}),signal:AbortSignal.timeout(100000)});
  if(!response.ok)throw new Error(`Transcription refused (${response.status}); the saved recording is unchanged.`);
  const data=await response.json();
  if(typeof data.transcript!=='string'||data.transcript.length>4000||!Number.isFinite(data.audioDurationMs)||data.audioDurationMs<0||data.audioDurationMs>audio.seconds*1000+1000||typeof data.sessionId!=='string')throw new Error('Transcription response was malformed; no answer was saved.');
  return {jobId:input.jobId,audioId:input.audioId,transcript:data.transcript,provenance:{model:TRANSCRIBE_MODEL,sessionId:data.sessionId,latencyMs:Date.now()-started,audioDurationMs:data.audioDurationMs,inputSha256:input.sha256,estimatedAudioCostUsd:Math.ceil(audio.seconds)*0.18/3600}};
}
