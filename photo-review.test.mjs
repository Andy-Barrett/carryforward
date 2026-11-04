import test from 'node:test';import assert from 'node:assert/strict';
import {selectReviewPhotos,PHOTO_REVIEW_LIMITS} from './public/evidence.js';
const photo=(id,bytes=100)=>({id,jobId:'job-1',status:'active',blob:new Blob([new Uint8Array(bytes)],{type:'image/png'})});
test('review selection is explicit and refuses excluded, missing, duplicate and cross-job originals',()=>{
 const photos=[photo('a'),photo('b'),{...photo('excluded'),status:'excluded'}, {...photo('other'),jobId:'job-2'}];
 assert.deepEqual(selectReviewPhotos(photos,new Set(),'job-1'),[]);
 assert.deepEqual(selectReviewPhotos(photos,new Set(['b']),'job-1').map(p=>p.id),['b']);
 for(const ids of [['excluded'],['other'],['missing'],['a','a']])assert.throws(()=>selectReviewPhotos(photos,ids,'job-1'));
});
test('photo count and original-byte cap fail before packaging or model dispatch',()=>{
 const photos=['a','b','c','d'].map(id=>photo(id));
 assert.throws(()=>selectReviewPhotos(photos,new Set(['a','b','c','d']),'job-1'),/three/);
 assert.throws(()=>selectReviewPhotos([photo('large',PHOTO_REVIEW_LIMITS.maxBytes+1)],['large'],'job-1'),/1 MB/);
 assert.equal(selectReviewPhotos([photo('exact',PHOTO_REVIEW_LIMITS.maxBytes)],['exact'],'job-1').length,1);
});
