import test from 'node:test';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{loadAdmittedPhotos}from'./public/photo-import.js';
const bytes=Uint8Array.from([1,2,3]),digest=async b=>createHash('sha256').update(b).digest('hex'),sha=await digest(bytes),source={id:'photo-a',jobId:'job-a',kind:'photo',sha256:sha,name:'Supplied fictional photo',origin:'Approved synthetic packet'};
const options={jobId:'job-a',sources:{'photo-a':source},photos:[],ensure(){},digest,encode:b=>Buffer.from(b).toString('base64')};
test('admitted job photos retain exact bytes and provenance, without modifying existing local media',async()=>{
 const paths=[],before=[];const result=await loadAdmittedPhotos({...options,photos:before,fetchOriginal:async path=>{paths.push(path);return new Response(bytes,{headers:{'Content-Type':'image/png'}});}});assert.deepEqual(paths,['/pilot/api/jobs/job-a/evidence/photo-a']);assert.equal(result[0].sha256,sha);assert.equal(result[0].origin,'Approved synthetic packet');assert.equal(result[0].syncStatus,'synced');assert.deepEqual(before,[]);assert.equal(await digest(Buffer.from(result[0].dataBase64,'base64')),sha);
 assert.deepEqual(await loadAdmittedPhotos({...options,photos:result,fetchOriginal:()=>assert.fail('Already cached original')}),[]);
});
test('foreign sources, changed originals and unsupported types cannot enter the phone cache',async()=>{
 await assert.rejects(loadAdmittedPhotos({...options,sources:{bad:{...source,jobId:'foreign'}},fetchOriginal:()=>assert.fail()}),/identity/);
 await assert.rejects(loadAdmittedPhotos({...options,fetchOriginal:async()=>new Response(Uint8Array.from([9]),{headers:{'Content-Type':'image/png'}})}),/original-byte/);
 await assert.rejects(loadAdmittedPhotos({...options,fetchOriginal:async()=>new Response(bytes,{headers:{'Content-Type':'text/html'}})}),/Unsupported/);
});
test('account closure during the original read suppresses late photo bytes',async()=>{
 let closed=false;await assert.rejects(loadAdmittedPhotos({...options,ensure(){if(closed)throw Error('Account closed');},fetchOriginal:async()=>{closed=true;return new Response(bytes,{headers:{'Content-Type':'image/png'}});}}),/Account closed/);
});
