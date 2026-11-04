import test from 'node:test';
import assert from 'node:assert/strict';
import { createReminderState, applyReminderEvent, reminderView, nativeReminderSnapshot, validRegion, REPORT_STATES } from './reminders.mjs';
const T = 1_800_000_000_000;
const fixture = extra => ({ companyId:'company-a', userId:'tech-a', jobId:'job-a', visitId:'visit-a', assignmentRevision:'assignment-1', briefRevision:'brief-1', reportRevision:'report-1', reportStatus:'no_report', expiresAt:T+3_600_000, checklist:[{id:'ladder',label:'Extension ladder',requirement:'required',source:'Dispatcher assignment v1'},{id:'meter',label:'Approved test meter',requirement:'required',source:'Approved work order v1'},{id:'shade',label:'Sun shade',requirement:'suggested',source:'Dispatcher suggestion'},{id:'part',label:'Replacement part',requirement:'unknown',source:'Dispatcher: await identification'}], onsiteOnly:['Record the intact label while parked onsite'], shop:{latitude:35,longitude:-92,radius:200}, site:{latitude:35.01,longitude:-92,radius:200}, ...extra });
function event(state, e, at=T) { return applyReminderEvent(state,e,at); }
function enabled(extra={}) { let s=createReminderState(fixture(extra),null,T); s=event(s,{type:'opt_in',enabled:true}); return event(s,{type:'permissions',location:'when_in_use',notifications:'granted',precise:true}); }
function exit(s,kind='shop',offset=0) { s=event(s,{type:'position',kind,position:'inside',fresh:true,accurate:true},T+offset); s=event(s,{type:'position',kind,position:'outside',fresh:true,accurate:true},T+offset+31_000); return event(s,{type:'tick'},T+offset+47_000); }

test('required/suggested/unknown packing remain distinct; no GPS acknowledgement',()=>{
  const s=exit(enabled()); const v=reminderView(s,T+47_000);
  assert.equal(v.pending.length,1); assert.equal(v.pending[0].reason,'brief_unreviewed');
  assert.deepEqual(v.readyToLeave.items,['Extension ladder','Approved test meter']);
  assert.equal(s.briefReviewed,false); assert.deepEqual(s.acknowledged,[]);
  assert.equal(v.checklist.filter(i=>i.requirement==='unknown').length,1);
});
test('explicit current-revision packing and brief review suppress unchanged reminder',()=>{
  let s=enabled(); s=event(s,{type:'review_brief',briefRevision:'brief-1'});
  for(const itemId of ['ladder','meter'])s=event(s,{type:'ack_item',itemId,briefRevision:'brief-1'});
  assert.equal(reminderView(exit(s),T+47_000).pending.length,0);
  assert.equal(nativeReminderSnapshot(s,T).reminders[0].needed,false);
});
test('a sent report does not suppress missing next-stop equipment; explicit packing clears it',()=>{
  let s=enabled({reportStatus:'sent',nextStopItemIds:['ladder']});
  s=exit(s,'site');
  assert.equal(reminderView(s,T+47_000).pending[0].reason,'next_stop_preparation');
  assert.deepEqual(nativeReminderSnapshot(s,T+47_000).reminders[1].items,['Extension ladder']);
  s=event(s,{type:'ack_item',itemId:'ladder',briefRevision:'brief-1'},T+48_000);
  assert.equal(reminderView(s,T+48_000).finishVisit.reminder,null);
  assert.deepEqual(s.pending,{});
  assert.equal(s.reportStatus,'sent');
});
test('changed day preparation requires review and cannot be acknowledged as complete by an exit',()=>{
  const s=exit(enabled({reportStatus:'accepted',preparationWarning:'A selected stop was reassigned.'}),'site');
  assert.equal(reminderView(s,T+47_000).finishVisit.reminder.reason,'day_review_required');
  assert.equal(nativeReminderSnapshot(s,T+47_000).reminders[1].reason,'day_review_required');
  assert.throws(()=>createReminderState(fixture({nextStopItemIds:['not-in-checklist']}),null,T),/current checklist/);
});
test('material checklist or brief revision reopens packing; stale ack ignored',()=>{
  let s=enabled();s=event(s,{type:'ack_item',itemId:'ladder',briefRevision:'brief-1'});
  s=createReminderState(fixture({briefRevision:'brief-2'}),s,T+1000);
  assert.deepEqual(s.acknowledged,[]); assert.equal(s.briefReviewed,false);
  s=event(s,{type:'ack_item',itemId:'ladder',briefRevision:'brief-1'},T+1001);assert.deepEqual(s.acknowledged,[]);
  s=createReminderState(fixture({checklist:[...fixture().checklist,{id:'ppe',label:'Task PPE',requirement:'required',source:'Revised assignment'}]}),s,T+1002);
  assert.equal(s.checklist.length,5);
});
test('site report states distinguish unsent from sent and accepted followups',()=>{
  for(const reportStatus of REPORT_STATES){
    const s=exit(enabled({reportStatus}),'site');const v=reminderView(s,T+47_000);
    assert.equal(v.pending.length,['no_report','draft','unconfirmed','confirmed_unsent'].includes(reportStatus)?1:0,reportStatus);
    if(reportStatus==='confirmed_unsent')assert.match(v.pending[0].message,/waiting to send/);
    if(reportStatus==='draft')assert.match(v.pending[0].message,/still a draft/);
  }
});
test('delivery and report revision changes remove stale notification without closing work',()=>{
  let s=exit(enabled({reportStatus:'unconfirmed'}),'site');assert.equal(Object.keys(s.pending).length,1);
  const old=nativeReminderSnapshot(s,T+47_000).reminders[1].id;
  s=createReminderState(fixture({reportStatus:'sent',reportRevision:'report-2'}),s,T+48_000);
  assert.deepEqual(s.pending,{});assert.equal(reminderView(s,T+48_000).finishVisit.reminder,null);
  assert.notEqual(nativeReminderSnapshot(s,T+48_000).reminders[1].id,old);
  assert.deepEqual(s.onsiteOnly,['Record the intact label while parked onsite']);
});
test('initial outside, short drive-by and unknown fix never infer an exit',()=>{
  for(const route of ['outside','short','unknown']){
    let s=enabled();
    if(route==='short')s=event(s,{type:'position',kind:'shop',position:'inside',fresh:true,accurate:true},T);
    s=event(s,{type:'position',kind:'shop',position:route==='unknown'?'unknown':'outside',fresh:true,accurate:true},T+1000);
    s=event(s,{type:'tick'},T+100_000);assert.deepEqual(s.pending,{},route);
  }
});
test('grace period and re-entry suppress brief exits and jitter',()=>{
  let s=enabled();s=event(s,{type:'position',kind:'shop',position:'inside',fresh:true,accurate:true},T);
  s=event(s,{type:'position',kind:'shop',position:'outside',fresh:true,accurate:true},T+31_000);
  assert.deepEqual(s.pending,{});
  s=event(s,{type:'position',kind:'shop',position:'inside',fresh:true,accurate:true},T+35_000);
  s=event(s,{type:'tick'},T+90_000);assert.deepEqual(s.pending,{});
});
test('deduplicates exits/events; dismiss binds exact revision; changed report reopens',()=>{
  let s=exit(enabled({reportStatus:'draft'}),'site');const p=Object.values(s.pending)[0];
  s=event(s,{type:'tick',id:'tick-1'},T+48_000);s=event(s,{type:'tick',id:'tick-1'},T+48_001);
  assert.equal(Object.values(s.pending)[0].id,p.id);
  s=event(s,{type:'dismiss',kind:'site'},T+49_000);s=event(s,{type:'tick'},T+50_000);assert.deepEqual(s.pending,{});
  s=createReminderState(fixture({reportStatus:'draft',reportRevision:'report-2'}),s,T+51_000);
  s=event(s,{type:'tick'},T+52_000);assert.equal(Object.keys(s.pending).length,1);
});
test('snooze and per-visit mute avoid repeated interruptions',()=>{
  let s=exit(enabled());s=event(s,{type:'snooze',kind:'shop',minutes:5},T+48_000);
  s=event(s,{type:'tick'},T+60_000);assert.deepEqual(s.pending,{});
  s=event(s,{type:'tick'},T+349_000);assert.equal(Object.keys(s.pending).length,1);
  s=event(s,{type:'mute',kind:'shop'},T+350_000);s=event(s,{type:'tick'},T+400_000);assert.deepEqual(s.pending,{});
});
test('missing, ambiguous, overlapping locations and denied/approximate permissions preserve manual fallback',()=>{
  for(const extra of [{shop:null,site:null},{shop:{...fixture().shop,ambiguous:true},site:null},{site:{...fixture().shop}}]){
    let s=exit(enabled(extra));assert.deepEqual(s.pending,{});assert.equal(reminderView(s,T+47_000).manualAvailable,true);
  }
  for(const permission of [{location:'denied',notifications:'granted',precise:true},{location:'when_in_use',notifications:'denied',precise:true},{location:'when_in_use',notifications:'granted',precise:false}]){
    let s=event(enabled(),{type:'permissions',...permission});s=exit(s);assert.deepEqual(s.pending,{});assert.equal(reminderView(s,T+47_000).manualAvailable,true);
  }
});
test('stale/inaccurate locations and earlier events cannot arm a reminder',()=>{
  let s=enabled();s=event(s,{type:'position',kind:'shop',position:'inside',fresh:true,accurate:true},T+5000);
  s=event(s,{type:'position',kind:'shop',position:'outside',fresh:true,accurate:true,at:T+4000},T+40_000);assert.equal(s.fences.shop.position,'inside');
  s=event(s,{type:'position',kind:'shop',position:'outside',fresh:false,accurate:true},T+41_000);
  s=event(s,{type:'tick'},T+100_000);assert.deepEqual(s.pending,{});
});
test('logout, revocation, reassignment and changed destination cancel every pending scope',()=>{
  for(const type of ['logout','revoked','reassigned','destination_changed']){
    const s=event(exit(enabled()),{type},T+48_000);assert.equal(s.access,false);assert.deepEqual(s.pending,{});assert.equal(nativeReminderSnapshot(s,T+48_000),null);
  }
});
test('company/user/assignment switch drops prior acknowledgements, opt-in, muted state and notifications',()=>{
  let s=exit(enabled());s=event(s,{type:'mute',kind:'site'},T+48_000);
  const switched=createReminderState(fixture({companyId:'company-b',userId:'tech-b',assignmentRevision:'assignment-2'}),s,T+49_000);
  assert.notEqual(switched.scopeKey,s.scopeKey);assert.equal(switched.optedIn,false);assert.deepEqual(switched.pending,{});assert.deepEqual(switched.muted,{});
  assert.deepEqual(event(switched,{type:'ack_item',scopeKey:s.scopeKey,itemId:'meter',briefRevision:'brief-1'},T+49_001).acknowledged,[]);
});
test('offline access expires; original local checklist remains but no active native grants',()=>{
  let s=exit(enabled());s=event(s,{type:'tick'},T+3_600_001);
  assert.deepEqual(s.pending,{});assert.equal(nativeReminderSnapshot(s,T+3_600_001),null);
  assert.equal(reminderView(s,T+3_600_001).manualAvailable,false);assert.equal(s.checklist.length,4);
});
test('manual Finish visit highlights onsite-only gaps without changing report or obligations',()=>{
  let s=enabled({reportStatus:'accepted_with_followups'});s=event(s,{type:'finish_visit'},T+1000);
  assert.equal(s.reportStatus,'accepted_with_followups');assert.equal(reminderView(s,T+1000).finishVisit.checkedAt,T+1000);
  assert.equal(reminderView(s,T+1000).finishVisit.onsiteOnly.length,1);assert.equal(reminderView(s,T+1000).finishVisit.reminder,null);
});
test('bounded scope, source and geometry validation fail closed',()=>{
  assert.throws(()=>createReminderState(fixture({companyId:''}),null,T));
  assert.throws(()=>createReminderState(fixture({expiresAt:T-1}),null,T));
  assert.throws(()=>createReminderState(fixture({checklist:[{id:'x',label:'Ladder',requirement:'required'}]}),null,T));
  assert.equal(validRegion({latitude:200,longitude:0,radius:200}),null);
  assert.equal(validRegion({latitude:0,longitude:0,radius:20}),null);
  assert.ok(createReminderState(fixture({expiresAt:T+10*3_600_000}),null,T).expiresAt===T+4*3_600_000);
});

test('permission revocation and opt-out require a new inside transition before rearming',()=>{
  for(const revoked of [{type:'permissions',location:'denied',notifications:'granted',precise:true},{type:'opt_in',enabled:false}]){
    let s=exit(enabled());s=event(s,revoked,T+48_000);assert.deepEqual(s.pending,{});
    s=event(s,{type:'opt_in',enabled:true},T+49_000);s=event(s,{type:'permissions',location:'when_in_use',notifications:'granted',precise:true},T+49_001);
    s=event(s,{type:'position',kind:'shop',position:'outside',fresh:true,accurate:true},T+50_000);s=event(s,{type:'tick'},T+100_000);
    assert.deepEqual(s.pending,{});assert.equal(s.fences.shop.insideAt,null);
  }
});
