import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeMonoWav,inspectWav} from './public/audio.js';
import {transcribeWithMeta} from './lib/meta-transcribe.mjs';
import {createHash} from 'node:crypto';
const wav=()=>encodeMonoWav([new Float32Array(16000)],16000);
const fixture=()=>{const bytes=wav();return {synthetic:true,jobId:'synthetic-job',audioId:'clip1',audioBase64:Buffer.from(bytes).toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')};};
test('audio duration comes from validated PCM bytes, not client labels',()=>{
 assert.equal(inspectWav(wav()).seconds,1);
 const stereo=encodeMonoWav([new Float32Array(48000),new Float32Array(48000)],48000);assert.equal(inspectWav(stereo).sampleRate,16000);assert.equal(inspectWav(stereo).seconds,1);
 assert.throws(()=>encodeMonoWav([new Float32Array(16000*31)],16000),/30 seconds/);
 const invalid=wav();new DataView(invalid.buffer).setUint16(22,2,true);assert.throws(()=>inspectWav(invalid),/mono/);
 assert.throws(()=>inspectWav(wav().subarray(0,40)),/RIFF/);
 const nan=new Float32Array(10);nan[0]=NaN;assert.throws(()=>encodeMonoWav([nan],16000),/sample/);
});
test('transcription rejects unauthorized source and wrong hash before a provider call',async()=>{
 let count=0;const fetchImpl=async()=>{count++;throw new Error('unexpected request');};
 await assert.rejects(transcribeWithMeta(fixture(),{fetchImpl}),/disabled/);
 await assert.rejects(transcribeWithMeta({...fixture(),synthetic:false},{token:'fixture',fetchImpl}),/synthetic/);
 await assert.rejects(transcribeWithMeta({...fixture(),sha256:'a'.repeat(64)},{token:'fixture',fetchImpl}),/hash/);assert.equal(count,0);
});
test('dedicated transcription retains source identity and metered duration; failures are not answers',async()=>{
 const response={transcript:'The inverter was replaced.',sessionId:'synthetic-session',audioDurationMs:1000};
 const result=await transcribeWithMeta(fixture(),{token:'fixture',fetchImpl:async(url,options)=>{assert.equal(url,'http://127.0.0.1:4421/v1/asr/transcribe');assert.equal(JSON.parse(options.body).model,'muse-voice-transcribe-1.0');return new Response(JSON.stringify(response));}});
 assert.equal(result.audioId,'clip1');assert.equal(result.provenance.audioDurationMs,1000);
 await assert.rejects(transcribeWithMeta(fixture(),{token:'fixture',fetchImpl:async()=>new Response('{}',{status:429})}),/refused/);
 await assert.rejects(transcribeWithMeta(fixture(),{token:'fixture',fetchImpl:async()=>new Response(JSON.stringify({...response,audioDurationMs:300000}))}),/malformed/);
});

test('voice source and reviewed transcript retain original and machine words separately',async()=>{
 const {createInvestigation,reduceInvestigation,interviewHandoff}=await import('./public/investigation.js');
 const order={id:'synthetic-job',checks:[{id:'repair',question:'What changed?'}]};let state=createInvestigation(order);
 const apply=(type,payload)=>{state=reduceInvestigation(state,{id:'e'+(state.seq+1),jobId:order.id,seq:state.seq+1,type,payload});};
 apply('source.added',{id:'clip1',kind:'audio',sha256:'a'.repeat(64)});
 apply('turn.recorded',{id:'t1',text:'Output was 2.4 kW.',audioId:'clip1',transcription:{rawText:'Output was 4.2 kW.',reviewed:true,provenance:{model:'synthetic-ASR-fixture'}}});
 const handoff=interviewHandoff(state);assert.equal(handoff.audioSources[0].id,'clip1');assert.equal(handoff.turns[0].transcription.rawText,'Output was 4.2 kW.');assert.equal(handoff.turns[0].text,'Output was 2.4 kW.');
 assert.throws(()=>apply('turn.recorded',{id:'bad',text:'Wrong clip',audioId:'other-job-clip'}),/wrong-job/);
});

test('stale interview writers cannot append a conflicting logical history',async()=>{
 const {validateEventAppend}=await import('./public/jobstore.js');
 const event={jobId:'job1',type:'interview.turn.recorded',payload:{investigationEvent:{jobId:'job1',seq:1,type:'turn.recorded'}}};
 validateEventAppend([],event);
 assert.throws(()=>validateEventAppend([event],event),/another view/);
 const second={...event,payload:{investigationEvent:{jobId:'job1',seq:2,type:'turn.recorded'}}};
 validateEventAppend([event],second);
 validateEventAppend([second,event],{...event,payload:{investigationEvent:{jobId:'job1',seq:3,type:'turn.recorded'}}});
 assert.throws(()=>validateEventAppend([],{...event,jobId:'other'}),/another view/);
});

test('original audio may retain unsupported codecs but cannot become an HTML/header payload',async()=>{
 const {validateAudioOriginal}=await import('./public/audio.js');
 validateAudioOriginal('audio/x-m4a',1000);validateAudioOriginal('audio/webm;codecs=opus',1000);
 assert.throws(()=>validateAudioOriginal('text/html',1000),/audio file/);
 assert.throws(()=>validateAudioOriginal('audio/wav\r\nInjected: bad',1000),/audio file/);
 assert.throws(()=>validateAudioOriginal('audio/wav',5000001),/audio file/);
});

test('local signal diagnostics distinguish silence from audible PCM without discarding originals',async()=>{
 const {wavSignal}=await import('./public/audio.js');
 assert.equal(wavSignal(wav()).veryQuiet,true);
 const samples=Float32Array.from({length:16000},(_,i)=>0.2*Math.sin(i*2*Math.PI*440/16000));
 const signal=wavSignal(encodeMonoWav([samples],16000));assert.equal(signal.veryQuiet,false);assert.ok(signal.rms>0.1);assert.ok(signal.peak>0.19);
 assert.throws(()=>wavSignal(new Uint8Array(20)),/RIFF/);
});
