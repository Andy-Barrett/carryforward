import test from 'node:test';import assert from 'node:assert/strict';
import {cases,displayPng} from './evaluation/cases.mjs';import {prepareReview} from './lib/meta-review.mjs';
test('fixed evaluation cases are bounded, job-scoped and do not leak expectations into requests',()=>{
 assert.equal(cases.length,12);assert.equal(cases.filter(c=>c.split==='reserved-first-pass').length,4);
 for(const c of cases){const {state,request}=prepareReview(c.input);assert.equal(state.jobId,c.id);assert.equal(Object.keys(c.expected.supported).length,4);assert.equal(request.expected,undefined);assert.ok(request.input[0].content.length);}
 assert.deepEqual([...displayPng('2.4').subarray(0,8)],[137,80,78,71,13,10,26,10]);
});
test('evaluation distinguishes safe refusal, missed support, owned work and question suppression',async()=>{
 const {scoreStructured,tokenCostEstimate}=await import('./evaluation/score.mjs');
 const fixture={expected:{supported:{repair:true,production:false},owner:{production:'Operations'},question:'none'}};
 const score=scoreStructured(fixture,{branches:{repair:{state:'supported'},production:{state:'deferred',owner:'Operations'}},activeQuestion:null},{observations:[],nextQuestion:null});
 assert.deepEqual(score.unsupportedSupportedOutcomes,[]);assert.deepEqual(score.missedSupportedOutcomes,[]);assert.equal(score.unnecessaryShown,false);
 assert.equal(tokenCostEstimate({input_tokens:1000000,output_tokens:1000000}),5.5);
});
