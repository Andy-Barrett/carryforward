import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareReview, reviewWithMeta } from './lib/meta-review.mjs';
import { demoOrder } from './public/engine.js';
const events=[{id:'event1',jobId:demoOrder.id,seq:1,type:'turn.recorded',payload:{id:'answer1',text:'Replaced inverter. No post-work reading yet.'}}];
const input={order:demoOrder,events,photos:[]};
const valid={version:'carryforward.interpretation.v1',jobId:demoOrder.id,baseRevision:1,model:'untrusted-name',observations:[],changes:[],nextQuestion:{branchId:'production',text:'Did you measure output after replacement?'}};
const response=(proposal=valid)=>new Response(JSON.stringify({id:'fixture-response',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(proposal)}]}],usage:{input_tokens:100,output_tokens:50,total_tokens:150}}));
test('guarded adapter uses fixed route and returns only validated findings and usage',async()=>{
 const result=await reviewWithMeta(input,{token:'fixture-token',fetchImpl:async(url,options)=>{
   assert.equal(url,'http://127.0.0.1:4421/v1/responses');
   const sent=JSON.parse(options.body); assert.equal(sent.store,false); assert.equal(sent.model,'muse-spark-1.3');
   assert.equal(sent.previous_response_id,undefined); return response();
 }});
 assert.equal(result.model,'muse-spark-1.3');assert.equal(result.provenance.usage.total_tokens,150);
});
test('disabled adapter makes no call; provider failure and malformed output remain failures',async()=>{
 let calls=0; const fetchImpl=async()=>{calls++;return new Response('{}',{status:429});};
 await assert.rejects(reviewWithMeta(input,{fetchImpl}),/disabled/);assert.equal(calls,0);
 await assert.rejects(reviewWithMeta(input,{token:'fixture',fetchImpl}),/refused/);
 await assert.rejects(reviewWithMeta(input,{token:'fixture',fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not JSON'}]}]}))}),/malformed/);
 await assert.rejects(reviewWithMeta(input,{token:'fixture',fetchImpl:async()=>response({...valid,baseRevision:0})}),/Stale/);
});
test('photo association, digest and size are checked before any provider call',()=>{
 const bytes=Buffer.from('synthetic image fixture'),sha256=createHash('sha256').update(bytes).digest('hex');
 const source={id:'event2',jobId:demoOrder.id,seq:2,type:'source.added',payload:{id:'photo1',kind:'photo',sha256}};
 const photo={id:'photo1',jobId:demoOrder.id,mime:'image/png',dataBase64:bytes.toString('base64')};
 assert.equal(prepareReview({...input,events:[...events,source],photos:[photo]}).request.input[0].content.at(-1).type,'input_image');
 assert.throws(()=>prepareReview({...input,events:[...events,source],photos:[{...photo,jobId:'other'}]}),/wrong-job/);
 assert.throws(()=>prepareReview({...input,events:[...events,source],photos:[{...photo,dataBase64:'YQ=='}]}),/hash/);
});
test('model cannot cite photo bytes omitted from this review',async()=>{
 const source={id:'event2',jobId:demoOrder.id,seq:2,type:'source.added',payload:{id:'photo1',kind:'photo',sha256:'a'.repeat(64)}};
 const fake={...valid,baseRevision:2,observations:[{id:'o1',claim:'Image shows output',sourceIds:['photo1']}]};
 await assert.rejects(reviewWithMeta({...input,events:[...events,source]},{token:'fixture',fetchImpl:async()=>response(fake)}),/not sent/);
});

test('style is constrained by saved events and leaves source evidence and core instructions identical',()=>{
 const direct=prepareReview(input).request;
 const conversational=prepareReview({...input,events:[...events,{id:'style',jobId:demoOrder.id,seq:2,type:'preference.changed',payload:{communicationStyle:'conversational'}}]}).request;
 assert.match(direct.instructions,/Communication style: direct/);assert.match(conversational.instructions,/Communication style: conversational/);
 assert.equal(direct.instructions.split('\nCommunication style:')[0],conversational.instructions.split('\nCommunication style:')[0]);
 const a=JSON.parse(direct.input[0].content[0].text),b=JSON.parse(conversational.input[0].content[0].text);
 assert.deepEqual(a.sources,b.sources);assert.deepEqual(a.branches,b.branches);assert.equal(a.followups,b.followups);
 assert.throws(()=>prepareReview({...input,events:[...events,{id:'style',jobId:demoOrder.id,seq:2,type:'preference.changed',payload:{communicationStyle:'unbounded'}}]}),/Invalid communication style/);
});
