// Authoritative job projection. Model proposals never overwrite source records.
export const INTERPRETATION_VERSION = 'carryforward.interpretation.v1';
const states = new Set(['open', 'supported', 'contradicted', 'needs_verification', 'deferred']);
const fail = (message) => { throw new Error(message); };
const text = (value, max = 4000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const clone = (value) => structuredClone(value);

export function createInvestigation(order) {
  if (!text(order?.id, 200) || !Array.isArray(order.checks) || !order.checks.length) fail('Invalid assignment');
  const branches = {};
  for (const check of order.checks) {
    if (!text(check.id, 200) || Object.hasOwn(branches, check.id)) fail('Invalid or duplicate assignment check');
    Object.defineProperty(branches, check.id, { enumerable: true, configurable: true, writable: true, value: {
      id: check.id, question: check.question, state: 'open', owner: null,
      sourceIds: [], reason: 'No supporting observation yet.', epoch: 0,
    }});
  }
  return { jobId: order.id, seq: 0, inputRevision: 0, events: [], sources: {},
    observations: [], branches, questions: [], activeQuestion: null, followups: 0, interpretations: [], communicationStyle: 'direct', reviewRequired: false };
}

function requireSources(state, ids, {forExclusion=false}={}) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || new Set(ids).size !== ids.length) fail('Expected bounded source references');
  for (const id of ids) {
    if (!Object.hasOwn(state.sources, id) || state.sources[id].excluded || state.sources[id].supersededBy || (!forExclusion && state.sources[id].derivedFrom && state.sources[state.sources[id].derivedFrom]?.excluded)) fail('Unknown, excluded or wrong-job source');
  }
}

export function validateInterpretation(state, proposal) {
  if (!proposal || proposal.version !== INTERPRETATION_VERSION || proposal.jobId !== state.jobId) fail('Wrong interpretation version or job');
  if (!Number.isSafeInteger(proposal.baseRevision) || proposal.baseRevision !== state.inputRevision) fail('Stale interpretation');
  if (!text(proposal.model, 200)) fail('Model provenance required');
  if (!Array.isArray(proposal.observations) || proposal.observations.length > 20 || !Array.isArray(proposal.changes) || proposal.changes.length > 20) fail('Unbounded model output');
  if (JSON.stringify(proposal).length > 64000) fail('Interpretation exceeds size limit');
  const superseded = new Set();
  const observationIds = new Set(state.observations.map(o => o.id));
  for (const observation of proposal.observations) {
    if (!text(observation.id, 200) || observationIds.has(observation.id) || !text(observation.claim)) fail('Invalid or duplicate observation');
    observationIds.add(observation.id);
    requireSources(state, observation.sourceIds);
    if (observation.supersedes) {
      const prior = state.observations.find(o => o.id === observation.supersedes);
      if (!prior || prior.supersededBy || superseded.has(observation.supersedes)) fail('Invalid supersession');
      superseded.add(observation.supersedes);
    }
  }
  const changed = new Set();
  for (const change of proposal.changes) {
    if (!Object.hasOwn(state.branches, change.branchId) || changed.has(change.branchId) || !states.has(change.state) || !text(change.reason)) fail('Invalid branch change');
    changed.add(change.branchId);
    requireSources(state, change.sourceIds);
    const prior = state.branches[change.branchId];
    // Deferred work is a human decision; a model cannot silently resume it.
    if (prior.state === 'deferred' && change.state !== 'deferred') fail('Deferred branch requires explicit human reopening');
    if (change.owner !== undefined && change.owner !== null && !text(change.owner, 200)) fail('Invalid follow-up owner');
    if (prior.state !== change.state && ['supported', 'contradicted'].includes(prior.state)) {
      if (!change.sourceIds.some(id => !prior.sourceIds.includes(id))) fail('Reopening requires new material evidence');
    }
  }
  if(proposal.acknowledgement!==undefined&&(!text(proposal.acknowledgement,250)||/[?？]/.test(proposal.acknowledgement)))fail('Invalid conversational acknowledgement');
  const q = proposal.nextQuestion;
  if (q !== null && q !== undefined) {
    if (!Object.hasOwn(state.branches, q.branchId) || !text(q.text, 500)) fail('Invalid next question');
    if ((q.text.match(/[?？]/g) || []).length > 1) fail('Only one question may be offered at a time');
    const proposed = proposal.changes.find(c => c.branchId === q.branchId)?.state || state.branches[q.branchId].state;
    if (proposed === 'supported' || proposed === 'deferred') fail('Question targets closed or deferred work');
  }
  return clone(proposal);
}

export function reduceInvestigation(previous, event) {
  if (!event || !text(event.id, 200) || event.jobId !== previous.jobId || !Number.isSafeInteger(event.seq)) fail('Invalid event identity');
  const duplicate = previous.events.find(e => e.id === event.id);
  if (duplicate) {
    if (JSON.stringify(duplicate) !== JSON.stringify(event)) fail('Conflicting duplicate event');
    return previous;
  }
  if (event.seq !== previous.seq + 1 || previous.events.length >= 500) fail('Out-of-order event or session limit reached');
  const state = clone(previous);
  const p = event.payload;
  if (!p || typeof p !== 'object' || Array.isArray(p)) fail('Invalid event payload');
  if (event.type === 'source.added') {
    if (!text(p.id, 200) || Object.hasOwn(state.sources, p.id) || !['photo', 'audio', 'testimony', 'measurement'].includes(p.kind)) fail('Invalid source');
    if (['photo','audio'].includes(p.kind) && !/^[a-f0-9]{64}$/.test(p.sha256 || '')) fail('Photo hash required');
    if (!['photo','audio'].includes(p.kind) && !text(p.text)) fail('Source text required');
    if(p.derivedFrom){
      const parent=state.sources[p.derivedFrom];
      if(p.kind!=='photo'||!parent||parent.kind!=='photo'||parent.excluded||parent.derivedFrom||p.sourceSha256!==parent.sha256||p.derivation?.method!=='browser-review-copy.v1'||![p.derivation.width,p.derivation.height].every(n=>Number.isInteger(n)&&n>0&&n<=1600)||![0.85,0.7,0.55].includes(p.derivation.quality))fail('Invalid review-copy origin');
    }
    Object.defineProperty(state.sources, p.id, { enumerable: true, writable: true, configurable: true, value: { ...clone(p), jobId: state.jobId, excluded: false } });
    state.inputRevision++;
    state.reviewRequired = true;
  } else if (event.type === 'question.offered') {
    if (!Object.hasOwn(state.branches, p.branchId) || !text(p.text, 500)) fail('Invalid interview question');
    const branch = state.branches[p.branchId];
    if (state.activeQuestion || state.followups >= 3 || ['supported', 'deferred'].includes(branch.state)) fail('Question policy prevents another question');
    if (state.questions.some(q => q.branchId === p.branchId && q.epoch === branch.epoch)) fail('Equivalent question already asked');
    state.activeQuestion = { branchId: p.branchId, text: p.text, epoch: branch.epoch };
    state.questions.push(clone(state.activeQuestion));
    state.followups++;
  } else if (event.type === 'turn.recorded') {
    if (!text(p.id, 200) || Object.hasOwn(state.sources, p.id) || !text(p.text)) fail('Invalid interview answer');
    if (p.branchId && !Object.hasOwn(state.branches, p.branchId)) fail('Answer belongs to unknown branch');
    if (p.audioId && (!Object.hasOwn(state.sources,p.audioId) || state.sources[p.audioId].kind !== 'audio' || state.sources[p.audioId].excluded)) fail('Unknown or wrong-job voice source');
    if(p.transcription){
      const t=p.transcription,source=state.sources[p.audioId];
      const released=t.reviewed===false&&t.submission==='hold_release'&&t.rawText===p.text&&t.provenance?.model==='muse-voice-transcribe-1.0'&&t.provenance.complete===true&&/^[a-f0-9]{64}$/.test(t.provenance.inputSha256||'')&&t.provenance.inputSha256===source?.wavSha256;
      if(!p.audioId||typeof t.rawText!=='string'||t.rawText.length>4000||!(t.reviewed===true||released))fail('Transcript must be reviewed or explicitly submitted by hold release');
    }
    const correctionTarget=p.supersedes||p.amends;
    if(p.supersedes&&p.amends)fail('Choose full replacement or amendment, not both');
    if(correctionTarget&&(!Object.hasOwn(state.sources,correctionTarget)||state.sources[correctionTarget].kind!=='testimony'||state.sources[correctionTarget].excluded||state.sources[correctionTarget].supersededBy))fail('Invalid corrected answer');
    if(p.amends){
      const original=state.sources[p.amends];
      original.amendedBy=[...(original.amendedBy||[]),p.id];
      // A narrow correction does not retract unrelated facts in the same utterance.
      // The next validated interpretation replaces the affected observation only.
    }
    if (p.supersedes) {
      state.sources[p.supersedes].supersededBy = p.id;
      for (const branch of Object.values(state.branches)) {
        if (branch.sourceIds.includes(p.supersedes)) {
          if (branch.state !== 'deferred') branch.state = 'needs_verification';
          branch.reason = 'Technician corrected supporting testimony; review the replacement answer.';
          branch.epoch++;
        }
      }
    }
    Object.defineProperty(state.sources, p.id, { enumerable: true, writable: true, configurable: true, value: {
      id: p.id, jobId: state.jobId, kind: 'testimony', text: p.text, at: event.at || null,
      branchId: p.branchId || null, supersedes: p.supersedes || null, excluded: false,
      ...(p.amends?{amends:p.amends}:{}),
      ...(p.audioId ? {audioId:p.audioId,transcription:clone(p.transcription || null)} : {}),
    }});
    if (p.branchId) {
      const branch = state.branches[p.branchId];
      branch.sourceIds.push(p.id);
      if (branch.state !== 'deferred') branch.state = 'needs_verification';
      branch.reason = 'Technician answer recorded; interpretation and verification remain pending.';
      // An answer does not authorize repeating the same question automatically.
    }
    if (!p.supersedes || state.activeQuestion?.branchId === p.branchId) state.activeQuestion = null;
    state.inputRevision++;
    state.reviewRequired = true;
  } else if (event.type === 'source.excluded') {
    requireSources(state, [p.id], {forExclusion:true});
    state.sources[p.id].excluded = true;
    for (const b of Object.values(state.branches)) {
      if (b.sourceIds.some(id=>id===p.id||state.sources[id]?.derivedFrom===p.id)) {
        b.state = b.state === 'deferred' ? 'deferred' : 'needs_verification';
        b.reason = 'Supporting source excluded by technician.';
        b.epoch++;
      }
    }
    state.activeQuestion = null;
    state.inputRevision++;
    state.reviewRequired = true;
  } else if (event.type === 'source.restored') {
    if (!Object.hasOwn(state.sources, p.id) || !state.sources[p.id].excluded) fail('Source is not excluded');
    state.sources[p.id].excluded = false;
    state.inputRevision++;
    state.reviewRequired = true;
  } else if (event.type === 'branch.response') {
    const b = state.branches[p.branchId];
    if (!Object.hasOwn(state.branches, p.branchId) || !['cannot_verify', 'later', 'already_answered', 'reopen'].includes(p.action)) fail('Invalid branch response');
    if (!text(p.reason)) fail('Response reason required');
    if(p.sourceId!==undefined){
      const source=state.sources[p.sourceId];
      if(!source||source.kind!=='testimony'||source.excluded||source.supersededBy||!['cannot_verify','later'].includes(p.action)||!text(p.quote,1000)||!source.text.includes(p.quote))fail('Follow-up decision requires exact current testimony');
      if(!text(p.owner,200)||!p.quote.toLowerCase().includes(p.owner.toLowerCase()))fail('Follow-up owner must appear in the quoted instruction');
      const explicit=p.action==='later'?/\b(?:leave|defer|later|follow[ -]?up|assign|hand(?:off| over)?)\b/i.test(p.quote):/\b(?:cannot|can['’]t|unable to|could not|couldn['’]t)\b.*\b(?:verify|confirm|check|obtain|measure)\b/i.test(p.quote);
      if(!explicit)fail('Follow-up decision requires an explicit instruction or inability to verify');
    }

    if (p.action === 'already_answered') requireSources(state, p.sourceIds);
    b.state = p.action === 'reopen' ? 'open' : p.action === 'already_answered' ? 'needs_verification' : 'deferred';
    b.reason = p.reason;
    if (p.action === 'already_answered') b.sourceIds = [...p.sourceIds];
    if (p.owner !== undefined && p.owner !== null && !text(p.owner, 200)) fail('Invalid follow-up owner');
    b.owner = p.owner || b.owner;
    if (p.action === 'reopen') b.epoch++;
    state.activeQuestion = null;
    state.inputRevision++;
  } else if (event.type === 'branches.owner-assigned') {
    if (!text(p.owner, 200) || !Array.isArray(p.branchIds) || !p.branchIds.length || p.branchIds.length > 20 || new Set(p.branchIds).size !== p.branchIds.length) fail('Invalid follow-up assignment');
    for (const id of p.branchIds) {
      if (!Object.hasOwn(state.branches, id) || state.branches[id].state === 'supported') fail('Follow-up assignment requires unresolved work');
    }
    for (const id of p.branchIds) state.branches[id].owner = p.owner.trim();
    // Ownership is a human decision, not new evidence or permission to repeat a question.
    state.inputRevision++;
  } else if (event.type === 'preference.changed') {
    if (!['direct','conversational'].includes(p.communicationStyle)) fail('Invalid communication style');
    state.communicationStyle = p.communicationStyle;
    // Invalidate in-flight wording without reopening evidence or resetting question limits.
    state.inputRevision++;
  } else if (event.type === 'review.continue') {
    // Explicit technician choice starts another bounded pass.
    state.followups = 0;
    state.activeQuestion = null;
  } else if (event.type === 'interpretation.received') {
    const proposal = validateInterpretation(state, p);
    for (const o of proposal.observations) {
      if (o.supersedes) state.observations.find(prior => prior.id === o.supersedes).supersededBy = o.id;
      state.observations.push({ ...o, origin: 'model_interpretation', model: proposal.model, inputRevision: proposal.baseRevision });
    }
    for (const change of proposal.changes) {
      const b = state.branches[change.branchId];
      const newEvidence = change.sourceIds.some(id => !b.sourceIds.includes(id));
      Object.assign(b, { state: change.state, sourceIds: [...change.sourceIds], reason: change.reason, owner: change.owner ?? b.owner });
      if (newEvidence) b.epoch++;
    }
    if (state.activeQuestion && ['supported', 'deferred'].includes(state.branches[state.activeQuestion.branchId].state)) state.activeQuestion = null;
    const q = proposal.nextQuestion;
    if (q && state.activeQuestion?.branchId === q.branchId) {
      state.activeQuestion = { ...state.activeQuestion, text: q.text };
    }
    if (q && !state.activeQuestion && state.followups < 3) {
      const b = state.branches[q.branchId];
      // Wording changes cannot evade suppression: compare branch and evidence epoch.
      if (!state.questions.some(prior => prior.branchId === q.branchId && prior.epoch === b.epoch)) {
        state.activeQuestion = { ...q, epoch: b.epoch };
        state.questions.push(state.activeQuestion);
        state.followups++;
      }
    }
    state.reviewRequired = false;
    state.interpretations.push({ model: proposal.model, inputRevision: proposal.baseRevision, eventId: event.id, communicationStyle: state.communicationStyle || 'direct', acknowledgement:proposal.acknowledgement||null, provenance: proposal.provenance || null });
  } else fail('Unknown investigation event');
  state.seq = event.seq;
  state.events.push(clone(event));
  return state;
}

// Deterministic fallback, deliberately not presented as AI reasoning.
export function nextInterviewQuestion(state) {
  if (state.activeQuestion || state.followups >= 3) return null;
  const branch = Object.values(state.branches).find(b =>
    b.state === 'open' && !state.questions.some(q => q.branchId === b.id && q.epoch === b.epoch));
  return branch ? { branchId: branch.id, text: branch.question } : null;
}

export function interviewHandoff(state) {
  return {
    communicationStyle: state.communicationStyle || 'direct',
    version: 'carryforward.interview.v1', jobId: state.jobId, revision: state.seq, inputRevision: state.inputRevision,
    mode: state.interpretations.length
      ? 'Technician testimony with source-linked model interpretations; not independent verification'
      : 'Technician testimony with deterministic question selection; no model interpretation',
    turns: Object.values(state.sources).filter(s => s.kind === 'testimony'),
    photoSources: Object.values(state.sources).filter(s => s.kind === 'photo'),
    audioSources: Object.values(state.sources).filter(s => s.kind === 'audio'),
    branches: Object.values(state.branches),
    observations: state.observations,
    reviewRequired: !!state.reviewRequired,
    interpretations: state.interpretations,
  };
}
