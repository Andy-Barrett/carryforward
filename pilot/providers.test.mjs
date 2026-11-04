import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,writeFile,readFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{createHash}from'node:crypto';
import{createPilotProviders}from'./providers.mjs';import{encodeMonoWav}from'../public/audio.js';
const sha=x=>createHash('sha256').update(x).digest('hex'),version={versionId:'approved-manual-v1',sha256:'a'.repeat(64)};
const scope={companyId:'company-a',userId:'tech-a',sessionId:'session-a',jobId:'fictional-job-a',assignmentRevision:'assignment-1',retrievalVersions:[version],synthetic:true};
const citation={...version,pageIndex:60,pdfPage:61,revision:'fixture-1',title:'Fictional source'};
const packet={question:'Where is the read-only status?',retrieval:{status:'found',procedureBlocked:false,citations:[citation],excerpts:[{text:'The fictional read-only status is in Status.',citation}]}};
const report={revision:'report-2',followups:[{id:'production',owner:'Operations',status:'open'},{id:'warranty',owner:'Operations',status:'open'}],corrections:[{sourceId:'report-original',amends:'report-original',reading:'2.4 kW before work'}]};
const modelReply=(p=packet,stateRevision='assignment-1')=>new Response(JSON.stringify({id:'fixture-response',status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'The listed read-only status is under Status.',citations:p.retrieval.citations,stateRevision})}]}]}),{status:200});
async function setup({fetchImpl=async()=>modelReply(),revalidate=async()=>true,speechImpl,now,validateLocalReply=async()=>true}={}){
 const dir=await mkdtemp(join(tmpdir(),'cf-provider-fixture-'));const paths={metaGuardTokenFile:join(dir,'fake-guard-token'),metaGuardLedger:join(dir,'fake-meta-ledger.json'),elevenKeyFile:join(dir,'fake-eleven-key'),elevenLedger:join(dir,'fake-eleven-ledger.json')};
 await writeFile(paths.metaGuardTokenFile,'fictional-guard-credential');await writeFile(paths.elevenKeyFile,'fictional-speech-credential');await writeFile(paths.metaGuardLedger,JSON.stringify({capUsd:10,reservedUsd:0,requests:[]}));await writeFile(paths.elevenLedger,JSON.stringify({version:1,characterCap:6000,requestCap:60,reservedCharacters:0,requests:[]}));
 const config={enabled:true,...paths,companies:{'company-a':{approvalId:'fictional-test-approval',fictionalInferenceApproved:true,expiresAt:'2099-01-01T00:00:00.000Z',providers:{metaAsr:true,metaAnswers:true,elevenSpeech:true}}}};
 return {providers:createPilotProviders({config,fetchImpl,revalidate,validateLocalReply,speechImpl,now}),config,paths};
}
async function grant(providers,ticket,reply='A validated local answer.'){return providers.grantSpeech({ticket,scope,reply,validatedStateRevision:'assignment-1',localValidation:{replySha256:sha(reply),stateRevision:'assignment-1'}});}
async function briefGrant(providers,selectedScope=scope,reply='A validated short briefing.'){const ticket=await providers.beginTurn(selectedScope);return providers.grantSpeech({ticket,scope:selectedScope,reply,validatedStateRevision:'assignment-1',localValidation:{replySha256:sha(reply),stateRevision:'assignment-1'},cacheableBriefing:true});}
test('a completed briefing replays exact Sarah PCM with a fresh grant and no second provider dispatch',async()=>{
 let syntheses=0;const {providers}=await setup({speechImpl:{async stream({onStart,onChunk}){syntheses++;await onStart({model:'eleven_v4_turbo',voice:'sarah',sampleRate:24000});await onChunk(Buffer.from([1,0,2,0]));return{bytes:4};}}});
 const first=await briefGrant(providers),initial=[];await providers.streamSpeech({grant:first,scope,onChunk:b=>{initial.push(...b);b.fill(9);}});
 const second=await briefGrant(providers),replayed=[];let metadata;const result=await providers.streamSpeech({grant:second,scope,onStart:v=>{metadata=v;},onChunk:b=>replayed.push(...b)});
 assert.deepEqual(initial,[1,0,2,0]);assert.deepEqual(replayed,initial);assert.equal(metadata.cacheHit,true);assert.equal(result.cacheHit,true);assert.equal(syntheses,1);assert.equal(providers.status().dispatches.elevenSpeech,1);assert.equal(providers.status().briefingCache.hits,1);
 await assert.rejects(providers.streamSpeech({grant:second,scope,onChunk:()=>assert.fail()}),/unavailable/);
});
test('briefing reuse cannot cross companies, users, jobs, revisions, source manifests or changed readout text',async()=>{
 let syntheses=0;const {providers,config}=await setup({speechImpl:{async stream({onStart,onChunk}){syntheses++;await onStart({model:'eleven_v4_turbo'});await onChunk(Buffer.from([1,0]));return{bytes:2};}}});
 config.companies['company-b']=structuredClone(config.companies['company-a']);
 for(const changed of [{},{companyId:'company-b'},{userId:'tech-b'},{jobId:'job-b'},{assignmentRevision:'revision-b'},{retrievalVersions:[{...version,sha256:'b'.repeat(64)}]}]){const selectedScope={...scope,...changed},g=await briefGrant(providers,selectedScope);await providers.streamSpeech({grant:g,scope:selectedScope,onChunk:()=>{}});}
 const changedText=await briefGrant(providers,scope,'A changed briefing.');await providers.streamSpeech({grant:changedText,scope,onChunk:()=>{}});assert.equal(syntheses,7);
});
test('briefing PCM retention is bounded and evicts the oldest completed entry',async()=>{
 let syntheses=0;const {providers}=await setup({speechImpl:{async stream({onStart,onChunk}){syntheses++;await onStart({model:'eleven_v4_turbo'});await onChunk(Buffer.alloc(4_000_000));return{bytes:4_000_000};}}});
 for(let i=0;i<5;i++){const g=await briefGrant(providers,scope,'Briefing '+i);await providers.streamSpeech({grant:g,scope,onChunk:()=>{}});}
 assert.equal(providers.status().briefingCache.bytes,16_000_000);assert.equal(providers.status().briefingCache.entries,4);
 const oldest=await briefGrant(providers,scope,'Briefing 0');await providers.streamSpeech({grant:oldest,scope,onChunk:()=>{}});assert.equal(syntheses,6);assert.equal(providers.status().briefingCache.bytes,16_000_000);
});
test('a partial or cancelled briefing is never admitted to the replay cache',async()=>{
 let fail=true;const {providers}=await setup({speechImpl:{async stream({onStart,onChunk}){await onStart({model:'eleven_v4_turbo'});await onChunk(Buffer.from([1,0]));if(fail)throw Error('Interrupted');return{bytes:2};}}});
 const first=await briefGrant(providers);await assert.rejects(providers.streamSpeech({grant:first,scope,onChunk:()=>{}}),/Interrupted/);assert.equal(providers.status().briefingCache.entries,0);fail=false;
 const next=await briefGrant(providers);await providers.streamSpeech({grant:next,scope,onChunk:()=>{}});assert.equal(providers.status().dispatches.elevenSpeech,2);assert.equal(providers.status().briefingCache.entries,1);
});
test('cached PCM still stops at current revocation before another chunk',async()=>{
 let allowed=true;const {providers}=await setup({revalidate:async()=>allowed,speechImpl:{async stream({onStart,onChunk}){await onStart({model:'eleven_v4_turbo'});await onChunk(Buffer.alloc(20000));return{bytes:20000};}}});
 const first=await briefGrant(providers);await providers.streamSpeech({grant:first,scope,onChunk:()=>{}});const next=await briefGrant(providers);let chunks=0;
 await assert.rejects(providers.streamSpeech({grant:next,scope,onChunk:()=>{chunks++;allowed=false;}}),/access changed/);assert.equal(chunks,1);assert.equal(providers.status().dispatches.elevenSpeech,1);
});
test('providers default disabled; no implicit environment, company approval or fabricated authentication',async()=>{
 const disabled=createPilotProviders({fetchImpl:()=>assert.fail('No network call permitted')});assert.equal(disabled.status().enabled,false);await assert.rejects(disabled.beginTurn(scope),/no enabled/);
 const {providers,config}=await setup();await assert.rejects(providers.beginTurn({...scope,companyId:'company-b'}),/no enabled/);await assert.rejects(providers.beginTurn({...scope,synthetic:false}),/fictional/);config.companies['company-a'].fictionalInferenceApproved=false;await assert.rejects(providers.beginTurn(scope),/no enabled/);assert.deepEqual(providers.status().dispatches,{metaAsr:0,metaAnswers:0,elevenSpeech:0});
});
test('guard-only answers have exact company/user/session/job/revision/source scope and current access',async()=>{
 let calls=0;const {providers}=await setup({fetchImpl:async(url,o)=>{calls++;assert.equal(url,'http://127.0.0.1:4421/v1/responses');const data=JSON.parse(o.body);assert.equal(data.store,false);assert.equal(data.stream,false);assert.equal(data.input[0].content[0].text.includes('Perihelion'),false);return modelReply();}});const ticket=await providers.beginTurn(scope);
 for(const changed of [{companyId:'company-b'},{userId:'other'},{sessionId:'other'},{jobId:'other'},{assignmentRevision:'other'},{retrievalVersions:[{...version,sha256:'b'.repeat(64)}]}])await assert.rejects(providers.answer({ticket,scope:{...scope,...changed},packet}),/company|turn|connection|revision/);
 assert.equal(calls,0);const answer=await providers.answer({ticket,scope,packet});assert.equal(answer.stateRevision,'assignment-1');assert.equal(answer.provenance.kind,'validated_model_answer');assert.equal(calls,1);await assert.rejects(providers.answer({ticket,scope,packet}),/once/);
});
test('missing/exhausted shared ledgers fail closed without a new accounting file or provider dispatch',async()=>{
 let calls=0;const {providers,paths}=await setup({fetchImpl:()=>{calls++;assert.fail();}});const ticket=await providers.beginTurn(scope);await writeFile(paths.metaGuardLedger,JSON.stringify({capUsd:10,reservedUsd:10,requests:[]}));await assert.rejects(providers.answer({ticket,scope,packet}),/accounting/);assert.equal(calls,0);assert.equal(JSON.parse(await readFile(paths.metaGuardLedger)).reservedUsd,10);
});
test('source and procedure boundaries reject wrong-version, missing-warning and report-state mutations before speech',async()=>{
 let calls=0;const {providers}=await setup({fetchImpl:async()=>{calls++;return modelReply();}});const ticket=await providers.beginTurn(scope);for(const retrieval of [{...packet.retrieval,status:'blocked'},{...packet.retrieval,procedureBlocked:true},{...packet.retrieval,citations:[{...citation,versionId:'other-company-source'}]}])await assert.rejects(providers.answer({ticket,scope,packet:{...packet,retrieval}}),/source|procedure|scoped/);assert.equal(calls,0);
 const mismatch=await setup({fetchImpl:async()=>modelReply(packet,'report-incorrect')});const second=await mismatch.providers.beginTurn(scope);await assert.rejects(mismatch.providers.answer({ticket:second,scope,packet:{...packet,validatedReport:report}}),/revision/);await assert.rejects(mismatch.providers.grantSpeech({ticket:second,scope,reply:'All work complete.',validatedStateRevision:'report-incorrect'}),/validated answer/);
});
test('combined report answer keeps validated correction links and owners immutable in the request',async()=>{
 let sent;const {providers}=await setup({fetchImpl:async(_url,o)=>{sent=JSON.parse(JSON.parse(o.body).input[0].content[0].text);return modelReply(packet,report.revision);}});const before=structuredClone(report),ticket=await providers.beginTurn(scope);await providers.answer({ticket,scope,packet:{...packet,validatedReport:report}});assert.deepEqual(sent.validatedReport,before);assert.deepEqual(report,before);assert.match(sent.validatedReport.corrections[0].reading,/2.4/);assert.equal(sent.validatedReport.followups.filter(x=>x.owner==='Operations').length,2);
});
test('saved hold-release audio reuses guarded ASR and ignores cancelled/late results',async()=>{
 let calls=0,finish;const waiting=new Promise(r=>finish=r);const {providers}=await setup({fetchImpl:async url=>{calls++;assert.equal(url,'http://127.0.0.1:4421/v1/asr/transcribe');await waiting;return new Response(JSON.stringify({transcript:'Fictional visit line.',audioDurationMs:50,sessionId:'fixture-asr'}));}});const wav=encodeMonoWav([Float32Array.from({length:1600},(_,i)=>Math.sin(i/10)/3)],16000),audio={jobId:scope.jobId,audioId:'clip-a',audioBase64:Buffer.from(wav).toString('base64'),sha256:sha(wav),submission:'hold_release',savedLocally:true};const ticket=await providers.beginTurn(scope);await assert.rejects(providers.transcribe({ticket,scope,audio:{...audio,savedLocally:false}}),/Save/);
 const pending=providers.transcribe({ticket,scope,audio});while(!calls)await new Promise(r=>setImmediate(r));providers.cancelTurn(ticket);finish();await assert.rejects(pending,/expired|turn|abort/i);assert.equal(calls,1);
});
test('speech grants are one-use and reject reassignment, source withdrawal and a late old-job PCM chunk',async()=>{
 let chunks=0;const fixtureSpeech={async stream({onStart,onChunk}){await onStart({provider:'fixture',sampleRate:24000});await onChunk(Buffer.alloc(100));await providers.beginTurn({...scope,jobId:'new-fictional-job'});await onChunk(Buffer.alloc(100));return{bytes:200};}};const {providers}=await setup({speechImpl:fixtureSpeech});const ticket=await providers.beginTurn(scope),voiceGrant=await grant(providers,ticket);await assert.rejects(providers.streamSpeech({grant:voiceGrant,scope,onChunk:()=>chunks++}),/expired|turn/);assert.equal(chunks,1);await assert.rejects(providers.streamSpeech({grant:voiceGrant,scope,onChunk:()=>chunks++}),/unavailable/);
});
test('revocation while streaming prevents the next chunk and logout removes pending grants',async()=>{
 let allowed=true,chunks=0;const {providers}=await setup({revalidate:async()=>allowed,speechImpl:{async stream({onChunk}){await onChunk(Buffer.alloc(80));allowed=false;await onChunk(Buffer.alloc(80));}}});const ticket=await providers.beginTurn(scope),voiceGrant=await grant(providers,ticket);await assert.rejects(providers.streamSpeech({grant:voiceGrant,scope,onChunk:()=>chunks++}),/access changed/);assert.equal(chunks,1);
 allowed=true;const another=await providers.beginTurn(scope),pending=await grant(providers,another);assert.equal(providers.revokeSession(scope),1);await assert.rejects(providers.streamSpeech({grant:pending,scope,onChunk:()=>assert.fail()}),/unavailable/);
});
test('complete mocked PCM retains frame order; caller abort prevents post-abort output',async()=>{
 const played=[];const {providers}=await setup({speechImpl:{async stream({onStart,onChunk,signal}){await onStart({provider:'ElevenLabs fixture',sampleRate:24000});for(const v of [1,2,3]){signal.throwIfAborted();await onChunk(Buffer.from([v,0]));}return{bytes:6,completedMs:1};}}});const ticket=await providers.beginTurn(scope),voiceGrant=await grant(providers,ticket);const result=await providers.streamSpeech({grant:voiceGrant,scope,onChunk:bytes=>played.push(...bytes)});assert.equal(result.bytes,6);assert.deepEqual(played,[1,0,2,0,3,0]);assert.equal(providers.status().dispatches.elevenSpeech,1);
 const controller=new AbortController(),next=await providers.beginTurn(scope),nextGrant=await grant(providers,next);controller.abort();await assert.rejects(providers.streamSpeech({grant:nextGrant,scope,signal:controller.signal,onChunk:()=>assert.fail()}),/abort/i);
});

test('local speech requires a separate stored-answer validator, not only a membership check',async()=>{const {providers}=await setup({validateLocalReply:null});const ticket=await providers.beginTurn(scope);await assert.rejects(grant(providers,ticket),/validated answer/);});
test('matched local benchmark records every stage and preserves corrections without evaluating live targets',async()=>{const {runPilotBenchmark}=await import('./benchmark.mjs');const result=await runPilotBenchmark();assert.equal(result.rows.length,30);assert.equal(result.realProviderCalls,0);assert.equal(result.targets.evaluated,false);for(const row of result.rows){for(const key of ['localSaved','asrStarted','asrReady','retrievalStarted','retrievalReady','validatedAnswer','firstPlayable','completed'])assert.equal(Number.isFinite(row.precisePoints[key]),true);assert.ok(row.precisePoints.firstPlayable>=row.precisePoints.validatedAnswer);if(row.validatedReport){assert.equal(row.validatedReport.followups.every(x=>x.owner==='Operations'&&x.state==='deferred'),true);assert.equal(row.providerFixtureCalls,row.condition.startsWith('candidate')?1:2);}}});
