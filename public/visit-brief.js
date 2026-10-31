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
