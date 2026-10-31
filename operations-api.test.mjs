import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { demoOrder } from './public/engine.js';
import { reportRevision } from './public/evidence.js';

test('real HTTP assignment, confirmed delivery, source receipt and acceptance remain revision-specific',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'carryforward-api-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'0',CARRYFORWARD_META_ENABLED:'0',CARRYFORWARD_OPERATIONS_DB:join(dir,'operations.sqlite')},stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((resolve,reject)=>{
    let text='';const timer=setTimeout(()=>reject(new Error('Server did not become ready')),10000);
    child.on('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});
    child.stdout.on('data',data=>{text+=data;const match=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  });
  const home=await fetch(base),cookie=home.headers.get('set-cookie').split(';')[0];
  const call=async(path,body)=>{
    const response=await fetch(base+'/api/v1/'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:base,'X-CarryForward-Intent':'operations',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json()};
  };
  assert.equal((await fetch(base+'/api/v1/simulator/inbox')).status,403);
  const {data:assignment}=await call('work-orders',{order:demoOrder});assert.ok(assignment.jobId);const path=`jobs/${assignment.jobId}`;
  assert.equal((await call('work-orders',{order:demoOrder})).data.jobId,assignment.jobId);
  assert.equal((await call(path+'/evidence',{photos:[]})).status,200);
  assert.equal((await call(path+'/turns',{events:[]})).status,200);
  const report={technician:'Synthetic tech',summary:'Inspected inverter; production remains unverified.',recordedAt:'2026-10-30T16:00:00-05:00',followupOwner:'Operations',entries:{},interviewRevision:0};
  const {data:packet}=await call(path+'/closeout',{report,eventRevision:0});assert.ok(packet.revision);
  assert.equal((await call(path+'/deliveries',{revision:packet.revision})).status,400);
  assert.equal((await call(path+'/confirmations',{revision:packet.revision,reportRevision:reportRevision(report),name:report.technician,confirmedAt:report.recordedAt})).status,200);
  assert.equal((await call(path+'/deliveries',{revision:packet.revision})).status,200);
  const inbox=(await call('simulator/inbox')).data;assert.equal(inbox.items[0].packet.revision,packet.revision);assert.equal(inbox.items[0].status.received,false);
  assert.equal((await call(path+'/acceptances',{revision:packet.revision})).status,400);
  assert.equal((await call(path+'/receipts',{revision:packet.revision})).status,200);
  assert.equal((await call(path+'/acceptances',{revision:packet.revision})).data.decision,'accepted_with_followups');
  const changed=await call(path+'/closeout',{report:{...report,summary:'Correction: site visit postponed.'},eventRevision:0});assert.notEqual(changed.data.revision,packet.revision);
  assert.equal((await call(path+'/acceptances',{revision:packet.revision})).status,400);
  assert.equal((await call(path)).data.accepted,false);
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await rm(dir,{recursive:true,force:true});}
});
