import test from 'node:test';import assert from 'node:assert/strict';
import {makeReviewCopy} from './public/review-copy.js';
import {buildMediaBundle} from './public/evidence.js';
import {prepareReview} from './lib/meta-review.mjs';import {demoOrder} from './public/engine.js';
import {createHash} from 'node:crypto';
test('copy preparation refuses excluded, derived and hash-changed sources before decoding',async()=>{
 const photo={id:'original',jobId:demoOrder.id,blob:new Blob(['original']),sha256:'a'.repeat(64)};
 await assert.rejects(makeReviewCopy({...photo,status:'excluded'}),/available original/);
 await assert.rejects(makeReviewCopy({...photo,derivedFrom:'another'}),/available original/);
 await assert.rejects(makeReviewCopy(photo),/hash changed/);
});
test('review request and portable export distinguish reduced bytes from their original',()=>{
 const original=Buffer.from('fictional original'),reduced=Buffer.from('fictional reduced copy');const hash=b=>createHash('sha256').update(b).digest('hex');
 const derivation={method:'browser-review-copy.v1',width:800,height:450,quality:0.85};
 const photos=[{id:'original',jobId:demoOrder.id,mime:'image/png',size:original.length,sha256:hash(original),dataBase64:original.toString('base64')},{id:'copy',jobId:demoOrder.id,mime:'image/jpeg',size:reduced.length,sha256:hash(reduced),dataBase64:reduced.toString('base64'),derivedFrom:'original',sourceSha256:hash(original),derivation}];
 const events=photos.map((p,i)=>({id:'source-'+i,jobId:demoOrder.id,seq:i+1,type:'source.added',payload:{id:p.id,kind:'photo',sha256:p.sha256,...(i?{derivedFrom:p.derivedFrom,sourceSha256:p.sourceSha256,derivation}:{})}}));
 const {request}=prepareReview({order:demoOrder,events,photos:[photos[1]]});const label=request.input[0].content.find(c=>c.text?.includes('reduced review copy'));
 assert.ok(label);assert.ok(label.text.includes(hash(original)));assert.ok(label.text.includes(hash(reduced)));
 const bundle=JSON.parse(buildMediaBundle({order:demoOrder,photos}));assert.equal(bundle.manifest[1].derivedFrom,'original');assert.deepEqual(Buffer.from(bundle.data.original,'base64'),original);assert.deepEqual(Buffer.from(bundle.data.copy,'base64'),reduced);
 assert.throws(()=>prepareReview({order:demoOrder,events:[...events,{id:'exclude',jobId:demoOrder.id,seq:3,type:'source.excluded',payload:{id:'original'}}],photos:[photos[1]]}),/excluded/);
});
