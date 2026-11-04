import {validateBriefing} from './engine.js';

const SECTIONS = [
  ['system', 'The system', 'System type, make, model and configuration are not supplied.'],
  ['problem', 'The reported problem', 'The reported problem is not supplied.'],
  ['customer', 'Customer preferences', 'Arrival, contact and property preferences are not supplied.'],
  ['access', 'Getting in', 'Gate, entry and access arrangements are not supplied.'],
  ['troubleshooting', 'Ideas to investigate', 'Troubleshooting ideas and an applicable diagnostic reference are not supplied.'],
  ['safety', 'Safety context', 'Applicable approved equipment and site-safety guidance is not attached.'],
  ['ladder', 'Ladder and elevated access', 'Ladder need, access plan and applicable approved ladder rules are not established.'],
];
export const BRIEF_KIND_LABELS = Object.freeze({reported:'Reported context', context:'Assignment context', hypothesis:'Planning idea · not a diagnosis', reference:'Reference note · approval not established'});

// Assignment context stays distinct from observations, diagnoses and approved
// procedures. Viewing this brief cannot confirm a repair or authorize work.
export function buildVisitBrief(order) {
  if (!order || typeof order.id !== 'string' || typeof order.systemId !== 'string') throw new Error('A job and system are required for the visit brief.');
  const supplied = Object.hasOwn(order, 'briefing') ? validateBriefing(order.briefing) : {};
  const sections = SECTIONS.map(([key,title,missing]) => {
    const notes = supplied[key] || [];
    const procedure = key === 'safety' || key === 'ladder';
    return {key,title,missing,notes,procedure,needsContext:!notes.length || procedure};
  });
  const problem = sections.find(section => section.key === 'problem');
  if (!problem.notes.length && order.reportedIssue) problem.notes = [{id:'assignment-problem',kind:'reported',text:order.reportedIssue,source:{id:order.id,title:'Original work order',revision:'Source revision not supplied'}}];
  problem.needsContext = !problem.notes.length;
  const scope = Array.isArray(order.requestedWork) ? [...order.requestedWork] : [];
  const history = Array.isArray(order.history) ? structuredClone(order.history) : [];
  const spoken = [`Pre-visit brief for ${order.customer || order.id}. System ${order.systemId}.`];
  for (const section of sections) {
    if (section.procedure) { spoken.push(`${section.title}: ${section.missing}`); continue; }
    if (!section.notes.length) { spoken.push(`${section.title}: ${section.missing}`); continue; }
    for (const note of section.notes) spoken.push(`${section.title}. ${BRIEF_KIND_LABELS[note.kind]}. ${note.text}`);
  }
  if (scope.length) spoken.push(`Assigned work: ${scope.join(' ')}`);
  if (history.length) spoken.push(`Previous notes: ${history.map(item => `${item.date}: ${item.text}`).join(' ')}`);
  return {jobId:order.id,systemId:order.systemId,customer:order.customer,property:order.property,sections,scope,history,spoken:spoken.join('\n')};
}

// Short readout over the recorded assignment; the full sourced brief stays on screen.
export function spokenDepartureBrief(order){
 const brief=buildVisitBrief(order),notes=['problem','system','access','customer'].map(key=>brief.sections.find(s=>s.key===key)).map(section=>section.notes[0]?.text||section.missing);
 return `Recorded work order for ${brief.customer||brief.jobId}. ${notes.join(' ')} Assigned work: ${brief.scope.join(' ')} Safety context: ${brief.sections.find(s=>s.key==='safety').missing}`;
}

// A short opening for the phone trial. Keep each included source statement
// intact; long fields stay in the readable work order rather than being cut.
export function spokenPilotBrief(order){
 const brief=buildVisitBrief(order),customer=(brief.customer||brief.jobId).length<=100?(brief.customer||brief.jobId):'this visit';
 const issue=typeof order.reportedIssue==='string'&&order.reportedIssue.length<=360?order.reportedIssue:'Read the reported problem in the work order.';
 const first=brief.scope[0],scope=first&&first.length<=180?`First assigned check: ${first}`:'Review the assigned scope in the work order.';
 return `Recorded work order for ${customer}. ${issue} ${scope} Review the full assignment and applicable approved safety guidance before work.`;
}
