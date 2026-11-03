import {bindJobCamera} from './job-camera.js';
import {bindHoldToSpeak} from './held-voice.js';
/* A conversation surface over the existing job record. No provider or storage writes live here. */
import {buildVisitBrief,BRIEF_KIND_LABELS} from './visit-brief.js';
import {VISIT_STAGES,visitStage,finalVisitUpdate} from './visit-flow.js';
const ACTIVITY = new Set(['ready', 'connecting', 'listening', 'reviewing', 'speaking']);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
};
const icon = name => {
  const paths = {
    camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3z"/><circle cx="12" cy="13" r="4"/>',
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
  startWithBrief = true, onBriefViewed, onQuestionResponse, startPhase, onPhaseChanged, onReconnect, voiceOnly=false, onHold,
} = {}) {
  if (!root || !order?.id) throw new Error('A job and a mount point are required.');
  void db; // Persistence remains in the integration adapter.
  let alive = true, state = null, activity = 'ready', busy = false, refreshId = 0;
  let evidence = null, response = null, draft = '', pendingAudio = null, talkCleanup = null;
  let cameraBusy = false;
  let currentAction = 0, draftSave = Promise.resolve(), activeEvidenceDialog = null;
  const visitBrief = buildVisitBrief(order);
  let phase = visitStage(startPhase,startWithBrief ? 'brief' : 'onsite');
  let briefOpen = phase.id === 'brief', liveAvailable = false, clipCount = 0, readingBrief = false;
  const shell = el('section', 'cf-cloud');
  shell.dataset.activity = 'ready'; shell.classList.toggle('cf-voice-first',voiceOnly);document.body.classList.toggle('voice-first',voiceOnly);
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
  const jobButton = button('Briefing', 'cf-small-action cf-briefing-action', 'volume');
  const ordersButton = button('Work orders', 'cf-small-action', 'arrow');
  const sourcesButton = button('Sources', 'cf-small-action', 'source');
  const handoffButton = button('Handoff', 'cf-small-action cf-handoff', 'arrow'); handoffButton.hidden=true;
  actions.append(jobButton, sourcesButton, handoffButton);
  rail.append(brand, jobIdentity, actions);
  const tools=el('details','cf-tools');tools.append(el('summary','','Details'));
  const toolsContent=el('div','cf-tools-content');tools.append(toolsContent);
  const heard=el('p','cf-heard');heard.hidden=true;
  const journey = el('div','cf-journey');
  const phaseLabel = el('p','cf-phase-label');
  const connection = el('div','cf-service'); connection.setAttribute('role','status');
  const connectionText = el('span','','Checking the interview connection…');
  const retry = button('Reconnect','cf-text-action'); retry.onclick=()=>run(async()=>{await onReconnect?.();});
  connection.append(connectionText,retry); journey.append(phaseLabel,connection);
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
  const briefPane = el('section','cf-visit-brief');
  briefPane.setAttribute('aria-label','Pre-visit briefing');
  const finalPane = el('section','cf-final-update'); finalPane.hidden=true;
  const responseActions = el('div', 'cf-response-actions');
  const reviewButton = button('Review latest evidence', 'cf-text-action', 'refresh');
  const hearButton = button('Read aloud', 'cf-text-action', 'volume');
  hearButton.hidden = typeof onSpeak !== 'function';
  responseActions.append(reviewButton, hearButton);
  const questionActions=el('div','cf-question-actions');
  focus.append(eyebrow, responseText, context, provenance, briefPane, finalPane, focalEvidence, questionActions, responseActions);
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
  composer.hidden = false;
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
  hideComposer.hidden=true; composerHint.textContent='Review your words, then send.';
  composerFoot.append(composerHint, sendButton);
  composer.append(composerLabel, input, composerFoot);
  const photos = el('section','cf-photo-strip');photos.hidden=true;photos.setAttribute('aria-label','Saved job photos');
  const cameraButton = button('Photo','cf-camera-action','camera');cameraButton.setAttribute('aria-label','Take a job photo');cameraButton.title='Swipe right to open the camera';
  const dock = el('div', 'cf-dock');
  const addButton = button('Add evidence', 'cf-dock-side', 'plus');
  const talkButton = button(typeof onTalk === 'function' ? 'Talk to CarryForward' : 'Talk with text', 'cf-talk', 'mic');
  const typeButton = button('Type instead', 'cf-dock-side', 'type');
  typeButton.setAttribute('aria-expanded', 'false');
  typeButton.setAttribute('aria-controls', inputId);
  typeButton.hidden=true; dock.append(talkButton,addButton);
  const savedState = el('p','cf-saved-state'); savedState.setAttribute('role','status');
  const activityLabel = el('p', 'cf-activity', 'Ready when you are');
  const inputMeter = el('meter', 'cf-input-meter');
  inputMeter.min=0;inputMeter.max=1;inputMeter.value=0;inputMeter.hidden=true;inputMeter.setAttribute('aria-label','Microphone input level');
  const footer = el('p', 'cf-parked-note', 'Pause and park to inspect evidence or confirm the handoff.');
  const fileInput = el('input', 'cf-sr-only');
  fileInput.type = 'file'; fileInput.hidden = true;
  fileInput.accept = 'image/jpeg,image/png,image/webp';
  fileInput.multiple = true;
  fileInput.setAttribute('aria-label', 'Add job photos');
  const cameraInput=el('input');cameraInput.type='file';cameraInput.hidden=true;cameraInput.accept=fileInput.accept;cameraInput.setAttribute('capture','environment');cameraInput.setAttribute('aria-label','Take a job photo');
  const phaseActions=el('div','cf-phase-actions');
  const previous=button('Back','cf-text-action'); const next=button(phase.next,'cf-send','arrow');
  previous.onclick=()=>{if(!busy&&activity==='ready')changePhase(VISIT_STAGES[Math.max(0,VISIT_STAGES.indexOf(phase)-1)].id);};
  next.onclick=()=>run(async()=>{if(phase.id==='final'){await onNavigate?.('review');return;}changePhase(VISIT_STAGES[VISIT_STAGES.indexOf(phase)+1].id);});
  phaseActions.append(previous,next);
  if(voiceOnly){
    const customer=el('div','cf-contact');
    const heading=el('div','cf-contact-heading');heading.append(el('p','cf-customer',order.customer||'Current visit'),jobButton);customer.append(heading);
    const contact=order.customerContact;
    if(contact?.phone){const row=el('div','cf-contact-phone');row.append(el('span','cf-phone-number',contact.phone));const number=contact.phone.replace(/[^+0-9]/g,'');for(const [label,scheme] of [['Call','tel:'],['Text','sms:']]){const action=el('a','cf-contact-link',label);action.href=scheme+number;action.setAttribute('aria-label',`${label} ${order.customer} at ${contact.phone}`);row.append(action);}customer.append(row);}
    const address=contact?.address||order.property;
    if(address){const location=el('a','cf-contact-link',address);location.href='https://maps.apple.com/?q='+encodeURIComponent(address);location.setAttribute('aria-label',`Open address in Maps: ${address}`);customer.append(location);}
    rail.replaceChildren(customer);
    toolsContent.append(ordersButton,sourcesButton,handoffButton,typeButton,composer,addButton,hearButton,history,savedState,el('p','cf-private-note','Fictional test assignment. Hold to speak sends new speech to Meta for a reply.'));
    handoffButton.hidden=false;typeButton.hidden=false;typeButton.querySelector('span:last-child').textContent='Type a message';
    composer.hidden=true;sendButton.hidden=true;composerHint.textContent='Press Enter to send';
    responseActions.hidden=true;phaseActions.hidden=true;footer.hidden=true;
    talkButton.classList.add('cf-hold');dock.replaceChildren(talkButton,cameraButton);
    lower.append(heard,notice,activityLabel,inputMeter,photos,dock,footer,tools,fileInput,cameraInput);
  }else lower.append(notice,composer,dock,activityLabel,inputMeter,savedState,phaseActions,history,footer,fileInput);
  shell.append(rail,journey,main,lower);
  root.replaceChildren(shell);

  function valid() { return alive && shell.isConnected; }
  function say(text, error = false) {
    if (!valid()) return;
    notice.textContent = text || '';
    notice.classList.toggle('is-error', error);
  }
  function setActivity(next) {
    if (!valid() || !ACTIVITY.has(next)) return;
    activity = next; activityLabel.hidden = next === 'ready';
    if (next === 'ready' || next === 'connecting' || next === 'listening') readingBrief = false;
    jobButton.replaceChildren(icon(readingBrief ? 'stop' : 'volume'), el('span', '', readingBrief ? 'Stop briefing' : 'Briefing'));
    jobButton.setAttribute('aria-pressed', String(readingBrief));
    if(next==='listening'||next==='connecting')say('');
    shell.dataset.activity = next;
    activityLabel.textContent = voiceOnly?({ready:'',connecting:'Opening microphone…',listening:'Listening — release when you’re done',reviewing:'Thinking…',speaking:'Replying…'}[next]):{ready: 'Ready when you are', connecting:'Starting live voice', listening: 'Microphone is listening', reviewing: 'Reviewing the job evidence', speaking: 'Reading the response aloud'}[next];
    if(voiceOnly){const label=next==='listening'?'Listening — release to send':next==='connecting'?'Keep holding…':next==='reviewing'?'Thinking…':'Hold to speak';talkButton.replaceChildren(icon('mic'),el('span','',label));talkButton.setAttribute('aria-label',label);}else talkButton.replaceChildren(icon(next === 'listening' || next === 'connecting' || next === 'speaking' ? 'stop' : 'mic'), el('span', '', next === 'connecting' ? 'Cancel setup' : next === 'listening' ? 'Finish speaking' : next === 'speaking' ? 'Stop speaking' : liveAvailable ? 'Talk to CarryForward' : 'Live interview unavailable'));
    talkButton.setAttribute('aria-pressed', String(next === 'listening'));
    syncControls();
  }
  function setInputLevel(level) {
    if(!valid())return;inputMeter.hidden=!level;
    inputMeter.value=level?Math.max(0,Math.min(1,(20*Math.log10(Math.max(level.rms,0.00001))+75)/60)):0;
  }
  function syncControls() {
    if (!valid()) return;
    const locked = busy || cameraBusy || activity === 'reviewing' || activity === 'connecting';
    reviewButton.disabled = locked || typeof onRefresh !== 'function' || activity === 'listening';
    sendButton.disabled = locked || !input.value.trim() || activity === 'listening';
    addButton.disabled = locked || activity === 'listening' || (!onUpload && !onPhotoFiles);
    hearButton.disabled = locked || activity === 'listening';
    cameraButton.disabled=locked||activity==='listening'||!onPhotoFiles;
    for(const control of photos.querySelectorAll('button'))control.disabled=locked||activity==='listening';
    talkButton.disabled = voiceOnly?(busy||cameraBusy||activity==='reviewing'||(!liveAvailable&&activity==='ready')):activity==='connecting'?false:locked||(!liveAvailable&&activity==='ready');
    previous.disabled=locked||activity!=='ready'; next.disabled=locked||activity!=='ready'||(phase.id==='final'&&!finalVisitUpdate(order,state).hasReport);
    jobButton.disabled = locked || activity === 'listening';
    ordersButton.disabled = !onNavigate || locked || activity === 'listening';
    sourcesButton.disabled = !onNavigate || locked || activity === 'listening';
    for (const control of focalEvidence.querySelectorAll('button,a')) {
      if (control.tagName === 'BUTTON') control.disabled = locked || activity === 'listening';
      else { control.setAttribute('aria-disabled', String(locked || activity === 'listening')); control.tabIndex = locked || activity === 'listening' ? -1 : 0; }
    }
    handoffButton.disabled = !onNavigate || locked || activity === 'listening';
    for(const control of questionActions.querySelectorAll('button,input'))control.disabled=locked||activity==='listening'||(control.textContent==='Already answered'&&!Object.values(state?.sources||{}).some(s=>s.kind==='testimony'&&!s.supersededBy));
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
  function sourceCaption(note) {
    const source = note.source;
    return `${BRIEF_KIND_LABELS[note.kind]} · ${source.title} · ${source.id} · ${source.revision}${source.page ? ` · p. ${source.page}` : ''}`;
  }
  function renderBrief() {
    briefPane.hidden = !briefOpen;
    if (!briefOpen || briefPane.childElementCount) return;
    const grid = el('div','cf-brief-grid');
    for (const section of visitBrief.sections) {
      const row = el('section',`cf-brief-section${section.needsContext?' cf-brief-gap':''}`);
      row.append(el('h2','',section.title));
      if (section.procedure) {
        row.append(el('p','',section.missing));
        if (section.notes.length) {
          const refs = el('details','cf-brief-references');
          refs.append(el('summary','','Supplied reference notes · not approved instructions'));
          for (const note of section.notes) refs.append(el('blockquote','',note.text),el('p','cf-brief-source',sourceCaption(note)));
          row.append(refs);
        }
      } else if (!section.notes.length) row.append(el('p','',section.missing));
      else for (const note of section.notes) row.append(el('p','cf-brief-note',note.text),el('p','cf-brief-source',sourceCaption(note)));
      grid.append(row);
    }
    const scope = el('details','cf-brief-scope');
    scope.append(el('summary','','The assignment and what came before'));
    const list = el('ul');
    for (const item of visitBrief.scope) list.append(el('li','',item));
    scope.append(list);
    for (const record of visitBrief.history) scope.append(el('p','cf-brief-history',`${record.date} · ${record.text}`),el('p','cf-brief-source',`Original work-order history · ${record.id}`));
    const full=el('details','cf-full-brief');full.append(el('summary','','Access, customer notes and job details'),grid,scope);
    const compact=el('div','cf-work-order');compact.append(el('h2','','Work order'),el('p','',order.reportedIssue||''));
    const assigned=el('ul');for(const text of order.requestedWork||[])assigned.append(el('li','',text));if(!voiceOnly)compact.append(assigned);
    const controls = el('div','cf-brief-controls');
    const tools = button('Work order and job selection','cf-text-action','source');
    tools.onclick = () => navigate('briefing');
    controls.append(tools); full.append(controls);
    briefPane.append(compact);if(voiceOnly)toolsContent.prepend(full);else briefPane.append(full);
  }
  function openBrief() {
    if (!valid()) return;
    onStopSpeaking?.(); changePhase('brief');
    main.scrollIntoView({block:'start'});
  }
  function renderResponse() {
    if (!valid()) return;
    const question = state?.activeQuestion;
    shell.classList.toggle('cf-has-brief',briefOpen);
    eyebrow.textContent = voiceOnly?'':`STEP ${VISIT_STAGES.indexOf(phase)+1} OF 4 · ${phase.label.toUpperCase()}`;
    phaseLabel.textContent=phase.label;next.replaceChildren(el('span','',phase.next),icon('arrow'));previous.hidden=phase.id==='brief';
    input.placeholder=phase.id==='brief'?'Ask about this work order…':phase.id==='onsite'?'Add a finding or ask a job question…':'Tell me what happened on this visit…';
    if(!voiceOnly)composer.hidden=phase.id==='final';dock.hidden=!voiceOnly&&phase.id==='final';
    responseText.textContent = phase.id==='final'?phase.title:response?.text||(voiceOnly?question?.text:null)||(phase.id==='report'?question?.text:null)||(voiceOnly?'What would you like to know?':phase.title);
    responseText.classList.toggle('cf-response-short', !!evidence);
    context.textContent = voiceOnly?'':response&&phase.id!=='final'?(response.detail||''):phase.hint;
    context.hidden = !context.textContent;
    provenance.replaceChildren();
    if (briefOpen) provenance.append(el('span','cf-origin-badge',`Work-order briefing · ${order.customer}`));
    else if (response?.origin) provenance.append(el('span', 'cf-origin-badge', response.origin));
    else if (question) provenance.append(el('span', 'cf-origin-badge', originForQuestion(state)));
    else provenance.append(el('span', 'cf-origin-badge', `Work order · ${order.customer}`));
    if (!briefOpen && response?.sourceIds?.length) provenance.append(el('span', 'cf-source-ids', response.sourceIds.join(' · ')));
    hearButton.replaceChildren(icon('volume'),el('span','',briefOpen?'Read the brief aloud':'Read aloud'));
    reviewButton.hidden=phase.id!=='report';
    renderBrief();
    renderFinal();
    renderEvidence();
    renderQuestionActions();
  }
  function changePhase(value) {
    if(!valid())return;onStopSpeaking?.();phase=visitStage(value);briefOpen=phase.id==='brief';evidence=null;clearResponse();
    onPhaseChanged?.(phase.id);if(phase.id!=='brief')onBriefViewed?.();renderResponse();syncControls();
    shell.scrollIntoView({block:'start'});
  }
  function renderFinal() {
    finalPane.hidden=phase.id!=='final';if(finalPane.hidden)return;
    const update=finalVisitUpdate(order,state);finalPane.replaceChildren();
    if(!update.hasReport){finalPane.append(el('p','','No report has been sent yet. A saved recording needs reviewed words before it becomes a report. Go back to add your update.'));return;}
    finalPane.append(el('p','cf-final-status',update.confirmation));
    if(update.findings.length){
      finalPane.append(el('h2','','Draft findings'),el('p','','Check these against your report before confirming.'));
      for(const finding of update.findings)finalPane.append(el('p','cf-final-note',finding.text));
    }else{
      finalPane.append(el('h2','','Saved reports'));
      if(update.reviewPending)finalPane.append(el('p','cf-final-status','Report review is still pending. Earlier findings have not been reused.'));
    }
    const history=update.findings.length?el('details','cf-final-history'):finalPane;
    if(update.findings.length){history.append(el('summary','','Original reports and corrections'));finalPane.append(history);}
    for(const note of update.notes){if(note.amendedBy?.length)history.append(el('small','','Earlier report · has a correction below'));if(note.amends)history.append(el('small','','Correction to an earlier report'));if(!note.reviewed)history.append(el('small','','Machine transcript · awaiting confirmation'));history.append(el('p','cf-final-note',note.text));}
    finalPane.append(el('h2','','Outcome and follow-up'));
    for(const check of update.checks){const row=el('article','cf-outcome');row.append(el('h3','',check.label),el('p','',check.status),el('p','',check.note));if(!check.reported)row.append(el('p','',check.owner?`Follow-up owner: ${check.owner}`:'Follow-up owner still needed'));finalPane.append(row);}
  }
  function setConnection({ready=false,liveEnabled=false,needsPairing=false}={}) {
    if(!valid())return;liveAvailable=ready&&liveEnabled;
    connection.classList.toggle('is-offline',!ready);
    connectionText.textContent=voiceOnly?(needsPairing?'Reconnect to talk.':liveAvailable?'':ready?'Voice is unavailable.':'Connection unavailable.'):(needsPairing?'Reconnect this phone to use the live interview. Saved notes are still here.':liveAvailable?'Live interview available. New speech goes to Meta after you choose Start.':ready?'Service connected · live speech is unavailable. You can type your update.':'Live interview offline. Type your update or save a local voice note below. Nothing is being sent.');connection.hidden=voiceOnly&&liveAvailable;
    retry.hidden=ready;setActivity(activity);
  }
  function setClips(count) {clipCount=count;renderHistory();}
  function renderQuestionActions() {
    questionActions.replaceChildren();
    if(voiceOnly||phase.id!=='report'||briefOpen||evidence||!state?.activeQuestion||!onQuestionResponse)return;
    if(response?.text&&response.text!==state.activeQuestion.text)questionActions.append(el('p','cf-pending-question',state.activeQuestion.text));
    const label=el('label','','Follow-up owner'),owner=el('input');owner.maxLength=200;owner.placeholder='For example, Operations';label.append(owner);questionActions.append(label);
    for(const [action,text] of [['cannot_verify',"Can't verify"],['later','Follow up later'],['already_answered','Already answered']]){
      const control=button(text,'cf-text-action');control.disabled=busy||activity==='listening'||activity==='reviewing';
      if(action==='already_answered'&&!Object.values(state.sources||{}).some(s=>s.kind==='testimony'&&!s.supersededBy))control.disabled=true;
      control.onclick=()=>run(async()=>{const result=await onQuestionResponse(action,owner.value,{branchId:state.activeQuestion.branchId,inputRevision:state.inputRevision});if(!valid())return;setResponse(result.response,{origin:result.origin});await refresh();});
      questionActions.append(control);
    }
  }
  function setResponse(text, metadata = {}) {
    if (!valid()) return;
    briefOpen = false;
    response = {text: String(text || ''), origin: metadata.origin || 'Interface message', sourceIds: metadata.sourceIds || [], detail: metadata.detail};
    renderResponse();
  }
  function renderHistory() {
    if (!valid()) return;
    historyList.replaceChildren();
    const turns = Object.values(state?.sources || {}).filter(s => s.kind === 'testimony');
    historySummary.textContent = voiceOnly ? `Reported work${turns.length?' · '+turns.length:''}` : turns.length ? `Saved conversation · ${turns.length} ${turns.length === 1 ? 'answer' : 'answers'}` : 'Saved conversation';
    savedState.textContent=voiceOnly?(turns.length?`${turns.length} reported ${turns.length===1?'update':'updates'} saved.`:clipCount?`${clipCount} voice ${clipCount===1?'note':'notes'} saved. Questions and replies are listed separately.`:'No field report yet.') : turns.length?`${turns.length} ${turns.length===1?'answer saved':'answers saved'} to this visit · Operations acceptance is separate.`:clipCount?`${clipCount} voice ${clipCount===1?'note saved':'notes saved'} on this phone. No report answer has been sent. Review or type your words before Send.`:'No report answers sent yet.';
    if (!turns.length) {
      historyList.append(el('li', 'cf-history-empty', 'Saved answers will appear here. A question about a source is kept separate from your field testimony.'));
      return;
    }
    for (const turn of turns) {
      const li = el('li', `cf-turn${turn.supersededBy ? ' is-superseded' : ''}`);
      const head = el('div', 'cf-turn-head');
      head.append(el('span', 'cf-origin-badge', turn.audioId ? (turn.transcription?.reviewed===false?'Speech transcript · not yet reviewed':'Technician · reviewed voice transcript') : 'Technician · typed testimony'));
      if (timeLabel(turn.at)) head.append(el('time', '', timeLabel(turn.at)));
      li.append(head, el('p', '', turn.text), el('small', 'cf-turn-source', `${turn.id}${turn.amends?` · amends ${turn.amends}`:''}${turn.amendedBy?.length?' · correction follows':''}${turn.supersedes ? ` · corrects ${turn.supersedes}` : ''}${turn.supersededBy ? ` · corrected by ${turn.supersededBy}` : ''}`));
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
      let spokenReply=null;
      await draftSave;
      if (!valid()) return;
      briefOpen = false;
      const result = await onCommand?.(message, {order, state, ...metadata});
      if (!valid()) return;
      if (result?.handled === true) {
        if (result.response || result.message) setResponse(result.response || result.message, {origin: result.origin || 'Job source lookup', sourceIds: result.sourceIds, detail: result.detail});
        if(pendingAudio?.liveReview&&result.response)spokenReply=result.response;
        if (Object.hasOwn(result, 'evidence')) showEvidence(result.evidence);
        if (result.activity && ACTIVITY.has(result.activity)) setActivity(result.activity);
      } else {
        if (typeof onSaveAnswer !== 'function') throw new Error('Saving answers is unavailable. Keep this message until the job is ready.');
        const saveResult = await onSaveAnswer(message, {branchId: state?.activeQuestion?.branchId || null, supersedes: null, ...metadata, ...(pendingAudio ? {audio: {...pendingAudio,transcription:{...pendingAudio.transcription,reviewed:true}}} : {})});
        if (!valid()) return;
        clearResponse();
        if (saveResult?.response) setResponse(saveResult.response, {origin: saveResult.origin || 'Saved job response', sourceIds: saveResult.sourceIds});
        if(saveResult?.speak)spokenReply=saveResult.response;
        say('Answer saved to this job.');
      }
      if (!valid()) return;
      draft = ''; pendingAudio = null; input.value = ''; input.blur(); composer.hidden = voiceOnly||phase.id==='final';
      await notifyDraft();
      if (!valid()) return;
      typeButton.setAttribute('aria-expanded', 'false');
      await refresh();
      if(spokenReply&&valid()){try{await onSpeak?.(spokenReply,{onState:next=>{if(valid())setActivity(next);},onError:error=>{if(valid()){setActivity('ready');say(error.message,true);}}});}catch(error){say(error.message,true);}}
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
    if (item) briefOpen = false;
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
  jobButton.onclick = async () => {
    if (busy || activity === 'connecting' || activity === 'listening' || activity === 'reviewing') return;
    if (readingBrief) { await onStopSpeaking?.(); if (valid()) setActivity('ready'); return; }
    openBrief(); readingBrief = true; setActivity('speaking');
    await readAloud(visitBrief.spoken);
  };
  function navigate(destination) {
    if (!valid() || busy || activity === 'listening' || activity === 'reviewing') return;
    try { Promise.resolve(onNavigate?.(destination)).catch(error => say(error.message || 'That view could not be opened.', true)); }
    catch (error) { say(error.message || 'That view could not be opened.', true); }
  }
  ordersButton.onclick = () => navigate('jobs');
  sourcesButton.onclick = () => navigate('sources');
  handoffButton.onclick = () => navigate('review');
  typeButton.onclick = () => { if (composer.hidden) openComposer(); else { composer.hidden = true; typeButton.setAttribute('aria-expanded', 'false'); } };
  hideComposer.onclick = () => { composer.hidden = true; typeButton.setAttribute('aria-expanded', 'false'); typeButton.focus(); };
  input.addEventListener('input', () => { draft = input.value; notifyDraft(); syncControls(); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && (voiceOnly||window.matchMedia('(min-width: 700px)').matches)) { event.preventDefault(); if (!sendButton.disabled) composer.requestSubmit(); } });
  composer.onsubmit = event => { event.preventDefault(); submit(input.value, pendingAudio ? {audio: pendingAudio} : {}); };
  reviewButton.onclick = () => run(async () => {
    const result = await onRefresh?.();
    if (!valid()) return;
    if (result?.response) setResponse(result.response, {origin: result.origin, sourceIds: result.sourceIds,detail:result.detail});
    else clearResponse();
    await refresh();
  }, {review: true});
  const camera=bindJobCamera(cameraInput,{jobId:order.id,
    canOpen:()=>valid()&&!busy&&!cameraBusy&&!['connecting','listening','reviewing'].includes(activity)&&!!onPhotoFiles,
    onOpening:()=>onStopSpeaking?.(),onState:value=>{cameraBusy=value;syncControls();},
    onFiles:async files=>{say('Saving photo…');const result=await onPhotoFiles(files);if(!valid())return;say(result?.message||'Photo saved locally.');await refresh();},
    onError:error=>say(error.message||'The photo could not be saved.',true),
  });
  cameraButton.onclick=()=>camera.open();
  function setPhotos(items){
    if(!valid())return;
    photos.replaceChildren();
    for(const item of items||[]){
      if(item.jobId!==order.id)throw Error('Photo belongs to another job.');
      const src=safeUrl(item.imageUrl||item.url,{media:true});if(!src)continue;
      const thumb=el('button','cf-photo-thumb');thumb.type='button';thumb.setAttribute('aria-label',`Inspect ${item.title||'saved photo'}`);
      const image=el('img');image.src=src;image.alt=item.title||'Saved job photo';image.decoding='async';
      thumb.append(image,el('span','','Saved locally'));thumb.onclick=()=>{onStopSpeaking?.();openEvidenceDialog(item);};photos.append(thumb);
    }
    photos.hidden=!photos.childElementCount;syncControls();
  }
  addButton.onclick = () => { if (onUpload) run(() => onUpload()); else fileInput.click(); };
  fileInput.onchange = () => { const files = Array.from(fileInput.files || []); if (files.length) run(async () => { const result = await onPhotoFiles?.(files); if (!valid()) return; fileInput.value = ''; say(result?.message || 'Evidence saved to this job.', !!result?.failed && !result.saved); await refresh(); }); };
  talkButton.onclick = async () => {
    if (!valid() || busy) return;
    if (activity === 'speaking') { await onStopSpeaking?.(); if (valid()) setActivity('ready'); return; }
    if (activity === 'listening'||activity==='connecting') {
      try { await onStopTalk?.(); if (typeof talkCleanup === 'function') await talkCleanup(); talkCleanup = null; if (valid()&&(activity==='listening'||activity==='connecting')) setActivity('ready'); }
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
      say('');
      if (typeof result === 'function') talkCleanup = result;
      if (result?.activity && ACTIVITY.has(result.activity)) setActivity(result.activity);
    } catch (error) { if (valid()) { setActivity('ready'); say(error.message || 'Microphone unavailable. You can type instead.', true); } }
  };
  let releaseHold=()=>{};
  if(voiceOnly){talkButton.onclick=null;releaseHold=bindHoldToSpeak(talkButton,{start:()=>{if(!valid()||busy)return null;return onHold?.();},onError:error=>{if(valid()){setActivity('ready');say(error.message,true);}}});}
  hearButton.onclick = async () => {
    if (activity === 'speaking') { await onStopSpeaking?.(); if (valid()) setActivity('ready'); return; }
    await readAloud(briefOpen ? visitBrief.spoken : responseText.textContent);
  };
  async function readAloud(text) {
    try {
      if (typeof onSpeak !== 'function') throw new Error('Spoken output unavailable. The work order is readable under Details.');
      await onSpeak(text, {onState: next => { if (valid()) setActivity(next); }, onError: error => { if (valid()) { setActivity('ready'); say(error?.message || String(error), true); } }});
    } catch (error) { if (valid()) { setActivity('ready'); say(error.message || 'Spoken output unavailable.', true); } }
  }
  syncControls();
  refresh();
  const cleanup = () => {
    if (!alive) return;
    camera.dispose();releaseHold();document.body.classList.remove('voice-first');alive = false; refreshId++; currentAction++;
    if (typeof talkCleanup === 'function') { try { talkCleanup(); } catch { /* adapter owns capture recovery */ } }
    for (const dialog of dialogs) { for (const video of dialog.querySelectorAll('video')) video.pause(); dialog.remove(); }
    dialogs.clear();
    for (const video of shell.querySelectorAll('video')) video.pause();
    shell.remove();
  };
  Object.assign(cleanup, {openCamera:options=>camera.open(options),canNavigate:()=>!camera.busy(),setPhotos,refresh, submit, setActivity, setInputLevel, setResponse, showEvidence, setDraft, zoomEvidence, openBrief, setConnection, setClips, changePhase, extraTools:toolsContent, setHeard:text=>{heard.textContent=`I heard: ${text}`;heard.hidden=!text;}});
  return cleanup;
}
