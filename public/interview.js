import {makeReviewCopy} from './review-copy.js';
import {reviewEvidence} from './evidence-review.js';
import { createInvestigation, reduceInvestigation, nextInterviewQuestion, interviewHandoff } from './investigation.js';
import { listEvents, appendEvent, listPhotosByJob, getInterviewDraft, saveInterviewDraft, savePhotoWithEvent } from './jobstore.js';
import { mountVoice } from './voice.js';
import { newEventId, selectReviewPhotos } from './evidence.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function loadInterview(db, order) {
  let state = createInvestigation(order);
  const events = await listEvents(db, order.id);
  for (const event of events.filter(e => e.type.startsWith('interview.'))) {
    state = reduceInvestigation(state, event.payload.investigationEvent);
  }
  return state;
}

export async function mountInterview(root, { db, order, onUse, onSaved, onEvidenceSaved }) {
  let state = await loadInterview(db, order);
  const config = await fetch('/api/config').then(r => r.json()).catch(() => ({metaEnabled:false}));
  let photos = await listPhotosByJob(db, order.id);
  const selected = new Set();
  const previewUrls=[];
  const releasePreviews=()=>{for(const url of previewUrls)URL.revokeObjectURL(url);previewUrls.length=0;};
  const previewObserver=new MutationObserver(()=>{if(!root.isConnected){releasePreviews();previewObserver.disconnect();}});
  previewObserver.observe(document.body,{childList:true,subtree:true});
  let busy = false;
  let message = '';
  let draft = '';
  let correction = '';
  let draftAudio = null;
  let voiceCapture = false;
  let draftId=newEventId(),draftSave=Promise.resolve();
  try{
    const recovered=await getInterviewDraft(db,order.id);
    if(recovered){
      draft=recovered.text;correction=recovered.correction;draftId=recovered.id;
      if(correction&&(!state.sources[correction]||state.sources[correction].supersededBy))correction='';
      if(recovered.audio){const audio=state.sources[recovered.audio.audioId];
        if(!audio||audio.kind!=='audio'||audio.excluded)throw Error('Recovered text has an unavailable voice source; review it before saving.');
        draftAudio=recovered.audio;
      }
      message='Unsent draft restored. Review it and Save answer to add it to job history.';
    }
  }catch(error){message=error.message;}
  function persistDraft(){
    const snapshot={id:draftId,jobId:order.id,text:draft,correction,audio:draftAudio};
    draftSave=saveInterviewDraft(db,snapshot).then(()=>{
      if(root.isConnected){const notice=root.querySelector('#interview-status');if(notice)notice.textContent='Draft saved locally · not yet part of the handoff.';}
    }).catch(error=>{message=error.message+' Keep this page open; your unsent text is not safely saved.';if(root.isConnected){const notice=root.querySelector('#interview-status');if(notice)notice.textContent=message;}});
    return draftSave;
  }
  async function dispatch(type, payload, clearDraftId) {
    const event = { id: newEventId(), jobId: order.id, seq: state.seq + 1,
      at: new Date().toISOString(), type, payload };
    const next = reduceInvestigation(state, event);
    await appendEvent(db, { id: event.id, jobId: order.id, type: `interview.${type}`,
      payload: { investigationEvent: event }, clearDraftId });
    state = next;
    onSaved?.(interviewHandoff(state));
  }
  async function run(action) {
    if (busy) return;
    if (voiceCapture) { const notice=root.querySelector('#interview-status'); if(notice)notice.textContent='Stop the recording before saving or reviewing the answer.'; return; }
    busy = true;
    const status = root.querySelector('#interview-status');
    if (status) status.textContent = 'Saving or reviewing evidence… Your saved conversation remains available.';
    for (const control of root.querySelectorAll('button,input,textarea,select')) control.disabled = true;
    try { await action(); message = 'Saved on this device.'; }
    catch (error) { message = `${error.message} Your unsent text is retained.`; }
    finally { busy = false; if (root.isConnected) draw(); }
  }
  async function askNext(force = false) {
    if (config.metaEnabled && !force) return;
    const q = nextInterviewQuestion(state);
    if (q) await dispatch('question.offered', q);
  }
  async function metaReview() {
    await reviewEvidence({order,selected,readPhotos:()=>listPhotosByJob(db,order.id),
      readState:async()=>state=await loadInterview(db,order),dispatch,
      ensureCurrent:()=>{if(!root.isConnected)throw Error('This job view has closed.');}});
  }

  function draw() {
    releasePreviews();
    if(!root.isConnected)return;
    const photoCards=photos.map(p=>{const url=URL.createObjectURL(p.blob);previewUrls.push(url);
      return `<article class="photo-card ${p.status==='excluded'?'excluded':''}"><img class="review-image" src="${url}" alt="Job photo: ${esc(p.name)}"><strong>${esc(p.name)}</strong><p>${esc(p.id)} · ${Math.ceil(p.blob.size/1000)} KB · ${p.derivedFrom?'review copy saved locally':'original saved locally'}</p>${p.derivedFrom?`<p>Reduced from ${esc(p.derivedFrom)}. Small details may be lost.</p>`:p.status!=='excluded'?`<button type="button" data-prepare-copy="${esc(p.id)}">Prepare smaller review copy</button>`:''}${p.status==='excluded'?'<p>Excluded from AI review</p>':config.metaEnabled?`<label class="checkline"><input type="checkbox" data-review-photo="${esc(p.id)}" ${selected.has(p.id)?'checked':''}>Include ${esc(p.name)} in this review</label>`:''}</article>`;}).join('');
    const turns = Object.values(state.sources).filter(s => s.kind === 'testimony');
    root.innerHTML = `<section class="panel interview"><p class="eyebrow">TALK THROUGH THE VISIT</p>
      <h2>Tell me what happened.</h2><p>Park before reviewing photos or confirming a handoff. This text interview saves your words; ${config.metaEnabled ? 'Meta review and reviewed voice transcripts are available for synthetic job evidence.' : 'Voice clips save locally. AI transcription and review are disabled.'}</p>
      <label>How should CarryForward talk with you?<select id="communication-style"><option value="direct" ${state.communicationStyle==='direct'?'selected':''}>Direct · no banter</option><option value="conversational" ${state.communicationStyle==='conversational'?'selected':''}>Conversational · relaxed</option></select></label><p>This choice stays with this job. Conversational allows brief, responsive humor. Evidence requirements and follow-up limits stay the same.</p>
      ${state.reviewRequired && state.interpretations.length ? '<p class="warn">New evidence has not been reconciled with the earlier model findings. Review it with Meta or keep affected outcomes open in the handoff.</p>' : ''}
      <ol class="conversation" aria-label="Saved conversation">${turns.map(t => `<li><strong>Technician${t.supersededBy||t.amendedBy?.length ? ' · corrected below' : ''}</strong><p>${esc(t.text)}</p><small>${esc(t.id)}${t.amends?` · amends ${esc(t.amends)}`:''}${t.supersedes ? ` · corrects ${esc(t.supersedes)}` : ''}${t.audioId ? ` · ${t.transcription?.reviewed===false?'unreviewed speech':'reviewed voice clip'} ${esc(t.audioId)}` : ''}</small>${t.transcription ? `<details><summary>Original machine/manual transcript</summary><p>${esc(t.transcription.rawText)}</p><small>${esc(t.transcription.provenance?.model || 'manual-transcript')}</small></details>` : ''}</li>`).join('')}</ol>
      ${state.activeQuestion ? `<div class="source"><strong>CarryForward · ${state.interpretations.length ? 'evidence follow-up' : 'work-order question'}</strong><p>${esc(state.activeQuestion.text)}</p></div>` : `<p>${state.followups >= 3 ? 'Three follow-ups recorded. You can review the handoff now or choose to continue.' : 'Describe the work in your own words. You can add corrections at any time.'}</p>`}
      <div id="voice-root"></div>
      <form id="interview-form"><label>Your answer<textarea id="interview-answer" rows="3" maxlength="4000" required>${esc(draft)}</textarea></label>
      <label>Correct an earlier answer (optional)<select id="correct-turn"><option value="">New answer</option>${turns.filter(t => !t.supersededBy).map(t => `<option value="${esc(t.id)}" ${correction === t.id ? 'selected' : ''}>${esc(t.text.slice(0,80))}</option>`).join('')}</select></label>
      <button class="primary" ${busy ? 'disabled' : ''}>Save answer</button></form>
      ${state.activeQuestion ? `<label>Follow-up owner<input id="interview-owner" maxlength="200" placeholder="For example, Operations"></label><div class="interview-actions"><button type="button" data-response="cannot_verify">Can't verify</button><button type="button" data-response="later">Follow up later</button><button type="button" data-response="already_answered" ${turns.length ? '' : 'disabled'}>Already answered</button></div>` : ''}
      <div class="interview-actions"><button id="ask-next" type="button" ${state.activeQuestion ? 'disabled' : ''}>${state.followups >= 3 ? 'Continue with more questions' : 'Next work-order question (fallback)'}</button><button id="use-interview" type="button" ${turns.length ? '' : 'disabled'}>Use these notes in field report</button></div>
      <details><summary>Review this job's photos (${photos.length})</summary><p>Inspect the originals before choosing evidence. Selection does not verify the reading, timing or equipment.</p><div class="photogrid">${photoCards||'<p>No job photos saved. Add photos in the field report.</p>'}</div><p id="photo-review-status" role="status"></p></details>
      ${config.metaEnabled ? `<fieldset><legend>Meta evidence review</legend><p>Only fictional demonstration content is authorized. Select up to three originals or prepared review copies (1 MB total) to send with the saved conversation. Originals stay on this device.</p><p>Only photos checked in the preview above are sent. Filenames and previews do not establish capture time or equipment identity.</p><label class="checkline"><input id="synthetic-review" type="checkbox">This job and its selected photos are synthetic demonstration data.</label><button id="meta-review" type="button" ${busy?'disabled':''}>Review evidence with Meta</button><p>${state.interpretations.length ? `Last review: ${esc(state.interpretations.at(-1).model)} · ${esc(state.interpretations.at(-1).provenance?.latencyMs || '?')} ms · ${esc(state.interpretations.at(-1).provenance?.usage?.total_tokens || '?')} tokens` : 'No Meta interpretation recorded for this job.'}</p></fieldset>` : ''}
      ${state.observations.length ? `<details><summary>Model findings and sources</summary>${state.observations.map(o=>`<article class="source"><p>${esc(o.claim)}${o.supersededBy?' (corrected)':''}</p><small>${esc(o.sourceIds.join(', '))} · ${esc(o.model)}</small></article>`).join('')}</details>` : ''}
      <details><summary>Unresolved work and sources</summary><p>Supported means evidence for a technician-reported claim, not independent verification or Operations acceptance.</p><ul>${Object.values(state.branches).map(b => `<li><strong>${esc(order.checks.find(c => c.id === b.id)?.label)}</strong>: ${esc(b.state)}${b.owner ? ` · ${esc(b.owner)}` : ''}<p>${esc(b.reason)}</p>${b.state === 'deferred' ? `<button data-reopen="${esc(b.id)}" type="button">Reopen</button>` : ''}</li>`).join('')}</ul></details>
      <p id="interview-status" role="status">${esc(message)}</p></section>`;
    root.querySelector('#communication-style').onchange=e=>{const communicationStyle=e.target.value;run(()=>dispatch('preference.changed',{communicationStyle}));};
    const voiceRoot=root.querySelector('#voice-root');
    mountVoice(voiceRoot,{db,jobId:order.id,enabled:config.transcriptionEnabled,onEvidenceSaved,onCaptureState:value=>{voiceCapture=value;},onTranscript:async({clip,text})=>{
      if(busy)throw new Error('Wait for the current interview save or review.');
      if(draftAudio&&draftAudio.audioId!==clip.id)throw new Error('Save the current voice answer before adding another clip.');
      if(!Object.hasOwn(state.sources,clip.id))await dispatch('source.added',{id:clip.id,kind:'audio',sha256:clip.originalSha256,wavSha256:clip.wavSha256,name:clip.name});
      draft=draft?draft+'\n'+text:text;
      draftAudio={audioId:clip.id,transcription:{rawText:clip.transcription?.transcript||text,reviewed:true,provenance:clip.transcription?.provenance||{model:'manual-transcript'}}};
      await persistDraft();
      draw();
    }}).catch(error=>{if(voiceRoot.isConnected)voiceRoot.textContent=`Voice capture unavailable: ${error.message}. Use text.`;});
    for (const box of root.querySelectorAll('[data-review-photo]')) box.onchange = () => {
      const next=new Set(selected);if(box.checked)next.add(box.dataset.reviewPhoto);else next.delete(box.dataset.reviewPhoto);
      try{selectReviewPhotos(photos,next,order.id);selected.clear();for(const id of next)selected.add(id);root.querySelector('#photo-review-status').textContent=`${selected.size} photo(s) selected. Review runs only when you request it.`;}
      catch(error){box.checked=selected.has(box.dataset.reviewPhoto);root.querySelector('#photo-review-status').textContent=error.message;}
    };
    for(const button of root.querySelectorAll('[data-prepare-copy]'))button.onclick=()=>run(async()=>{
      const stored=await listPhotosByJob(db,order.id);
      if(stored.length>=10)throw Error('This job has ten photos. Review copies also count toward the photo limit.');
      const original=stored.find(p=>p.id===button.dataset.prepareCopy);
      if(!original||original.jobId!==order.id)throw Error('Original belongs to another job.');
      if(stored.some(p=>p.derivedFrom===original.id&&p.status!=='excluded'))throw Error('A review copy already exists. Inspect and select it below.');
      const copy=await makeReviewCopy(original);
      if(!state.sources[original.id])await dispatch('source.added',{id:original.id,kind:'photo',sha256:original.sha256,name:original.name});
      await savePhotoWithEvent(db,copy,{id:newEventId(),type:'evidence.added',payload:{photoId:copy.id,derivedFrom:original.id}});
      await dispatch('source.added',{id:copy.id,kind:'photo',sha256:copy.sha256,name:copy.name,derivedFrom:copy.derivedFrom,sourceSha256:copy.sourceSha256,derivation:copy.derivation});
      photos=await listPhotosByJob(db,order.id);await onEvidenceSaved?.();
    });
    const metaButton = root.querySelector('#meta-review');
    if(metaButton) metaButton.onclick = () => {
      if (!root.querySelector('#synthetic-review').checked) { message = 'Confirm that this is synthetic demonstration data before sending it to Meta.'; draw(); return; }
      run(metaReview);
    };
    root.querySelector('#interview-answer').oninput = e => { draft = e.target.value; persistDraft(); };
    root.querySelector('#correct-turn').onchange = e => { correction = e.target.value; persistDraft(); };
    root.querySelector('#interview-form').onsubmit = e => {
      e.preventDefault();
      run(async () => {
        if (!draft.trim()) throw new Error('Add an answer first.');
        await draftSave;
        const prior = correction && state.sources[correction];
        await dispatch('turn.recorded', { id: newEventId(), text: draft.trim(),
          branchId: prior ? prior.branchId : state.activeQuestion?.branchId || null,
          supersedes: correction || null, ...(draftAudio||{}) }, draftId);
        draft = ''; correction = ''; draftAudio=null; draftId=newEventId();
        await askNext();
      });
    };
    root.querySelector('#ask-next').onclick = () => run(async () => {
      if (state.followups >= 3) await dispatch('review.continue', {});
      await askNext(true);
    });
    for (const button of root.querySelectorAll('[data-response]')) button.onclick = () => run(async () => {
      const action = button.dataset.response;
      const owner = root.querySelector('#interview-owner').value.trim();
      const sources = turns.filter(t => !t.supersededBy).map(t => t.id);
      await dispatch('branch.response', { branchId: state.activeQuestion.branchId, action,
        reason: action === 'already_answered' ? 'Technician points to saved answers; interpretation remains pending.' : action === 'later' ? 'Technician requested follow-up.' : 'Technician cannot verify this during the visit.',
        owner: owner || null, ...(action === 'already_answered' ? { sourceIds: sources.slice(-20) } : {}) });
      await askNext();
    });
    for (const button of root.querySelectorAll('[data-reopen]')) button.onclick = () => run(async () => {
      await dispatch('branch.response',{branchId:button.dataset.reopen,action:'reopen',reason:'Technician explicitly chose to reopen this check.'});
      await askNext();
    });
    root.querySelector('#use-interview').onclick = () => onUse(interviewHandoff(state));
  }
  draw();
  return () => interviewHandoff(state);
}
