import test from 'node:test';
import assert from 'node:assert/strict';
import {startHeldVoice,bindHoldToSpeak} from './public/held-voice.js';
import {inspectWav} from './public/audio.js';
import {createInvestigation,reduceInvestigation,interviewHandoff} from './public/investigation.js';
import {conversationIntent,spokenVisitSummary} from './public/visit-flow.js';
import {demoOrder} from './public/engine.js';
class Target extends EventTarget {disabled=false;attributes={};setAttribute(k,v){this.attributes[k]=v;}setPointerCapture(){}send(type,data={}){const event=new Event(type,{cancelable:true});Object.assign(event,data);this.dispatchEvent(event);}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('one pointer release submits once; click, cancellation, background and disposal never restart or submit',()=>{
 const control=new Target(),win=new Target(),page=new Target();page.visibilityState='visible';let starts=0,stops=0,cancels=0;
 const dispose=bindHoldToSpeak(control,{windowTarget:win,page,start:()=>{starts++;return{stop:()=>stops++,cancel:()=>cancels++};}});
 control.send('click');assert.equal(starts,0);
 control.send('pointerdown',{pointerId:1,button:0});control.send('pointerdown',{pointerId:1,button:0});win.send('pointerup',{pointerId:2});assert.equal(stops,0);win.send('pointerup',{pointerId:1});win.send('pointerup',{pointerId:1});assert.deepEqual([starts,stops,cancels],[1,1,0]);
 control.send('pointerdown',{pointerId:2,button:0});control.send('pointercancel',{pointerId:2});assert.equal(cancels,1);
 control.send('keydown',{key:' ',repeat:false});control.send('keydown',{key:' ',repeat:true});control.send('keyup',{key:' '});assert.deepEqual([starts,stops,cancels],[3,2,1]);
 control.send('pointerdown',{pointerId:3,button:0});page.visibilityState='hidden';page.send('visibilitychange');assert.equal(cancels,2);
 control.send('pointerdown',{pointerId:4,button:0});dispose();control.send('pointerdown',{pointerId:5,button:0});assert.deepEqual([starts,stops,cancels],[5,2,3]);
});
function audioFixture({pending=false,staleResume=false}={}){
 const track=new Target();let stopped=0;track.stop=()=>stopped++;
 const audioSession={type:'playback'},stream={getTracks:()=>[track]},page=new Target(),win=new Target();page.visibilityState='visible';let node,grant;
 class Audio {destination={};audioWorklet={addModule:async()=>{}};resumes=0;resume=()=>staleResume&&++this.resumes===1?new Promise(()=>{}):Promise.resolve();close=async()=>{};createMediaStreamSource(){return{connect(){},disconnect(){}};}createGain(){return{gain:{value:0},connect(){},disconnect(){}};}}
 class MediaNode {constructor(){node=this;this.port={postMessage:()=>queueMicrotask(()=>this.port.onmessage({data:{type:'stopped'}}))};}connect(){}disconnect(){}}
 const mediaDevices={getUserMedia:()=>{audioSession.type='playback';return pending?new Promise(resolve=>grant=()=>resolve(stream)):Promise.resolve(stream);}};
 let result;const states=[];const handle=startHeldVoice({onState:s=>states.push(s),onComplete:r=>{result=r;}},{Audio,MediaNode,mediaDevices,page,windowTarget:win,audioSession});
 return{handle,states,page,track,audioSession,grant:()=>grant(),get result(){return result;},get stopped(){return stopped;},packet(){const bytes=new ArrayBuffer(12800),v=new DataView(bytes);for(let i=0;i<6400;i++)v.setInt16(i*2,Math.round(5000*Math.sin(i*0.17)),true);node.port.onmessage({data:{type:'pcm',bytes}});return bytes;}};
}
test('held capture keeps its first PCM, stops on release and produces exactly one bounded result',async()=>{
 const f=audioFixture();await f.handle.ready;assert.equal(f.audioSession.type,'play-and-record');const first=f.packet();await f.handle.stop();await f.handle.stop();assert.equal(f.result.cancelled,false);assert.equal(f.result.error,null);assert.equal(inspectWav(f.result.wav).seconds,0.4);assert.deepEqual(f.result.wav.slice(44),new Uint8Array(first));assert.ok(f.stopped>0);
});
test('release during permission closes late microphone; background keeps partial audio but cancels dispatch',async()=>{
 const pending=audioFixture({pending:true});await pending.handle.stop();pending.grant();await pending.handle.ready;assert.ok(pending.stopped>0);assert.equal(pending.result.wav,null);assert.match(pending.result.error,/still opening/);
 const f=audioFixture();await f.handle.ready;f.packet();f.page.visibilityState='hidden';f.page.send('visibilitychange');await tick();await f.handle.cancel();assert.equal(f.result.cancelled,true);assert.equal(inspectWav(f.result.wav).seconds,0.4);
});
test('released speech retains unreviewed identity and byte provenance; other unreviewed words cannot be admitted',()=>{
 let state=createInvestigation(demoOrder);const apply=(type,payload)=>state=reduceInvestigation(state,{id:'e'+(state.seq+1),jobId:demoOrder.id,seq:state.seq+1,type,payload});
 apply('source.added',{id:'clip',kind:'audio',sha256:'a'.repeat(64),wavSha256:'b'.repeat(64)});
 const turn={id:'turn',text:'Inverter replaced. Production not checked.',audioId:'clip',transcription:{rawText:'Inverter replaced. Production not checked.',reviewed:false,submission:'hold_release',provenance:{model:'muse-voice-transcribe-1.0',inputSha256:'b'.repeat(64),complete:true}}};
 assert.throws(()=>apply('turn.recorded',{...turn,transcription:{...turn.transcription,submission:'automatic'}}),/reviewed/);
 assert.throws(()=>apply('turn.recorded',{...turn,text:'Production verified'}),/reviewed/);
 assert.throws(()=>apply('turn.recorded',{...turn,transcription:{...turn.transcription,provenance:{...turn.transcription.provenance,inputSha256:'c'.repeat(64)}}}),/reviewed/);
 apply('turn.recorded',turn);const packet=interviewHandoff(state);assert.equal(packet.turns[0].transcription.reviewed,false);assert.equal(packet.turns[0].transcription.submission,'hold_release');assert.ok(packet.branches.every(b=>b.state!=='supported'));
 assert.match(spokenVisitSummary(demoOrder,state),/not been delivered/);assert.equal(conversationIntent('I’m onsite'),'onsite');assert.equal(conversationIntent('Give me the final update'),'final');assert.equal(conversationIntent('No, I meant the reading was before the repair'),'correction');assert.equal(conversationIntent('Monitoring is live'),null);
});


test('a stale gesture-resume promise does not block capture on the new microphone route',async()=>{
 const f=audioFixture({staleResume:true});
 await Promise.race([f.handle.ready,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Capture waited for the stale route')),100);t.unref();})]);
 assert.equal(f.states.at(-1),'listening');f.packet();await f.handle.stop();assert.equal(f.result.error,null);
});
