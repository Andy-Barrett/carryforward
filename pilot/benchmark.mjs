import {performance} from 'node:perf_hooks';
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createTurnTiming} from '../public/turn-timing.js';
import {encodeMonoWav} from '../public/audio.js';
import {createInvestigation,reduceInvestigation} from '../public/investigation.js';
import {demoOrder} from '../public/engine.js';
import {createDocumentLibrary} from './documents.mjs';
import {registerManufacturerFixture,MATCHED_EQUIPMENT} from './manual-fixture.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const round=x=>Number(x.toFixed(3));
export const FACTUAL_INPUTS=Object.freeze([
 'Where is S_OK shown under Server Comm in Status?',
 'Where is Verifying the Connection?',
 'Where is the RS485 Bus Configuration section?',
 'Where is the SetApp Commissioning Status screen described?',
 'What does the green inverter LED indicate?',
 'Where are the inverter identification details?',
 'What information is requested for support contact?',
 'Where are the communication options described?',
 'Where are transport and storage covered?',
 'Where are the technical specifications for SE7600H-US?',
]);
export const REPORT_INPUTS=Object.freeze([
 'Correction: the pre-work reading was 2.4 kW, not 4.2. Leave production and warranty with Operations.',
 'The display showed 2.4 kW before work. The earlier 4.2 was incorrect. Leave production and warranty with Operations.',
 'Change only the pre-work reading to 2.4 kW. Monitoring is still reported live; no replacement. Leave production and warranty with Operations.',
 'Pre-work output was 2.4 kW, correcting my earlier 4.2. Post-work production is unverified. Leave production and warranty with Operations.',
 'For the report, correct 4.2 to 2.4 kW before work. Keep monitoring and no replacement unchanged. Leave production and warranty with Operations.',
]);
export function stageDurations(timing) {
 const p=timing.points??{},span=(a,b)=>Number.isFinite(p[a])&&Number.isFinite(p[b])?round(p[b]-p[a]):null;
 return {localSaveMs:span('release','localSaved'),asrMs:span('asrStarted','asrReady'),retrievalMs:span('retrievalStarted','retrievalReady'),classificationMs:span('classificationStarted','classificationReady'),reviewMs:span('reviewStarted','reviewReady'),validatedStateMs:span('stateValidationStarted','validatedAnswer'),releaseToFirstPlayableMs:span('release','firstPlayable'),playbackMs:span('firstPlayable','completed'),releaseToCompletedMs:span('release','completed')};
}
function reportBase(id) {
 const order={...structuredClone(demoOrder),id};let state=createInvestigation(order);
 const append=(type,payload)=>{state=reduceInvestigation(state,{id:`event-${state.seq+1}`,jobId:id,seq:state.seq+1,type,payload});};
 append('turn.recorded',{id:'original-report',text:'Before work the display was 4.2 kW. Monitoring reported live. No replacement was performed.'});
 append('interpretation.received',{version:'carryforward.interpretation.v1',jobId:id,baseRevision:state.inputRevision,model:'fixture-baseline-not-live',observations:[{id:'original-reading',claim:'Technician-reported 4.2 kW before work.',sourceIds:['original-report']},{id:'unchanged-monitoring',claim:'Technician reported monitoring live.',sourceIds:['original-report']},{id:'unchanged-repair',claim:'Technician reported no replacement.',sourceIds:['original-report']}],changes:[{branchId:'monitoring',state:'supported',sourceIds:['original-report'],reason:'Technician testimony; not live telemetry.'}],nextQuestion:null});
 return {order,state};
}
function applyReport(before,text) {
 let state=structuredClone(before);
 const append=(type,payload)=>{state=reduceInvestigation(state,{id:`event-${state.seq+1}`,jobId:state.jobId,seq:state.seq+1,type,payload});};
 append('turn.recorded',{id:'correction-report',text,amends:'original-report'});
 append('interpretation.received',{version:'carryforward.interpretation.v1',jobId:state.jobId,baseRevision:state.inputRevision,model:'combined-fixture-replay-not-live',observations:[{id:'corrected-reading',claim:'Technician-reported 2.4 kW before work.',sourceIds:['correction-report'],supersedes:'original-reading'}],changes:[{branchId:'production',state:'needs_verification',sourceIds:['correction-report'],reason:'Pre-work reading cannot verify post-work production.'}],nextQuestion:null});
 const quote='Leave production and warranty with Operations.';
 for(const branchId of ['production','warranty'])append('branch.response',{branchId,action:'later',owner:'Operations',sourceId:'correction-report',quote,reason:'Explicit fictional technician instruction.'});
 assert.equal(state.sources['correction-report'].amends,'original-report');assert.equal(state.sources['original-report'].amendedBy.includes('correction-report'),true);
 assert.equal(state.observations.find(x=>x.id==='original-reading').supersededBy,'corrected-reading');assert.equal(state.observations.find(x=>x.id==='corrected-reading').claim.includes('2.4 kW'),true);
 assert.equal(state.observations.find(x=>x.id==='unchanged-monitoring').supersededBy,undefined);assert.equal(state.observations.find(x=>x.id==='unchanged-repair').supersededBy,undefined);
 for(const branchId of ['production','warranty']){assert.equal(state.branches[branchId].owner,'Operations');assert.equal(state.branches[branchId].state,'deferred');}
 return state;
}
const summary=rows=>{const numbers=rows.map(x=>x.wallMs).sort((a,b)=>a-b);return {samples:rows.length,minMs:numbers[0],medianMs:numbers[Math.floor(numbers.length/2)],maxMs:numbers.at(-1),note:'Local fixture wall times only. No live speech percentile or target claim.'};};
/** No fetch/network/live-provider mode exists here. Every ASR/model/PCM result is explicitly a fixture. */
export async function runPilotBenchmark({manualPath,outputPath}={}) {
 const directory=await mkdtemp(join(tmpdir(),'cf-pilot-benchmark-')),databasePath=join(directory,'documents.sqlite'),storageDir=join(directory,'originals'),companyId='benchmark-fictional-company',actor={id:'benchmark-admin',role:'admin',companyId};
 const library=createDocumentLibrary({databasePath,storageDir});let version,equipment=[],sourceKind;
 if(manualPath) {
  version=await registerManufacturerFixture({library,companyId,actor,manualPath,approve:true});equipment=[MATCHED_EQUIPMENT];sourceKind='actual_pinned_manufacturer_pdf';
 }else {
  version=await library.upload(companyId,actor,{title:'Fictional replay manual',issuer:'Fictional benchmark company',revision:'FIXTURE-1',mime:'text/plain',applicability:{kind:'company_policy',requiredIdentityFields:[]},bytes:Buffer.from('Status and communication\nS_OK is shown under Server Comm in Status. Verifying the Connection, RS485 Bus Configuration and SetApp Commissioning Status are fixture headings. The green inverter LED, inverter identification, support contact, communication options, transport and storage, technical specifications for SE7600H-US are only search terms in this fictional profiling source. This file is not manufacturer guidance.')});library.approve(companyId,actor,version.versionId);sourceKind='fictional_text_only';
 }
 const references=[{versionId:version.versionId}],inputs=[...FACTUAL_INPUTS.map((text,i)=>({id:`fact-${i+1}`,kind:'factual',text})),...REPORT_INPUTS.map((text,i)=>({id:`report-${i+1}`,kind:'report_correction',text}))];
 const wav=encodeMonoWav([Float32Array.from({length:3200},(_,i)=>Math.sin(i/15)/4)],16000),rows=[];
 try {
  for(const condition of ['baseline_reopened_database_serial_fixture','candidate_reused_database_combined_fixture']) {
   for(const input of inputs) {
    const base=input.kind==='report_correction'?reportBase(input.id):null,start=performance.now(),timing=createTurnTiming({release:start}),precise={release:0};
    const mark=name=>{timing.mark(name);precise[name]=round(performance.now()-start);};
    await writeFile(join(directory,`${condition}-${input.id}.wav`),wav,{mode:0o600});mark('localSaved');
    mark('asrStarted');const transcript=await Promise.resolve(input.text);mark('asrReady');
    mark('retrievalStarted');let context;
    if(condition.startsWith('baseline')) {const opened=createDocumentLibrary({databasePath,storageDir});try{context=opened.retrieve(companyId,{references,equipment,query:input.kind==='factual'?transcript:FACTUAL_INPUTS[0]});}finally{opened.close();}}
    else context=library.retrieve(companyId,{references,equipment,query:input.kind==='factual'?transcript:FACTUAL_INPUTS[0]});
    mark('retrievalReady');assert.equal(context.status,'found');
    mark('classificationStarted');let providerFixtureCalls=0;
    const classification=await Promise.resolve({intent:input.kind==='factual'?'question':'report'});if(input.kind!=='factual')providerFixtureCalls++;
    mark('classificationReady');
    if(input.kind!=='factual') {
      if(condition.startsWith('baseline')){mark('reviewStarted');await Promise.resolve({proposal:'separate fixture review'});providerFixtureCalls++;mark('reviewReady');}else mark('combinedReviewReady');
    }
    mark('stateValidationStarted');const state=base?applyReport(base.state,transcript):null;
    const reply=state?'Pre-work reading is corrected to 2.4 kW. Monitoring stays reported live and no replacement was performed. Production and warranty remain with Operations.':context.answer;
    assert.equal(reply.includes('delivered'),false);mark('validatedAnswer');
    // Application callback exercise only: this synthetic tone is not generated speech or acoustic playback.
    mark('speechStarted');const chunks=[Buffer.from(wav.subarray(44,3244)),Buffer.from(wav.subarray(3244))];let played=0;
    for(const chunk of chunks){await Promise.resolve();if(!played)mark('firstPlayable');played+=chunk.length;}assert.equal(played,wav.length-44);mark('completed');
    rows.push({condition,inputId:input.id,inputKind:input.kind,inputSha256:sha(input.text),input:input.text,sourceHash:version.sha256,sourceKind,temperature:condition.startsWith('baseline')?'new SQLite connection per turn; OS cache uncontrolled':'reused SQLite connection; OS cache uncontrolled',provider:'fixture ASR and fixture classification/review; synthetic PCM callback',providerFixtureCalls,realProviderCalls:0,success:true,sourcePage:context.citations[0].pdfPage,firstMeaningfulAudioMs:null,audioContent:'synthetic tone fixture, not meaningful generated speech',fillerAcknowledgement:null,wallMs:round(performance.now()-start),timing:timing.snapshot(),precisePoints:precise,stageDurations:stageDurations({points:precise}),validatedReport:state?{reading:'2.4 kW before work',correctionSourceId:'correction-report',amends:'original-report',retainedMonitoring:true,retainedNoReplacement:true,followups:['production','warranty'].map(id=>({id,owner:state.branches[id].owner,state:state.branches[id].state}))}:null});
   }
  }
 }finally{library.close();}
 for(const input of inputs) {const pair=rows.filter(r=>r.inputId===input.id);assert.equal(pair.length,2);assert.equal(pair[0].inputSha256,pair[1].inputSha256);assert.deepEqual(pair[0].validatedReport,pair[1].validatedReport);}
 const result={version:'carryforward.pilot.local-benchmark.v1',recordedAt:new Date().toISOString(),mode:'local fixture/replay — not live provider or phone speech',realProviderCalls:0,matchedFactualInputs:10,matchedReportInputs:5,rows,conditions:[...new Set(rows.map(r=>r.condition))].map(condition=>({condition,factual:summary(rows.filter(r=>r.condition===condition&&r.inputKind==='factual')),reports:summary(rows.filter(r=>r.condition===condition&&r.inputKind==='report_correction'))})),historicalPhoneObservations:{source:'docs/FIELD_TRIAL_2026-11-03.md',comparableBaseline:false,samples:[{asrMs:3290,combinedModelMs:8600,firstPlayableMs:13600,completedMs:21550},{asrMs:4320,combinedModelMs:14110,firstPlayableMs:20250,completedMs:26570}],interpretation:'Different utterances and evolving state; cannot support a speedup or percentile estimate.'},validation:{allThirtyLocalRunsPassed:true,sameMatchedInputs:true,correctionsAndOwnersPreserved:true,ordinaryPlaybackCallbacksComplete:true,acousticPlaybackMeasured:false,safetyAndReportValidationBeforeAudio:true},targets:{evaluated:false,reason:'Fixture callbacks omit network ASR/model/voice generation and actual device playback. Controlled live and physical-phone measurements remain required.',shortFactualMedianMs:5000,shortFactualP90Ms:8000,reportMedianMs:12000,reportP90Ms:20000,stretchRoutineMs:[2000,3000]},remaining:['Company-approved guarded live allowance verification','Matched live-provider inputs with cold/warm and failure counts','Physical microphone and consecutive complete Sarah playback','Acoustic first sound and end-to-end cancellation across app/background conditions']};
 if(outputPath){await mkdir(resolve(outputPath,'..'),{recursive:true,mode:0o700});await writeFile(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});}
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const outputPath=process.argv[2]||'.local/pilot-benchmark/local-profile.private.json',manualPath=process.argv[3];
 const result=await runPilotBenchmark({outputPath,manualPath});console.log(JSON.stringify({outputPath,mode:result.mode,realProviderCalls:0,matchedInputs:{facts:10,reports:5},conditions:result.conditions,targetsEvaluated:false},null,2));
}
