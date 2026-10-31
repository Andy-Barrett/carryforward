import { mountCloud } from './cloud-view.js';
import {chooseCloudReview,prepareCloudHandoff} from './cloud-dialogs.js';
import {reviewEvidence} from './evidence-review.js';
import {makeReviewCopy} from './review-copy.js';
import { createJobContext, routeJobCommand } from './job-context.js';
import { resourcesForJob } from './cloud-resources.js';
import { loadInterview } from './interview.js';
import { reduceInvestigation, interviewHandoff } from './investigation.js';
import { appendEvent, listPhotosByJob, listAudioByJob, savePhotoWithEvent } from './jobstore.js';
import { newEventId, hashBytes } from './evidence.js';
import { mountVoice } from './voice.js';

// This surface navigates admitted sources and saves ordinary interview events.
// Source lookup is deterministic; it is never represented as model reasoning.
export async function mountCloudSession(root, {
  db, order: suppliedOrder, onNavigate, onSaved, onEvidenceSaved,
  onPhotoFiles, onPrepareHandoff, onGetReport, onGetPhotos,
}) {
  if (!db || !root || !suppliedOrder?.id) throw new Error('A saved job is required before opening its conversation.');
  const order = structuredClone(suppliedOrder), jobId = order.id;
  const draftKey = `carryforward.cloud-draft.v1:${jobId}`;
  const focusKey = `carryforward.cloud-focus.v1:${jobId}:${order.systemId}`;
  const briefKey = `carryforward.brief-viewed.v1:${jobId}`;
  const briefRevision = await hashBytes(new TextEncoder().encode(JSON.stringify(order)));
  let startWithBrief = true;
  try { startWithBrief = localStorage.getItem(briefKey) !== briefRevision; } catch { /* Show the brief if view-state storage is unavailable. */ }
  let alive = true, saving = false, capture = false, voice = null, view = null;
  let state = await loadInterview(db, order), context = createJobContext(order);
  let draft = '', draftAudio = null, draftId = newEventId(), speech = null, refreshSequence = 0;
  let callbackError = '';
  let config = {metaEnabled:false,transcriptionEnabled:false};
  const photoUrls = new Map();
  const valid = () => alive && root.isConnected;
  const requireCurrent = () => { if (!valid()) throw new Error('This job view has closed. Reopen the job before continuing.'); };
  const requireIdle = () => {
    requireCurrent();
    if (capture) throw new Error('Stop the recording and wait for its local save before continuing.');
    if (saving) throw new Error('Wait for this answer to finish saving.');
  };

  function checkedAudio(audio) {
    if (!audio) return null;
    if (typeof audio.audioId !== 'string' || audio.audioId.length > 200 ||
        audio.transcription?.reviewed !== true || typeof audio.transcription.rawText !== 'string' ||
        audio.transcription.rawText.length > 4000) throw new Error('Review the voice transcript before using it.');
    return structuredClone(audio);
  }
  function saveDraft(text, { audio = null } = {}) {
    if (!valid()) return;
    if (typeof text !== 'string' || text.length > 4000) throw new Error('Keep this draft under 4,000 characters.');
    const nextAudio = checkedAudio(audio);
    const record = { id: draftId, jobId, text, audio: nextAudio };
    if (JSON.stringify(record).length > 20000) throw new Error('This voice-linked draft is too large to save.');
    try {
      if (text || nextAudio) localStorage.setItem(draftKey, JSON.stringify(record));
      else localStorage.removeItem(draftKey);
    } catch { throw new Error('This draft is not safely saved. Keep this view open and copy your text before leaving.'); }
    draft = text; draftAudio = nextAudio;
    if (!text && !nextAudio) draftId = newEventId();
  }
  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (saved) {
      if (saved.jobId !== jobId || typeof saved.text !== 'string' || saved.text.length > 4000) throw new Error('Invalid saved cloud draft.');
      if (typeof saved.id === 'string' && saved.id.length <= 200) draftId = saved.id;
      draft = saved.text; draftAudio = checkedAudio(saved.audio); restored = true;
    }
  } catch { /* An unreadable cloud draft must not replace the interview's separate draft. */ }

  async function getPhotos() {
    const photos = await (onGetPhotos ? onGetPhotos(jobId) : listPhotosByJob(db, jobId));
    requireCurrent();
    if (!Array.isArray(photos) || photos.some(photo => photo.jobId !== jobId)) throw new Error('Photos belong to another job.');
    return photos;
  }
  async function refreshContext() {
    const sequence = ++refreshSequence, photos = await getPhotos();
    const available = photos.filter(photo => photo.status !== 'excluded')
      .sort((a, b) => (Date.parse(a.addedAt) || 0) - (Date.parse(b.addedAt) || 0) || String(a.id).localeCompare(String(b.id)))
      .map(photo => {
      if (!(photo.blob instanceof Blob)) throw new Error('A saved job photo is unavailable. Reopen the field report before using it.');
      let url = photoUrls.get(photo.id)?.url;
      if (!url || photoUrls.get(photo.id).sha256 !== photo.sha256) {
        url = URL.createObjectURL(photo.blob);
        const previous = photoUrls.get(photo.id);
        if (previous) URL.revokeObjectURL(previous.url);
        photoUrls.set(photo.id, { url, sha256: photo.sha256 });
      }
      return { ...photo, url, imageUrl: url, previewUrl: url };
    });
    const next = createJobContext(order, resourcesForJob(order, available));
    requireCurrent();
    if (sequence !== refreshSequence) return context;
    for (const key of ['lastResourceId', 'lastDocumentId', 'lastWarningId']) {
      if (next.resources.some(resource => resource.id === context[key])) next[key] = context[key];
    }
    try {
      const prior = JSON.parse(localStorage.getItem(focusKey) || 'null');
      if (prior?.jobId === jobId && prior.systemId === order.systemId) {
        for (const key of ['lastResourceId', 'lastDocumentId', 'lastWarningId']) {
          const ref = prior[key];
          if (!next[key] && ref && next.resources.some(resource => resource.id === ref.id && (resource.revision || null) === ref.revision)) next[key] = ref.id;
        }
      }
    } catch { /* A missing focus record does not affect saved evidence or testimony. */ }
    context = next;
    return context;
  }
  function rememberFocus() {
    const record = {jobId,systemId:order.systemId};
    for (const key of ['lastResourceId', 'lastDocumentId', 'lastWarningId']) {
      const resource = context.resources.find(item => item.id === context[key]);
      record[key] = resource ? {id:resource.id,revision:resource.revision || null} : null;
    }
    try { localStorage.setItem(focusKey,JSON.stringify(record)); } catch { /* Navigation remains available for this session. */ }
  }
  function evidence(resource) {
    return {
      ...resource, excerpt: resource.text,
      imageUrl: resource.kind === 'document' ? resource.posterUrl : resource.kind === 'image' ? resource.url : undefined,
      poster: resource.posterUrl,
      sourceUrl: resource.url,
      origin: resource.title?.toLowerCase().includes('fictional') ? 'Fictional demonstration source' : 'Attached job source',
      availability: `${resource.revision ? `Revision ${resource.revision} · ` : ''}Reference only; does not verify a job outcome`,
    };
  }
  async function navigate(step, {executedCommand = false} = {}) {
    requireIdle();
    stopSpeaking();
    if (step === 'sources') { await showSources(); return; }
    if (step === 'review' && onPrepareHandoff) {
      state=await loadInterview(db,order);requireCurrent();
      const packet=interviewHandoff(state),revision=state.seq;
      const prepared=await prepareCloudHandoff(root,{report:await onGetReport?.()||{},packet,unsent:!!draft.trim()});
      requireIdle();if(!prepared)return;
      const latest=await loadInterview(db,order);requireCurrent();
      if(latest.seq!==revision)throw Error('The conversation changed. Reopen the handoff to review the latest answers.');
      await onPrepareHandoff(prepared,{jobId});
    }
    const executed = {id:draftId,text:draft};
    await onNavigate?.(step, { jobId });
    // A command may unmount this view before submit returns. Button navigation
    // preserves unsent narration; only an executed command clears its exact draft.
    if (!executedCommand) return;
    try {
      const stored = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (stored?.id === executed.id && stored.text === executed.text) localStorage.removeItem(draftKey);
    } catch { /* A failed cleanup retains the draft rather than erasing newer work. */ }
    draft = ''; draftAudio = null; draftId = newEventId();
  }
  async function showSources() {
    const packet = await refreshContext(); requireCurrent();
    const dialog = document.createElement('dialog'); dialog.className = 'cf-reference-picker';
    const title = document.createElement('h2'); title.textContent = 'The sources for this visit';
    const description = document.createElement('p'); description.textContent = 'Work-order references and saved job images. Demo references are labeled; viewing a source does not verify an outcome.';
    dialog.append(title, description);
    const list = document.createElement('div'); list.className = 'cf-reference-list';
    for (const resource of packet.resources) {
      const button = document.createElement('button'); button.type = 'button';
      const name = document.createElement('strong'); name.textContent = resource.title;
      const detail = document.createElement('span'); detail.textContent = `${resource.kind}${resource.page ? ` · page ${resource.page}` : ''}${resource.revision ? ` · ${resource.revision}` : ''}`;
      button.append(name, detail);
      button.onclick = async () => {
        try { const result = routeJobCommand(`show ${resource.id}`, context);
          if (result.kind !== 'present' || !result.resource) { description.textContent = result.message; return; }
          context = result.context; rememberFocus();
          view.setResponse(result.message, {origin:'Attached job source',sourceIds:[resource.id]}); view.showEvidence(evidence(result.resource)); dialog.close();
        } catch(error) { description.textContent = error.message; }
      };
      list.append(button);
    }
    const add = document.createElement('button'); add.type='button'; add.textContent='Add a job photo';
    add.onclick=()=>{dialog.close();onNavigate?.('capture',{jobId});};
    const close = document.createElement('button'); close.type='button';close.textContent='Back to the conversation';close.onclick=()=>dialog.close();
    dialog.append(list,add,close);dialog.addEventListener('close',()=>dialog.remove());root.append(dialog);dialog.showModal();
  }
  async function dispatch(type, payload) {
    requireCurrent();
    const event = { id: newEventId(), jobId, seq: state.seq + 1, at: new Date().toISOString(), type, payload };
    const next = reduceInvestigation(state, event);
    await appendEvent(db, { id: event.id, jobId, type: `interview.${type}`, payload: { investigationEvent: event } });
    state = next;
    if (valid()) {
      try { await onSaved?.(interviewHandoff(state), { jobId }); }
      catch (error) { callbackError = error.message || 'The report view could not refresh.'; }
    }
    return event;
  }
  async function saveAnswer(text, metadata = {}) {
    requireIdle();
    saving = true;
    try {
      // Reload before append; appendEvent still rejects a concurrent stale writer.
      state = await loadInterview(db, order);
      requireCurrent();
      callbackError = '';
      const audio = checkedAudio(metadata.audio);
      const alreadySaved = state.sources[draftId];
      if (alreadySaved?.kind === 'testimony') {
        if (alreadySaved.text === text && (alreadySaved.audioId || null) === (audio?.audioId || null) &&
            (alreadySaved.supersedes || null) === (metadata.supersedes || null)) {
          return { response: 'This answer is already saved to the job.', origin: 'Technician testimony · saved locally' };
        }
        draftId = newEventId();
        saveDraft(text, { audio });
      }
      if (audio) {
        const clips = await listAudioByJob(db, jobId);
        requireCurrent();
        const clip = clips.find(item => item.id === audio.audioId && item.jobId === jobId);
        if (!clip) throw new Error('The reviewed voice source is unavailable in this job.');
        if (!Object.hasOwn(state.sources, clip.id)) await dispatch('source.added', {
          id: clip.id, kind: 'audio', sha256: clip.originalSha256,
          wavSha256: clip.wavSha256, name: clip.name,
        });
      }
      const prior = metadata.supersedes && state.sources[metadata.supersedes];
      await dispatch('turn.recorded', {
        id: draftId, text, branchId: prior?.branchId || metadata.branchId || null,
        supersedes: metadata.supersedes || null, ...(audio || {}),
      });
      return { response: callbackError ? `Answer saved. Reopen the interview to refresh the report: ${callbackError}` :
        'Saved to this job. Review the evidence when you are ready.', origin: 'Technician testimony · saved locally' };
    } finally { saving = false; }
  }
  async function command(text) {
    requireIdle();
    const normalized = text.toLowerCase().replace(/[?.!]/g, '').trim();
    if (/^(?:correct|edit) (?:(?:my|the|an|last|earlier|previous) )*(?:answer|statement)$/.test(normalized)) {
      await navigate('interview', {executedCommand:true});
      return { handled: true };
    }
    if (/^(?:show|open|go to) (?:the )?(?:handoff|closeout|field report|sources|interview)$/.test(normalized)) {
      const step = /handoff|closeout/.test(normalized) ? 'review' : /field report/.test(normalized) ? 'capture' : /sources/.test(normalized) ? 'sources' : 'interview';
      await navigate(step, {executedCommand:true});
      return { handled: true };
    }
    if (/^(?:review|check) (?:the |latest )?(?:job )?evidence(?: with meta)?$/.test(normalized)) {
      const result=await reviewLatest();
      return {handled:true,...(result||{})};
    }
    // The assignment brief is available without loading any saved media.
    if (routeJobCommand(text,context).kind === 'briefing') { view.openBrief(); return {handled:true}; }
    const result = routeJobCommand(text, await refreshContext());
    requireCurrent();
    context = result.context;
    rememberFocus();
    if (result.kind === 'not_command') return false;
    if (result.kind === 'navigate' && /^zoom_/.test(result.action)) {
      view.showEvidence(evidence(result.resource));
      view.zoomEvidence?.(result.action === 'zoom_in' ? 'in' : 'out');
    }
    return {
      handled: true, response: result.message,
      origin: result.kind === 'briefing' ? 'Original work-order briefing' : 'From this job’s source packet',
      sourceIds: result.citation ? [result.citation.resourceId] : [],
      ...(result.kind === 'present' ? { evidence: evidence(result.resource) } : {}),
      ...(result.kind === 'unavailable' ? { evidence: null } : {}),
    };
  }
  async function reviewLatest() {
    requireIdle();stopSpeaking();
    const selection=await chooseCloudReview(root,{photos:await getPhotos(),enabled:config.metaEnabled===true,unsent:!!draft.trim(),prepareCopy:async id=>{
      requireIdle();const stored=await getPhotos();
      if(stored.length>=10)throw Error('This job has ten photos. Copies count toward the limit.');
      const original=stored.find(photo=>photo.id===id);
      if(!original)throw Error('Original photo is unavailable.');
      if(stored.some(photo=>photo.derivedFrom===id&&photo.status!=='excluded'))throw Error('A review copy already exists. Select it in the review list.');
      const copy=await makeReviewCopy(original);requireCurrent();
      await savePhotoWithEvent(db,copy,{id:newEventId(),type:'evidence.added',payload:{photoId:copy.id,derivedFrom:copy.derivedFrom}});
      await onEvidenceSaved?.({jobId});requireCurrent();return copy;
    }});
    requireIdle();if(!selection)return null;
    saving=true;view.setActivity('reviewing');
    try {
      await reviewEvidence({order,selected:selection,readPhotos:getPhotos,
        readState:async()=>{state=await loadInterview(db,order);requireCurrent();return state;},dispatch,ensureCurrent:requireCurrent});
      await refreshContext();
      const last=state.interpretations.at(-1),open=Object.values(state.branches).filter(b=>b.state!=='supported').length;
      return {response:state.activeQuestion?.text||`Review saved. ${open} unresolved ${open===1?'item remains':'items remain'} for the handoff.`,
        origin:`Model interpretation · ${last.model}`,
        detail:`${last.provenance?.latencyMs||'?'} ms · ${last.provenance?.usage?.total_tokens||'?'} tokens. Reported claims remain distinct from verified observations.`};
    } finally {saving=false;if(valid())view.setActivity('ready');}
  }
  async function respondQuestion(action,owner,expected) {
    requireIdle();state=await loadInterview(db,order);requireCurrent();
    if(!state.activeQuestion||state.activeQuestion.branchId!==expected?.branchId||state.inputRevision!==expected.inputRevision)throw Error('This question has changed. Refresh the conversation.');
    const sources=Object.values(state.sources).filter(s=>s.kind==='testimony'&&!s.supersededBy).map(s=>s.id);
    if(action!=='already_answered'&&!owner?.trim())throw Error('Name the person or team who will follow up.');
    saving=true;
    try {await dispatch('branch.response',{branchId:state.activeQuestion.branchId,action,owner:owner?.trim()||null,
      reason:action==='already_answered'?'Technician points to saved answers; interpretation remains pending.':action==='later'?'Technician requested follow-up.':'Technician cannot verify this during the visit.',
      ...(action==='already_answered'?{sourceIds:sources.slice(-20)}:{})});
      return {response:action==='already_answered'?'Saved your reference to the earlier answers. This remains unverified until review.':`Kept open for ${owner.trim()}.`,origin:'Technician decision · saved locally'};
    }finally{saving=false;}
  }
  function stopSpeaking() {
    if (speech) { speech.onend = null; speech.onerror = null; speech = null; }
    globalThis.speechSynthesis?.cancel();
    if (valid()) view?.setActivity('ready');
  }
  function speak(text, callbacks = {}) {
    requireIdle();
    const synth = globalThis.speechSynthesis;
    const localVoice = synth?.getVoices().find(item => item.localService === true);
    if (!synth || !localVoice || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('A local speech voice is unavailable. Read the response on screen instead.');
    stopSpeaking();
    speech = new SpeechSynthesisUtterance(text);
    speech.voice = localVoice;
    speech.onstart = () => { if (valid()) callbacks.onState?.('speaking'); };
    speech.onend = () => { speech = null; if (valid()) callbacks.onState?.('ready'); };
    speech.onerror = () => { speech = null; if (valid()) callbacks.onError?.(new Error('Local speech stopped. The response remains on screen.')); };
    synth.speak(speech);
  }

  requireCurrent();
  view = mountCloud(root, {
    order, db, onNavigate: navigate, onSaveAnswer: saveAnswer, onCommand: command, startWithBrief,
    onBriefViewed: () => { try { localStorage.setItem(briefKey,briefRevision); } catch { /* Viewing is not confirmation or work authorization. */ } },
    onGetState: async () => { const next = await loadInterview(db, order); requireCurrent(); state = next; return next; },
    onDraftChange: saveDraft, onQuestionResponse:respondQuestion,
    onPhotoFiles: async files => {
      requireIdle();
      if (!onPhotoFiles) throw new Error('Open the field report to attach photos.');
      const result = await onPhotoFiles(files, { jobId });
      requireCurrent();
      await refreshContext();
      return result;
    },
    onRefresh: async () => {
      return reviewLatest();
    },
    onTalk: async () => {
      requireIdle(); stopSpeaking(); voicePanel.open = true;
      if (voice?.start) await voice.start();
      else { voiceRoot.querySelector('#voice-record')?.focus(); view.setResponse('Use Record below, then review your words before sending.', { origin: 'Voice capture controls' }); }
    },
    onStopTalk: async () => { voice?.stop?.(); },
    onStopSpeaking: stopSpeaking, onSpeak: speak,
  });
  const voicePanel = document.createElement('details');
  voicePanel.className = 'cf-voice-panel';
  const summary = document.createElement('summary'); summary.textContent = 'Voice clips and reviewed transcripts';
  const voiceRoot = document.createElement('div');
  voicePanel.append(summary, voiceRoot); root.append(voicePanel);
  if (restored) view.setDraft?.(draft, { audio: draftAudio, focus: false });

  try { config = await fetch('/api/config', { signal: AbortSignal.timeout(5000) }).then(response => response.json()); } catch { /* Capture stays local when offline. */ }
  if (valid()) {
    try {
      voice = await mountVoice(voiceRoot, {
        db, jobId, enabled: config.transcriptionEnabled === true,
        onCaptureState: value => { capture = value; },
        onRecordingState: value => { if (valid()) view.setActivity(value ? 'listening' : 'ready'); },
        onEvidenceSaved: async () => {
          if (!valid()) return;
          await onEvidenceSaved?.({ jobId });
          if (valid()) await view.refresh();
        },
        onTranscript: async ({ clip, text }) => {
          requireIdle();
          if (clip.jobId !== jobId) throw new Error('This voice clip belongs to another job.');
          if (draftAudio && draftAudio.audioId !== clip.id) throw new Error('Send or clear the current voice-linked draft before adding another clip.');
          const audio = { audioId: clip.id, transcription: { rawText: clip.transcription?.transcript || text,
            reviewed: true, provenance: clip.transcription?.provenance || { model: 'manual-transcript' } } };
          const combined = draft ? `${draft}\n${text}` : text;
          saveDraft(combined, { audio });
          view.setDraft?.(combined, { audio });
          view.setResponse('Review these words, then Send. Nothing has been added as testimony yet.', { origin: 'Reviewed voice draft' });
        },
      });
    } catch (error) { if (valid()) voiceRoot.textContent = `Voice capture unavailable: ${error.message}. Use text.`; }
  }
  const observer = new MutationObserver(() => { if (!root.isConnected) dispose(true); });
  observer.observe(document.body, { childList: true, subtree: true });
  function dispose(force = false) {
    if (!alive) return true;
    if (!force && (capture || saving)) {
      view.setResponse('Stop the recording and wait for its save before leaving.', { origin: 'Local save status' });
      return false;
    }
    alive = false; refreshSequence++;
    observer.disconnect(); stopSpeaking();
    voice?.dispose?.(); voice?.stop?.();
    view(); voicePanel.remove();
    for (const entry of photoUrls.values()) URL.revokeObjectURL(entry.url);
    photoUrls.clear();
    return true;
  }
  const cleanup = () => dispose(false);
  cleanup.canNavigate = () => !capture && !saving;
  cleanup.refresh = () => view.refresh();
  cleanup.setResponse = (...args) => view.setResponse(...args);
  return cleanup;
}
