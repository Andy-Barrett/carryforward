import {conversationIntent,spokenVisitSummary} from './visit-flow.js';
import {buildVisitBrief} from './visit-brief.js';
import {requestReview} from './review-request.js';
import {createLocalSpeaker} from './local-speech.js';
import { mountCloud } from './cloud-view.js';
import {chooseCloudReview,prepareCloudHandoff} from './cloud-dialogs.js';
import {reviewEvidence} from './evidence-review.js';
import {makeReviewCopy} from './review-copy.js';
import { createJobContext, routeJobCommand } from './job-context.js';
import { resourcesForJob } from './cloud-resources.js';
import { loadInterview } from './interview.js';
import { reduceInvestigation, interviewHandoff } from './investigation.js';
import { appendEvent, listPhotosByJob, listAudioByJob, savePhotoWithEvent, listConversation, saveConversation, listEvents } from './jobstore.js';
import { newEventId, hashBytes } from './evidence.js';
import { mountVoice } from './voice.js';

// This surface navigates admitted sources and saves ordinary interview events.
// Spoken questions use guarded Meta reasoning; explicit source controls remain deterministic.
export async function mountCloudSession(root, {
  db, order: suppliedOrder, onNavigate, onSaved, onEvidenceSaved,
  onPhotoFiles, onPrepareHandoff, onGetReport, onGetPhotos, onNewVoiceDemo,
}) {
  if (!db || !root || !suppliedOrder?.id) throw new Error('A saved job is required before opening its conversation.');
  const order = structuredClone(suppliedOrder), jobId = order.id;
  const draftKey = `carryforward.cloud-draft.v1:${jobId}`;
  const focusKey = `carryforward.cloud-focus.v1:${jobId}:${order.systemId}`;
  const briefKey = `carryforward.brief-viewed.v1:${jobId}`;
  const phaseKey = `carryforward.visit-phase.v1:${jobId}`;
  let startPhase;try{startPhase=localStorage.getItem(phaseKey)||undefined;}catch{}
  const briefRevision = await hashBytes(new TextEncoder().encode(JSON.stringify(order)));
  let startWithBrief = true;
  try { startWithBrief = localStorage.getItem(briefKey) !== briefRevision; } catch { /* Show the brief if view-state storage is unavailable. */ }
  let alive = true, saving = false, capture = false, conversationBusy=false, voice = null, view = null;
  let state = await loadInterview(db, order), context = createJobContext(order);
  let draft = '', draftAudio = null, draftId = newEventId(), speech = null, refreshSequence = 0;
  const speaker=createLocalSpeaker();
  let callbackError = '';
  let config = {metaEnabled:false,transcriptionEnabled:false,liveVoiceEnabled:false}, needsPairing=false;
  const photoUrls = new Map();
  const valid = () => alive && root.isConnected;
  const requireCurrent = () => { if (!valid()) throw new Error('This job view has closed. Reopen the job before continuing.'); };
  const requireIdle = () => {
    requireCurrent();
    if (capture) throw new Error('Stop the recording and wait for its local save before continuing.');
    if (saving) throw new Error('Wait for this answer to finish saving.');
  };

  function checkedAudio(audio, {allowUnreviewed=false}={}) {
    if (!audio) return null;
    if (typeof audio.audioId !== 'string' || audio.audioId.length > 200 ||
        (audio.transcription?.reviewed !== true && !(allowUnreviewed && audio.transcription?.reviewed === false)) || typeof audio.transcription.rawText !== 'string' ||
        audio.transcription.rawText.length > 4000) throw new Error('Review the voice transcript before using it.');
    return structuredClone(audio);
  }
  function saveDraft(text, { audio = null } = {}) {
    if (!valid()) return;
    if (typeof text !== 'string' || text.length > 4000) throw new Error('Keep this draft under 4,000 characters.');
    const nextAudio = checkedAudio(audio,{allowUnreviewed:true});
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
      draft = saved.text; draftAudio = checkedAudio(saved.audio,{allowUnreviewed:true}); restored = true;
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
      state=latest;
      const {assignOpenOwners,...reportDraft}=prepared;
      if(assignOpenOwners){
        saving=true;
        try{await dispatch('branches.owner-assigned',{branchIds:Object.values(state.branches).filter(b=>b.state!=='supported').map(b=>b.id),owner:reportDraft.followupOwner});}
        finally{saving=false;}
      }
      reportDraft.interviewRevision=state.seq;
      await onPrepareHandoff(reportDraft,{jobId});
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
      const audio = checkedAudio(metadata.audio,{allowUnreviewed:metadata.fromHold===true});
      let answerId=metadata.turnId||draftId;
      const alreadySaved = state.sources[answerId];
      if (alreadySaved?.kind === 'testimony') {
        if (alreadySaved.text === text && (alreadySaved.audioId || null) === (audio?.audioId || null) &&
            (alreadySaved.supersedes || null) === (metadata.supersedes || null)) {
          return { response: 'This answer is already saved to the job.', origin: 'Technician testimony · saved locally' };
        }
        answerId=newEventId();if(!metadata.fromHold){draftId=answerId;saveDraft(text,{audio});}
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
        id: answerId, text, branchId: prior?.branchId || metadata.branchId || null,
        supersedes: metadata.supersedes || null, ...(audio || {}),
      });
      if((audio?.liveReview===true||metadata.fromHold===true) && config.metaEnabled===true && !callbackError){
        view.setActivity('reviewing');
        try {
          await reviewEvidence({order,selected:[],readPhotos:getPhotos,readState:async()=>{state=await loadInterview(db,order);requireCurrent();return state;},dispatch,ensureCurrent:requireCurrent,...(metadata.fromHold?{request:(_url,payload)=>requestReview('/api/conversation/review',payload)}:{})});
          const open=Object.values(state.branches).filter(branch=>branch.state!=='supported').length;
          const acknowledgement=metadata.fromHold?state.interpretations.at(-1)?.acknowledgement:null;
          return {response:(acknowledgement?acknowledgement+' ':'')+(state.activeQuestion?.text||`Got it. ${open} ${open===1?'item still needs':'items still need'} verification for the handoff.`),origin:'Model interpretation · muse-spark-1.3',speak:true};
        }catch(error){return {response:`Your answer is saved. AI review did not finish: ${error.message}`,origin:'Saved testimony · AI review incomplete'};}
        finally{if(valid())view.setActivity('ready');}
      }
      return { response: callbackError ? `Answer saved. Reopen the interview to refresh the report: ${callbackError}` :
        'Saved to this job. Review the evidence when you are ready.', origin: 'Technician testimony · saved locally' };
    } finally { saving = false; }
  }
  async function command(text) {
    requireIdle();
    const normalized = text.toLowerCase().replace(/[?.!]/g, '').trim();
    if(/\b(?:onsite|on site|arrived)\b/.test(normalized)&&/\b(?:gate|access|entry)\b/.test(normalized))view.changePhase('onsite');
    if(/^(?:i(?:m| am|’m|'m)? )?(?:have |just )?(?:arrived(?: onsite| on site)?|am onsite|am on site|onsite|on site)$/.test(normalized)){
      view.changePhase('onsite');return {handled:true,response:'You’re in the onsite step. Add what you find or ask about the job.',origin:'Visit navigation · no outcome verified'};
    }

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
    if(config.metaEnabled && !/^(?:show|open|zoom|next|previous|back|replay)\b/i.test(text.trim())){
      const history=(await listConversation(db,jobId)).slice(-12);
      const testimony=Object.values(state.sources).filter(item=>item.kind==='testimony'&&!item.supersededBy).slice(-20).map(item=>({id:item.id,text:item.text}));
      const answer=await requestReview('/api/conversation/answer',{order,text,history,testimony},{timeoutMs:130000});requireCurrent();
      if(answer.intent==='report')return false;
      await saveConversation(db,{id:newEventId(),jobId,at:new Date().toISOString(),question:text,reply:answer.reply,intent:answer.intent,sourceIds:answer.sourceIds,provenance:answer.provenance});
      await drawConversation();return {handled:true,response:answer.reply,origin:'Meta · work order and field context',sourceIds:answer.sourceIds,speak:true};
    }
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
      sourceIds: result.sourceIds || (result.citation ? [result.citation.resourceId] : []),
      detail: result.citations?.map(source=>`${source.title} · ${source.revision}${source.page?` · page ${source.page}`:''}`).join(' · '),
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

  async function spokenTurn({clip,text}) {
    requireIdle();conversationBusy=true;stopSpeaking();view.setHeard(text);view.setActivity('reviewing');
    try {
      state=await loadInterview(db,order);requireCurrent();
      const intent=conversationIntent(text);let reply,origin='From this work order';
      if(intent==='final'){view.changePhase('final');reply=spokenVisitSummary(order,state);origin='Draft visit update';}
      else if(intent==='onsite'){view.changePhase('onsite');reply='You’re onsite. What are you finding?';}
      else if(intent==='report'){view.changePhase('report');reply='Go ahead. What did you do, and what still needs attention?';}
      else {
        const history=(await listConversation(db,jobId)).slice(-12);
        const testimony=Object.values(state.sources).filter(item=>item.kind==='testimony'&&!item.supersededBy).slice(-20).map(item=>({id:item.id,text:item.text}));
        const answer=await requestReview('/api/conversation/answer',{order,text,history,testimony},{timeoutMs:130000});
        requireCurrent();reply=answer.reply;origin='Meta · work order and field context';
        if(answer.intent==='report'){
          const prior=intent==='correction'?Object.values(state.sources).filter(s=>s.kind==='testimony'&&!s.supersededBy).at(-1):null;
          const result=await saveAnswer(text,{fromHold:true,turnId:'turn-'+clip.id,supersedes:prior?.id||null,branchId:state.activeQuestion?.branchId||null,
            audio:{audioId:clip.id,transcription:{rawText:text,reviewed:false,submission:'hold_release',provenance:clip.transcription.provenance}}});
          requireCurrent();reply=(answer.reply==='Got it.'?'':answer.reply+' ')+result.response;origin=result.origin;
        }
        await saveConversation(db,{id:'conversation-'+clip.id,jobId,at:new Date().toISOString(),question:text,reply:reply.slice(0,2000),intent:answer.intent,sourceIds:answer.sourceIds,provenance:answer.provenance});
      }
      view.setResponse(reply,{origin});await drawConversation();await view.refresh();requireCurrent();
      conversationBusy=false;if(document.visibilityState==='hidden'){view.setActivity('ready');return;}view.setActivity('speaking');
      speak(reply,{onState:next=>{if(valid())view.setActivity(next);},onError:error=>{if(valid()){view.setActivity('ready');view.setResponse(reply+' '+error.message,{origin});}}});
    }finally{conversationBusy=false;}
  }

  function stopSpeaking() { speaker.stop(); if(valid())view?.setActivity('ready'); }
  function speak(text,callbacks={}) { requireIdle();speaker.speak(text,callbacks); }

  requireCurrent();
  view = mountCloud(root, {
    order, db, onNavigate: navigate, onSaveAnswer: saveAnswer, onCommand: command, startWithBrief, startPhase, voiceOnly:true,
    onHold:()=>{requireIdle();if(conversationBusy)throw Error('Wait for the reply.');stopSpeaking();if(!config.transcriptionEnabled)throw Error('Voice is unavailable. Reconnect to talk.');if(!voice)throw Error('The microphone is getting ready. Hold again in a moment.');return voice.hold();},
    onPhaseChanged:value=>{try{localStorage.setItem(phaseKey,value);}catch{}},
    onReconnect:async()=>{requireIdle();if(needsPairing){window.location.assign('/pair');return;}await refreshConnection();},
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
      requireIdle(); stopSpeaking();
      if(!await refreshConnection()||!config.liveVoiceEnabled){view.setResponse('The live interview is unavailable. You can type an update, or open Saved voice notes to record locally. A local recording is not a sent report.',{origin:'Connection status'});return;}
      if (voice?.start) await voice.start();
      else { voiceRoot.querySelector('#voice-record')?.focus(); view.setResponse('Use Record below, then review your words before sending.', { origin: 'Voice capture controls' }); }
    },
    onStopTalk: async () => { voice?.stop?.();if(valid())view.setActivity('reviewing'); },
    onStopSpeaking: stopSpeaking, onSpeak: speak,
  });
  const voicePanel = document.createElement('details');
  voicePanel.className = 'cf-voice-panel';
  const summary = document.createElement('summary'); summary.textContent = 'Saved voice notes';
  const voiceRoot = document.createElement('div');
  voicePanel.append(summary, voiceRoot); view.extraTools.append(voicePanel);
  const conversationLog=document.createElement('details');
  conversationLog.append(document.createElement('summary'),document.createElement('div'));
  conversationLog.firstChild.textContent='Questions and replies';view.extraTools.append(conversationLog);
  async function drawConversation({restore=false}={}){
    const rows=await listConversation(db,jobId);if(!valid())return;
    if(restore&&rows.length)view.setResponse(rows.at(-1).reply,{origin:'Saved CarryForward reply',sourceIds:rows.at(-1).sourceIds});
    const content=conversationLog.lastChild;content.replaceChildren();
    for(const row of rows){const card=document.createElement('article');card.className='source';
      const question=document.createElement('p');question.textContent='You: '+row.question;
      const reply=document.createElement('p');reply.textContent='CarryForward: '+row.reply;
      const source=document.createElement('small');source.textContent=(row.sourceIds||[]).join(' · ');card.append(question,reply,source);content.append(card);}
  }
  await drawConversation({restore:true});
  const exportConversation=document.createElement('button');exportConversation.type='button';exportConversation.textContent='Save conversation review';
  exportConversation.onclick=async()=>{try{requireIdle();const clips=await listAudioByJob(db,jobId);
    const packet={version:'carryforward.conversation-review.v1',exportedAt:new Date().toISOString(),order,conversation:await listConversation(db,jobId),events:await listEvents(db,jobId),voiceTranscripts:clips.map(c=>({id:c.id,name:c.name,transcription:c.transcription})),note:'Text only. Earlier source-lookup replies were not saved. Raw transcripts are machine text; questions are not reports.'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=jobId+'-conversation-review.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){view.setResponse(error.message);}};view.extraTools.append(exportConversation);
  const newVisit=document.createElement('button');newVisit.type='button';newVisit.textContent='New fictional work order';newVisit.onclick=async()=>{try{requireIdle();stopSpeaking();await onNewVoiceDemo?.();}catch(error){view.setResponse(error.message);}};view.extraTools.append(newVisit);
  if (restored) view.setDraft?.(draft, { audio: draftAudio, focus: false });

  async function refreshConnection() {
    let ready=false;needsPairing=false;
    try{const response=await fetch('/api/config',{signal:AbortSignal.timeout(5000)});needsPairing=response.status===401;if(!response.ok)throw Error('Service unavailable');config=await response.json();ready=true;}
    catch{config={metaEnabled:false,transcriptionEnabled:false,liveVoiceEnabled:false};}
    if(valid()){view.setConnection({ready,liveEnabled:config.transcriptionEnabled===true,needsPairing});voice?.setAvailability?.({enabled:config.transcriptionEnabled===true,liveEnabled:false});}
    return ready;
  }
  await refreshConnection();
  if (valid()) {
    try {
      voice = await mountVoice(voiceRoot, {
        db, jobId, onClipsChanged:count=>{if(valid()){summary.textContent=`Saved voice notes${count?` · ${count}`:''}`;view.setClips(count);}}, onNewDemo:async()=>{requireIdle();stopSpeaking();await onNewVoiceDemo?.();}, enabled: config.transcriptionEnabled === true,liveEnabled:false,onSpokenTurn:spokenTurn,
        onInputLevel:level=>{if(valid())view.setInputLevel(level);},
        onVoiceState:next=>{if(valid())view.setActivity(next);},
        onPreview:(text,setup)=>{if(valid())view.setResponse(text||'Listening…',{origin:setup?'Live voice setup':'Live transcript · provisional'});},
        onLiveDraft:async({clip,text})=>{
          requireIdle();
          if(draft.trim()||draftAudio){view.setResponse('Live clip saved. Your earlier draft is still here; review the clip below when ready.',{origin:'Local recording saved'});return;}
          const audio={audioId:clip.id,liveReview:true,transcription:{rawText:text,reviewed:false,provenance:clip.transcription.provenance}};
          saveDraft(text,{audio});view.setDraft(text,{audio});view.setResponse('Review these words, then Send. I’ll check the answer and read the follow-up.',{origin:'Live transcript · awaiting your review'});
        },
        onCaptureState: value => { capture = value;if(!value&&valid())view.setActivity('ready'); },
        onRecordingState: value => { if (valid()) view.setActivity(value ? 'listening' : 'reviewing'); },
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
    if (!force && (capture || saving || conversationBusy)) {
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
  cleanup.canNavigate = () => !capture && !saving && !conversationBusy;
  cleanup.refresh = () => view.refresh();
  cleanup.setResponse = (...args) => view.setResponse(...args);
  return cleanup;
}
