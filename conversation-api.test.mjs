import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {once} from 'node:events';
import {OperationsStore} from './lib/operations.mjs';import {evidenceRevision} from './public/evidence.js';import {encodeMonoWav,AUDIO_LIMITS} from './public/audio.js';import {createHash} from 'node:crypto';import {demoOrder} from './public/engine.js';

test('conversation routes keep origin/auth and fictional boundaries and allow a bounded conversation beyond five attempts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'carryforward-conversation-'));await writeFile(join(dir,'token'),'unit-fixture-not-a-provider-token');
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'0',CARRYFORWARD_PHONE_HTTPS:'0',CARRYFORWARD_META_ENABLED:'1',CARRYFORWARD_GUARD_TOKEN_FILE:join(dir,'token'),CARRYFORWARD_OPERATIONS_DB:join(dir,'store.sqlite')},stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Server timeout')),5000);child.once('exit',()=>reject(Error('Server exited')));child.stdout.on('data',data=>{text+=data;const match=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});});
  const response=await fetch(base),cookie=response.headers.get('set-cookie').split(';')[0];
  const headers={Origin:base,Cookie:cookie,'X-CarryForward-Intent':'review','Content-Type':'application/json'};
  const post=(body,extra=headers)=>fetch(base+'/api/conversation/transcribe',{method:'POST',headers:extra,body:JSON.stringify(body)});
  assert.equal((await post({},{...headers,Origin:'https://foreign.example'})).status,403);
  assert.equal((await post({},{...headers,Cookie:''})).status,403);
  assert.match((await (await post({jobId:'CUSTOMER-REAL'})).json()).error,/fictional/);
  // Invalid audio is rejected before any request can reach the guard/provider.
  for(let i=0;i<30;i++){const r=await post({synthetic:true,jobId:'DEMO-BOUND',audioId:'clip'});assert.equal(r.status,400);assert.match((await r.json()).error,/audio encoding/);}
  assert.match((await (await post({synthetic:true,jobId:'DEMO-BOUND',audioId:'clip'})).json()).error,/session limit/);
 }finally{child.kill('SIGTERM');await once(child,'exit');await rm(dir,{recursive:true,force:true});}
});

test('more than five preserved recordings and unreviewed release provenance survive simulator admission',()=>{
 const store=new OperationsStore();try{
  const {jobId}=store.assign(demoOrder),bytes=Buffer.from(encodeMonoWav([new Float32Array(1600)],16000)),sha256=createHash('sha256').update(bytes).digest('hex');
  const clips=Array.from({length:6},(_,i)=>({id:'clip-'+i,jobId:demoOrder.id,mime:'audio/wav',sha256,wavSha256:sha256,dataBase64:bytes.toString('base64'),wavBase64:bytes.toString('base64')}));store.admitAudio(jobId,clips);
  assert.deepEqual(Buffer.from(store.audio(jobId,'clip-5').bytes),bytes);
  const transcript={rawText:'Monitoring is reported live.',reviewed:false,submission:'hold_release',provenance:{model:'muse-voice-transcribe-1.0',inputSha256:sha256,complete:true}};
  const events=[{id:'e1',jobId:demoOrder.id,seq:1,type:'source.added',payload:{id:'clip-5',kind:'audio',sha256,wavSha256:sha256}},{id:'e2',jobId:demoOrder.id,seq:2,type:'turn.recorded',payload:{id:'voice-turn',text:transcript.rawText,audioId:'clip-5',transcription:transcript}}];
  store.syncEvents(jobId,events);const report={technician:'Fictional technician',summary:transcript.rawText,recordedAt:'2026-11-02T10:00:00-06:00',followupOwner:'Operations',entries:{},interviewRevision:2,evidenceRevision:evidenceRevision([],clips)};
  const packet=store.candidate(jobId,report,2);assert.equal(packet.audio.length,6);assert.equal(packet.closeout.interview.turns[0].transcription.reviewed,false);assert.equal(store.inbox().length,0);
  assert.throws(()=>store.admitAudio(jobId,Array.from({length:AUDIO_LIMITS.clipsPerJob+1},(_,i)=>({...clips[0],id:'too-many-'+i}))),/limit/);
 }finally{store.close();}
});
