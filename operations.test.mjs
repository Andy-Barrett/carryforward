import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { OperationsStore } from './lib/operations.mjs';
import { demoOrder } from './public/engine.js';
import { reportRevision } from './public/evidence.js';
const baseReport={technician:'Synthetic technician',summary:'Replaced inverter; registration remains with Operations.',recordedAt:'2026-10-30T15:20:00-05:00',followupOwner:'Operations',promises:'Office will send registration.',interviewRevision:0,entries:{repair:{status:'observed',note:'Replaced inverter',reference:'field-note-1',observedAt:'2026-10-30T15:00:00-05:00'},warranty:{status:'pending',note:'Operations owns registration'}}};
const confirm=(store,id,packet,report=baseReport)=>store.confirm(id,{revision:packet.revision,reportRevision:reportRevision(report),name:report.technician,confirmedAt:'2026-10-30T16:00:00-05:00'});

test('assignment identity is stable and scope conflicts fail rather than merge jobs',()=>{
 const s=new OperationsStore();try{
 const a=s.assign(demoOrder),b=s.assign(demoOrder);assert.equal(a.jobId,b.jobId);
 assert.throws(()=>s.assign({...demoOrder,systemId:'other-system'}),/different scope/);
 const other=s.assign({...demoOrder,id:'DEMO-OTHER'});assert.notEqual(a.jobId,other.jobId);
 }finally{s.close();}
});
test('receipt and acceptance bind exact revision and leave pending work visible',()=>{
 const s=new OperationsStore();try{
 const {jobId}=s.assign(demoOrder);const packet=s.candidate(jobId,baseReport,0);
 assert.throws(()=>s.queue(jobId,packet.revision),/Confirm/);confirm(s,jobId,packet);
 s.queue(jobId,packet.revision);assert.equal(s.inbox()[0].status.received,false);
 assert.throws(()=>s.accept(jobId,packet.revision),/Receipt/);
 s.receipt(jobId,packet.revision);assert.equal(s.accept(jobId,packet.revision).decision,'accepted_with_followups');
 const nextReport={...baseReport,summary:'Corrected: replacement not completed.'};const newer=s.candidate(jobId,nextReport,0);
 assert.notEqual(newer.revision,packet.revision);assert.equal(s.status(jobId).accepted,false);
 assert.throws(()=>s.accept(jobId,packet.revision),/Receipt/);
 assert.throws(()=>s.confirm(jobId,{revision:newer.revision,reportRevision:packet.reportRevision,name:baseReport.technician,confirmedAt:baseReport.recordedAt}),/another report/);
 }finally{s.close();}
});
test('evidence bytes, correction history, confirmation and acceptance survive reopening the database',()=>{
 const dir=mkdtempSync(join(tmpdir(),'carryforward-operations-')),path=join(dir,'store.sqlite');let s=new OperationsStore(path);
 try{
 const {jobId}=s.assign(demoOrder);const bytes=Buffer.from('synthetic encoded-photo fixture'),sha256=createHash('sha256').update(bytes).digest('hex');
 const photo={id:'p1',jobId:demoOrder.id,mime:'image/png',sha256,dataBase64:bytes.toString('base64')};s.admitEvidence(jobId,[photo]);
 const events=[{id:'e1',jobId:demoOrder.id,seq:1,type:'turn.recorded',payload:{id:'t1',text:'Output 4.2 kW'}},{id:'e2',jobId:demoOrder.id,seq:2,type:'turn.recorded',payload:{id:'t2',text:'Correction: 2.4 kW',supersedes:'t1'}},{id:'e3',jobId:demoOrder.id,seq:3,type:'source.added',payload:{id:'p1',kind:'photo',sha256}}];
 s.syncEvents(jobId,events);const report={...baseReport,interviewRevision:3};const packet=s.candidate(jobId,report,3);confirm(s,jobId,packet,report);s.queue(jobId,packet.revision);s.receipt(jobId,packet.revision);s.accept(jobId,packet.revision);
 s.close();s=new OperationsStore(path);
 assert.equal(s.status(jobId).accepted,true);assert.deepEqual(Buffer.from(s.evidence(jobId,'p1').bytes),bytes);
 const read=s.closeout(jobId);assert.equal(read.closeout.interview.turns[0].supersededBy,'t2');assert.equal(read.confirmation.revision,packet.revision);assert.equal(read.evidence[0].sha256,sha256);
 s.admitEvidence(jobId,[{...photo,status:'excluded'}]);assert.equal(s.status(jobId).accepted,false);assert.throws(()=>s.accept(jobId,packet.revision),/Receipt/);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('cross-job evidence and rewriting saved event history are refused',()=>{
 const s=new OperationsStore();try{
 const a=s.assign(demoOrder),b=s.assign({...demoOrder,id:'DEMO-OTHER'});
 const bytes=Buffer.from('fixture'),sha256=createHash('sha256').update(bytes).digest('hex');
 const photo={id:'p1',jobId:demoOrder.id,mime:'image/png',sha256,dataBase64:bytes.toString('base64')};s.admitEvidence(a.jobId,[photo]);
 assert.throws(()=>s.admitEvidence(b.jobId,[photo]),/Wrong-job/);
 assert.throws(()=>s.evidence(b.jobId,'p1'),/not available/);
 const event={id:'e1',jobId:demoOrder.id,seq:1,type:'turn.recorded',payload:{id:'t1',text:'Original claim'}};s.syncEvents(a.jobId,[event]);
 assert.throws(()=>s.syncEvents(a.jobId,[{...event,payload:{...event.payload,text:'Rewrite'}}]),/prefix/);
 assert.throws(()=>s.candidate(a.jobId,{...baseReport,interviewRevision:0},0),/Stale/);
 }finally{s.close();}
});
