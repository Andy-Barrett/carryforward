import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { dayAt, distanceKm, suggestNearbyOrder, dayLegs } from './public/day-plan.js';
import { createPilotServer } from './server.mjs';
import { seedFictionalPilot, client } from './demo.mjs';
import { demoOrder } from '../public/engine.js';
import { evidenceRevision } from '../public/evidence.js';

const location = (longitude, latitude=35) => ({ latitude, longitude, radius:150 });
function stop(id, longitude, shop=location(-92)) { return { id,locations:{site:location(longitude),shop} }; }

test('nearby suggestion uses assignment coordinates and preserves the technician order until accepted',()=>{
  const jobs=[stop('far',-91),stop('near',-91.99),stop('middle',-91.5)];
  const suggested=suggestNearbyOrder(jobs);
  assert.deepEqual(suggested.jobIds,['near','middle','far']);
  assert.equal(suggested.start,'assigned shop');
  assert.deepEqual(jobs.map(j=>j.id),['far','near','middle']);
  assert.ok(dayLegs(jobs)[0].km>dayLegs([jobs[1],jobs[2],jobs[0]])[0].km);
  assert.ok(Math.abs(distanceKm(location(0,0),location(1,0))-111.195)<0.01);
  assert.equal(distanceKm(location(0,0),location(0,0)),0);
});

test('missing/ambiguous coordinates never imply a route; mixed shops keep the first chosen stop',()=>{
  for(const site of [null,{latitude:'35',longitude:-92},{latitude:91,longitude:0},{...location(-92),ambiguous:true}])
    assert.equal(suggestNearbyOrder([stop('a',-92),{id:'b',locations:{site}}]).available,false);
  const jobs=[stop('first',-91.8),stop('far',-91),stop('near',-91.79,location(-93))];
  assert.deepEqual(suggestNearbyOrder(jobs).jobIds,['first','near','far']);
  assert.equal(suggestNearbyOrder(jobs).start,'your first stop');
  assert.equal(dayLegs(jobs)[0].km,null);
  assert.equal(dayAt('America/Chicago',Date.parse('2026-11-05T01:00:00Z')),'2026-11-04');
  assert.equal(dayAt('Asia/Tokyo',Date.parse('2026-11-05T01:00:00Z')),'2026-11-05');
});

async function freePort(){const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
test('actual HTTP day planning persists order, isolates users and drives current/next-stop departure checks',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cf-day-plan-')),port=await freePort(),origin=`http://127.0.0.1:${port}`;
  let app=await createPilotServer({directory,port});await app.listen();
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const [a,b]=await seedFictionalPilot({origin}),worker=client(origin),other=client(origin),owner=client(origin);
  await worker.ok('/api/auth/sign-in/email',{method:'POST',body:a.tech});
  await other.ok('/api/auth/sign-in/email',{method:'POST',body:b.tech});
  await owner.ok('/api/auth/sign-in/email',{method:'POST',body:a.owner});
  const timeZone='America/Chicago',date=dayAt(timeZone),url=`/pilot/api/day-plan?date=${date}&timeZone=${timeZone}`;
  const initial=await worker.ok(url);assert.deepEqual(initial.jobIds,[]);
  assert.equal((await client(origin).request(url,{headers:{Authorization:'Bearer '+a.integration.token}})).status,403);
  assert.equal((await worker.request(`/pilot/api/day-plan?date=2099-01-01&timeZone=${timeZone}`)).status,400);
  assert.equal((await worker.request(`/pilot/api/day-plan?date=${date}&timeZone=not-a-time-zone`)).status,400);
  const input={version:'carryforward.assignment.v2',externalId:'DAY-NEXT',sourceRevision:'1',assigneeUserIds:[a.technicianId],customerRef:'day-next-customer',siteRef:'day-next-site',systemRef:'day-next-system',equipment:[],contextRefs:[],locations:{shop:location(-92),site:location(-91.8)},departureChecklist:[{id:'ladder',label:'Extension ladder',requirement:'required',source:'Fictional dispatcher requirement'}],order:{...demoOrder,customer:'Next customer (fictional)',customerContact:undefined,property:'Fictional next site'}};
  const next=await owner.ok('/pilot/api/jobs',{method:'POST',body:input,headers:{'Idempotency-Key':randomUUID()}});
  const ownerAccount=await owner.ok('/pilot/api/account');
  const notAssigned=await owner.ok('/pilot/api/jobs',{method:'POST',body:{...input,externalId:'DAY-NOT-ASSIGNED',assigneeUserIds:[ownerAccount.principal.userId]},headers:{'Idempotency-Key':randomUUID()}});
  async function save(jobIds,revision=null,extra={}){return worker.request('/pilot/api/day-plan',{method:'POST',body:{date,timeZone,revision,jobIds,...extra}});}
  assert.equal((await save([b.assignmentId])).status,404);
  assert.equal((await save([notAssigned.id])).status,404);
  assert.equal((await save([a.assignmentId,a.assignmentId])).status,400);
  assert.equal((await save(Array.from({length:21},(_,i)=>'unavailable-'+i))).status,400);
  assert.equal((await save([a.assignmentId],null,{companyId:b.companyId})).status,400);
  const saved=await save([a.assignmentId,next.id]);assert.equal(saved.status,200);const revision=saved.value.revision;
  assert.deepEqual((await other.ok(url)).jobIds,[]);
  assert.equal((await save([next.id,a.assignmentId])).status,409);
  const prep=await worker.ok(`/pilot/api/jobs/${a.assignmentId}/reminders`,{method:'POST',body:{}});
  assert.equal(prep.state.day.nextStop.id,next.id);
  assert.equal(prep.state.checklist.length,3);
  assert.match(prep.state.checklist.find(i=>i.label==='Extension ladder').source,/DAY-NEXT/);
  assert.deepEqual(prep.view.readyToLeave.items,['Diagnostic kit','Extension ladder']);
  await worker.ok(`/pilot/api/jobs/${a.assignmentId}/reminders`,{method:'POST',body:{event:{type:'ack_item',itemId:prep.state.checklist[0].id,briefRevision:prep.state.briefRevision}}});
  const nativeBefore=(await worker.ok('/pilot/api/reminders/native-state')).active;
  // Report delivery is independent of packing for the next stop.
  const candidate=await worker.ok(`/pilot/api/jobs/${a.assignmentId}/closeout`,{method:'POST',body:{eventRevision:0,report:{technician:a.tech.name,summary:'Fictional inspection. Operations owns remaining checks.',recordedAt:new Date().toISOString(),followupOwner:'Operations',promises:'Operations to review.',interviewRevision:0,evidenceRevision:evidenceRevision([]),entries:{}}}});
  await worker.ok(`/pilot/api/jobs/${a.assignmentId}/confirmations`,{method:'POST',body:{name:a.tech.name,revision:candidate.revision,reportRevision:candidate.reportRevision,confirmedAt:new Date().toISOString()}});
  await worker.ok(`/pilot/api/jobs/${a.assignmentId}/deliveries`,{method:'POST',body:{revision:candidate.revision}});
  let current=await worker.ok(`/pilot/api/jobs/${a.assignmentId}/reminders`,{method:'POST',body:{}});
  assert.equal(current.state.reportStatus,'sent');assert.equal(current.view.finishVisit.reminder.reason,'next_stop_preparation');
  assert.deepEqual(current.view.finishVisit.reminder.items,['Extension ladder']);
  const nativeNext=(await worker.ok('/pilot/api/reminders/native-state')).active;
  assert.equal(nativeNext.reminders[1].reason,'next_stop_preparation');
  assert.equal(JSON.stringify(nativeNext).includes('Next customer'),false,'Native previews do not contain next customer identity.');
  await app.close();app=await createPilotServer({directory,port});await app.listen();
  assert.deepEqual((await worker.ok(url)).jobIds,[a.assignmentId,next.id]);
  assert.equal((await worker.ok(`/pilot/api/jobs/${a.assignmentId}/reminders`,{method:'POST',body:{}})).state.day.nextStop.id,next.id);
  const changed=await save([next.id,a.assignmentId],revision);assert.equal(changed.status,200);
  current=await worker.ok(`/pilot/api/jobs/${a.assignmentId}/reminders`,{method:'POST',body:{event:{type:'ack_item',itemId:prep.state.checklist[0].id,briefRevision:prep.state.briefRevision}}});
  assert.equal(current.state.day.nextStop,null);assert.deepEqual(current.state.acknowledged,[]);
  const after=(await worker.ok('/pilot/api/reminders/native-state')).active;
  assert.equal(after.scope.jobId,a.assignmentId,'Changing a day plan never silently opens another job.');
  assert.notEqual(after.reminders[0].id,nativeBefore.reminders[0].id);assert.equal(after.reminders[1].needed,false);
  // An assignment change is revalidated, never retained merely because it was selected.
  await owner.ok('/pilot/api/jobs',{method:'POST',body:{...input,sourceRevision:'2',assigneeUserIds:[ownerAccount.principal.userId]},headers:{'Idempotency-Key':randomUUID(),'If-Match':next.revision}});
  const filtered=await worker.ok(url);assert.deepEqual(filtered.jobIds,[a.assignmentId]);assert.equal(filtered.unavailableCount,1);
  current=await worker.ok(`/pilot/api/jobs/${a.assignmentId}/reminders`,{method:'POST',body:{}});
  assert.equal(current.view.readyToLeave.reason,'day_review_required');
  assert.equal(JSON.stringify(current.state).includes('Next customer'),false);
  const tomorrow=Date.now()+86_400_000;
  assert.equal(app.store.currentDayPlan((await worker.ok('/pilot/api/account')).principal,tomorrow),null);
});
