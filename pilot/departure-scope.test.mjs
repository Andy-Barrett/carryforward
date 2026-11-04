import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function departure('),end=source.indexOf('async function report(',start);
assert.ok(start>=0 && end>start);
// Execute the real dialog entrypoint, pausing its authenticated request. No
// rendered or device acceptance is implied by this lifecycle regression.
for(const change of ['account','aborted'])test(`departure response after ${change} change cannot reveal a stale dialog`,async()=>{
  let resolve,requested=false;
  const response=new Promise(r=>{resolve=r;});
  const context=vm.createContext({epoch:1,
    scopedApi:()=>async()=>{requested=true;return response;},
    document:{createElement(){assert.fail('A stale response cannot construct a dialog');}},
    esc:value=>String(value),
  });
  new vm.Script(source.slice(start,end)).runInContext(context);
  const controller=new AbortController();
  const pending=context.departure({id:'fictional-a'},false,false,{signal:controller.signal});
  assert.equal(requested,true);
  if(change==='account')context.epoch++;
  else controller.abort();
  resolve({state:{day:{customer:'A-only fictional context'}}});
  await pending;
});
