export function scoreStructured(fixture,state,proposal){
 const unsupported=[],missed=[],ownerMisses=[];
 for(const [id,expected] of Object.entries(fixture.expected.supported)){
  if(!expected&&state.branches[id].state==='supported')unsupported.push(id);
  if(expected&&state.branches[id].state!=='supported')missed.push(id);
 }
 for(const [id,owner] of Object.entries(fixture.expected.owner||{})){
  const actual=String(state.branches[id].owner||'').trim().toLowerCase();
  const accepted=owner==='Operations'?['operations','office']: [owner.toLowerCase()];
  if(!accepted.includes(actual))ownerMisses.push(id);
 }
 const shown=state.activeQuestion?.branchId||null,proposed=proposal.nextQuestion?.branchId||null;
 const unnecessaryShown=fixture.expected.question==='none'&&shown!==null||(fixture.expected.forbiddenQuestions||[]).includes(shown);
 const unnecessaryProposed=fixture.expected.question==='none'&&proposed!==null||(fixture.expected.forbiddenQuestions||[]).includes(proposed);
 const missedQuestion=fixture.expected.question==='production'&&shown!=='production';
 const deferredMisses=(fixture.expected.deferred||[]).filter(id=>state.branches[id].state!=='deferred');
 return {unsupportedSupportedOutcomes:unsupported,missedSupportedOutcomes:missed,ownerMisses,deferredMisses,shownQuestion:shown,proposedQuestion:proposed,unnecessaryShown,unnecessaryProposed,missedQuestion,
   // Text matching is a review aid, not a semantic correctness verdict.
   imageDetailMentioned:fixture.expected.imageReading?proposal.observations.some(o=>o.claim.includes(fixture.expected.imageReading)):null,
   imageSystemMentioned:fixture.expected.imageSystem?proposal.observations.some(o=>o.claim.includes(fixture.expected.imageSystem)):null};
}
export function tokenCostEstimate(usage){
 if(!usage)return null;
 const cached=usage.input_tokens_details?.cached_tokens||0;
 return ((usage.input_tokens-cached)*1.25+cached*0.15+usage.output_tokens*4.25)/1000000;
}
