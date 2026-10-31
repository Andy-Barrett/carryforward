/* A conversation surface over the existing job record. No provider or storage writes live here. */
const ACTIVITY = new Set(['ready', 'listening', 'reviewing', 'speaking']);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
};
const icon = name => {
  const paths = {
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    type: '<path d="M4 5h16M12 5v15m-4 0h8M4 9V5m16 4V5"/>',
    source: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    volume: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  const span = el('span', 'cf-icon');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.source}</svg>`;
  return span;
};
const button = (label, className, iconName) => {
  const node = el('button', className);
  node.type = 'button';
  if (iconName) node.append(icon(iconName));
  node.append(el('span', '', label));
  return node;
};
function safeUrl(value, {media = false} = {}) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, window.location.href);
    if (url.username || url.password) return null;
    if (url.protocol === 'blob:') return url.origin === window.location.origin ? url.href : null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // Media must be served locally or explicitly supplied as an already-created blob.
    // Opening a source link is a deliberate user action; embedding a remote source is not.
    if (media && url.origin !== window.location.origin) return null;
    return url.href;
  } catch { return null; }
}
function timeLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Date(value).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
}
function originForQuestion(state) {
  const q = state.activeQuestion;
  const event = [...(state.events || [])].reverse().find(e =>
    e.type === 'interpretation.received' && e.payload?.nextQuestion?.text === q?.text &&
    e.payload?.nextQuestion?.branchId === q?.branchId);
  return event ? `Model interpretation · ${event.payload.model}` : 'Saved job question';
}

/**
 * Optional media/voice adapters own permissions and all external work.
 * onCommand(text,{order,state,audio}) => false | {handled,response,origin,evidence}
 * onSaveAnswer(text,{branchId,supersedes,audio}) => Promise
 * Evidence: {id,kind,title,origin,url,imageUrl,excerpt,page,sourceUrl,sourceLabel,availability}
 * Returns cleanup(), with refresh, submit, setActivity, setResponse and showEvidence methods.
 */
export function mountCloud(root, {
  order, db, onNavigate, onSaveAnswer, onPhotoFiles, onRefresh, onGetState, onCommand,
  onTalk, onStopTalk, onStopSpeaking, onSpeak, onUpload, onDraftChange,
} = {}) {
  if (!root || !order?.id) throw new Error('A job and a mount point are required.');
  void db; // Persistence remains in the integration adapter.
  let alive = true, state = null, activity = 'ready', busy = false, refreshId = 0;
  let evidence = null, response = null, draft = '', pendingAudio = null, talkCleanup = null;
  let currentAction = 0, draftSave = Promise.resolve(), activeEvidenceDialog = null;
  const shell = el('section', 'cf-cloud');
  shell.dataset.activity = 'ready';
  shell.setAttribute('aria-label', 'CarryForward field conversation');
  const rail = el('header', 'cf-rail');
  const brand = el('div', 'cf-brand');
  brand.append(el('span', 'cf-brand-symbol', '↗'), el('span', '', 'CarryForward'));
  const jobIdentity = el('div', 'cf-job-identity');
  jobIdentity.append(el('span', 'cf-job-dot'), el('span', '', order.customer || 'Current visit'));
  const jobName = el('span', 'cf-job-id', order.id);
  jobIdentity.append(jobName);
  const actions = el('nav', 'cf-rail-actions');
  actions.setAttribute('aria-label', 'Current job');
  const jobButton = button('The job', 'cf-small-action');
  const sourcesButton = button('Sources', 'cf-small-action', 'source');
  const handoffButton = button('Handoff', 'cf-small-action cf-handoff', 'arrow');
  actions.append(jobButton, sourcesButton, handoffButton);
  rail.append(brand, jobIdentity, actions);
  const main = el('div', 'cf-stage');
  const presence = el('div', 'cf-presence');
  presence.setAttribute('aria-hidden', 'true');
  presence.append(el('span', 'cf-cloud-halo'), el('span', 'cf-cloud-body'), el('span', 'cf-cloud-gleam'));
  const cloudMark = el('span', 'cf-cloud-mark');
  cloudMark.append(el('i'), el('i'), el('i'));
  presence.append(cloudMark);
  const focus = el('div', 'cf-focus');
  const eyebrow = el('p', 'cf-eyebrow', 'HERE WITH THE JOB');
  const responseText = el('h1', 'cf-response', 'Let’s bring this visit forward.');
  const context = el('p', 'cf-context', 'Tell me what you found, what you did, and what still needs a hand.');
  const provenance = el('p', 'cf-provenance');
  const focalEvidence = el('div', 'cf-focal-evidence');
  const responseActions = el('div', 'cf-response-actions');
  const reviewButton = button('Review latest evidence', 'cf-text-action', 'refresh');
  const hearButton = button('Read aloud', 'cf-text-action', 'volume');
  hearButton.hidden = typeof onSpeak !== 'function';
  responseActions.append(reviewButton, hearButton);
  focus.append(eyebrow, responseText, context, provenance, focalEvidence, responseActions);
  main.append(presence, focus);
  const lower = el('div', 'cf-lower');
  const history = el('details', 'cf-history');
  const historySummary = el('summary', '', 'Conversation');
  const historyList = el('ol', 'cf-history-list');
  historyList.setAttribute('aria-label', 'Saved conversation');
  history.append(historySummary, historyList);
  const notice = el('p', 'cf-notice');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  const composer = el('form', 'cf-composer');
  composer.hidden = true;
  const composerLabel = el('label', 'cf-sr-only', 'Your message');
  const inputId = `cf-message-${Math.random().toString(36).slice(2)}`;
  composerLabel.htmlFor = inputId;
  const input = el('textarea', 'cf-message');
  input.id = inputId;
  input.placeholder = 'Tell me what happened, or ask for a job source…';
  input.rows = 2;
  input.maxLength = 4000;
  const composerFoot = el('div', 'cf-composer-foot');
  const composerHint = el('span', 'cf-composer-hint', 'Enter to send · Shift + Enter for a new line');
  const hideComposer = button('Close typing', 'cf-icon-button', 'close');
  hideComposer.setAttribute('aria-label', 'Close typing');
  const sendButton = button('Send', 'cf-send', 'arrow');
  sendButton.type = 'submit';
  composerFoot.append(composerHint, hideComposer, sendButton);
  composer.append(composerLabel, input, composerFoot);
  const dock = el('div', 'cf-dock');
  const addButton = button('Add evidence', 'cf-dock-side', 'plus');
  const talkButton = button(typeof onTalk === 'function' ? 'Talk to CarryForward' : 'Talk with text', 'cf-talk', 'mic');
  const typeButton = button('Type instead', 'cf-dock-side', 'type');
  typeButton.setAttribute('aria-expanded', 'false');
  typeButton.setAttribute('aria-controls', inputId);
  dock.append(addButton, talkButton, typeButton);
  const activityLabel = el('p', 'cf-activity', 'Ready when you are');
  const footer = el('p', 'cf-parked-note', 'Pause and park to inspect evidence or confirm the handoff.');
  const fileInput = el('input', 'cf-sr-only');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp';
  fileInput.multiple = true;
  fileInput.setAttribute('aria-label', 'Add job photos');
  lower.append(history, notice, composer, dock, activityLabel, footer, fileInput);
  shell.append(rail, main, lower);
  root.replaceChildren(shell);

  function valid() { return alive && shell.isConnected; }
  function say(text, error = false) {
    if (!valid()) return;
    notice.textContent = text || '';
    notice.classList.toggle('is-error', error);
  }
  function setActivity(next) {
    if (!valid() || !ACTIVITY.has(next)) return;
    activity = next;
    shell.dataset.activity = next;
    activityLabel.textContent = {ready: 'Ready when you are', listening: 'Microphone is listening', reviewing: 'Reviewing the job evidence', speaking: 'Reading the response aloud'}[next];
    talkButton.replaceChildren(icon(next === 'listening' || next === 'speaking' ? 'stop' : 'mic'), el('span', '', next === 'listening' ? 'Finish speaking' : next === 'speaking' ? 'Stop speaking' : typeof onTalk === 'function' ? 'Talk to CarryForward' : 'Talk with text'));
    talkButton.setAttribute('aria-pressed', String(next === 'listening'));
    syncControls();
  }
  function syncControls() {
    if (!valid()) return;
    const locked = busy || activity === 'reviewing';
    reviewButton.disabled = locked || typeof onRefresh !== 'function' || activity === 'listening';
    sendButton.disabled = locked || !input.value.trim() || activity === 'listening';
    addButton.disabled = locked || activity === 'listening' || (!onUpload && !onPhotoFiles);
    hearButton.disabled = locked || activity === 'listening';
    talkButton.disabled = locked;
    jobButton.disabled = locked || activity === 'listening';
    sourcesButton.disabled = !onNavigate || locked || activity === 'listening';
    for (const control of focalEvidence.querySelectorAll('button,a')) {
      if (control.tagName === 'BUTTON') control.disabled = locked || activity === 'listening';
      else { control.setAttribute('aria-disabled', String(locked || activity === 'listening')); control.tabIndex = locked || activity === 'listening' ? -1 : 0; }
    }
    handoffButton.disabled = !onNavigate || locked || activity === 'listening';
    input.readOnly = locked || activity === 'listening';
  }
  function openComposer({focusInput = true} = {}) {
    if (!valid()) return;
    composer.hidden = false;
    typeButton.setAttribute('aria-expanded', 'true');
    input.value = draft;
    syncControls();
    if (focusInput) input.focus();
  }
  function clearResponse() { response = null; }
  function renderResponse() {
    if (!valid()) return;
    const question = state?.activeQuestion;
    eyebrow.textContent = evidence ? 'IN VIEW' : question ? 'ONE USEFUL NEXT STEP' : 'HERE WITH THE JOB';
    responseText.textContent = response?.text || question?.text || 'Let’s bring this visit forward.';
    responseText.classList.toggle('cf-response-short', !!evidence);
    context.textContent = response ? (response.detail || '') : (question ? 'Answer in your own words. If you can’t verify it here, keep it open for the handoff.' : `You’re with ${order.customer || 'this job'}. Tell me what you found, what you did, and what still needs a hand.`);
    context.hidden = !context.textContent;
    provenance.replaceChildren();
    if (response?.origin) provenance.append(el('span', 'cf-origin-badge', response.origin));
    else if (question) provenance.append(el('span', 'cf-origin-badge', originForQuestion(state)));
    else provenance.append(el('span', 'cf-origin-badge', `Work order · ${order.id}`));
    if (response?.sourceIds?.length) provenance.append(el('span', 'cf-source-ids', response.sourceIds.join(' · ')));
    renderEvidence();
  }
  function setResponse(text, metadata = {}) {
    if (!valid()) return;
    response = {text: String(text || ''), origin: metadata.origin || 'Interface message', sourceIds: metadata.sourceIds || [], detail: metadata.detail};
    renderResponse();
  }
  function renderHistory() {
    if (!valid()) return;
    historyList.replaceChildren();
    const turns = Object.values(state?.sources || {}).filter(s => s.kind === 'testimony');
    historySummary.textContent = turns.length ? `Conversation · ${turns.length} saved ${turns.length === 1 ? 'answer' : 'answers'}` : 'Conversation & source trail';
    if (!turns.length) {
      historyList.append(el('li', 'cf-history-empty', 'Saved answers will appear here. A question about a source is kept separate from your field testimony.'));
      return;
    }
    for (const turn of turns) {
      const li = el('li', `cf-turn${turn.supersededBy ? ' is-superseded' : ''}`);
      const head = el('div', 'cf-turn-head');
      head.append(el('span', 'cf-origin-badge', turn.audioId ? 'Technician · reviewed voice transcript' : 'Technician · typed testimony'));
      if (timeLabel(turn.at)) head.append(el('time', '', timeLabel(turn.at)));
      li.append(head, el('p', '', turn.text), el('small', 'cf-turn-source', `${turn.id}${turn.supersedes ? ` · corrects ${turn.supersedes}` : ''}${turn.supersededBy ? ` · corrected by ${turn.supersededBy}` : ''}`));
      if (turn.audioId) li.append(el('small', 'cf-turn-source', `Audio source · ${turn.audioId}`));
      historyList.append(li);
    }
  }
  function renderStatus() {
    if (!valid()) return;
    const branches = Object.values(state?.branches || {});
    const openCount = branches.filter(b => b.state !== 'supported').length;
    handoffButton.replaceChildren(el('span', '', 'Handoff'), ...(openCount ? [el('span', 'cf-open-count', String(openCount))] : []), icon('arrow'));
    handoffButton.setAttribute('aria-label', `Review handoff${branches.length ? `, ${openCount} unresolved ${openCount === 1 ? 'item' : 'items'}` : ''}`);
    renderHistory();
    renderResponse();
    syncControls();
  }
  async function refresh({keepResponse = true} = {}) {
    const generation = ++refreshId;
    try {
      const next = typeof onGetState === 'function' ? await onGetState() : null;
      if (!valid() || generation !== refreshId) return;
      state = next?.state || next;
      if (!keepResponse) clearResponse();
      renderStatus();
    } catch (error) { if (valid() && generation === refreshId) say(error.message || 'The saved job could not be loaded.', true); }
  }
  async function run(action, {review = false} = {}) {
    if (!valid() || busy || activity === 'listening') return;
    const actionId = ++currentAction;
    busy = true;
    if (review) setActivity('reviewing');
    else syncControls();
    say('');
    try {
      const result = await action();
      if (!valid() || actionId !== currentAction) return;
      return result;
    } catch (error) {
      if (valid() && actionId === currentAction) say(error.message || 'That action did not finish. Your message is still here.', true);
    } finally {
      if (valid() && actionId === currentAction) { busy = false; if (review) setActivity('ready'); else syncControls(); }
    }
  }
  function notifyDraft() {
    if (typeof onDraftChange !== 'function') return Promise.resolve();
    const snapshot = {text: draft, audio: pendingAudio};
    draftSave = draftSave.catch(() => {}).then(() => onDraftChange(snapshot.text, {audio: snapshot.audio}));
    draftSave.catch(error => { if (valid() && draft === snapshot.text) say(`${error.message || 'Draft could not be saved.'} Keep this view open; your unsent text is retained here.`, true); });
    return draftSave;
  }
  function setDraft(text, {audio = null, focus = true} = {}) {
    if (!valid()) return;
    draft = String(text || ''); pendingAudio = audio;
    input.value = draft;
    openComposer({focusInput: focus});
    notifyDraft();
  }
  async function submit(text, metadata = {}) {
    if (!valid()) return;
    const message = String(text || '').trim();
    if (!message) return;
    if (message.length > 4000) { say('Keep this message under 4,000 characters. Your text is retained.', true); return; }
    draft = message;
    pendingAudio = metadata.audio || pendingAudio;
    input.value = draft;
    return run(async () => {
      await draftSave;
      if (!valid()) return;
      const result = await onCommand?.(message, {order, state, ...metadata});
      if (!valid()) return;
      if (result?.handled === true) {
        if (result.response || result.message) setResponse(result.response || result.message, {origin: result.origin || 'Job source lookup', sourceIds: result.sourceIds, detail: result.detail});
        if (Object.hasOwn(result, 'evidence')) showEvidence(result.evidence);
        if (result.activity && ACTIVITY.has(result.activity)) setActivity(result.activity);
      } else {
        if (typeof onSaveAnswer !== 'function') throw new Error('Saving answers is unavailable. Keep this message until the job is ready.');
        const saveResult = await onSaveAnswer(message, {branchId: state?.activeQuestion?.branchId || null, supersedes: null, ...metadata, ...(pendingAudio ? {audio: pendingAudio} : {})});
        if (!valid()) return;
        clearResponse();
        if (saveResult?.response) setResponse(saveResult.response, {origin: saveResult.origin || 'Saved job response', sourceIds: saveResult.sourceIds});
        say('Answer saved to this job.');
      }
      if (!valid()) return;
      draft = ''; pendingAudio = null; input.value = ''; composer.hidden = true;
      await notifyDraft();
      if (!valid()) return;
      typeButton.setAttribute('aria-expanded', 'false');
      await refresh();
    });
  }
  function sourceLink(item) {
    const href = safeUrl(item.sourceUrl || item.url);
    if (!href) return null;
    const link = el('a', 'cf-source-link', item.sourceLabel || 'Open source');
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.append(icon('arrow'));
    link.addEventListener('click', event => { if (busy || activity === 'listening' || activity === 'reviewing') event.preventDefault(); });
    return link;
  }
  function mediaFor(item, enlarged = false) {
    const kind = item.kind === 'photo' ? 'image' : item.kind === 'pdf' ? 'document' : item.kind;
    const holder = el('div', `cf-media cf-media-${kind || 'unknown'}${enlarged ? ' cf-media-enlarged' : ''}`);
    if (kind === 'image' || (kind === 'document' && item.imageUrl)) {
      const src = safeUrl(item.imageUrl || item.url, {media: true});
      if (src) {
        const image = el('img', 'cf-source-image');
        image.src = src; image.alt = item.alt || `${item.title || 'Job source'}${item.page ? `, page ${item.page}` : ''}`;
        image.decoding = 'async';
        image.addEventListener('error', () => { if (valid()) holder.replaceChildren(el('p', 'cf-media-unavailable', 'This source image could not be loaded. Open the source or choose another saved item.')); }, {once: true});
        holder.append(image);
      } else holder.append(el('p', 'cf-media-unavailable', 'No viewable local image was supplied for this source.'));
    } else if (kind === 'video') {
      const src = safeUrl(item.url, {media: true});
      if (src) {
        const video = el('video', 'cf-source-video');
        video.controls = true; video.preload = 'metadata'; video.playsInline = true; video.src = src;
        const poster = safeUrl(item.poster, {media: true});
        if (poster) video.poster = poster;
        video.append(el('p', '', 'Your browser cannot play this video. Open the source to inspect the file.'));
        if (item.captionsUrl && safeUrl(item.captionsUrl, {media: true})) {
          const track = el('track'); track.kind = 'captions'; track.src = safeUrl(item.captionsUrl, {media: true}); track.srclang = item.captionsLanguage || 'en'; track.label = item.captionsLabel || 'Captions'; video.append(track);
        }
        holder.append(video);
      } else holder.append(el('p', 'cf-media-unavailable', 'No playable local video was supplied for this source.'));
    } else if (kind === 'document') {
      const page = el('div', 'cf-document-page');
      page.append(el('span', 'cf-document-kicker', item.page ? `PAGE ${item.page}` : 'DOCUMENT EXCERPT'), el('h3', '', item.title || 'Job document'));
      if (item.excerpt) page.append(el('blockquote', '', item.excerpt));
      else page.append(el('p', '', 'A page preview has not been supplied. Open the source document to inspect it.'));
      holder.append(page);
    } else holder.append(el('p', 'cf-media-unavailable', item.excerpt || 'Choose a saved job source to inspect.'));
    return holder;
  }
  function renderEvidence() {
    if (!valid()) return;
    for (const video of focalEvidence.querySelectorAll('video')) video.pause();
    focalEvidence.replaceChildren();
    shell.classList.toggle('cf-has-evidence', !!evidence);
    if (!evidence) return;
    const item = evidence;
    const card = el('article', 'cf-evidence-card');
    const head = el('div', 'cf-evidence-head');
    const title = el('div');
    const badges = el('div', 'cf-evidence-badges');
    badges.append(el('span', 'cf-origin-badge', item.origin || 'Origin not supplied'));
    if (item.page) badges.append(el('span', 'cf-page-badge', `Page ${item.page}`));
    title.append(badges, el('h2', '', item.title || 'Job source'));
    const close = button('Close source', 'cf-icon-button', 'close');
    close.setAttribute('aria-label', 'Close source preview');
    close.onclick = () => { clearResponse(); showEvidence(null); };
    head.append(title, close);
    card.append(head, mediaFor(item));
    if (item.excerpt && item.imageUrl) card.append(el('blockquote', 'cf-evidence-excerpt', item.excerpt));
    const foot = el('div', 'cf-evidence-foot');
    const meta = el('div', 'cf-evidence-meta');
    if (item.id) meta.append(el('span', 'cf-evidence-id', item.id));
    meta.append(el('span', '', item.availability || 'Supplied job source'));
    const controls = el('div', 'cf-evidence-controls');
    const zoom = button('Inspect', 'cf-text-action', 'expand');
    zoom.onclick = () => openEvidenceDialog(item);
    controls.append(zoom);
    const link = sourceLink(item); if (link) controls.append(link);
    foot.append(meta, controls); card.append(foot); focalEvidence.append(card);
  }
  function showEvidence(item) {
    if (!valid()) return;
    if (item?.jobId && item.jobId !== order.id) { say('That source belongs to another job and cannot be shown here.', true); return; }
    evidence = item ? {...item, excerpt: item.excerpt || item.text || '', sourceUrl: item.sourceUrl || item.sourceURL || ''} : null;
    renderResponse();
    syncControls();
  }
  const dialogs = new Set();
  function makeDialog(title) {
    const dialog = el('dialog', 'cf-dialog');
    const top = el('div', 'cf-dialog-head');
    top.append(el('h2', '', title));
    const close = button('Close', 'cf-icon-button', 'close');
    close.setAttribute('aria-label', 'Close dialog');
    top.append(close); dialog.append(top);
    close.onclick = () => dialog.close();
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { for (const video of dialog.querySelectorAll('video')) video.pause(); dialogs.delete(dialog); dialog.remove(); });
    shell.append(dialog); dialogs.add(dialog);
    return dialog;
  }
  function openEvidenceDialog(item, allowBusy = false) {
    if (!valid() || (!allowBusy && busy) || activity === 'listening' || activity === 'reviewing') return;
    const dialog = makeDialog(item.title || 'Inspect source');
    activeEvidenceDialog = dialog;
    dialog.addEventListener('close', () => { if (activeEvidenceDialog === dialog) activeEvidenceDialog = null; });
    dialog.classList.add('cf-source-dialog');
    dialog.append(el('p', 'cf-dialog-provenance', `${item.origin || 'Origin not supplied'}${item.page ? ` · Page ${item.page}` : ''}${item.id ? ` · ${item.id}` : ''}`));
    const viewport = mediaFor(item, true);
    dialog.append(viewport);
    if (item.kind !== 'video') {
      const zoom = button('Zoom in', 'cf-text-action', 'expand');
      zoom.setAttribute('aria-pressed', 'false');
      zoom.onclick = () => { const expanded = viewport.classList.toggle('is-zoomed'); zoom.setAttribute('aria-pressed', String(expanded)); zoom.replaceChildren(icon('expand'), el('span', '', expanded ? 'Fit to view' : 'Zoom in')); };
      dialog.append(zoom);
    }
    if (item.excerpt && item.imageUrl) dialog.append(el('blockquote', 'cf-evidence-excerpt', item.excerpt));
    const link = sourceLink(item); if (link) dialog.append(link);
    dialog.showModal();
  }
  function zoomEvidence(direction = 'in') {
    if (!valid() || !evidence) { say('Choose a job source before zooming.'); return false; }
    if (!activeEvidenceDialog?.isConnected && direction !== 'out') openEvidenceDialog(evidence, true);
    const viewport = activeEvidenceDialog?.querySelector('.cf-media');
    if (!viewport) return false;
    const expanded = direction !== 'out';
    viewport.classList.toggle('is-zoomed', expanded);
    const control = activeEvidenceDialog.querySelector('.cf-text-action');
    if (control) { control.setAttribute('aria-pressed', String(expanded)); control.replaceChildren(icon('expand'), el('span', '', expanded ? 'Fit to view' : 'Zoom in')); }
    return true;
  }
  function openJob() {
    if (!valid() || busy || activity === 'listening' || activity === 'reviewing') return;
    const dialog = makeDialog('The job, in view.');
    dialog.classList.add('cf-job-dialog');
    dialog.append(el('p', 'cf-eyebrow', `${order.id} · ${order.systemId || 'System not supplied'}`), el('h3', 'cf-job-customer', order.customer), el('p', 'cf-job-property', order.property), el('h4', '', 'The reported problem'), el('p', '', order.reportedIssue));
    const scope = el('ul', 'cf-job-scope');
    for (const text of order.requestedWork || []) scope.append(el('li', '', text));
    dialog.append(el('h4', '', 'What we came to do'), scope);
    if (order.history?.length) {
      dialog.append(el('h4', '', 'What came before'));
      for (const record of order.history) {
        const entry = el('article', 'cf-job-history');
        entry.append(el('span', 'cf-origin-badge', `Work-order history · ${record.id}`), el('p', 'cf-history-date', record.date), el('p', '', record.text));
        dialog.append(entry);
      }
    }
    const workspace = button('Work order and job selection', 'cf-text-action', 'arrow');
    workspace.onclick = () => { dialog.close(); navigate('briefing'); }; dialog.append(workspace);
    dialog.append(el('p', 'cf-dialog-note', 'Source history and technician testimony remain separate. A reported repair does not establish production, monitoring, or completion of paperwork.'));
    dialog.showModal();
  }
  jobButton.onclick = openJob;
  function navigate(destination) {
    if (!valid() || busy || activity === 'listening' || activity === 'reviewing') return;
    try { Promise.resolve(onNavigate?.(destination)).catch(error => say(error.message || 'That view could not be opened.', true)); }
    catch (error) { say(error.message || 'That view could not be opened.', true); }
  }
  sourcesButton.onclick = () => navigate('sources');
  handoffButton.onclick = () => navigate('review');
  typeButton.onclick = () => { if (composer.hidden) openComposer(); else { composer.hidden = true; typeButton.setAttribute('aria-expanded', 'false'); } };
  hideComposer.onclick = () => { composer.hidden = true; typeButton.setAttribute('aria-expanded', 'false'); typeButton.focus(); };
  input.addEventListener('input', () => { draft = input.value; notifyDraft(); syncControls(); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && window.matchMedia('(min-width: 700px)').matches) { event.preventDefault(); if (!sendButton.disabled) composer.requestSubmit(); } });
  composer.onsubmit = event => { event.preventDefault(); submit(input.value, pendingAudio ? {audio: pendingAudio} : {}); };
  reviewButton.onclick = () => run(async () => {
    const result = await onRefresh?.();
    if (!valid()) return;
    if (result?.response) setResponse(result.response, {origin: result.origin, sourceIds: result.sourceIds});
    else clearResponse();
    await refresh();
  }, {review: true});
  addButton.onclick = () => { if (onUpload) run(() => onUpload()); else fileInput.click(); };
  fileInput.onchange = () => { const files = Array.from(fileInput.files || []); if (files.length) run(async () => { const result = await onPhotoFiles?.(files); if (!valid()) return; fileInput.value = ''; say(result?.message || 'Evidence saved to this job.', !!result?.failed && !result.saved); await refresh(); }); };
  talkButton.onclick = async () => {
    if (!valid() || busy) return;
    if (activity === 'speaking') { await onStopSpeaking?.(); if (valid()) setActivity('ready'); return; }
    if (activity === 'listening') {
      try { await onStopTalk?.(); if (typeof talkCleanup === 'function') await talkCleanup(); talkCleanup = null; if (valid()) setActivity('ready'); }
      catch (error) { say(error.message || 'Recording could not be stopped.', true); }
      return;
    }
    if (typeof onTalk !== 'function') { openComposer(); say('Use text for this conversation. Voice capture has not been connected here.'); return; }
    say('Opening the microphone…');
    try {
      const result = await onTalk({
        onState: next => { if (valid()) { setActivity(next); if (next === 'listening') say(''); } },
        onTranscript: value => { if (!valid()) return; setActivity('ready'); setDraft(typeof value === 'string' ? value : value?.text || '', {audio: value?.audio || null}); say('Review these words, then send them to the job.'); },
        onError: error => { if (!valid()) return; setActivity('ready'); say(error?.message || String(error), true); },
      });
      if (!valid()) { if (typeof result === 'function') result(); return; }
      if (typeof result === 'function') talkCleanup = result;
      if (result?.activity && ACTIVITY.has(result.activity)) setActivity(result.activity);
    } catch (error) { if (valid()) { setActivity('ready'); say(error.message || 'Microphone unavailable. You can type instead.', true); } }
  };
  hearButton.onclick = async () => {
    if (activity === 'speaking') { await onStopSpeaking?.(); if (valid()) setActivity('ready'); return; }
    try { await onSpeak?.(responseText.textContent, {onState: next => { if (valid()) setActivity(next); }, onError: error => { if (valid()) { setActivity('ready'); say(error?.message || String(error), true); } }}); }
    catch (error) { if (valid()) { setActivity('ready'); say(error.message || 'Spoken output unavailable.', true); } }
  };
  syncControls();
  refresh();
  const cleanup = () => {
    if (!alive) return;
    alive = false; refreshId++; currentAction++;
    if (typeof talkCleanup === 'function') { try { talkCleanup(); } catch { /* adapter owns capture recovery */ } }
    for (const dialog of dialogs) { for (const video of dialog.querySelectorAll('video')) video.pause(); dialog.remove(); }
    dialogs.clear();
    for (const video of shell.querySelectorAll('video')) video.pause();
    shell.remove();
  };
  Object.assign(cleanup, {refresh, submit, setActivity, setResponse, showEvidence, setDraft, zoomEvidence});
  return cleanup;
}
