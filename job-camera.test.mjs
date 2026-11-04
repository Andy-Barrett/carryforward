import test from 'node:test';import assert from 'node:assert/strict';
import {bindJobCamera} from './public/job-camera.js';
import {bindVisitSwipes,swipeTarget,bindSourceReturn} from './public/visit-navigation.js';
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
 const dispose=bindVisitSwipes(root,{getStep:()=>step,canNavigate:()=>idle,navigate:page=>actions.push(page),openFiles:()=>actions.push('files')});
 const point=(x,y,id=1)=>({clientX:x,clientY:y,identifier:id});
 const fire=(type,{x=20,y=100,id=1,control=false,multiple=false,...rest}={})=>{
  const item=point(x,y,id);let prevented=false;
  listeners.get(type)?.({target:{closest:()=>control},touches:type==='touchend'?[]:multiple?[item,point(x+2,y,2)]:[item],changedTouches:[item],cancelable:true,preventDefault(){prevented=true;},...rest});return prevented;
 };
 return {fire,actions,options,dispose,listeners,setStep:value=>step=value,setIdle:value=>idle=value};
}
test('right swipe opens job files once from touchend even when pointer release is canceled',()=>{
 const h=swipeHarness();h.fire('touchstart');assert.equal(h.fire('touchmove',{x:110,y:110}),true);
 h.fire('pointercancel');assert.deepEqual(h.actions,[]);h.fire('touchend',{x:130,y:110});assert.deepEqual(h.actions,['files']);
 h.fire('touchend',{x:130,y:110});assert.equal(h.actions.length,1);assert.equal(h.options.get('touchmove').passive,false);
 h.fire('touchstart',{x:190});h.fire('touchmove',{x:80});h.fire('touchend',{x:65});assert.deepEqual(h.actions,['files','jobs']);
 h.dispose();assert.equal(h.listeners.size,0);
});
test('vertical scrolling, controls, canceled or multi-touch gestures cannot open files',()=>{
 const h=swipeHarness();
 h.fire('touchstart');assert.equal(h.fire('touchmove',{x:24,y:140}),false);h.fire('touchend',{x:150,y:145});
 h.fire('touchstart',{control:true});h.fire('touchend',{x:150});
 h.fire('touchstart');h.fire('touchcancel');h.fire('touchend',{x:150});
 h.fire('touchstart');h.fire('touchmove',{x:100,multiple:true});h.fire('touchend',{x:150});
 h.fire('touchstart',{multiple:true});h.fire('touchend',{x:150});
 h.fire('touchstart');h.fire('touchend',{x:150,id:2});
 h.fire('touchstart');h.fire('touchend',{x:50});assert.deepEqual(h.actions,[]);
 assert.equal(swipeTarget('companion',70,10),'files');assert.equal(swipeTarget('companion',70,60),null);
});
test('navigation cannot interrupt a busy visit or carry a gesture between pages',()=>{
 const h=swipeHarness();h.setIdle(false);h.fire('touchstart');h.setIdle(true);h.fire('touchend',{x:150});
 h.fire('touchstart');h.setIdle(false);h.fire('touchend',{x:150});h.setIdle(true);
 h.fire('touchstart');h.setStep('jobs');h.fire('touchend',{x:150});assert.deepEqual(h.actions,[]);
 h.fire('touchstart');h.fire('touchend',{x:150});assert.deepEqual(h.actions,['companion']);
});

test('swipe uses explicit picker while tap preserves click; denied activation releases the busy lock',()=>{
 let clicks=0,pickers=0,deny=false;const errors=[];
 const input={value:'',click(){clicks++;},showPicker(){pickers++;if(deny)throw new DOMException('No gesture','NotAllowedError');}};
 const camera=bindJobCamera(input,{onFiles:()=>{},onError:error=>errors.push(error.message)});
 assert.equal(camera.open(),true);assert.equal(clicks,1);assert.equal(pickers,0);input.oncancel();
 assert.equal(camera.open({swipe:true}),true);assert.equal(pickers,1);assert.equal(clicks,1);input.oncancel();
 deny=true;assert.equal(camera.open({swipe:true}),false);assert.equal(camera.busy(),false);assert.match(errors[0],/Tap Photo/);
 assert.equal(camera.open(),true);assert.equal(clicks,2);input.oncancel();camera.dispose();
 const legacy={value:'',click(){clicks++;}};const fallback=bindJobCamera(legacy,{onFiles:()=>{}});
 assert.equal(fallback.open({swipe:true}),true);assert.equal(clicks,3);fallback.dispose();
});


function nativeHarness({onFiles=async()=>{}}={}){
 const listeners=new Map(),messages=[],errors=[];let clicks=0;
 const events={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
 const bridge={postMessage:message=>messages.push(message)};
 const input={value:'',click(){clicks++;},showPicker(){assert.fail('Native swipe must not use WebKit picker');}};
 const camera=bindJobCamera(input,{jobId:'DEMO-JOB',eventTarget:events,nativeBridge:()=>bridge,onFiles,onError:error=>errors.push(error.message)});
 return {camera,messages,errors,listeners,clicks:()=>clicks,fire:async detail=>listeners.get('carryforward:camera')?.({detail}),leave:()=>listeners.get('pagehide')?.()};
}
test('native camera results are request/job bound, admitted once and retain the save lock',async()=>{
 let calls=0,release;const h=nativeHarness({onFiles:async files=>{calls++;assert.equal(files.length,1);assert.equal(files[0].type,'image/jpeg');assert.equal(files[0].name,'camera-test.jpg');assert.deepEqual([...new Uint8Array(await files[0].arrayBuffer())],[255,216,255]);await new Promise(resolve=>release=resolve);}});
 h.camera.open({swipe:true});const request=h.messages[0];assert.equal(request.action,'open');assert.equal(h.camera.busy(),true);assert.equal(h.camera.open(),false);
 const photo={...request,state:'photo',mime:'image/jpeg',name:'camera-test.jpg',dataBase64:'/9j/'};
 await h.fire({...photo,id:'stale'});await h.fire({...photo,jobId:'OTHER'});assert.equal(calls,0);
 const save=h.fire(photo);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,1);assert.equal(h.camera.busy(),true);assert.equal(h.camera.open(),false);
 await h.fire(photo);assert.equal(calls,1);release();await save;assert.equal(h.camera.busy(),false);
 h.camera.open();assert.equal(h.clicks(),1);h.camera.dispose();assert.equal(h.listeners.size,0);
});
test('native cancellation, invalid payloads and a closed page never admit evidence or strand controls',async()=>{
 let calls=0;const h=nativeHarness({onFiles:async()=>calls++});
 const open=()=>{h.camera.open({swipe:true});return h.messages.at(-1);};
 let request=open();await h.fire({...request,state:'cancel'});assert.equal(h.camera.busy(),false);
 request=open();await h.fire({...request,state:'error',message:'Camera unavailable'});assert.match(h.errors.at(-1),/unavailable/);assert.equal(h.camera.busy(),false);
 for(const invalid of [{mime:'image/png',dataBase64:'AAAA'},{mime:'image/jpeg',dataBase64:'!@#'},{mime:'image/jpeg',dataBase64:'A'.repeat(6_666_669)}]){
  request=open();await h.fire({...request,state:'photo',...invalid});assert.equal(h.camera.busy(),false);
 }
 request=open();h.leave();assert.equal(h.messages.at(-1).action,'cancel');assert.equal(h.messages.at(-1).id,request.id);await h.fire({...request,state:'photo',mime:'image/jpeg',dataBase64:'/9j/'});assert.equal(calls,0);
 request=open();h.camera.dispose();assert.equal(h.messages.at(-1).action,'cancel');assert.equal(h.listeners.size,0);assert.equal(calls,0);
});


test('source return uses only the unzoomed right edge and never takes over panning or pinching',()=>{
 const listeners=new Map();let returns=0,zoomed=false;
 const dialog={getBoundingClientRect:()=>({right:390}),addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
 const dispose=bindSourceReturn(dialog,{canReturn:()=>!zoomed,onReturn:()=>returns++});
 const fire=(kind,x,y=100,multi=false)=>{const touch={clientX:x,clientY:y,identifier:1};listeners.get(kind)?.({touches:kind==='touchend'?[]:multi?[touch,{...touch,identifier:2}]:[touch],changedTouches:[touch],target:{closest:()=>false}});};
 fire('touchstart',380);fire('touchend',280);assert.equal(returns,1);
 fire('touchstart',200);fire('touchend',100);assert.equal(returns,1,'Interior image drag is panning.');
 zoomed=true;fire('touchstart',380);fire('touchend',280);assert.equal(returns,1);zoomed=false;
 fire('touchstart',380);fire('touchmove',370,100,true);fire('touchend',280);assert.equal(returns,1);
 fire('touchstart',380);fire('touchend',280,300);assert.equal(returns,1);
 fire('touchstart',380);fire('touchcancel',380);fire('touchend',280);assert.equal(returns,1);
 dispose();assert.equal(listeners.size,0);
});
