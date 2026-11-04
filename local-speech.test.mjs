import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalSpeaker} from './public/local-speech.js';
test('native speech does not call Web Speech cancel and stale completions cannot stop a new reply',()=>{
 const originals={window:globalThis.window,webkit:globalThis.webkit,speechSynthesis:globalThis.speechSynthesis};
 const events=new EventTarget(),sent=[];let webCancels=0,errors=0;
 globalThis.window=events;globalThis.webkit={messageHandlers:{carryForwardSpeech:{postMessage:m=>sent.push(m)}}};globalThis.speechSynthesis={cancel:()=>webCancels++};
 try{const speaker=createLocalSpeaker();speaker.speak('First reply');const first=sent.at(-1).id;speaker.speak('Second reply',{onError:()=>errors++});const second=sent.at(-1).id;
  const event=new Event('carryforward-speech');event.detail={id:first,state:'error'};events.dispatchEvent(event);assert.equal(errors,0);
  const cancelled=new Event('carryforward-speech');cancelled.detail={id:second,state:'error'};events.dispatchEvent(cancelled);assert.equal(errors,1);
  speaker.stop();assert.equal(webCancels,0);assert.ok(sent.some(m=>m.action==='stop'&&m.id===first));
 }finally{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
