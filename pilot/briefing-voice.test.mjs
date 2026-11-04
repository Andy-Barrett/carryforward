import test from 'node:test';
import assert from 'node:assert/strict';
import {createBriefingVoice} from './public/briefing-voice.js';
const text='Recorded work order for the fictional customer.';
const granted=()=>({enabled:true,reply:text,ticket:{turnId:'turn-a'},speech:{enabled:true,jobId:'job-a',turnId:'turn-a',displayText:text,token:'fictional-one-use-token'}});
function fixture(request){const calls=[];let allowed=true;const voice=createBriefingVoice({jobId:'job-a',text,request:async(action,body)=>{calls.push([action,body]);return request?.(action,body)??granted();},ensure:()=>{if(!allowed)throw Error('Account closed');},speak:async(t,options)=>calls.push(['speak',t,options]),stopSpeech:()=>calls.push(['stop']),onUnavailable:reason=>calls.push(['unavailable',reason])});return {voice,calls,revoke:()=>{allowed=false;}};}
test('briefing requests only the current-job readout grant and passes Sarah to the ordinary PCM player',async()=>{
 const f=fixture();await f.voice.play();assert.deepEqual(f.calls.map(x=>x[0]),['stop','voice/briefing','speak']);assert.equal(f.calls[2][1],text);assert.equal(f.calls[2][2].speech.token,'fictional-one-use-token');assert.equal(f.calls[2][2].config.speech.enabled,true);
});
test('a stopped briefing cannot begin speaking after its grant arrives',async()=>{
 let finish;const pending=new Promise(r=>finish=r),f=fixture(action=>action==='voice/briefing'?pending:{});const play=f.voice.play();f.voice.cancel();finish(granted());await play;assert.equal(f.calls.some(x=>x[0]==='speak'),false);assert.equal(f.calls.filter(x=>x[0]==='voice/cancel').length,1);
});
test('a different account cannot receive a late briefing or cancellation request',async()=>{
 let finish;const pending=new Promise(r=>finish=r),f=fixture(()=>pending);const play=f.voice.play();f.revoke();finish(granted());await assert.rejects(play,/Account closed/);assert.equal(f.calls.some(x=>x[0]==='speak'||x[0]==='voice/cancel'),false);
});
test('a stale or wrong-job briefing is never substituted or spoken',async()=>{
 const f=fixture(()=>({...granted(),reply:'Changed assignment'}));await assert.rejects(f.voice.play(),/briefing changed/);assert.equal(f.calls.some(x=>x[0]==='speak'),false);assert.equal(f.calls.filter(x=>x[0]==='voice/cancel').length,1);
});
test('unconfigured Sarah leaves a readable briefing and never substitutes local speech',async()=>{
 const f=fixture(()=>({enabled:false,reason:'Speech disabled'}));await assert.rejects(f.voice.play(),/Sarah is unavailable.*Speech disabled/);assert.deepEqual(f.calls.map(x=>x[0]),['stop','voice/briefing','unavailable']);
});
