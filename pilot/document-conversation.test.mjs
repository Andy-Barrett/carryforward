import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPilotServer} from './server.mjs';
import {manufacturerFixtureUpload,MATCHED_EQUIPMENT,SETAPP_MANUAL} from './manual-fixture.mjs';
import {warningReadbackReply} from './documents.mjs';
import {createPilotProviders} from './providers.mjs';
import {demoOrder} from '../public/engine.js';
import {evidenceRevision} from '../public/evidence.js';
import {encodeMonoWav} from '../public/audio.js';
import {speechText} from '../public/speech-text.js';
const sha=value=>createHash('sha256').update(value).digest('hex');

function client(origin) {
 const jar=new Map();
 return {async request(path,{method='GET',data,headers={}}={}) {
  const response=await fetch(origin+path,{method,headers:{Origin:origin,'X-CarryForward-Intent':'pilot',Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
  for(const raw of response.headers.getSetCookie()){const[k,v]=raw.split(';')[0].split('=');if(v)jar.set(k,v);else jar.delete(k);}
  const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes);}catch{value=null;}return {status:response.status,value,bytes,headers:response.headers};
 },async ok(path,data,method=data===undefined?'GET':'POST',headers={}) {
  const result=await this.request(path,{method,data,headers});assert.ok(result.status<400,JSON.stringify({path,...result}));return result.value;
 }};
}
async function fixture(t,{providers=false}={}) {
 const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const directory=await mkdtemp(join(tmpdir(),'cf-document-conversation-')),providerConfig={enabled:providers,companies:{}},transport={asr:0,model:0,speech:0,spokenText:null,transcript:'What was the warning before removing the cover?'};
 let providerFactory;
 if(providers) {
  // These new fixture ledgers/credentials are never the shared live accounts.
  Object.assign(providerConfig,{metaGuardTokenFile:join(directory,'fixture-token'),metaGuardLedger:join(directory,'fixture-meta-ledger'),elevenKeyFile:join(directory,'fixture-key'),elevenLedger:join(directory,'fixture-speech-ledger')});
  await writeFile(providerConfig.metaGuardTokenFile,'fixture-token');await writeFile(providerConfig.elevenKeyFile,'fixture-key');await writeFile(providerConfig.metaGuardLedger,JSON.stringify({capUsd:10,reservedUsd:0,requests:[]}));await writeFile(providerConfig.elevenLedger,JSON.stringify({version:1,characterCap:6000,requestCap:60,reservedCharacters:0,requests:[]}));
  providerFactory=options=>createPilotProviders({...options,fetchImpl:async url=>{if(url.endsWith('/v1/asr/transcribe')){transport.asr++;return new Response(JSON.stringify({transcript:transport.transcript,audioDurationMs:100,sessionId:'fixture-warning-asr'}));}transport.model++;throw Error('Warning readback must not call a model.');},speechImpl:{async stream({text,onStart,onChunk}){transport.speech++;transport.spokenText=text;await onStart({model:'eleven_v4_turbo',sampleRate:24000});await onChunk(Buffer.from([0,0,1,0,2,0]));return{bytes:6};}}});
 }
 const app=await createPilotServer({directory,port,providerConfig,providerFactory});await app.listen();
 t.after(async()=>{app.server.closeAllConnections();await app.close();await rm(directory,{recursive:true,force:true});});
 const owner=client(app.baseURL),tech=client(app.baseURL),password='fictional-document-conversation-pass-123';
 await owner.ok('/api/auth/sign-up/email',{name:'Fictional Source Owner',email:'source-owner@example.test',password});
 const {principal:admin}=await owner.ok('/pilot/api/account/companies',{name:'Fictional Source Company'});
 if(providers)providerConfig.companies[admin.companyId]={approvalId:'fixture-warning-readback-approval',expiresAt:'2099-01-01T00:00:00.000Z',fictionalInferenceApproved:true,providers:{metaAsr:true,metaAnswers:true,elevenSpeech:true}};
 const invitation=await owner.ok('/pilot/api/account/invitations',{email:'source-tech@example.test',role:'technician'});
 await tech.ok('/api/auth/sign-up/email',{name:'Fictional Source Tech',email:'source-tech@example.test',password});
 const {principal:worker}=await tech.ok('/pilot/api/account/invitations/accept',{token:new URL(invitation.url).hash.slice(8)});
 return {app,owner,tech,admin,worker,transport};
}
async function upload(owner,{bytes,...metadata}) {
 return owner.ok('/pilot/api/documents',{...metadata,dataBase64:bytes.toString('base64')});
}
function assignment(worker,document,overrides={}) {
 return {version:'carryforward.assignment.v2',externalId:'DOCUMENT-CONVERSATION-WO',sourceRevision:'1',assigneeUserIds:[worker.userId],customerRef:'fictional-source-customer',siteRef:'fictional-source-site',systemRef:'fictional-source-system',equipment:[MATCHED_EQUIPMENT],contextRefs:[{documentId:document.documentId,versionId:document.versionId,equipmentRef:MATCHED_EQUIPMENT.equipmentRef}],order:{...structuredClone(demoOrder),briefing:{},history:[]},...overrides};
}
const jobPath=(job,action)=>`/pilot/api/jobs/${job.id}/${action}`;

test('actual approved manual warning becomes a complete bounded reply; procedure, mismatch and missing-warning gates stay closed',async t=>{
 const manualPath=process.env.CF_MANUFACTURER_FIXTURE??new URL('../.local/pilot-manuals/MAN-01-00541-1.4.pdf',import.meta.url);
 try{await readFile(manualPath);}catch{t.skip('The separately obtained pinned manufacturer original is required for this acceptance.');return;}
 const f=await fixture(t,{providers:true}),manual=await upload(f.owner,await manufacturerFixtureUpload(manualPath));
 assert.equal(manual.processing.status,'ready');assert.equal(manual.sha256,SETAPP_MANUAL.sha256);assert.equal(manual.status,'uploaded');
 await f.owner.ok(`/pilot/api/documents/${manual.versionId}/approve`,{});
 const input=assignment(f.worker,manual),job=await f.owner.ok('/pilot/api/jobs',input,'POST',{'Idempotency-Key':'manual-warning'});
 const answer=await f.tech.ok(jobPath(job,'question'),{text:'What was the warning before removing the cover?'});
 assert.equal(answer.provenance.kind,'source_warning_readback');assert.equal(answer.provenance.model,'none');assert.equal(answer.retrieval.requestKind,'warning_recall');assert.equal(answer.retrieval.procedureBlocked,true);assert.ok(answer.reply.length<=1600);
 const citation=answer.citations[0];assert.equal(citation.sha256,SETAPP_MANUAL.sha256);assert.equal(citation.revision,SETAPP_MANUAL.revision);assert.equal(citation.pageIndex,7);assert.equal(citation.pdfPage,8);assert.equal(citation.printedLabel,'7');assert.match(citation.originalUrl,new RegExp(`/jobs/${job.id}/references/${manual.versionId}/original#page=8$`));
 const pages=await f.tech.ok(jobPath(job,`references/${manual.versionId}/pages`)),page=pages.find(x=>x.pageIndex===7);
 assert.equal(answer.retrieval.excerpts[0].text,page.text,'Full bilingual safety page remains available without truncation');
 // Compare each whole source block independently, not only a risk/wait keyword.
 for(const firstWords of ['The inverter cover','Before operating the inverter','Opening the inverter']) {
  const start=page.text.indexOf(firstWords),end=page.text.indexOf('\nAVERTISSEMENT!',start);assert.ok(start>=0&&end>start);assert.ok(answer.reply.includes(page.text.slice(start,end).trim()),'Readback retains the complete English warning and all its prerequisites');
 }
 assert.match(answer.reply,/does not authorize work/);assert.match(answer.reply,/complete approved procedure/);assert.equal((await f.tech.ok(jobPath(job,'events'))).events.length,0,'Reading a warning is not testimony or confirmation');
 const procedure=await f.tech.ok(jobPath(job,'question'),{text:'How do I remove the inverter cover?'});assert.equal(procedure.retrieval.requestKind,'procedure_request');assert.equal(procedure.retrieval.procedureBlocked,true);assert.equal(procedure.provenance.kind,'source_lookup');assert.equal(procedure.reply.includes('Wait five minutes'),false);assert.match(procedure.reply,/not permission/);
 const explicitSteps=await f.tech.ok(jobPath(job,'question'),{text:'What is the procedure to remove the cover?'});assert.equal(explicitSteps.retrieval.requestKind,'procedure_request');assert.equal(explicitSteps.retrieval.procedureBlocked,true);assert.equal(explicitSteps.reply.includes('Wait five minutes'),false);
 const mismatch=await f.owner.ok('/pilot/api/jobs',assignment(f.worker,manual,{externalId:'MISMATCH-WO',equipment:[{...MATCHED_EQUIPMENT,variant:'LCD'}]}),'POST',{'Idempotency-Key':'mismatched-warning'});
 const mismatched=await f.tech.ok(jobPath(mismatch,'question'),{text:'What was the warning before removing the cover?'});assert.equal(mismatched.retrieval.code,'equipment_mismatch');assert.equal(mismatched.citations.length,0);assert.equal(mismatched.reply.includes('Wait five minutes'),false);
 const missing=await upload(f.owner,{bytes:Buffer.from('Fictional cover reference. No operating instructions or safety material is supplied.'),mime:'text/plain',title:'Fictional missing context',issuer:'Fictional issuer',revision:'1',applicability:SETAPP_MANUAL.applicability});await f.owner.ok(`/pilot/api/documents/${missing.versionId}/approve`,{});
 const missingJob=await f.owner.ok('/pilot/api/jobs',assignment(f.worker,missing,{externalId:'MISSING-WARNING-WO'}),'POST',{'Idempotency-Key':'missing-warning'});
 const unavailable=await f.tech.ok(jobPath(missingJob,'question'),{text:'What was the warning before removing the cover?'});assert.equal(unavailable.retrieval.code,'missing_warning');assert.equal(unavailable.citations.length,0);assert.equal(unavailable.reply.includes('Wait five minutes'),false);
 const tooLong={...answer.retrieval,excerpts:[{...answer.retrieval.excerpts[0],text:'WARNING!\n'+('Required prerequisite and risk context. '.repeat(100))}]};assert.equal(warningReadbackReply(tooLong),null,'A complete warning that exceeds the bound is refused, never truncated');
 const start=await f.tech.ok(jobPath(job,'voice/start'),{}),bytes=Buffer.from(encodeMonoWav([Float32Array.from({length:3200},(_,i)=>Math.sin(i/12)/3)],16000)),clip={id:randomUUID(),name:'Fictional warning question',mime:'audio/wav',dataBase64:bytes.toString('base64'),sha256:sha(bytes),wavBase64:bytes.toString('base64'),wavSha256:sha(bytes)};
 const asr=await f.tech.ok(jobPath(job,'voice/transcribe'),{ticket:start.ticket,clip,savedLocally:true,submission:'hold_release'}),voice=await f.tech.ok(jobPath(job,'voice/answer'),{ticket:start.ticket,text:asr.transcript});
 assert.equal(voice.provenance.kind,'source_warning_readback');assert.equal(voice.reply,answer.reply);assert.equal(voice.retrieval.procedureBlocked,true);assert.equal(voice.reportSaved,false);assert.equal(voice.speech.replySha256,sha(voice.reply));assert.equal(voice.serverTiming.stages.model.status,'skipped');assert.equal(voice.serverTiming.stages.speechGrant.status,'complete');
 const pcm=await f.tech.request(jobPath(job,'voice/speech'),{method:'POST',data:{...voice.speech,requestId:randomUUID()}});assert.equal(pcm.status,200);assert.equal(pcm.headers.get('x-carryforward-speech-voice'),'sarah');assert.deepEqual([...pcm.bytes],[0,0,1,0,2,0]);assert.equal(f.transport.spokenText,speechText(voice.reply));assert.deepEqual([f.transport.asr,f.transport.model,f.transport.speech],[1,0,1]);
 assert.equal((await f.tech.request(jobPath(job,'voice/speech'),{method:'POST',data:{...voice.speech,requestId:randomUUID()}})).status,403,'A verified warning grant remains one use');assert.equal((await f.tech.ok(jobPath(job,'events'))).events.length,0);
});

test('explicit signed HTTP reference refresh uses the new version and preserves the exact earlier confirmed packet in history',async t=>{
 const f=await fixture(t),metadata={mime:'text/plain',title:'Fictional status reference',issuer:'Fictional company',revision:'SOURCE-1',applicability:{kind:'company_policy',requiredIdentityFields:[]}},original=Buffer.from('Communication status\nThe fictional read-only communication status is on the BLUE status page.'),one=await upload(f.owner,{...metadata,bytes:original});
 await f.owner.ok(`/pilot/api/documents/${one.versionId}/approve`,{});const input=assignment(f.worker,one),job=await f.owner.ok('/pilot/api/jobs',input,'POST',{'Idempotency-Key':'first-assignment'});
 const oldAnswer=await f.tech.ok(jobPath(job,'question'),{text:'Where is communication status?'});assert.equal(oldAnswer.citations[0].versionId,one.versionId);assert.match(oldAnswer.reply,/BLUE/);
 const report={technician:'Fictional Source Tech',summary:'Fictional inspection only. Production and warranty remain open with Operations.',recordedAt:'2026-11-04T10:00:00-06:00',followupOwner:'Operations',promises:'Operations will verify the open checks.',interviewRevision:0,evidenceRevision:evidenceRevision(),entries:{}};
 const candidate=await f.tech.ok(jobPath(job,'closeout'),{report,eventRevision:0});await f.tech.ok(jobPath(job,'confirmations'),{revision:candidate.revision,reportRevision:candidate.reportRevision,name:report.technician,confirmedAt:report.recordedAt});
 const confirmed=await f.tech.ok(jobPath(job,'closeout'));assert.equal(confirmed.confirmation.revision,candidate.revision);
 const two=await upload(f.owner,{...metadata,documentId:one.documentId,revision:'SOURCE-2',bytes:Buffer.from('Communication status\nThe fictional read-only communication status is on the GREEN status page.')});await f.owner.ok(`/pilot/api/documents/${two.versionId}/approve`,{});
 const stale=await f.tech.ok(jobPath(job,'question'),{text:'Where is communication status?'});assert.equal(stale.retrieval.code,'document_superseded_refresh_required');assert.deepEqual(await f.tech.ok(jobPath(job,'closeout')),confirmed,'Approval alone cannot rewrite a confirmed report');
 const next={...input,sourceRevision:'2',contextRefs:[{documentId:one.documentId,versionId:two.versionId}]};
 const noRevision=await f.owner.request('/pilot/api/jobs',{method:'POST',data:next,headers:{'Idempotency-Key':'missing-revision'}});assert.equal(noRevision.status,409);
 const refreshed=await f.owner.ok('/pilot/api/jobs',next,'POST',{'Idempotency-Key':'explicit-refresh','If-Match':job.revision});assert.equal(refreshed.id,job.id);assert.notEqual(refreshed.revision,job.revision);assert.equal(refreshed.status.technicianConfirmed,false,'New assignment context requires a new report confirmation');
 const answer=await f.tech.ok(jobPath(job,'question'),{text:'Where is communication status?'});assert.equal(answer.retrieval.status,'found');assert.equal(answer.citations[0].versionId,two.versionId);assert.equal(answer.citations[0].revision,'SOURCE-2');assert.equal(answer.citations[0].sha256,two.sha256);assert.match(answer.reply,/GREEN/);assert.equal(answer.reply.includes('BLUE'),false);
 const history=await f.tech.ok(jobPath(job,'history'));assert.equal(history.items.length,1);assert.deepEqual(history.items[0].packet,confirmed,'Archived packet, confirmation, authorship and source report remain byte-equivalent JSON');assert.equal(history.items[0].revision,candidate.revision);
 const preserved=await f.owner.request(`/pilot/api/documents/${one.versionId}/original`);assert.equal(preserved.status,200);assert.deepEqual(preserved.bytes,original);
 const oldPage=await f.tech.request(jobPath(job,`references/${one.versionId}/original`));assert.equal(oldPage.status,404,'The refreshed assignment cannot open the removed old reference');
 const badRecall=await f.tech.ok(jobPath(job,'question'),{text:'Show that page again',previousCitation:oldAnswer.citations[0]});assert.equal(badRecall.retrieval.code,'stale_citation');
 assert.equal((await f.tech.ok('/pilot/api/provider-status')).mode,'disabled');
});

test('actual manual “where is that setting?” recalls only a current exact applicable prior citation over authenticated HTTP',async t=>{
 const manualPath=process.env.CF_MANUFACTURER_FIXTURE??new URL('../.local/pilot-manuals/MAN-01-00541-1.4.pdf',import.meta.url);
 try{await readFile(manualPath);}catch{t.skip('The separately obtained pinned manufacturer original is required for this acceptance.');return;}
 const f=await fixture(t),manual=await upload(f.owner,await manufacturerFixtureUpload(manualPath));await f.owner.ok(`/pilot/api/documents/${manual.versionId}/approve`,{});
 const job=await f.owner.ok('/pilot/api/jobs',assignment(f.worker,manual),'POST',{'Idempotency-Key':'setting-recall'}),path=jobPath(job,'question');
 const status=await f.tech.ok(path,{text:'Where is Server Comm status?'});assert.equal(status.retrieval.status,'found');assert.equal(status.citations[0].pdfPage,61);assert.equal(status.citations[0].printedLabel,'60');assert.match(status.citations[0].section,/Verifying the Connection/);
 const recalled=await f.tech.ok(path,{text:'where is that setting?',previousCitation:status.citations[0]});assert.equal(recalled.retrieval.requestKind,'setting_recall');assert.equal(recalled.intent,'question');assert.equal(recalled.provenance.model,'none');assert.deepEqual(recalled.citations,status.citations,'Recall preserves the exact section, version, hash and page provenance');assert.match(recalled.reply,/Status/);assert.match(recalled.reply,/Server Comm/);assert.match(recalled.reply,/S_OK/);assert.equal((await f.tech.ok(jobPath(job,'events'))).events.length,0);
 const passage=recalled.retrieval.excerpts[0].text;assert.ok(passage.startsWith('Verifying the Connection'));assert.match(passage,/After connecting and configuring/);assert.match(passage,/selected communication option\./);assert.ok(recalled.reply.includes(passage),'Complete recalled section and prerequisite context fit the reply');for(const text of [passage,recalled.reply])assert.doesNotMatch(text,/RS485-\s*1\s*>\s*Follower Detect|automatic detection|configure the RS485/i,'Preceding configuration steps are not the recalled setting answer');
 const missing=await f.tech.ok(path,{text:'where is that setting?'});assert.equal(missing.retrieval.code,'setting_name_required');assert.match(missing.reply,/Which setting/);assert.equal(missing.citations.length,0);
 for(const previousCitation of [{...status.citations[0],sha256:'0'.repeat(64)},{...status.citations[0],pageIndex:7,pdfPage:8,printedLabel:'7'},{...status.citations[0],pdfPage:62},{...status.citations[0],section:'Invented setting section'}]) {
  const wrong=await f.tech.ok(path,{text:'where is that setting?',previousCitation});assert.equal(wrong.retrieval.code,'stale_citation');assert.equal(wrong.citations.length,0);assert.equal(wrong.reply.includes('S_OK'),false);
 }
 const foreignOwner=client(f.app.baseURL);await foreignOwner.ok('/api/auth/sign-up/email',{name:'Fictional Foreign Owner',email:'foreign-source-owner@example.test',password:'fictional-foreign-source-pass-123'});await foreignOwner.ok('/pilot/api/account/companies',{name:'Fictional Foreign Source Company'});
 const foreign=await upload(foreignOwner,{bytes:Buffer.from('FOREIGN PRIVATE MARKER\nA fictional foreign-company setting source.'),mime:'text/plain',title:'Foreign source',issuer:'Fictional foreign company',revision:'FOREIGN-1',applicability:{kind:'company_policy',requiredIdentityFields:[]}});await foreignOwner.ok(`/pilot/api/documents/${foreign.versionId}/approve`,{});
 const forbidden=await f.tech.ok(path,{text:'where is that setting?',previousCitation:{...status.citations[0],documentId:foreign.documentId,versionId:foreign.versionId,sha256:foreign.sha256}});assert.equal(forbidden.retrieval.code,'stale_citation');assert.equal(JSON.stringify(forbidden).includes('FOREIGN PRIVATE MARKER'),false);
 const mismatch=await f.owner.ok('/pilot/api/jobs',assignment(f.worker,manual,{externalId:'SETTING-MISMATCH-WO',equipment:[{...MATCHED_EQUIPMENT,variant:'LCD'}]}),'POST',{'Idempotency-Key':'setting-mismatch'});
 const wrongEquipment=await f.tech.ok(jobPath(mismatch,'question'),{text:'where is that setting?',previousCitation:status.citations[0]});assert.equal(wrongEquipment.retrieval.code,'equipment_mismatch');assert.equal(wrongEquipment.citations.length,0);
 for(const text of ['Set that setting','Change that setting']) {const change=await f.tech.ok(path,{text,previousCitation:status.citations[0]});assert.equal(change.retrieval.procedureBlocked,true);assert.notEqual(change.retrieval.requestKind,'setting_recall');assert.equal((await f.tech.ok(jobPath(job,'events'))).events.length,0);}
 assert.equal((await client(f.app.baseURL).request(path,{method:'POST',data:{text:'where is that setting?',previousCitation:status.citations[0]}})).status,401);
 await f.owner.ok(`/pilot/api/documents/${manual.versionId}/withdraw`,{reason:'Fictional setting-recall withdrawal'});const withdrawn=await f.tech.ok(path,{text:'where is that setting?',previousCitation:status.citations[0]});assert.equal(withdrawn.retrieval.status,'blocked');assert.equal(withdrawn.citations.length,0);assert.equal(withdrawn.reply.includes('S_OK'),false);
 assert.equal((await f.tech.ok('/pilot/api/provider-status')).mode,'disabled');assert.deepEqual([f.transport.asr,f.transport.model,f.transport.speech],[0,0,0]);
});
