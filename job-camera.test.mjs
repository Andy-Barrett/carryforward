import test from 'node:test';import assert from 'node:assert/strict';
import {bindJobCamera} from './public/job-camera.js';
import {bindVisitSwipes,swipeTarget} from './public/visit-navigation.js';
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

// A swipe may lose pointerup to WebKit's scroll recognizer. The actual
// touchend must still open the picker once, within that release callback.
function swipeHarness(){
 const listeners=new Map(),options=new Map(),actions=[];let step='companion',idle=true;
 const root={addEventListener(type,callback,option){listeners.set(type,callback);options.set(type,option);},removeEventListener(type){listeners.delete(type);}};
 const dispose=bindVisitSwipes(root,{getStep:()=>step,canNavigate:()=>idle,navigate:page=>actions.push(page),openCamera:()=>actions.push('camera')});
 const point=(x,y,id=1)=>({clientX:x,clientY:y,identifier:id});
 const fire=(type,{x=20,y=100,id=1,control=false,multiple=false,...rest}={})=>{
  const item=point(x,y,id);let prevented=false;
  listeners.get(type)?.({target:{closest:()=>control},touches:type==='touchend'?[]:multiple?[item,point(x+2,y,2)]:[item],changedTouches:[item],cancelable:true,preventDefault(){prevented=true;},...rest});return prevented;
 };
 return {fire,actions,options,dispose,listeners,setStep:value=>step=value,setIdle:value=>idle=value};
}
test('right swipe opens camera once from touchend even when pointer release is canceled',()=>{
 const h=swipeHarness();h.fire('touchstart');assert.equal(h.fire('touchmove',{x:110,y:110}),true);
 h.fire('pointercancel');assert.deepEqual(h.actions,[]);h.fire('touchend',{x:130,y:110});assert.deepEqual(h.actions,['camera']);
 h.fire('touchend',{x:130,y:110});assert.equal(h.actions.length,1);assert.equal(h.options.get('touchmove').passive,false);
 h.fire('touchstart',{x:190});h.fire('touchmove',{x:80});h.fire('touchend',{x:65});assert.deepEqual(h.actions,['camera','jobs']);
 h.dispose();assert.equal(h.listeners.size,0);
});
test('vertical scrolling, controls, canceled or multi-touch gestures cannot open camera',()=>{
 const h=swipeHarness();
 h.fire('touchstart');assert.equal(h.fire('touchmove',{x:24,y:140}),false);h.fire('touchend',{x:150,y:145});
 h.fire('touchstart',{control:true});h.fire('touchend',{x:150});
 h.fire('touchstart');h.fire('touchcancel');h.fire('touchend',{x:150});
 h.fire('touchstart');h.fire('touchmove',{x:100,multiple:true});h.fire('touchend',{x:150});
 h.fire('touchstart',{multiple:true});h.fire('touchend',{x:150});
 h.fire('touchstart');h.fire('touchend',{x:150,id:2});
 h.fire('touchstart');h.fire('touchend',{x:50});assert.deepEqual(h.actions,[]);
 assert.equal(swipeTarget('companion',70,10),'camera');assert.equal(swipeTarget('companion',70,60),null);
});
test('navigation cannot interrupt a busy visit or carry a gesture between pages',()=>{
 const h=swipeHarness();h.setIdle(false);h.fire('touchstart');h.setIdle(true);h.fire('touchend',{x:150});
 h.fire('touchstart');h.setIdle(false);h.fire('touchend',{x:150});h.setIdle(true);
 h.fire('touchstart');h.setStep('jobs');h.fire('touchend',{x:150});assert.deepEqual(h.actions,[]);
 h.fire('touchstart');h.fire('touchend',{x:150});assert.deepEqual(h.actions,['companion']);
});
