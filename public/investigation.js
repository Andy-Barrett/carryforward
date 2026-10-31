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
    observations: [], branches, questions: [], activeQuestion: null, followups: 0, interpretations: [], reviewRequired: false };
}

function requireSources(state, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || new Set(ids).size !== ids.length) fail('Expected bounded source references');
  for (const id of ids) {
    if (!Object.hasOwn(state.sources, id) || state.sources[id].excluded || state.sources[id].supersededBy) fail('Unknown, excluded or wrong-job source');
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
    if (p.transcription && (!p.audioId || typeof p.transcription.rawText !== 'string' || p.transcription.rawText.length > 4000 || p.transcription.reviewed !== true)) fail('Transcript must be reviewed before use');
    if (p.supersedes && (!Object.hasOwn(state.sources, p.supersedes) || state.sources[p.supersedes].kind !== 'testimony' || state.sources[p.supersedes].supersededBy)) fail('Invalid corrected answer');
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
    requireSources(state, [p.id]);
    state.sources[p.id].excluded = true;
    for (const b of Object.values(state.branches)) {
      if (b.sourceIds.includes(p.id)) {
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
    if (p.action === 'already_answered') requireSources(state, p.sourceIds);
    b.state = p.action === 'reopen' ? 'open' : p.action === 'already_answered' ? 'needs_verification' : 'deferred';
    b.reason = p.reason;
    if (p.action === 'already_answered') b.sourceIds = [...p.sourceIds];
    if (p.owner !== undefined && p.owner !== null && !text(p.owner, 200)) fail('Invalid follow-up owner');
    b.owner = p.owner || b.owner;
    if (p.action === 'reopen') b.epoch++;
    state.activeQuestion = null;
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
    state.interpretations.push({ model: proposal.model, inputRevision: proposal.baseRevision, eventId: event.id, provenance: proposal.provenance || null });
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
    version: 'carryforward.interview.v1', jobId: state.jobId, revision: state.seq, inputRevision: state.inputRevision,
    mode: state.interpretations.length
      ? 'Technician testimony with source-linked model interpretations; not independent verification'
      : 'Technician testimony with deterministic question selection; no model interpretation',
    turns: Object.values(state.sources).filter(s => s.kind === 'testimony'),
    audioSources: Object.values(state.sources).filter(s => s.kind === 'audio'),
    branches: Object.values(state.branches),
    observations: state.observations,
    reviewRequired: !!state.reviewRequired,
    interpretations: state.interpretations,
  };
}
