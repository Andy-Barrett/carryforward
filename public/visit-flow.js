// View progress is navigation, not proof that work happened or was accepted.
export const VISIT_STAGES = Object.freeze([
  {id:'brief',label:'Work order',title:'Review the work order',hint:'Ask about the job before you leave.',next:'I’ve arrived onsite'},
  {id:'onsite',label:'On site',title:'What are you finding?',hint:'Add a finding, ask a job question, or add a photo if useful.',next:'Report back'},
  {id:'report',label:'Report back',title:'Tell me how the visit went',hint:'What did you do, what did you check, and what still needs attention?',next:'Get final update'},
  {id:'final',label:'Final update',title:'Your visit update',hint:'Review what is reported and what still needs follow-up.',next:'Review and confirm'},
]);
export function visitStage(value,fallback='brief') {
  return VISIT_STAGES.find(stage=>stage.id===value)||VISIT_STAGES.find(stage=>stage.id===fallback)||VISIT_STAGES[0];
}
export function finalVisitUpdate(order,state) {
  if(state&&state.jobId!==order.id)throw Error('The final update belongs to another job.');
  const turns=Object.values(state?.sources||{}).filter(source=>source.kind==='testimony'&&!source.supersededBy);
  return {hasReport:turns.length>0,notes:turns.map(turn=>({id:turn.id,text:turn.text,...(turn.amends?{amends:turn.amends}:{}),...(turn.amendedBy?{amendedBy:turn.amendedBy}:{}),reviewed:turn.transcription?.reviewed!==false})),
    checks:(order.checks||[]).map(check=>{const branch=state?.branches?.[check.id];return {
      id:check.id,label:check.label,reported:branch?.state==='supported',
      status:branch?.state==='supported'?'Reported · needs human review':'Follow-up open',
      note:branch?.reason||'No supported outcome has been recorded.',owner:branch?.owner||null,
    };}),
    confirmation:'Visit summary · check confirmation on the review screen. Operations acceptance is separate.',
  };
}

export function conversationIntent(text) {
  const value=String(text).toLowerCase().replace(/[’']/g,'').replace(/[?.!,]/g,'').replace(/\s+/g,' ').trim();
  if(/^(?:(?:please|okay|ok|can you) )?(?:(?:give|read|show|tell) (?:me )?(?:the |my )?)?(?:final update|visit summary|final summary|closeout|handoff)(?: please)?$/.test(value)||/^(?:im done|i am done|were done|wrap (?:it |this )?up)$/.test(value))return 'final';
  if(/^(?:(?:i |im |i am |ive |i have )?(?:just )?)?(?:arrived(?: onsite| on site)?|onsite|on site)$/.test(value))return 'onsite';
  if(/^(?:let me |i (?:want to|will) )?(?:report back|give (?:my|the) report)$/.test(value))return 'report';
  if(/^(?:correction|no i meant)\b/.test(value))return 'correction';
  return null;
}
export function spokenVisitSummary(order,state) {
  const update=finalVisitUpdate(order,state);
  if(!update.hasReport)return 'I don’t have a visit report yet. Tell me what you found, what you did, and what still needs attention.';
  const latest=update.notes.slice(-3).map(note=>`${note.amendedBy?.length?'Earlier report, amended below: ':note.amends?'Correction: ':''}${note.text.slice(0,450)}`).join(' ');
  const open=update.checks.filter(check=>!check.reported);
  return `Here’s the draft visit update. You reported: ${latest} ${open.length?`Still open: ${open.map(check=>`${check.label}${check.owner?`, with ${check.owner}`:''}`).join('; ')}.`:'The recorded checks have supporting reports; they are not independently verified.'} This has not been delivered to Operations.`;
}

// Derive the open-work acknowledgement from saved branch states, rather than
// trusting a conversational promise that an obligation was kept open.
export function spokenReportReply(order,state){
  const open=(order.checks||[]).filter(check=>state.branches[check.id]?.state!=='supported');
  const acknowledgement='Your update is saved.';
  const followup=open.length?`Still open: ${open.map(check=>`${check.label}${state.branches[check.id]?.owner?`, with ${state.branches[check.id].owner}`:', owner not assigned'}`).join('; ')}.`:'The recorded checks have supporting reports; they still need human review.';
  return `${acknowledgement} ${followup}${state.activeQuestion?' '+state.activeQuestion.text:''}`;
}
