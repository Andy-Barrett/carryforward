import test from 'node:test';import assert from 'node:assert/strict';
import {isOffsetObservationTime,observationInputParts,collectObservationTime} from './public/observation-time.js';
import {demoOrder,reviewReport} from './public/engine.js';
test('observation times require an explicit known offset and a real calendar time',()=>{
 for(const s of ['2026-10-30T15:12:00-05:00','2026-10-30T20:12:00Z','2024-02-29T12:00+05:45'])assert.equal(isOffsetObservationTime(s),true,s);
 for(const s of ['2026-10-30T15:12','2026-02-29T12:00Z','2026-04-31T12:00Z','2026-10-30T24:00Z','2026-10-30T12:00+14:30','2026-10-30T12:00-00:00','2026-10-30T12:00+05:99'])assert.equal(isOffsetObservationTime(s),false,s);
});
test('form roundtrips preserve existing instants and never infer offsets for legacy times',()=>{
 const original='2026-10-30T15:12:33.125-05:00';const parts=observationInputParts(original);
 assert.equal(collectObservationTime(parts.wall,parts.offset,original),original);
 const legacy='2026-10-30T15:12';assert.equal(observationInputParts(legacy).offset,'');assert.equal(collectObservationTime(legacy,'',legacy),legacy);
 assert.equal(collectObservationTime(legacy,'-05:00',legacy),'2026-10-30T15:12-05:00');
 assert.equal(Date.parse('2026-10-30T15:12-05:00'),Date.parse('2026-10-30T20:12Z'));
});
test('an offset-free legacy observation remains open until the technician resolves it',()=>{
 const entry={status:'observed',note:'Measured output',reference:'meter-photo',observedAt:'2026-10-30T15:12'};
 const report={technician:'Synthetic technician',summary:'Synthetic observation',recordedAt:'2026-10-30T20:12:00Z',entries:{production:entry}};assert.equal(reviewReport(demoOrder,report).findings.find(f=>f.id==='production').outcome,'open');
 assert.match(reviewReport(demoOrder,report).findings.find(f=>f.id==='production').reason,/UTC offset/);
 report.entries.production.observedAt+='-05:00';assert.equal(reviewReport(demoOrder,report).findings.find(f=>f.id==='production').outcome,'documented');
});

test('report creation time cannot use an offset-free timestamp',()=>{
 const report={technician:'Synthetic technician',summary:'Synthetic visit',recordedAt:'2026-10-30T15:12',entries:{}};
 assert.throws(()=>reviewReport(demoOrder,report),/Recorded time.*UTC offset/);
});
