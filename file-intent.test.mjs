import test from 'node:test';import assert from 'node:assert/strict';
import {fileIntent,selectQuestionPhoto} from './public/file-intent.js';
const photos=[{id:'a',jobId:'job',name:'display.jpg'},{id:'b',jobId:'job',name:'door.jpg'},{id:'foreign',jobId:'other',name:'private.jpg'}];
test('only a deliberate request enters file/image routing; camera narration never uploads',()=>{
 for(const text of ['The photo shows 2.4 kW.','I took a picture.','Monitoring is live.'])assert.equal(fileIntent(text).kind,'none');
 for(const text of ['What do you see here?','What does this mean?','Review this picture.'])assert.equal(fileIntent(text).kind,'interpret');
 assert.equal(fileIntent('pull up that PDF').kind,'document');assert.equal(fileIntent('show it again').kind,'again');assert.equal(fileIntent('open the work order files').kind,'files');
});
test('image questions use explicit focus, disambiguate, and never fall back to foreign or cleared context',()=>{
 assert.deepEqual(selectQuestionPhoto('What do you see here?',{jobId:'job',photos,selectedId:'a'}).photoIds,['a']);
 assert.equal(selectQuestionPhoto('What do you see here?',{jobId:'job',photos}).kind,'choose');
 assert.equal(selectQuestionPhoto('What does this mean?',{jobId:'job',photos:photos.slice(0,1)}).kind,'choose');
 assert.equal(selectQuestionPhoto('What does this photo show?',{jobId:'job',photos:photos.slice(0,1),selectedId:'withdrawn-photo'}).kind,'choose');
 assert.deepEqual(selectQuestionPhoto('Review the latest photo',{jobId:'job',photos,selectedId:'a'}).photoIds,['b']);
 assert.equal(selectQuestionPhoto('Review private.jpg picture',{jobId:'job',photos}).kind,'choose');
 assert.equal(selectQuestionPhoto('Review this photo',{jobId:'job',photos:photos.map(p=>({...p,status:'excluded'})),selectedId:'a'}).kind,'choose');
});
