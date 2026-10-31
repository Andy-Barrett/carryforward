import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvestigation, reduceInvestigation, interviewHandoff, INTERPRETATION_VERSION } from './public/investigation.js';
const order = { id: 'job-1', checks: [{ id:'repair', question:'Repair?' }, { id:'monitoring', question:'Monitoring?' }] };
const event = (s, type, payload) => ({ id:`event-${s.seq+1}`, jobId:s.jobId, seq:s.seq+1, type, payload });
const apply = (s, type, p) => reduceInvestigation(s,event(s,type,p));
const source = (s,id) => apply(s,'source.added',{id, kind:'testimony', text:'Technician observation'});
const proposal = (s, changes=[], observations=[], nextQuestion=null) => ({version:INTERPRETATION_VERSION,jobId:s.jobId,baseRevision:s.inputRevision,model:'synthetic-fixture-not-live',changes,observations,nextQuestion});
const change = (branchId,state,sourceIds) => ({branchId,state,sourceIds,reason:'New technician evidence'});

test('new photo reopens only its affected branch and cannot imply monitoring from repair',()=>{
 let s=source(createInvestigation(order),'t1');
 s=apply(s,'interpretation.received',proposal(s,[change('repair','supported',['t1'])]));
 s=apply(s,'source.added',{id:'photo1',kind:'photo',sha256:'a'.repeat(64)});
 s=apply(s,'interpretation.received',proposal(s,[change('monitoring','needs_verification',['photo1'])],[],{branchId:'monitoring',text:'Was this after replacement?'}));
 assert.equal(s.branches.repair.state,'supported'); assert.equal(s.branches.monitoring.state,'needs_verification');
 assert.equal(s.activeQuestion.branchId,'monitoring');
});
test('corrections retain original claim and source provenance',()=>{
 let s=source(createInvestigation(order),'t1');
 s=apply(s,'interpretation.received',proposal(s,[],[{id:'o1',claim:'4.2 kW',sourceIds:['t1']}]));
 s=source(s,'t2');
 s=apply(s,'interpretation.received',proposal(s,[],[{id:'o2',claim:'2.4 kW',sourceIds:['t2'],supersedes:'o1'}]));
 assert.equal(s.observations[0].claim,'4.2 kW'); assert.equal(s.observations[0].supersededBy,'o2');
 assert.equal(s.observations[1].origin,'model_interpretation');
});
test('stale results, cross-job sources, malformed output and evidence-free reopening fail closed',()=>{
 let s=source(createInvestigation(order),'t1'); const old=proposal(s);
 s=source(s,'t2');
 assert.throws(()=>apply(s,'interpretation.received',old),/Stale/);
 assert.throws(()=>apply(s,'interpretation.received',proposal(s,[change('repair','supported',['other-job-photo'])])),/wrong-job/);
 assert.throws(()=>apply(s,'interpretation.received',{...proposal(s),observations:{}}),/Unbounded/);
 s=apply(s,'interpretation.received',proposal(s,[change('repair','supported',['t1'])]));
 assert.throws(()=>apply(s,'interpretation.received',proposal(s,[change('repair','open',['t1'])])),/new material/);
});
test('human deferral preserves owner and cannot be silently reopened by model',()=>{
 let s=source(createInvestigation(order),'t1');
 s=apply(s,'branch.response',{branchId:'monitoring',action:'later',reason:'Office must check connection',owner:'Operations'});
 assert.equal(s.branches.monitoring.owner,'Operations');
 assert.throws(()=>apply(s,'interpretation.received',proposal(s,[change('monitoring','supported',['t1'])])),/human reopening/);
 s=apply(s,'branch.response',{branchId:'monitoring',action:'reopen',reason:'Tech can check now'});
 assert.equal(s.branches.monitoring.state,'open');
});
test('equivalent questions are suppressed even if wording changes; explicit reopening allows retry',()=>{
 let s=source(createInvestigation(order),'t1');
 s=apply(s,'interpretation.received',proposal(s,[],[],{branchId:'repair',text:'What work did you do?'}));
 s=apply(s,'branch.response',{branchId:'repair',action:'already_answered',sourceIds:['t1'],reason:'See my first answer'});
 s=apply(s,'interpretation.received',proposal(s,[],[],{branchId:'repair',text:'Tell me about the work?'}));
 assert.equal(s.activeQuestion,null); assert.equal(s.questions.length,1);
 s=apply(s,'branch.response',{branchId:'repair',action:'reopen',reason:'I have a correction'});
 s=apply(s,'interpretation.received',proposal(s,[],[],{branchId:'repair',text:'What changed?'}));
 assert.equal(s.questions.length,2);
});
test('duplicate retries are idempotent, conflicting IDs and out-of-order events rejected',()=>{
 const s=createInvestigation(order), e=event(s,'source.added',{id:'t1',kind:'testimony',text:'Repair complete'});
 const next=reduceInvestigation(s,e); assert.strictEqual(reduceInvestigation(next,e),next);
 assert.throws(()=>reduceInvestigation(next,{...e,payload:{...e.payload,text:'Different'}}),/Conflicting/);
 assert.throws(()=>reduceInvestigation(next,{...e,id:'other',seq:4}),/Out-of-order/);
 assert.equal(s.seq,0); assert.equal(Object.keys(s.sources).length,0);
});
test('excluded support reopens verification without erasing historical observations',()=>{
 let s=source(createInvestigation(order),'t1');
 s=apply(s,'interpretation.received',proposal(s,[change('repair','supported',['t1'])],[{id:'o1',claim:'Repair reported',sourceIds:['t1']}]));
 s=apply(s,'source.excluded',{id:'t1'});
 assert.equal(s.branches.repair.state,'needs_verification'); assert.equal(s.observations.length,1);
 assert.throws(()=>apply(s,'interpretation.received',proposal(s,[change('repair','supported',['t1'])])),/excluded/);
});
test('three-question pass ceiling leaves remaining work open until explicit continuation',()=>{
 const wide={id:'job-1',checks:['a','b','c','d'].map(id=>({id,question:id}))};
 let s=source(createInvestigation(wide),'t1');
 for (const branchId of ['a','b','c','d']) {
   s=apply(s,'interpretation.received',proposal(s,[],[],{branchId,text:'Please clarify '+branchId}));
   if(branchId!=='d') s=apply(s,'branch.response',{branchId,action:'later',reason:'Office follow-up'});
 }
 assert.equal(s.questions.length,3); assert.equal(s.activeQuestion,null); assert.equal(s.branches.d.state,'open');
 s=apply(s,'review.continue',{});
 s=apply(s,'interpretation.received',proposal(s,[],[],{branchId:'d',text:'Can we check d now?'}));
 assert.equal(s.activeQuestion.branchId,'d');
});
test('saved interview answers remain testimony and corrections invalidate referenced support',()=>{
 let s=createInvestigation(order);
 s=apply(s,'question.offered',{branchId:'repair',text:'What work did you do?'});
 s=apply(s,'turn.recorded',{id:'answer1',branchId:'repair',text:'Replaced inverter.'});
 assert.equal(s.branches.repair.state,'needs_verification'); assert.equal(s.sources.answer1.kind,'testimony');
 s=apply(s,'interpretation.received',proposal(s,[change('repair','supported',['answer1'])]));
 s=apply(s,'turn.recorded',{id:'answer2',branchId:'repair',text:'Correction: only inspected it.',supersedes:'answer1'});
 assert.equal(s.sources.answer1.supersededBy,'answer2'); assert.equal(s.branches.repair.state,'needs_verification');
 assert.throws(()=>apply(s,'interpretation.received',proposal(s,[change('repair','supported',['answer1'])])),/source/);
});
test('fallback interview cannot offer a second simultaneous or equivalent question',()=>{
 let s=createInvestigation(order);
 s=apply(s,'question.offered',{branchId:'repair',text:'What happened?'});
 assert.throws(()=>apply(s,'question.offered',{branchId:'monitoring',text:'Online?'}),/policy/);
 s=apply(s,'turn.recorded',{id:'a1',text:'Inspected it.',branchId:'repair'});
 assert.throws(()=>apply(s,'question.offered',{branchId:'repair',text:'Tell me what happened?'}),/Equivalent/);
});
test('correction to another answer does not dismiss an unrelated active question',()=>{
 let s=createInvestigation(order);
 s=apply(s,'turn.recorded',{id:'initial',text:'Inspected inverter.',branchId:'repair'});
 s=apply(s,'question.offered',{branchId:'monitoring',text:'Is monitoring live?'});
 s=apply(s,'turn.recorded',{id:'correction',text:'Replaced inverter.',branchId:'repair',supersedes:'initial'});
 assert.equal(s.activeQuestion.branchId,'monitoring');
});
test('new testimony requires reconciliation; deferral alone does not make a completed review stale',()=>{
 let s=source(createInvestigation(order),'t1');
 s=apply(s,'interpretation.received',proposal(s,[change('repair','supported',['t1'])]));assert.equal(s.reviewRequired,false);
 s=apply(s,'branch.response',{branchId:'monitoring',action:'later',reason:'Office follow-up'});assert.equal(s.reviewRequired,false);
 s=apply(s,'turn.recorded',{id:'new-answer',text:'New observation changes the situation.'});assert.equal(s.reviewRequired,true);
});

 test('compound model questions are rejected and handoff accurately labels interpretation provenance',()=>{
 let s=source(createInvestigation(order),'t1');
 assert.match(interviewHandoff(s).mode,/no model interpretation/);
 assert.throws(()=>apply(s,'interpretation.received',proposal(s,[],[],{branchId:'repair',text:'Was it replaced? Can you measure output?'})),/Only one question/);
 s=apply(s,'interpretation.received',proposal(s,[change('repair','supported',['t1'])]));
 assert.match(interviewHandoff(s).mode,/source-linked model interpretations/);
 assert.doesNotMatch(interviewHandoff(s).mode,/no model interpretation/);
 });
