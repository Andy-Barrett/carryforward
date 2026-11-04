import test from 'node:test';import assert from 'node:assert/strict';
import {validateInterviewDraft} from './public/jobstore.js';
test('unsent drafts reject wrong-job, excessive text and unreviewed voice references',()=>{
 const draft={id:'draft-1',jobId:'job-1',text:'Still composing',correction:'',audio:null};
 assert.equal(validateInterviewDraft(draft,'job-1'),draft);
 assert.throws(()=>validateInterviewDraft(draft,'job-2'),/wrong-job/);
 assert.throws(()=>validateInterviewDraft({...draft,text:'x'.repeat(4001)},'job-1'),/Invalid/);
 assert.throws(()=>validateInterviewDraft({...draft,audio:{audioId:'clip',transcription:{rawText:'machine words',reviewed:false}}},'job-1'),/voice reference/);
 const reviewed={...draft,audio:{audioId:'clip',transcription:{rawText:'machine words',reviewed:true,provenance:{model:'synthetic-test'}}}};
 assert.equal(validateInterviewDraft(reviewed,'job-1').audio.transcription.rawText,'machine words');
});
