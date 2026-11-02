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
