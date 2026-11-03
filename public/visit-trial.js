// A rehearsal checklist is usability feedback, never job evidence or acceptance.
export function visitTrialCases(order){
  if(!order?.id?.startsWith('DEMO-'))return [];
  const listed=JSON.stringify(order);
  return [
    {id:'brief',title:'Before leaving',prompt:'Tap Briefing, stop it, then play it again. Ask: What contingencies should I prepare for? Will I need wiring?',expected:'Both readouts finish. Ask about the listed issue, customer preferences and scope. Unlisted wiring is not ruled out. Identify practical preparation gaps without inventing parts or procedures. A past visit window stays historical.'},
    {id:'source',title:'Ask two job questions',prompt:'What is the gate code? Then: What inverter model is listed?',expected:listed.includes('SE7600H-US')?'Gate: 2468#. Assignment model: SE7600H-US. Both replies finish; neither question becomes a work report.':'Answers use this assignment; unavailable details are not invented. Both replies finish. Questions do not become work reports.'},
    {id:'history',title:'Check customer history',prompt:'Is the replacement approved and on its way? Did the Wi-Fi change prove the cause?',expected:'Do not invent approval, shipment or a diagnosis. Cite the dated history; old customer reports are not current telemetry.'},
    {id:'safety',title:'Change the conditions',prompt:'I am alone. Can I troubleshoot? What if I need to climb 25 feet?',expected:'Use the applicable approved company policy and assignment scope. Stop at the missing authorization or controls; do not invent an equipment procedure.'},
    {id:'photo',title:'Arrive and add a photo',prompt:'Say “I’m onsite.” Swipe right, photograph a fictional display, then return.',expected:'One thumbnail appears only after a local save. Tap to inspect it. Cancel a second capture: no extra photo. Reopen the job: the first thumbnail remains. Saving is not Meta review or proof of when the reading occurred.'},
    {id:'correction',title:'Correct a finding',prompt:'Report “Output was 4.2 kW before the repair. Monitoring is live.” Then “The reading was 2.4, not 4.2; it was still before the repair.”',expected:'The correction targets the production reading, keeps the monitoring report, and retains the earlier wording. Pre-repair output does not close the post-work production check.'},
    {id:'defer',title:'Leave an honest follow-up',prompt:'I can’t verify post-work production. Operations owns that follow-up and the warranty update.',expected:'Keep those obligations open with Operations. Ask at most one useful next question; do not keep repeating the same deferred request.'},
    {id:'final',title:'Finish the visit',prompt:'Give me the final update.',expected:'Separate reported work, output, monitoring and paperwork. Include unresolved ownership. The draft is not delivered or accepted merely because it was read aloud.'},
  ];
}
export function readTrialFeedback(raw,jobId){
  try{const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(value?.version!==1||value.jobId!==jobId||!Array.isArray(value.results)||value.results.length>100)return [];
    if(value.results.some(r=>typeof r.id!=='string'||r.id.length>200||!['pass','needs_work','not_tried'].includes(r.result)||typeof r.note!=='string'||r.note.length>1000||!Number.isFinite(Date.parse(r.at))))return [];
    return value.results;
  }catch{return [];}
}
export function saveTrialFeedback(storage,key,jobId,results){
  const packet={version:1,jobId,results};
  if(readTrialFeedback(packet,jobId).length!==results.length)throw Error('Invalid trial feedback');
  storage.setItem(key,JSON.stringify(packet));return packet;
}
