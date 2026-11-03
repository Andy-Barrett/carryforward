import {createInvestigation,reduceInvestigation,validateInterpretation} from '../public/investigation.js';
import {MODEL} from './meta-review.mjs';
import {spokenReportReply} from '../public/visit-flow.js';

// Preview only: question classification must never commit technician testimony.
// The client saves the same turn, then independently validates the proposal against
// the actual saved revision. No image/audio bytes enter this text review.
export function prepareSpokenReview(order,input,correctsSourceId=null){
  if(!Array.isArray(input.events)||input.events.length>498)throw Error('Invalid bounded report history');
  const pending=input.pendingReport;
  if(!pending||pending.text!==input.text||typeof pending.id!=='string'||pending.id!==input.turnId||!pending.audio||pending.audio.kind!=='audio')throw Error('Invalid pending spoken report');
  let state=createInvestigation(order);
  for(const event of input.events)state=reduceInvestigation(state,event);
  const prior=correctsSourceId&&state.sources[correctsSourceId];
  if(correctsSourceId&&(!prior||prior.kind!=='testimony'||prior.excluded||prior.supersededBy))throw Error('Invalid correction target');
  const append=(type,payload)=>{state=reduceInvestigation(state,{id:'preview-'+type+'-'+pending.id,jobId:order.id,seq:state.seq+1,type,payload});};
  const audio=pending.audio;
  if(state.sources[audio.id]){
    const saved=state.sources[audio.id];
    if(saved.kind!=='audio'||saved.sha256!==audio.sha256||saved.wavSha256!==audio.wavSha256||saved.excluded)throw Error('Conflicting spoken audio source');
  }else append('source.added',audio);
  append('turn.recorded',{id:pending.id,text:pending.text,branchId:prior?.branchId||state.activeQuestion?.branchId||null,amends:correctsSourceId,audioId:audio.id,transcription:pending.transcription});
  return state;
}
export function acceptSpokenReview(order,input,proposal,correctsSourceId,decisions=[]){
  const state=prepareSpokenReview(order,input,correctsSourceId);
  const accepted=validateInterpretation(state,proposal&&{...proposal,model:MODEL});
  for(const item of [...accepted.observations,...accepted.changes])for(const id of item.sourceIds){
    if(state.sources[id].kind==='photo')throw Error('No image bytes were included in this spoken turn');
  }
  let next=reduceInvestigation(state,{id:'preview-review-'+input.turnId,jobId:order.id,seq:state.seq+1,type:'interpretation.received',payload:accepted});
  if(!Array.isArray(decisions)||decisions.length>order.checks.length)throw Error('Invalid bounded follow-up decisions');
  const seen=new Set(),responses=[];
  for(const decision of decisions){
    if(!decision||seen.has(decision.branchId))throw Error('Duplicate follow-up decision');
    seen.add(decision.branchId);
    const payload={branchId:decision.branchId,action:decision.action,owner:decision.owner,reason:decision.reason,sourceId:input.pendingReport.id,quote:decision.quote};
    next=reduceInvestigation(next,{id:'preview-decision-'+decision.branchId+'-'+input.turnId,jobId:order.id,seq:next.seq+1,type:'branch.response',payload});
    responses.push(payload);
  }
  return {proposal:accepted,decisions:responses,reply:spokenReportReply(order,next)};
}
export function spokenReviewContext(state){
  return {jobId:state.jobId,baseRevision:state.inputRevision,
    sources:Object.fromEntries(Object.entries(state.sources).map(([id,source])=>[id,{...source,visualIncluded:false}])),
    branches:state.branches,observations:state.observations,questionHistory:state.questions,followups:state.followups};
}
