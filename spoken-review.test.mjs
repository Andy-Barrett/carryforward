import test from 'node:test';
import assert from 'node:assert/strict';
import {converseWithMeta,prepareConversation} from './lib/meta-conversation.mjs';
import {prepareSpokenReview,acceptSpokenReview} from './lib/spoken-review.mjs';
import {createInvestigation,reduceInvestigation} from './public/investigation.js';
import {spokenReportReply} from './public/visit-flow.js';
import {detailedDemoOrder as order} from './public/demo-work-orders.js';
const text='Before any work the display showed 4.2 kW. Monitoring is live. No replacement was done. Operations owes a warranty update.';
const pendingReport={id:'turn-clip',text,audio:{id:'clip',kind:'audio',sha256:'a'.repeat(64),wavSha256:'b'.repeat(64),name:'Fictional clip'},transcription:{rawText:text,reviewed:false,submission:'hold_release',provenance:{model:'muse-voice-transcribe-1.0',inputSha256:'b'.repeat(64),complete:true}}};
const input={order,text,events:[],pendingReport,turnId:pendingReport.id,testimony:[]};
const proposal={version:'carryforward.interpretation.v1',jobId:order.id,model:'muse-spark-1.3',baseRevision:2,observations:[{id:'pre-work-output',claim:'Technician-reported 4.2 kW before work.',sourceIds:[pendingReport.id]}],changes:[{branchId:'production',state:'needs_verification',sourceIds:[pendingReport.id],reason:'Only pre-work output supplied.'},{branchId:'warranty',state:'needs_verification',sourceIds:[pendingReport.id],reason:'Warranty update still owed.',owner:'Operations'},{branchId:'monitoring',state:'supported',sourceIds:[pendingReport.id],reason:'Technician reported live.'}],acknowledgement:'Got your update.',nextQuestion:{branchId:'production',text:'Can you obtain a current reading?'}};
const report={version:'carryforward.conversation.v1',jobId:order.id,intent:'report',reply:'Got it.',sourceIds:[pendingReport.id],correctsSourceId:null,proposal};
const response=value=>new Response(JSON.stringify({id:'fixture-only',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:100,output_tokens:100}}));

test('one guarded response classifies a report, validates its interpretation and names the open owner',async()=>{
 let calls=0;
 const result=await converseWithMeta(input,{token:'fixture-only',reasoningEffort:'minimal',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:4421/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.reasoning.effort,'minimal');assert.match(body.instructions,/top-level response MUST use carryforward.conversation.v1/);return response(report);}});
 assert.equal(calls,1);assert.equal(result.proposal.baseRevision,2);assert.equal(result.proposal.provenance.mode,'single_spoken_turn');
 assert.match(result.reportReply,/Still open:/);assert.match(result.reportReply,/with Operations/);assert.match(result.reportReply,/current reading/);assert.doesNotMatch(result.reportReply,/delivered|accepted/);
 // Replaying the actual save also validates; the preview itself has no mutation.
 assert.deepEqual(input.events,[]);const state=prepareSpokenReview(order,input);assert.equal(state.sources['turn-clip'].transcription.reviewed,false);
 const saved=reduceInvestigation(state,{id:'actual-review',jobId:order.id,seq:3,type:'interpretation.received',payload:result.proposal});assert.equal(saved.branches.warranty.state,'needs_verification');assert.equal(saved.branches.warranty.owner,'Operations');assert.equal(saved.branches.monitoring.state,'supported');assert.equal(spokenReportReply(order,saved),result.reportReply);
});

test('question and clarification never return a report interpretation or cite the provisional turn',async()=>{
 for(const intent of ['question','clarify']){
  const question={...report,intent,reply:'What did you mean?',sourceIds:[],proposal:undefined};
  const result=await converseWithMeta(input,{token:'fixture-only',fetchImpl:async()=>response(question)});assert.equal(result.proposal,undefined);assert.equal(result.reportReply,undefined);
  await assert.rejects(converseWithMeta(input,{token:'fixture-only',fetchImpl:async()=>response({...question,proposal})}),/cannot apply/);
  await assert.rejects(converseWithMeta(input,{token:'fixture-only',fetchImpl:async()=>response({...question,sourceIds:[pendingReport.id]})}),/provisional testimony/);
 }
});

test('invalid or omitted interpretations keep a clear report saveable without automatic review retry',async()=>{
 for(const bad of [undefined,{...proposal,baseRevision:0},{...proposal,jobId:'OTHER'},{...proposal,changes:[{...proposal.changes[0],sourceIds:['foreign']}]}]){
  let calls=0;const result=await converseWithMeta(input,{token:'fixture-only',fetchImpl:async()=>{calls++;return response({...report,proposal:bad});}});
  assert.equal(calls,1);assert.equal(result.intent,'report');assert.ok(result.reviewError);assert.equal(result.proposal,undefined);assert.equal(result.reportReply,undefined);
 }
});

test('wrong-job history and invalid raw transcript binding fail before any model request',()=>{
 const wrong={id:'e',jobId:'OTHER',seq:1,type:'turn.recorded',payload:{id:'x',text:'Foreign record'}};
 assert.throws(()=>prepareConversation({...input,events:[wrong]}),/event identity/);
 assert.throws(()=>prepareConversation({...input,pendingReport:{...pendingReport,text:'Changed transcript'}}),/pending/);
 assert.throws(()=>prepareConversation({...input,pendingReport:{...pendingReport,transcription:{...pendingReport.transcription,provenance:{...pendingReport.transcription.provenance,inputSha256:'c'.repeat(64)}}}}),/Transcript/);
});

test('unselected image bytes cannot acquire a visual interpretation through the spoken shortcut',()=>{
 const event={id:'photo-event',jobId:order.id,seq:1,type:'source.added',payload:{id:'photo',kind:'photo',sha256:'d'.repeat(64)}};
 const withPhoto={...input,events:[event]};
 const context=JSON.parse(prepareConversation(withPhoto).request.input[0].content[0].text);assert.equal(context.reportReview.sources.photo.visualIncluded,false);
 assert.throws(()=>acceptSpokenReview(order,withPhoto,{...proposal,baseRevision:3,observations:[{id:'fake-visual',claim:'Photo shows a reading.',sourceIds:['photo']}]},null),/No image bytes/);
});

test('the one-pass route respects human deferral and validates corrections against active testimony',()=>{
 const initial=createInvestigation(order);
 const saved=reduceInvestigation(initial,{id:'old',jobId:order.id,seq:1,type:'turn.recorded',payload:{id:'old-reading',text:'Output was 4.2 kW.'}});
 const follow=reduceInvestigation(saved,{id:'defer',jobId:order.id,seq:2,type:'branch.response',payload:{branchId:'production',action:'later',owner:'Operations',reason:'Not obtainable now.'}});
 const next={...input,events:follow.events};
 assert.throws(()=>acceptSpokenReview(order,next,{...proposal,baseRevision:4},null),/Deferred branch/);
 assert.throws(()=>prepareSpokenReview(order,next,'unknown'),/correction target/);
 const corrected=prepareSpokenReview(order,next,'old-reading');assert.equal(corrected.sources['old-reading'].supersededBy,'turn-clip');assert.equal(corrected.branches.production.state,'deferred');
});

import {timingSummary} from './public/turn-timing.js';
test('timing labels distinguish the combined evidence review from a question-only answer',()=>{
 assert.match(timingSummary({points:{classificationStarted:100,classificationReady:1000,combinedReviewReady:1001}}),/review included in answer/);
 assert.match(timingSummary({points:{classificationStarted:100,classificationReady:1000}}),/review not needed/);
});
