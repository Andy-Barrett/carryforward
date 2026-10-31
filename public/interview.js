import { createInvestigation, reduceInvestigation, nextInterviewQuestion, interviewHandoff } from './investigation.js';
import { listEvents, appendEvent, listPhotosByJob } from './jobstore.js';
import { newEventId, hashBytes } from './evidence.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function loadInterview(db, order) {
  let state = createInvestigation(order);
  const events = await listEvents(db, order.id);
  for (const event of events.filter(e => e.type.startsWith('interview.'))) {
    state = reduceInvestigation(state, event.payload.investigationEvent);
  }
  return state;
}

export async function mountInterview(root, { db, order, onUse, onSaved }) {
  let state = await loadInterview(db, order);
  const config = await fetch('/api/config').then(r => r.json()).catch(() => ({metaEnabled:false}));
  let photos = await listPhotosByJob(db, order.id);
  const selected = new Set();
  let busy = false;
  let message = '';
  let draft = '';
  let correction = '';
  async function dispatch(type, payload) {
    const event = { id: newEventId(), jobId: order.id, seq: state.seq + 1,
      at: new Date().toISOString(), type, payload };
    const next = reduceInvestigation(state, event);
    await appendEvent(db, { id: event.id, jobId: order.id, type: `interview.${type}`,
      payload: { investigationEvent: event } });
    state = next;
    onSaved?.(interviewHandoff(state));
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    const status = root.querySelector('[role="status"]');
    if (status) status.textContent = 'Saving or reviewing evidence… Your saved conversation remains available.';
    for (const button of root.querySelectorAll('button')) button.disabled = true;
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
    const stored = await listPhotosByJob(db, order.id);
    for (const photo of stored) {
      if (!Object.hasOwn(state.sources, photo.id) && photo.status !== 'excluded') {
        await dispatch('source.added', {id:photo.id,kind:'photo',sha256:photo.sha256,name:photo.name});
      } else if (state.sources[photo.id]) {
        if (photo.status === 'excluded' && !state.sources[photo.id].excluded) await dispatch('source.excluded',{id:photo.id});
        if (photo.status !== 'excluded' && state.sources[photo.id].excluded) await dispatch('source.restored',{id:photo.id});
      }
    }
    const packed = [];
    for (const photo of stored.filter(p => selected.has(p.id) && p.status !== 'excluded')) {
      const bytes = new Uint8Array(await photo.blob.arrayBuffer());
      if (await hashBytes(bytes) !== photo.sha256) throw new Error('Saved photo failed its hash check.');
      let binary=''; for (let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      packed.push({id:photo.id,jobId:order.id,mime:photo.mime,dataBase64:btoa(binary)});
    }
    const revision = state.seq;
    const response = await fetch('/api/review', {method:'POST',headers:{'Content-Type':'application/json','X-CarryForward-Intent':'review'},body:JSON.stringify({order,events:state.events,photos:packed})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Meta review failed.');
    const latest = await loadInterview(db, order);
    if (latest.seq !== revision) throw new Error('The job changed during review. Stale result was not applied.');
    await dispatch('interpretation.received',data.proposal);
  }
  function draw() {
    const turns = Object.values(state.sources).filter(s => s.kind === 'testimony');
    root.innerHTML = `<section class="panel interview"><p class="eyebrow">TALK THROUGH THE VISIT</p>
      <h2>Tell me what happened.</h2><p>Park before reviewing photos or confirming a handoff. This text interview saves your words; ${config.metaEnabled ? 'Meta review is available for synthetic job evidence; voice is not connected yet.' : 'AI interpretation and voice are not connected yet.'}</p>
      <ol class="conversation" aria-label="Saved conversation">${turns.map(t => `<li><strong>Technician${t.supersededBy ? ' · corrected below' : ''}</strong><p>${esc(t.text)}</p><small>${esc(t.id)}${t.supersedes ? ` · corrects ${esc(t.supersedes)}` : ''}</small></li>`).join('')}</ol>
      ${state.activeQuestion ? `<div class="source"><strong>CarryForward · ${state.interpretations.length ? 'evidence follow-up' : 'work-order question'}</strong><p>${esc(state.activeQuestion.text)}</p></div>` : `<p>${state.followups >= 3 ? 'Three follow-ups recorded. You can review the handoff now or choose to continue.' : 'Describe the work in your own words. You can add corrections at any time.'}</p>`}
      <form id="interview-form"><label>Your answer<textarea id="interview-answer" rows="3" maxlength="4000" required>${esc(draft)}</textarea></label>
      <label>Correct an earlier answer (optional)<select id="correct-turn"><option value="">New answer</option>${turns.filter(t => !t.supersededBy).map(t => `<option value="${esc(t.id)}" ${correction === t.id ? 'selected' : ''}>${esc(t.text.slice(0,80))}</option>`).join('')}</select></label>
      <button class="primary" ${busy ? 'disabled' : ''}>Save answer</button></form>
      ${state.activeQuestion ? `<label>Follow-up owner<input id="interview-owner" maxlength="200" placeholder="For example, Operations"></label><div class="interview-actions"><button type="button" data-response="cannot_verify">Can't verify</button><button type="button" data-response="later">Follow up later</button><button type="button" data-response="already_answered" ${turns.length ? '' : 'disabled'}>Already answered</button></div>` : ''}
      <div class="interview-actions"><button id="ask-next" type="button" ${state.activeQuestion ? 'disabled' : ''}>${state.followups >= 3 ? 'Continue with more questions' : 'Next work-order question (fallback)'}</button><button id="use-interview" type="button" ${turns.length ? '' : 'disabled'}>Use these notes in field report</button></div>
      ${config.metaEnabled ? `<fieldset><legend>Meta evidence review</legend><p>Only fictional demonstration content is authorized. Select up to three job photos (1 MB total) to send with the saved conversation. Originals stay on this device.</p>${photos.filter(p=>p.status!=='excluded').map(p=>`<label><input type="checkbox" data-review-photo="${esc(p.id)}" ${selected.has(p.id)?'checked':''}>${esc(p.name)} · ${esc(p.id)}</label>`).join('')}<label><input id="synthetic-review" type="checkbox">This job and its selected photos are synthetic demonstration data.</label><button id="meta-review" type="button" ${busy?'disabled':''}>Review evidence with Meta</button><p>${state.interpretations.length ? `Last review: ${esc(state.interpretations.at(-1).model)} · ${esc(state.interpretations.at(-1).provenance?.latencyMs || '?')} ms · ${esc(state.interpretations.at(-1).provenance?.usage?.total_tokens || '?')} tokens` : 'No Meta interpretation recorded for this job.'}</p></fieldset>` : ''}
      ${state.observations.length ? `<details><summary>Model findings and sources</summary>${state.observations.map(o=>`<article class="source"><p>${esc(o.claim)}${o.supersededBy?' (corrected)':''}</p><small>${esc(o.sourceIds.join(', '))} · ${esc(o.model)}</small></article>`).join('')}</details>` : ''}
      <details><summary>Unresolved work and sources</summary><p>Supported means evidence for a technician-reported claim, not independent verification or Operations acceptance.</p><ul>${Object.values(state.branches).map(b => `<li><strong>${esc(order.checks.find(c => c.id === b.id)?.label)}</strong>: ${esc(b.state)}${b.owner ? ` · ${esc(b.owner)}` : ''}<p>${esc(b.reason)}</p>${b.state === 'deferred' ? `<button data-reopen="${esc(b.id)}" type="button">Reopen</button>` : ''}</li>`).join('')}</ul></details>
      <p role="status">${esc(message)}</p></section>`;
    for (const box of root.querySelectorAll('[data-review-photo]')) box.onchange = () => { if(box.checked) selected.add(box.dataset.reviewPhoto); else selected.delete(box.dataset.reviewPhoto); };
    const metaButton = root.querySelector('#meta-review');
    if(metaButton) metaButton.onclick = () => {
      if (!root.querySelector('#synthetic-review').checked) { message = 'Confirm that this is synthetic demonstration data before sending it to Meta.'; draw(); return; }
      run(metaReview);
    };
    root.querySelector('#interview-answer').oninput = e => { draft = e.target.value; };
    root.querySelector('#correct-turn').onchange = e => { correction = e.target.value; };
    root.querySelector('#interview-form').onsubmit = e => {
      e.preventDefault();
      run(async () => {
        if (!draft.trim()) throw new Error('Add an answer first.');
        const prior = correction && state.sources[correction];
        await dispatch('turn.recorded', { id: newEventId(), text: draft.trim(),
          branchId: prior ? prior.branchId : state.activeQuestion?.branchId || null,
          supersedes: correction || null });
        draft = ''; correction = '';
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
