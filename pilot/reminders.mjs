import { createHash } from 'node:crypto';

// A deterministic reducer, not an authorization layer. The caller must derive
// this snapshot from its authenticated membership + assigned job on every sync.
export const REPORT_STATES = Object.freeze(['no_report', 'draft', 'unconfirmed', 'confirmed_unsent', 'sent', 'received', 'accepted', 'accepted_with_followups']);
const TYPES = ['shop', 'site'];
const MAX_LEASE = 4 * 60 * 60 * 1000;
const DWELL = 30_000;
const EXIT_GRACE = 15_000;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
const clone = value => structuredClone(value);
const text = (value, max = 200) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const time = value => { const n = typeof value === 'number' ? value : Date.parse(value); return Number.isFinite(n) ? n : NaN; };
export function validRegion(value) {
  if (!value || !finite(value.latitude) || !finite(value.longitude) || Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180 || !finite(value.radius) || value.radius < 100 || value.radius > 1000 || value.ambiguous === true) return null;
  return { latitude: value.latitude, longitude: value.longitude, radius: value.radius };
}
function meters(a, b) {
  const r = Math.PI / 180, lat = (b.latitude - a.latitude) * r, lon = (b.longitude - a.longitude) * r;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(lon / 2) ** 2));
}
function scope(snapshot) {
  const names = ['companyId', 'userId', 'jobId', 'visitId', 'assignmentRevision'];
  const result = Object.fromEntries(names.map(name => [name, text(snapshot[name])]));
  if (Object.values(result).some(value => !value)) throw new TypeError('A complete authenticated assignment scope is required');
  return result;
}
function cleanItems(items) {
  if (!Array.isArray(items) || items.length > 60) throw new TypeError('Checklist must contain at most 60 items');
  const ids = new Set();
  return items.map(item => {
    if (!text(item.id, 100) || ids.has(item.id) || !text(item.label, 160) || !['required', 'suggested', 'unknown'].includes(item.requirement) || !text(item.source, 500)) throw new TypeError('Each checklist item needs a unique ID, explicit requirement and source');
    ids.add(item.id); return { id: item.id, label: item.label, requirement: item.requirement, source: item.source };
  });
}
function initialFence() { return { position: 'unknown', insideAt: null, exitAt: null, lastAt: 0 }; }
function fingerprint(state, kind) {
  return digest([state.scope, kind, kind === 'shop' ? [state.briefRevision, state.checklist] : [state.reportRevision, state.reportStatus,
    state.nextStopItemIds?.length || state.preparationWarning ? [state.briefRevision,state.nextStopItemIds,state.acknowledged] : null]]);
}
function need(state, kind) {
  if (state.preparationWarning) return { reason:'day_review_required', items:[], message:'Your day plan needs review. Stop safely before opening CarryForward.' };
  if (kind === 'shop') {
    const missing = state.checklist.filter(item => item.requirement === 'required' && !state.acknowledged.includes(item.id));
    return !state.briefReviewed || missing.length ? { reason: !state.briefReviewed ? 'brief_unreviewed' : 'packing_incomplete', items: missing.map(item => item.label), message: `${!state.briefReviewed ? 'Review the departure brief' : 'Check required equipment'}${missing.length ? `: ${missing.map(item => item.label).join(', ')}` : ''}. Stop safely before opening CarryForward.` } : null;
  }
  const messages = {
    no_report: ['no_report', 'Your visit report has not been started.'],
    draft: ['draft', 'Your visit report is still a draft.'],
    unconfirmed: ['unconfirmed', 'Your visit report needs your confirmation.'],
    confirmed_unsent: ['confirmed_unsent', 'Your confirmed report is waiting to send.'],
  };
  const found = messages[state.reportStatus];
  if (found) return { reason: found[0], items: state.onsiteOnly, message: `${found[1]} Stop safely before opening CarryForward.` };
  const missing = state.checklist.filter(item => state.nextStopItemIds?.includes(item.id) && item.requirement === 'required' && !state.acknowledged.includes(item.id));
  return missing.length ? { reason:'next_stop_preparation', items:missing.map(item=>item.label), message:'Check required equipment for your next stop. Stop safely before opening CarryForward.' } : null;
}
function reconcile(state, now) {
  if (!state.access || now >= state.expiresAt) { state.pending = {}; state.fences = { shop: initialFence(), site: initialFence() }; return state; }
  for (const kind of TYPES) {
    const current = state.pending[kind];
    if (!need(state, kind) || current?.fingerprint !== fingerprint(state, kind) || state.muted[kind]) delete state.pending[kind];
  }
  return state;
}
export function createReminderState(snapshot, prior = null, now = Date.now()) {
  const normalizedScope = scope(snapshot), scopeKey = digest(normalizedScope);
  if (!text(snapshot.briefRevision) || !REPORT_STATES.includes(snapshot.reportStatus)) throw new TypeError('Current brief revision and report status are required');
  const checklist = cleanItems(snapshot.checklist ?? []);
  const nextStopItemIds = snapshot.nextStopItemIds ?? [];
  if (!Array.isArray(nextStopItemIds) || nextStopItemIds.length > 60 || nextStopItemIds.some(id=>!checklist.some(item=>item.id===id))) throw new TypeError('Next-stop packing must refer to the current checklist');
  const expires = time(snapshot.expiresAt);
  if (!Number.isFinite(expires) || expires <= now) throw new TypeError('A future authenticated access lease is required');
  const same = prior?.scopeKey === scopeKey;
  const sameBrief = same && prior.briefRevision === snapshot.briefRevision && digest(prior.checklist) === digest(checklist);
  const regions = { shop: validRegion(snapshot.shop), site: validRegion(snapshot.site) };
  const overlap = regions.shop && regions.site && meters(regions.shop, regions.site) <= regions.shop.radius + regions.site.radius;
  const regionKey = digest(regions);
  const state = {
    version: 1, scope: normalizedScope, scopeKey, access: true, expiresAt: Math.min(expires, now + MAX_LEASE),
    briefRevision: snapshot.briefRevision, reportRevision: text(snapshot.reportRevision) ?? 'none', reportStatus: snapshot.reportStatus,
    checklist, nextStopItemIds:[...new Set(nextStopItemIds)], preparationWarning:text(snapshot.preparationWarning,500), onsiteOnly: (snapshot.onsiteOnly ?? []).filter(value => text(value, 160)).slice(0, 20), regions, regionKey, overlap: !!overlap,
    briefReviewed: sameBrief && prior.briefReviewed === true, acknowledged: sameBrief ? prior.acknowledged.filter(id => checklist.some(item => item.id === id)) : [],
    optedIn: same && prior.optedIn === true, permissions: same ? clone(prior.permissions) : { location: 'unknown', notifications: 'unknown', precise: false },
    fences: same && prior.regionKey === regionKey ? clone(prior.fences) : { shop: initialFence(), site: initialFence() },
    pending: same ? clone(prior.pending) : {}, reminded: same ? clone(prior.reminded) : {}, snoozedUntil: same ? clone(prior.snoozedUntil) : {},
    muted: same ? clone(prior.muted) : {}, eventIds: same ? prior.eventIds.slice(-100) : [], finishCheckedAt: same ? prior.finishCheckedAt : null,
  };
  return reconcile(state, now);
}
export function applyReminderEvent(previous, event, now = Date.now()) {
  const state = clone(previous);
  if (!event || typeof event.type !== 'string') throw new TypeError('An explicit reminder action is required');
  if (event.scopeKey && event.scopeKey !== state.scopeKey) return state;
  if (event.id && state.eventIds.includes(event.id)) return state;
  if (event.id) state.eventIds = [...state.eventIds.slice(-99), event.id];
  if (['logout', 'revoked', 'reassigned', 'destination_changed'].includes(event.type)) {
    state.access = false; state.optedIn = false; state.pending = {}; state.fences = { shop: initialFence(), site: initialFence() }; return state;
  }
  reconcile(state, now);
  if (!state.access || now >= state.expiresAt) return state;
  if (event.type === 'opt_in') { state.optedIn = event.enabled === true; if (!state.optedIn) state.fences = { shop: initialFence(), site: initialFence() }; }
  else if (event.type === 'permissions') {
    state.permissions = { location: ['when_in_use', 'always'].includes(event.location) ? event.location : 'denied', notifications: event.notifications === 'granted' ? 'granted' : 'denied', precise: event.precise === true };
    if (state.permissions.location === 'denied' || state.permissions.notifications !== 'granted' || !state.permissions.precise) state.fences = { shop: initialFence(), site: initialFence() };
  } else if (event.type === 'review_brief' && event.briefRevision === state.briefRevision) state.briefReviewed = true;
  else if (event.type === 'ack_item' && event.briefRevision === state.briefRevision && state.checklist.some(item => item.id === event.itemId)) {
    state.acknowledged = event.acknowledged === false ? state.acknowledged.filter(id => id !== event.itemId) : [...new Set([...state.acknowledged, event.itemId])];
  } else if (event.type === 'finish_visit') state.finishCheckedAt = now;
  else if (TYPES.includes(event.kind)) {
    const kind = event.kind;
    if (event.type === 'mute') { state.muted[kind] = event.enabled !== false; delete state.pending[kind]; }
    if (event.type === 'dismiss') { state.reminded[kind] = fingerprint(state, kind); delete state.pending[kind]; }
    if (event.type === 'snooze') { state.snoozedUntil[kind] = now + Math.min(60, Math.max(5, event.minutes ?? 15)) * 60_000; delete state.pending[kind]; }
    if (event.type === 'position') {
      const fence = state.fences[kind], at = time(event.at ?? now);
      if (!Number.isFinite(at) || at < fence.lastAt || Math.abs(at - now) > 60_000 || !['inside', 'outside', 'unknown'].includes(event.position)) return state;
      if (event.fresh !== true || event.accurate !== true) { fence.position = 'unknown'; fence.insideAt = null; fence.exitAt = null; delete state.pending[kind]; return state; }
      fence.lastAt = at;
      if (event.position === 'inside') {
        if (fence.position !== 'inside') fence.insideAt = at;
        fence.position = 'inside'; fence.exitAt = null; delete state.pending[kind];
      } else if (event.position === 'outside') {
        if (fence.position === 'inside' && at - fence.insideAt >= DWELL) fence.exitAt = at;
        fence.position = 'outside';
      } else { fence.position = 'unknown'; fence.insideAt = null; fence.exitAt = null; }
    }
  }
  reconcile(state, now);
  const enabled = state.optedIn && ['when_in_use', 'always'].includes(state.permissions.location) && state.permissions.notifications === 'granted' && state.permissions.precise && !state.overlap;
  if (!enabled) { state.pending = {}; return state; }
  for (const kind of TYPES) {
    const fence = state.fences[kind], key = fingerprint(state, kind), required = need(state, kind);
    if (!required || !state.regions[kind] || state.muted[kind] || state.reminded[kind] === key || now < (state.snoozedUntil[kind] ?? 0) || fence.position !== 'outside' || !fence.exitAt || now - fence.exitAt < EXIT_GRACE) continue;
    state.pending[kind] ??= { id: `cf-reminder-${key}`, fingerprint: key, kind, scopeKey: state.scopeKey, briefRevision: state.briefRevision, reportRevision: state.reportRevision, reason: required.reason, message: required.message, createdAt: now };
  }
  return state;
}
export function reminderView(state, now = Date.now()) {
  const valid = state.access && now < state.expiresAt;
  return { scopeKey: state.scopeKey, available: valid, manualAvailable: valid, briefReviewed: state.briefReviewed, checklist: state.checklist.map(item => ({ ...item, acknowledged: state.acknowledged.includes(item.id) })), readyToLeave: need(state, 'shop'), finishVisit: { reportStatus: state.reportStatus, reminder: need(state, 'site'), onsiteOnly: state.onsiteOnly, checkedAt: state.finishCheckedAt }, automatic: valid && state.optedIn && state.permissions.precise && !state.overlap && ['when_in_use', 'always'].includes(state.permissions.location) && state.permissions.notifications === 'granted', fallbackReason: !valid ? 'access_expired' : state.overlap ? 'overlapping_regions' : !state.regions.shop && !state.regions.site ? 'missing_location' : !state.optedIn ? 'not_enabled' : !['when_in_use', 'always'].includes(state.permissions.location) ? 'location_unavailable' : !state.permissions.precise ? 'precise_location_unavailable' : state.permissions.notifications !== 'granted' ? 'notifications_unavailable' : null, pending: valid ? Object.values(state.pending) : [] };
}
export function nativeReminderSnapshot(state, now = Date.now()) {
  if (!state.access || now >= state.expiresAt) return null;
  return { version: 1, scope: state.scope, scopeKey: state.scopeKey, expiresAt: state.expiresAt, briefRevision: state.briefRevision, reportRevision: state.reportRevision, regionKey: state.regionKey, overlap: state.overlap, reminders: TYPES.map(kind => {
    const needed = need(state, kind);
    return { kind, id: `cf-reminder-${fingerprint(state, kind)}`, region: state.regions[kind], needed: !!needed, muted: !!state.muted[kind], dismissed: state.reminded[kind] === fingerprint(state, kind), snoozedUntil: state.snoozedUntil[kind] ?? 0, reason: needed?.reason ?? null, items: needed?.items ?? [], message: needed?.message ?? null };
  }) };
}
