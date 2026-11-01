// Shared bounds and transcript assembly. ASR events are data, never commands.
export const LIVE_MODEL = 'muse-voice-transcribe-1.0';
export const LIVE_LIMITS = Object.freeze({seconds:30,rate:16000,frameBytes:16384,totalBytes:960000,backlogBytes:64000,text:4000});
export function checkLiveStart(value) {
  if (!value || value.type !== 'start' || value.synthetic !== true || value.version !== 1 ||
      typeof value.jobId !== 'string' || !value.jobId.trim() || value.jobId.length > 300 ||
      typeof value.audioId !== 'string' || !/^ev-[a-f0-9]{16}$/.test(value.audioId) ||
      Object.keys(value).some(key => !['type','synthetic','version','jobId','audioId'].includes(key))) throw Error('Start an identified fictional demo session.');
  return {type:'start',version:1,synthetic:true,jobId:value.jobId,audioId:value.audioId};
}
export function checkPcmFrame(length, total, elapsedMs) {
  if (!Number.isInteger(length) || length <= 0 || length % 2 || length > LIVE_LIMITS.frameBytes || total + length > LIVE_LIMITS.totalBytes) throw Error('Live audio exceeds its frame or 30-second limit.');
  if ((total + length) / 32 > elapsedMs + 750) throw Error('Audio arrived faster than real time.');
  return total + length;
}
export function cleanAsrEvent(value) {
  if (!value || typeof value !== 'object') throw Error('Invalid speech event.');
  const types = ['speechStart','speechEnd','speechComplete','transcript','audioProgress'];
  if (!types.includes(value.type)) return null;
  const out = {type:value.type};
  if (value.audioProcessedMs !== undefined) {
    if (!Number.isFinite(value.audioProcessedMs) || value.audioProcessedMs < 0 || value.audioProcessedMs > 31000) throw Error('Invalid audio progress.');
    out.audioProcessedMs = value.audioProcessedMs;
  }
  if (['speechStart','speechEnd','speechComplete'].includes(value.type)) {
    if (!Number.isInteger(value.turnId) || value.turnId < 0 || value.turnId > 500) throw Error('Invalid speech turn.');
    out.turnId = value.turnId;
  }
  if (['speechComplete','transcript'].includes(value.type)) {
    if (typeof value.transcript !== 'string' || value.transcript.length > LIVE_LIMITS.text) throw Error('Transcript exceeds the review limit.');
    out.transcript = value.transcript;
    if (value.type === 'transcript') out.final = value.final === true;
  }
  return out;
}
export function transcriptAssembly() {
  const turns = new Map(); let current = null, partial = '';
  const finalText = () => [...turns].sort((a,b) => a[0]-b[0]).map(([,text]) => text).filter(Boolean).join(' ');
  return {
    accept(input) {
      const event = cleanAsrEvent(input); if (!event) return;
      if (event.type === 'speechStart') { current = event.turnId; partial = ''; }
      if (event.type === 'transcript') partial = event.transcript; // CUMULATIVE replaces, never appends.
      if (event.type === 'speechComplete') {
        if (turns.has(event.turnId) && turns.get(event.turnId) !== event.transcript) throw Error('A completed speech turn changed. Review the saved audio.');
        turns.set(event.turnId,event.transcript);
        if (current === event.turnId) { current = null; partial = ''; }
      }
      if (finalText().length + partial.length > LIVE_LIMITS.text) throw Error('Keep the reviewed answer under 4,000 characters.');
    },
    get finalText() { return finalText(); },
    get preview() { return [finalText(),partial].filter(Boolean).join(' '); },
    get unfinished() { return !!partial || current !== null; },
  };
}
