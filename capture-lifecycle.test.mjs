import test from 'node:test';
import assert from 'node:assert/strict';
import {watchCaptureInterruptions} from './public/capture-lifecycle.js';
const setup=()=>{const page=new EventTarget(),windowTarget=new EventTarget(),track=new EventTarget();page.visibilityState='visible';let count=0;
 const cleanup=watchCaptureInterruptions({page,windowTarget,tracks:[track],onInterrupt:()=>count++});
 return {page,windowTarget,track,cleanup,count:()=>count};};
test('backgrounding, page exit and lost microphone interrupt once without restarting',()=>{
 for(const reason of ['hidden','pagehide','ended']){const s=setup();
 s.page.dispatchEvent(new Event('visibilitychange'));assert.equal(s.count(),0);
 if(reason==='hidden'){s.page.visibilityState='hidden';s.page.dispatchEvent(new Event('visibilitychange'));}
 if(reason==='pagehide')s.windowTarget.dispatchEvent(new Event('pagehide'));
 if(reason==='ended')s.track.dispatchEvent(new Event('ended'));
 assert.equal(s.count(),1);
 s.track.dispatchEvent(new Event('ended'));s.windowTarget.dispatchEvent(new Event('pagehide'));assert.equal(s.count(),1);
 s.page.visibilityState='visible';s.page.dispatchEvent(new Event('visibilitychange'));assert.equal(s.count(),1);s.cleanup();}
});
test('normal stop detaches interruption listeners before stopping tracks',()=>{
 const s=setup();s.cleanup();s.track.dispatchEvent(new Event('ended'));s.windowTarget.dispatchEvent(new Event('pagehide'));
 s.page.visibilityState='hidden';s.page.dispatchEvent(new Event('visibilitychange'));assert.equal(s.count(),0);s.cleanup();
});
