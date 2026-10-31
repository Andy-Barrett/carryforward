import test from 'node:test';
import assert from 'node:assert/strict';
import {demoOrder,validateOrder} from './public/engine.js';
import {buildVisitBrief} from './public/visit-brief.js';
import {createJobContext,routeJobCommand} from './public/job-context.js';
import {prepareReview,reviewWithMeta} from './lib/meta-review.mjs';

test('opening brief preserves supplied context, planning labels, source revisions, scope and dated history',()=>{
  const order=validateOrder(demoOrder), brief=buildVisitBrief(order);
  assert.equal(brief.sections.length,7);
  assert.deepEqual(brief.sections.find(s=>s.key==='access').notes,order.briefing.access);
  assert.match(brief.spoken,/Planning idea · not a diagnosis/);
  assert.match(brief.spoken,/gate/i);
  assert.match(brief.spoken,/2026-10-24/);
  assert.match(brief.spoken,/warranty registration/);
  assert.match(brief.spoken,/Ladder need, access plan/);
  brief.sections[0].notes[0].source.revision='changed';
  assert.equal(order.briefing.system[0].source.revision,'DEMO-1');
});

test('legacy brief states missing preferences, access and equipment explicitly without fabricating a diagnosis',()=>{
  const order=structuredClone(demoOrder);delete order.briefing;
  const brief=buildVisitBrief(order);
  for(const key of ['system','customer','access','troubleshooting','safety','ladder']) {
    assert.equal(brief.sections.find(s=>s.key===key).needsContext,true);
    assert.match(brief.sections.find(s=>s.key===key).missing,/not supplied|not attached|not established/);
  }
  assert.equal(brief.sections.find(s=>s.key==='problem').notes[0].text,order.reportedIssue);
  assert.ok(!brief.spoken.includes('No gate'));
});

test('unapproved safety references are not read aloud as rules and cannot grant procedure authority',()=>{
  const order=structuredClone(demoOrder);
  order.briefing.safety[0].text='UNTRUSTED SAFETY INSTRUCTION';
  order.briefing.ladder[0].text='UNTRUSTED LADDER INSTRUCTION';
  const brief=buildVisitBrief(order);
  assert.ok(!brief.spoken.includes('UNTRUSTED'));
  assert.equal(brief.sections.find(s=>s.key==='safety').needsContext,true);
  assert.equal(brief.sections.find(s=>s.key==='ladder').needsContext,true);
  assert.equal(routeJobCommand('what was the warning before I remove the cover',createJobContext(order)).kind,'unavailable');
});

test('recalled briefing retains the same sourced context without admitting it as field evidence',()=>{
  const order=validateOrder(demoOrder),context=createJobContext(order);
  for(const request of ['brief me','repeat the brief','show me the briefing']) {
    const result=routeJobCommand(request,context);
    assert.equal(result.kind,'briefing');
    assert.match(result.message,/gate/i);
    assert.match(result.message,/Planning idea/);
    assert.match(result.message,/Ladder need/);
    assert.equal(result.context.lastWarningId,null);
  }
  assert.throws(()=>prepareReview({order,events:[],photos:[]}),/Save an answer or photo/);
});

test('Meta receives briefing context but cannot close work using a briefing-only source ID',async()=>{
  const order=validateOrder(demoOrder);
  const events=[{id:'turn-event',jobId:order.id,seq:1,type:'turn.recorded',payload:{id:'field-answer',text:'Fictional visit has not established production.'}}];
  const input={order,events,photos:[]},prepared=prepareReview(input);
  const packet=JSON.parse(prepared.request.input[0].content[0].text);
  assert.deepEqual(packet.order.briefing,order.briefing);
  assert.ok(!Object.hasOwn(packet.sources,'demo-system'));
  const proposal={version:'carryforward.interpretation.v1',jobId:order.id,baseRevision:1,model:'fixture',observations:[],changes:[{branchId:'repair',state:'supported',sourceIds:['demo-system'],reason:'Unsupported fixture claim'}],nextQuestion:null};
  await assert.rejects(reviewWithMeta(input,{token:'fixture',fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(proposal)}]}]}))}),/Unknown.*source/);
});
