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
  return {hasReport:turns.length>0,notes:turns.map(turn=>({id:turn.id,text:turn.text})),
    checks:(order.checks||[]).map(check=>{const branch=state?.branches?.[check.id];return {
      id:check.id,label:check.label,reported:branch?.state==='supported',
      status:branch?.state==='supported'?'Reported · needs human review':'Follow-up open',
      note:branch?.reason||'No supported outcome has been recorded.',owner:branch?.owner||null,
    };}),
    confirmation:'Visit summary · check confirmation on the review screen. Operations acceptance is separate.',
  };
}
