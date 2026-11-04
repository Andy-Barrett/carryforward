import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function openAssignedVisit('),end=source.indexOf('async function createJobAdvanced(',start);
assert(start>=0&&end>start);
const real=source.slice(start,end);
function harness(load){
 const calls=[],ctx=vm.createContext({epoch:0,account:{principal:{companyId:'a',userId:'tech-a'}},structuredClone,message:text=>calls.push(['message',text]),page:async name=>{ctx.epoch++;calls.push(['page',name]);},field:async id=>{ctx.epoch++;calls.push(['field',id]);await load?.(ctx);}});
 new vm.Script(real).runInContext(ctx);return {ctx,calls};
}
test('a visit-opening failure restores an active list and exposes the previously hidden error',async()=>{
 const h=harness(async()=>{throw Error('Local cache unavailable');});await h.ctx.openAssignedVisit('job-a');
 assert.deepEqual(h.calls.slice(0,2),[['field','job-a'],['page','jobs']]);assert.match(h.calls[2][1],/Local cache unavailable.*Work orders to retry/);assert.equal(h.ctx.epoch,2);
});
test('a late visit failure cannot replace the next account or its status',async()=>{
 const h=harness(async ctx=>{ctx.account={principal:{companyId:'b',userId:'tech-b'}};ctx.epoch++;throw Error('A-only failure');});await h.ctx.openAssignedVisit('job-a');assert.deepEqual(h.calls,[['field','job-a']]);
});
test('a late visit failure cannot pull the same user back from a newer screen',async()=>{
 const h=harness(async ctx=>{ctx.epoch++;throw Error('Old screen failed');});await h.ctx.openAssignedVisit('job-a');assert.deepEqual(h.calls,[['field','job-a']]);
});
test('a late visit failure cannot restore a list after the same account starts a new session',async()=>{
 const h=harness(async ctx=>{ctx.account.principal.sessionId='new-session';throw Error('Old session failed');});await h.ctx.openAssignedVisit('job-a');assert.deepEqual(h.calls,[['field','job-a']]);
});
test('a successful visit opens once without returning to the list or mutating a report',async()=>{
 const h=harness();await h.ctx.openAssignedVisit('job-a');assert.deepEqual(h.calls,[['field','job-a']]);assert.equal(h.ctx.epoch,1);
});
