import test from 'node:test';
import assert from 'node:assert/strict';
import {visitStage,finalVisitUpdate} from './public/visit-flow.js';
import {createInvestigation,reduceInvestigation} from './public/investigation.js';
import {demoOrder} from './public/engine.js';
import {createJobContext,routeJobCommand} from './public/job-context.js';

test('work-order questions use current job sources and never invent missing access',()=>{
 const answer=routeJobCommand('What is the customer gate code?',createJobContext(demoOrder));
 assert.equal(answer.kind,'answer');assert.match(answer.message,/2468#/);assert.deepEqual(answer.sourceIds,['DEMO-ACCESS-017']);
 const other={...demoOrder,id:'other',briefing:{}};
 assert.equal(routeJobCommand('What is the gate code?',createJobContext(other)).kind,'unavailable');
 assert.ok(!routeJobCommand('What is the gate code?',createJobContext(other)).message.includes('2468'));
 assert.equal(routeJobCommand('How do I disconnect this inverter?',createJobContext(demoOrder)).kind,'unavailable');
 assert.equal(routeJobCommand('Where is the spare key?',createJobContext(demoOrder)).kind,'unavailable');
 assert.equal(routeJobCommand('I replaced the inverter.',createJobContext(demoOrder)).kind,'not_command');
});

test('final update preserves original testimony, unknown outcomes and explicit ownership',()=>{
 let state=createInvestigation(demoOrder);
 state=reduceInvestigation(state,{id:'e1',jobId:demoOrder.id,seq:1,type:'turn.recorded',payload:{id:'t1',text:'Replaced the inverter. Monitoring not checked.'}});
 state=reduceInvestigation(state,{id:'e2',jobId:demoOrder.id,seq:2,type:'branches.owner-assigned',payload:{branchIds:demoOrder.checks.map(check=>check.id),owner:'Operations'}});
 const update=finalVisitUpdate(demoOrder,state);assert.equal(update.hasReport,true);assert.equal(update.notes[0].text,'Replaced the inverter. Monitoring not checked.');
 assert.ok(update.checks.every(check=>!check.reported));assert.ok(update.checks.every(check=>check.status==='Follow-up open'));assert.ok(update.checks.every(check=>check.owner==='Operations'));
 assert.match(update.confirmation,/confirmation on the review screen/);assert.throws(()=>finalVisitUpdate({...demoOrder,id:'another'},state),/another job/);
 const empty=finalVisitUpdate(demoOrder,createInvestigation(demoOrder));assert.equal(empty.hasReport,false);
 assert.equal(visitStage('nonsense').id,'brief');assert.equal(visitStage('onsite').id,'onsite');
});


import {spokenVisitSummary} from './public/visit-flow.js';
test('final readout uses current findings, retains raw correction history and omits superseded claims',()=>{
 let state=createInvestigation(demoOrder);
 const append=(type,payload)=>state=reduceInvestigation(state,{id:'summary-'+(state.seq+1),jobId:demoOrder.id,seq:state.seq+1,type,payload});
 append('turn.recorded',{id:'old',text:'uh display 4.2. monitoring is live.'});
 append('interpretation.received',{version:'carryforward.interpretation.v1',jobId:demoOrder.id,baseRevision:state.inputRevision,model:'fixture',observations:[{id:'old-reading',claim:'Technician-reported pre-work output 4.2 kW.',sourceIds:['old']},{id:'monitoring-live',claim:'Technician-reported monitoring is live.',sourceIds:['old']}],changes:[],nextQuestion:null});
 append('turn.recorded',{id:'correction',amends:'old',text:'uh correction 2.4 2.4 before work.'});
 append('interpretation.received',{version:'carryforward.interpretation.v1',jobId:demoOrder.id,baseRevision:state.inputRevision,model:'fixture',observations:[{id:'new-reading',claim:'Technician-reported pre-work output 2.4 kW.',sourceIds:['correction'],supersedes:'old-reading'}],changes:[],nextQuestion:null});
 const update=finalVisitUpdate(demoOrder,state),spoken=spokenVisitSummary(demoOrder,state);
 assert.equal(update.findings[0].id,'new-reading');assert.equal(update.findings.length,2);assert.match(update.notes[0].text,/4.2/);assert.match(update.notes[1].text,/2.4 2.4/);
 assert.match(spoken,/2.4 kW/);assert.match(spoken,/monitoring is live/);assert.doesNotMatch(spoken,/4.2|uh|2.4 2.4/);assert.match(spoken,/has not been delivered/);
 append('source.excluded',{id:'correction'});assert.equal(finalVisitUpdate(demoOrder,state).findings.length,0);assert.doesNotMatch(spokenVisitSummary(demoOrder,state),/2.4/);assert.match(spokenVisitSummary(demoOrder,state),/review is still pending/);
});

test('final summary refuses to present unknown or excluded sources as current findings',()=>{
 const state=createInvestigation(demoOrder);state.sources.old={id:'old',kind:'testimony',text:'Old untrusted claim',excluded:true};state.sources.live={id:'live',kind:'testimony',text:'Current report',excluded:false};
 state.observations=[{id:'unknown',claim:'No valid source',sourceIds:['foreign']},{id:'excluded',claim:'Excluded claim',sourceIds:['old']},{id:'valid',claim:'Technician-reported current report.',sourceIds:['live']}];
 assert.deepEqual(finalVisitUpdate(demoOrder,state).findings.map(f=>f.id),['valid']);assert.equal(finalVisitUpdate(demoOrder,state).notes.length,1);
 state.reviewRequired=true;assert.deepEqual(finalVisitUpdate(demoOrder,state).findings,[]);assert.match(spokenVisitSummary(demoOrder,state),/review is still pending/);
});
