import {directAssignmentAnswer} from './lookup-context.mjs';
import {validateOrder} from '../public/engine.js';
import {fieldReferences,conversationRules} from './field-context.mjs';
import {equipmentReferencesForOrder} from './equipment-context.mjs';
import {selectCompanyReferences} from './company-context.mjs';
import {MODEL} from './meta-review.mjs';
const text=(value,max)=>typeof value==='string'&&value.trim()&&value.length<=max;
export function prepareConversation(input,{reasoningEffort='low',companyContext=null,now=new Date()}={}){
  if(!['low','minimal'].includes(reasoningEffort))throw Error('Unsupported bounded conversation reasoning');
  const order=validateOrder(input?.order);
  const communicationStyle=input.communicationStyle||'conversational';if(!['direct','conversational'].includes(communicationStyle))throw Error('Unsupported conversation style');
  if(!/^DEMO-/.test(order.id)||!text(input.text,4000))throw Error('A fictional job and bounded message are required');
  const history=input.history||[];
  if(!Array.isArray(history)||history.length>12||history.some(t=>t.jobId!==order.id||!text(t.question,4000)||!text(t.reply,2000)))throw Error('Invalid or wrong-job conversation history');
  const testimony=input.testimony||[];
  if(!Array.isArray(testimony)||testimony.length>20||testimony.some(s=>!text(s.id,200)||!text(s.text,4000)))throw Error('Invalid bounded technician reports');
  const companySources=selectCompanyReferences(companyContext,{text:input.text,history});
  const equipmentSources=equipmentReferencesForOrder(order);
  const customerHistory=order.history.map(h=>({...h,jobId:order.id,systemId:order.systemId,kind:'dated_customer_history_supplied_by_assignment',verification:'Historical reported context; not current telemetry, proof of repair or Operations acceptance.'}));
  const sources=[{id:'work-order',kind:'assignment',text:JSON.stringify(order)},...fieldReferences,...companySources,...equipmentSources,...customerHistory,
    ...testimony.map(s=>({...s,kind:'technician_report_not_independently_verified'}))];
  const reserved=new Set(['work-order',...fieldReferences.map(s=>s.id),...companySources.map(s=>s.id),...equipmentSources.map(s=>s.id)]);
  if(testimony.some(s=>reserved.has(s.id))||new Set(sources.map(s=>s.id)).size!==sources.length)throw Error('Duplicate or reserved source identity');
  const ids=new Set(sources.map(s=>s.id));
  for(const section of Object.values(order.briefing||{}))for(const note of section){if(reserved.has(note.source.id)||reserved.has(note.id))throw Error('Reserved briefing source identity');ids.add(note.source.id);ids.add(note.id);}
  for(const h of order.history){if(reserved.has(h.id))throw Error('Reserved history source identity');ids.add(h.id);}
  if(order.customerContact){if(reserved.has(order.customerContact.source.id))throw Error('Reserved contact source identity');ids.add(order.customerContact.source.id);}
  const asOf={date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),timeZone:'America/Chicago'};
  const packet={jobId:order.id,asOf,sources,recentConversation:history.map(t=>({question:t.question,reply:t.reply})),currentMessage:input.text};
  const request={model:MODEL,instructions:conversationRules+'\n'+(communicationStyle==='direct'?'Style: direct, clear and friendly; skip banter.':'Style: relaxed, capable and concise; respond to invited humor briefly.'),input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(packet)}]}],max_output_tokens:1400,reasoning:{effort:reasoningEffort},stream:false,store:false};
  if(JSON.stringify(request).length>100000)throw Error('Conversation packet exceeds limit');
  return {order,request,ids,testimony,companySources,equipmentSources,customerHistory};
}
export function validateConversation(value,{order,ids,testimony=[]}){
  if(!value||value.version!=='carryforward.conversation.v1'||value.jobId!==order.id||!['question','report','clarify'].includes(value.intent)||!text(value.reply,1600)||!Array.isArray(value.sourceIds)||value.sourceIds.length>12||value.sourceIds.some(id=>typeof id!=='string'||!ids.has(id)))throw Error('Invalid conversation reply or source citation');
  if(value.correctsSourceId!=null&&(value.intent!=='report'||!testimony.some(s=>s.id===value.correctsSourceId)))throw Error('Invalid correction target');
  return {correctsSourceId:value.correctsSourceId||null,version:value.version,jobId:order.id,intent:value.intent,reply:value.reply.trim(),sourceIds:[...new Set(value.sourceIds)]};
}
export async function converseWithMeta(input,{token,fetchImpl=fetch,reasoningEffort='low',companyContext=null}={}){
  if(!token)throw Error('Guarded Meta conversation is disabled');
  const prepared=prepareConversation(input,{reasoningEffort,companyContext}),started=Date.now();
  const response=await fetchImpl('http://127.0.0.1:4421/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(prepared.request),signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`Meta conversation refused (${response.status}). Your voice note stays saved; no automatic retry was made.`);
  const raw=await response.json();
  if(raw.status!=='completed')throw Error('Meta reply was incomplete; no field report was added');
  const output=(raw.output||[]).filter(v=>v.type==='message').flatMap(v=>v.content||[]).filter(v=>v.type==='output_text').map(v=>v.text).join('');
  if(output.length>16000)throw Error('Conversation output exceeds limit');
  let parsed;try{parsed=JSON.parse(output);}catch{throw Error('Meta reply was unreadable; no field report was added');}
  const answer=validateConversation(parsed,prepared),usage=raw.usage;
  if(!Number.isInteger(usage?.input_tokens)||!Number.isInteger(usage?.output_tokens))throw Error('Conversation usage accounting missing');
  answer.provenance={model:MODEL,reasoningEffort,responseId:raw.id,latencyMs:Date.now()-started,usage,companyContext:companyContext?{title:companyContext.title,revision:companyContext.revision,sourceRevision:companyContext.sourceRevision,sha256:companyContext.sha256,selectedSourceIds:prepared.companySources.map(s=>s.id),citedSections:prepared.companySources.filter(s=>answer.sourceIds.includes(s.id)).map(({text,...metadata})=>metadata)}:null,jobContext:{customerHistorySourceIds:prepared.customerHistory.map(s=>s.id),equipmentReferences:prepared.equipmentSources.map(({text,...metadata})=>metadata)}};return answer;
}

// Fast reads quote explicit assignment facts. They are labeled separately from
// actual Meta reasoning; any ambiguity retains the full grounded model route.
export async function answerConversation(input,options={}){
  const prepared=prepareConversation(input,{companyContext:options.companyContext,reasoningEffort:options.reasoningEffort||'minimal'});
  const direct=directAssignmentAnswer({...input,order:prepared.order});
  return direct||converseWithMeta(input,options);
}
