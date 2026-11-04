import test from 'node:test';import assert from 'node:assert/strict';
import {reviewEvidence} from './public/evidence-review.js';
import {createInvestigation,reduceInvestigation} from './public/investigation.js';
import {demoOrder} from './public/engine.js';import {hashBytes} from './public/evidence.js';
async function fixture(){
 let state=createInvestigation(demoOrder),sent=0;
 const photo={id:'photo-1',jobId:demoOrder.id,name:'fictional.png',mime:'image/png',status:'included',blob:new Blob(['synthetic bytes'])};photo.sha256=await hashBytes(new Uint8Array(await photo.blob.arrayBuffer()));
 let photos=[photo];
 const dispatch=async(type,payload)=>{state=reduceInvestigation(state,{id:`event-${state.seq+1}`,jobId:demoOrder.id,seq:state.seq+1,at:'2026-10-31T18:00:00Z',type,payload});};
 await dispatch('turn.recorded',{id:'turn-1',text:'Synthetic visit. Production and monitoring remain unverified.'});
 const input={order:demoOrder,selected:new Set([photo.id]),readState:async()=>structuredClone(state),readPhotos:async()=>photos,dispatch,request:async(path,body)=>{
   sent++;assert.equal(path,'/api/review');assert.deepEqual(body.photos.map(p=>p.id),['photo-1']);
   return{proposal:{version:'carryforward.interpretation.v1',jobId:demoOrder.id,baseRevision:state.inputRevision,model:'test-model',observations:[],changes:[],nextQuestion:null}};
 }};
 return{input,photo,dispatch,get state(){return state;},get sent(){return sent;},replace:items=>photos=items};
}
test('shared cloud/detailed review sends only selected verified bytes and appends a validated result',async()=>{
 const f=await fixture();await reviewEvidence(f.input);assert.equal(f.sent,1);assert.equal(f.state.interpretations.length,1);assert.equal(f.state.sources['photo-1'].sha256,f.photo.sha256);
});
test('changed or wrong-job photos fail before any provider request',async()=>{
 const f=await fixture();f.photo.sha256='0'.repeat(64);await assert.rejects(reviewEvidence(f.input),/hash/);assert.equal(f.sent,0);
 const g=await fixture();g.photo.jobId='other-job';await assert.rejects(reviewEvidence(g.input),/another job/);assert.equal(g.sent,0);
});
test('a photo exclusion during provider wait rejects the result without appending interpretation',async()=>{
 const f=await fixture(),request=f.input.request;
 f.input.request=async(...args)=>{const result=await request(...args);f.replace([{...f.photo,status:'excluded'}]);return result;};
 await assert.rejects(reviewEvidence(f.input),/photos changed/);assert.equal(f.state.interpretations.length,0);
});
test('a correction while awaiting review rejects stale interpretation',async()=>{
 const f=await fixture(),request=f.input.request;
 f.input.request=async(...args)=>{const result=await request(...args);await f.dispatch('turn.recorded',{id:'turn-2',text:'Correction: no repair was completed.',supersedes:'turn-1'});return result;};
 await assert.rejects(reviewEvidence(f.input),/changed during review/);assert.equal(f.state.interpretations.length,0);assert.equal(f.state.sources['turn-1'].supersededBy,'turn-2');
});


test('a deliberate image question travels with the exact selected original bytes',async()=>{
 const f=await fixture(),request=f.input.request;let packet;
 f.input.question='What do you see in this picture?';f.input.request=async(path,body)=>{packet=body;return request(path,body);};
 await reviewEvidence(f.input);assert.equal(packet.question,f.input.question);assert.equal(packet.photos.length,1);
 assert.equal(Buffer.from(packet.photos[0].dataBase64,'base64').toString(),'synthetic bytes');
});
