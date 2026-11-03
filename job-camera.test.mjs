import test from 'node:test';import assert from 'node:assert/strict';
import {bindJobCamera} from './public/job-camera.js';
import {visitTrialCases,readTrialFeedback,saveTrialFeedback} from './public/visit-trial.js';
import {detailedDemoOrder} from './public/demo-work-orders.js';
test('camera opens synchronously once, cancellation admits nothing, failed admission cannot show success',async()=>{
  let clicks=0,calls=0,blocked=false,fail=false,release;const errors=[],states=[];
  const input={value:'old',files:[],click(){clicks++;}};
  const camera=bindJobCamera(input,{canOpen:()=>!blocked,onState:value=>states.push(value),onFiles:async files=>{calls++;assert.equal(files.length,1);if(fail)throw Error('Disk full');await new Promise(resolve=>release=resolve);},onError:error=>errors.push(error.message)});
  blocked=true;assert.equal(camera.open(),false);assert.equal(clicks,0);blocked=false;
  assert.equal(camera.open(),true);assert.equal(clicks,1);assert.equal(input.value,'');assert.equal(camera.open(),false);
  input.oncancel();assert.equal(calls,0);assert.equal(camera.busy(),false);
  camera.open();input.files=[{name:'display.jpg'}];const save=input.onchange();assert.equal(camera.busy(),true);assert.equal(camera.open(),false);release();await save;assert.equal(camera.busy(),false);
  fail=true;camera.open();await input.onchange();assert.deepEqual(errors,['Disk full']);assert.equal(camera.busy(),false);
  camera.dispose();assert.equal(camera.open(),false);assert.equal(input.onchange,null);assert.equal(states.at(-1),false);
});
test('trial feedback is scoped, bounded and separate from field evidence',()=>{
 const cases=visitTrialCases(detailedDemoOrder);assert.equal(cases.length,8);assert.ok(cases.some(c=>c.id==='correction'));assert.match(cases.find(c=>c.id==='photo').expected,/not Meta review/);assert.deepEqual(visitTrialCases({id:'REAL'}),[]);
 let stored;const storage={setItem:(key,value)=>stored=value};const results=[{id:'correction',result:'needs_work',note:'Targeted the wrong reading',at:new Date().toISOString()}];
 saveTrialFeedback(storage,'test',detailedDemoOrder.id,results);assert.deepEqual(readTrialFeedback(stored,detailedDemoOrder.id),results);assert.deepEqual(readTrialFeedback(stored,'OTHER'),[]);
 assert.throws(()=>saveTrialFeedback(storage,'test',detailedDemoOrder.id,[{...results[0],result:'accepted_by_operations'}]),/Invalid/);
 assert.throws(()=>saveTrialFeedback(storage,'test',detailedDemoOrder.id,[{...results[0],note:'x'.repeat(1001)}]),/Invalid/);
 assert.throws(()=>saveTrialFeedback({setItem(){throw Error('Quota');}},'test',detailedDemoOrder.id,results),/Quota/);
});
