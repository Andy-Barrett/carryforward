import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {WebSocket,WebSocketServer} from 'ws';
import {attachLiveRelay,metaVoiceHandshake,sessionAcknowledgement} from './lib/live-transport.mjs';
import {checkLiveStart,checkPcmFrame,transcriptAssembly,LIVE_MODEL} from './public/live-protocol.js';
import {pcmWav,startLiveVoice} from './public/live-voice.js';
import {inspectWav} from './public/audio.js';
const start={type:'start',version:1,synthetic:true,jobId:'DEMO-LIVE-1',audioId:'ev-0123456789abcdef'};
test('live audio requires explicit fictional identity and bounds bytes, pacing and duration',()=>{
  assert.deepEqual(checkLiveStart(start),start);
  for(const change of [{synthetic:false},{audioId:'foreign'},{authorization:'secret'},{jobId:''}])assert.throws(()=>checkLiveStart({...start,...change}));
  assert.equal(checkPcmFrame(3200,0,100),3200);
  for(const [length,total,elapsed] of [[1,0,100],[20000,0,1000],[3200,959000,31000],[16000,32000,0]])assert.throws(()=>checkPcmFrame(length,total,elapsed));
});
test('cumulative words replace partials; overlapping final turns retain order and do not duplicate',()=>{
  const a=transcriptAssembly();a.accept({type:'speechStart',turnId:1});
  a.accept({type:'transcript',transcript:'four point two'});a.accept({type:'transcript',transcript:'two point four'});
  assert.equal(a.preview,'two point four');assert.equal(a.finalText,'');
  a.accept({type:'speechStart',turnId:2});a.accept({type:'transcript',transcript:'paperwork open'});
  a.accept({type:'speechComplete',turnId:1,transcript:'Two point four.'});assert.equal(a.preview,'Two point four. paperwork open');assert.equal(a.unfinished,true);
  a.accept({type:'speechComplete',turnId:2,transcript:'Paperwork open.'});a.accept({type:'speechComplete',turnId:2,transcript:'Paperwork open.'});
  assert.equal(a.finalText,'Two point four. Paperwork open.');assert.equal(a.unfinished,false);
  assert.throws(()=>a.accept({type:'speechComplete',turnId:2,transcript:'Done.'}));
});
test('PCM worklet preserves rate across blocks and produces a playable bounded mono WAV',async()=>{
  let Processor;const packets=[];
  const context=vm.createContext({sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:event=>{if(event.type==='pcm')packets.push(event.bytes);}};}},registerProcessor:(_,value)=>{Processor=value;},ArrayBuffer,DataView,Math,Number});
  vm.runInContext(await readFile(new URL('./public/pcm-worklet.js',import.meta.url),'utf8'),context);
  const p=new Processor();let total=0;
  while(total<48000){const size=Math.min(128,48000-total);const signal=Float32Array.from({length:size},(_,i)=>Math.sin((total+i)*2*Math.PI*440/48000)*0.5);p.process([[signal,signal]]);total+=size;}
  p.port.onmessage({data:'stop'});const wav=pcmWav(packets),info=inspectWav(wav);
  assert.ok(Math.abs(info.seconds-1)<0.001);assert.equal(info.sampleRate,16000);
  const data=new DataView(wav.buffer);let peak=0;for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(data.getInt16(i,true)));assert.ok(peak>15000&&peak<17000);
});
async function fixture(prepare=async()=>{}){
  const provider=http.createServer(),wss=new WebSocketServer({server:provider});await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  let connections=0;let handshake=null;
  wss.on('connection',ws=>{connections++;ws.on('message',(data,binary)=>{if(binary)return;const item=JSON.parse(data.toString());if(item.type==='endStream'){
    for(const event of [{type:'speechStart',turnId:1},{type:'transcript',transcript:'repair done'},{type:'speechComplete',turnId:1,transcript:'Repair done; warranty open.'}])ws.send(JSON.stringify(event));ws.close(1000);
  }else{handshake=item;ws.send(JSON.stringify({sessionId:'fixture-session'}));}});});
  const server=http.createServer();let busy=false;
  attachLiveRelay(server,{path:'/live',authorize:req=>req.headers.origin==='http://allowed.example'&&req.headers.cookie==='session=fixture',claim:()=>{if(busy)return false;busy=true;return true;},release:()=>{busy=false;},prepare,connect:()=>new WebSocket(`ws://127.0.0.1:${provider.address().port}`),handshake:()=>metaVoiceHandshake('fixture-not-provider-key'),acknowledgement:sessionAcknowledgement});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:`ws://127.0.0.1:${server.address().port}/live`,get connections(){return connections;},get handshake(){return handshake;},get busy(){return busy;},async close(){for(const ws of wss.clients)ws.terminate();wss.close();await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>provider.close(resolve))]);}};
}
function client(url,headers={Origin:'http://allowed.example',Cookie:'session=fixture'}){
 const ws=new WebSocket(url,{headers});const events=[];
 ws.on('message',raw=>events.push(JSON.parse(raw.toString())));ws.on('error',()=>{});
 return {ws,events};
}
async function eventOf(ws,type){for await(const [raw] of onMessages(ws)){const event=JSON.parse(raw.toString());if(event.type===type)return event;}throw Error('Missing event '+type);}
async function* onMessages(ws){const {on}=await import('node:events');yield* on(ws,'message',{close:['close']});}

test('authenticated live relay drains final words and closes without a second dispatch',async()=>{
 let reservations=0;const f=await fixture(async()=>{reservations++;});const {ws,events}=client(f.url);
 try{await once(ws,'open');const ready=eventOf(ws,'ready');ws.send(JSON.stringify(start));await ready;
  assert.equal(reservations,1);assert.equal(f.handshake.mode,'ENDPOINTING');assert.ok(!JSON.stringify(f.handshake).includes(start.jobId));
  ws.send(Buffer.alloc(3200));const closed=once(ws,'close');ws.send(JSON.stringify({type:'endStream'}));await closed;
  assert.equal(events.at(-1).type,'done');assert.equal(events.at(-1).audioDurationMs,100);assert.equal(events.find(e=>e.type==='speechComplete').transcript,'Repair done; warranty open.');assert.equal(f.connections,1);assert.equal(f.busy,false);
 }finally{ws.terminate();await f.close();}
});
test('reservation failure never connects upstream and socket cancellation releases the relay',async()=>{
 const f=await fixture(async()=>{throw Error('Aggregate budget exhausted');});const {ws,events}=client(f.url);
 try{await once(ws,'open');const closed=once(ws,'close');ws.send(JSON.stringify(start));await closed;
  assert.match(events[0].message,/budget exhausted/);assert.equal(f.connections,0);assert.equal(f.busy,false);
 }finally{ws.terminate();await f.close();}
});
test('foreign origin and unpaired sockets are refused before any reservation',async()=>{
 let reservations=0;const f=await fixture(async()=>{reservations++;});
 try{for(const headers of [{Origin:'http://evil.example',Cookie:'session=fixture'},{Origin:'http://allowed.example'}]){const {ws}=client(f.url,headers);await assert.rejects(once(ws,'open'),/403/);ws.terminate();}assert.equal(reservations,0);assert.equal(f.connections,0);}
 finally{await f.close();}
});

test('cancelling while a budget reservation is writing does not release the spending slot early',async()=>{
 let finishReservation;const reservation=new Promise(resolve=>{finishReservation=resolve;});
 const f=await fixture(()=>reservation),{ws}=client(f.url);
 try{await once(ws,'open');ws.send(JSON.stringify(start));await new Promise(resolve=>setTimeout(resolve,10));
  ws.terminate();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.busy,true);assert.equal(f.connections,0);
  finishReservation();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.busy,false);assert.equal(f.connections,0);
 }finally{finishReservation();ws.terminate();await f.close();}
});
test('a premature client disconnect closes the provider and does not reconnect',async()=>{
 const f=await fixture(),{ws}=client(f.url);
 try{await once(ws,'open');const ready=eventOf(ws,'ready');ws.send(JSON.stringify(start));await ready;ws.terminate();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.busy,false);assert.equal(f.connections,1);}
 finally{ws.terminate();await f.close();}
});

test('a suspended audio engine times out instead of leaving the microphone flow stuck',async()=>{
 const names=['AudioContext','AudioWorkletNode','navigator'];const before=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));let closed=0,permissions=0;
 try{
  Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:class{resume(){return new Promise(()=>{});}close(){closed++;return Promise.resolve();}}});
  Object.defineProperty(globalThis,'AudioWorkletNode',{configurable:true,value:class{}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia(){permissions++;}}}});
  const capture=startLiveVoice({jobId:start.jobId,audioId:start.audioId,onComplete:()=>{}});
  await assert.rejects(capture.ready,/Local audio did not start/);assert.equal(closed,1);assert.equal(permissions,0);
 }finally{for(const name of names){const descriptor=before.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});

async function browserCaptureFixture(signal=true) {
  const names=['AudioContext','AudioWorkletNode','navigator','document','window','location','WebSocket'];
  const before=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  let resumes=0,stops=0,sockets=0,node,checkStarted;
  const checking=new Promise(resolve=>{checkStarted=resolve;});
  const audioSession={type:'auto'},track=new EventTarget();track.stop=()=>{stops++;};
  const page=new EventTarget();page.visibilityState='visible';
  const packet=()=>{const bytes=new ArrayBuffer(3200),view=new DataView(bytes);if(signal)for(let i=0;i<1600;i++)view.setInt16(i*2,Math.round(Math.sin(i/8)*8000),true);return bytes;};
  const values={
    AudioContext:class{
      audioWorklet={addModule:async()=>{}};
      resume(){resumes++;return Promise.resolve();}close(){return Promise.resolve();}
      createMediaStreamSource(){return {connect(){queueMicrotask(()=>{node.port.onmessage({data:{type:'pcm',bytes:packet()}});node.port.onmessage({data:{type:'pcm',bytes:packet()}});});},disconnect(){}};}
      createGain(){return {gain:{value:1},connect(){}};}
    },
    AudioWorkletNode:class{constructor(){node=this;this.port={postMessage:()=>queueMicrotask(()=>this.port.onmessage({data:{type:'stopped'}}))};}connect(){}disconnect(){}},
    navigator:{audioSession,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track]})}},document:page,window:new EventTarget(),location:{href:'https://fictional.example/'},
    WebSocket:class{
      static OPEN=1;readyState=1;bufferedAmount=0;
      constructor(){sockets++;queueMicrotask(()=>this.onopen());}
      send(value){if(typeof value!=='string')return;const item=JSON.parse(value);if(item.type==='start')queueMicrotask(()=>this.onmessage({data:JSON.stringify({type:'ready',model:LIVE_MODEL,sessionId:'fixture'})}));if(item.type==='endStream')queueMicrotask(()=>this.onmessage({data:JSON.stringify({type:'done'})}));}
      close(){this.readyState=3;}
    },
  };
  for(const [name,value] of Object.entries(values))Object.defineProperty(globalThis,name,{configurable:true,value});
  return {checking,onStatus:text=>{if(text.startsWith('Checking the microphone'))checkStarted();},get resumes(){return resumes;},get stops(){return stops;},get sockets(){return sockets;},audioSession,
    restore(){for(const [name,descriptor] of before){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}};
}
test('local microphone check resumes after permission, meters PCM and never opens Meta',async()=>{
  const f=await browserCaptureFixture();let result;const levels=[];
  try{const capture=startLiveVoice({jobId:start.jobId,audioId:start.audioId,localCheck:true,onStatus:f.onStatus,onLevel:value=>levels.push(value),onComplete:value=>{result=value;}});
    await capture.ready;assert.equal(f.resumes,2);assert.equal(f.audioSession.type,'play-and-record');assert.equal(f.sockets,0);
    await capture.stop();assert.ok(result.wav.byteLength>44);assert.equal(result.localCheck,true);assert.equal(result.transcription,null);assert.ok(levels.some(value=>value?.rms>0.1));assert.equal(levels.at(-1),null);assert.equal(f.audioSession.type,'auto');assert.ok(f.stops>0);
  }finally{f.restore();}
});
test('silent PCM fails the local preflight without opening or reserving a provider session',async t=>{
  const f=await browserCaptureFixture(false);t.mock.timers.enable({apis:['setTimeout']});
  try{const capture=startLiveVoice({jobId:start.jobId,audioId:start.audioId,onStatus:f.onStatus,onComplete:()=>{}});
    const failed=assert.rejects(capture.ready,/No microphone signal.*Nothing was sent/);await f.checking;t.mock.timers.tick(6000);await failed;
    assert.equal(f.sockets,0);assert.ok(f.stops>0);assert.equal(f.audioSession.type,'auto');
  }finally{t.mock.timers.reset();f.restore();}
});
test('an empty completed ASR stream is an actionable failure, not a successful transcript',async()=>{
  const f=await browserCaptureFixture();let result;
  try{const capture=startLiveVoice({jobId:start.jobId,audioId:start.audioId,onComplete:value=>{result=value;}});await capture.ready;await capture.stop();
    await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.sockets,1);assert.equal(result.transcription,null);assert.match(result.error,/No words came back/);
  }finally{f.restore();}
});
