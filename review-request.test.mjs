import test from 'node:test';
import assert from 'node:assert/strict';
import {requestReview} from './public/review-request.js';
test('a stalled model request releases the caller with explicit uncertain outcome and no retry',async()=>{
 let calls=0;
 const fetchImpl=(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));};
 await assert.rejects(requestReview('/api/review',{saved:'unchanged'},{timeoutMs:5,fetchImpl}),/provider request may still finish; no automatic retry/);
 assert.equal(calls,1);
});
test('deadline includes response body and preserves actionable provider errors',async()=>{
 const fetchImpl=async(_url,{signal})=>({ok:true,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('body aborted')),{once:true}))});
 await assert.rejects(requestReview('/api/review',{}, {timeoutMs:5,fetchImpl}),/wait timed out/);
 await assert.rejects(requestReview('/api/review',{}, {fetchImpl:async()=>({ok:false,json:async()=>({error:'Budget guard refused this request.'})})}),/Budget guard refused/);
 const data=await requestReview('/api/review',{}, {fetchImpl:async()=>({ok:true,json:async()=>({proposal:'bounded'})})});assert.deepEqual(data,{proposal:'bounded'});
});
