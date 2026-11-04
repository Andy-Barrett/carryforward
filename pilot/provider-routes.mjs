import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {createPilotProviders} from './providers.mjs';
import {prepareSpokenReview,acceptSpokenReview,spokenReviewContext} from '../lib/spoken-review.mjs';
import {createInvestigation,reduceInvestigation} from '../public/investigation.js';
import {inspectWav} from '../public/audio.js';
import {warningReadbackReply} from './documents.mjs';
import {spokenPilotBrief} from '../public/visit-brief.js';
const digest=x=>createHash('sha256').update(typeof x==='string'||x instanceof Uint8Array?x:JSON.stringify(x)).digest('hex');
const requireValue=(ok,message,status=400)=>{if(!ok){const error=Error(message);error.status=status;throw error;}};
const bounded=(x,max)=>typeof x==='string'&&x.trim()&&x.length<=max;
const canonical=x=>JSON.stringify(x);
const userKey=p=>canonical([p.companyId,p.userId,p.sessionId]);
const stateRevision=(ops,j)=>'events-'+digest(ops.job(j.op_job).events);
// These offsets belong to this server request, not the phone's release/playback clock.
function serverTiming(action) {
 const origin=performance.now(),points={requestReceived:0},stages={};
 const mark=name=>{points[name]=Number((performance.now()-origin).toFixed(3));};
 return {
  mark,
  start(name,kind,startPoint){mark(startPoint);stages[name]={kind,status:'running',startPoint};},
  finish(name,endPoint){mark(endPoint);const stage=stages[name];stage.status='complete';stage.endPoint=endPoint;stage.durationMs=Number((points[endPoint]-points[stage.startPoint]).toFixed(3));},
  skip(name,reason){stages[name]={status:'skipped',reason};},
  snapshot(){return {version:'carryforward.server-timing.v1',clock:'server_monotonic',origin:action+' handler entry after route match',unit:'ms',points:{...points},stages:structuredClone(stages),clientClockComparable:false,acousticMeasured:false};},
 };
}
/** Optional routes. Principal, current assignment and document authority are recomputed on every asynchronous boundary. */
export function createPilotVoiceRoutes({auth,store,library,config={},providerFactory=createPilotProviders}={}) {
 const turns=new Map(),lastPages=new Map();let providers;
 async function context(request,expectedJobId) {
  const principal=await auth.principal(request);requireValue(principal&&principal.role!=='integration','Sign in with an active company membership.',401);
  const job=store.job(principal,expectedJobId,{technicianOnly:true}),versions=[];
  requireValue(job.input.contextRefs.length<=12,'Narrow this assignment to 12 approved reference versions.',409);
  for(const ref of job.input.contextRefs) {
   const document=await library.read(principal.companyId,ref.versionId);
   requireValue(document.status==='approved'&&document.processing.status==='ready'&&(!ref.documentId||document.documentId===ref.documentId),'Refresh the approved assignment sources before using voice.',409);
   versions.push({versionId:document.versionId,sha256:document.sha256});
  }
  versions.sort((a,b)=>a.versionId.localeCompare(b.versionId));
  const finalPrincipal=await auth.principal(request);requireValue(finalPrincipal&&userKey(finalPrincipal)===userKey(principal),'Company membership or session changed.',401);store.job(finalPrincipal,expectedJobId,{technicianOnly:true});
  return {principal:finalPrincipal,job,scope:{companyId:principal.companyId,userId:principal.userId,sessionId:principal.sessionId,jobId:job.id,assignmentRevision:job.revision,retrievalVersions:versions,synthetic:true},stateRevision:stateRevision(store.operations(principal.companyId),job)};
 }
 function turnFor(ticket,ctx) {
  const turn=turns.get(ticket?.turnId);requireValue(turn&&userKey(turn.scope)===userKey(ctx.scope)&&turn.scope.jobId===ctx.job.id,'This voice turn is unavailable.',403);return turn;
 }
 providers=providerFactory({config,revalidate:async(scope,operation={})=>{
  const turn=[...turns.values()].find(x=>x.scope.sessionId===scope.sessionId&&x.scope.companyId===scope.companyId&&x.scope.userId===scope.userId&&x.scope.jobId===scope.jobId);
  if(!turn)return false;
  try{const current=await context(turn.request,scope.jobId);return canonical(current.scope)===canonical(scope)&&current.stateRevision===turn.stateRevision&&(!operation.validatedStateRevision||operation.validatedStateRevision===current.stateRevision);}catch{return false;}
 },validateLocalReply:async(scope,{replySha256,validatedStateRevision})=>{
  const turn=[...turns.values()].find(x=>canonical(x.scope)===canonical(scope));return !!turn?.answer&&digest(turn.answer.reply)===replySha256&&turn.stateRevision===validatedStateRevision;
 }});
 const routes={
  status(){return {...providers.status(),voiceReports:'configured combined classification and validated report proposals',reportMutations:'validated proposals only; final confirmation and delivery remain separate'};},
  async handle(req,res,{principal,job,action,json,body}={}) {
   if(!/^voice\/(?:start|briefing|transcribe|answer|speech|cancel)$/.test(action??''))return false;
   const timing=serverTiming(action);
   requireValue(req.method==='POST','Method not allowed.',405);requireValue(principal?.role!=='integration','A member session is required.',403);
   const request={headers:{...req.headers}},input=await body(req,16_000_000);
   timing.mark('bodyReady');
   requireValue(input&&typeof input==='object'&&!Array.isArray(input),'Expected a bounded voice object.');
   for(const key of ['companyId','userId','sessionId','role','scope','retrievalVersions','assignmentRevision'])requireValue(!Object.hasOwn(input,key),'Voice identity and source manifests are server-owned.',400);
   for(const[id,turn]of turns)if(turn.ticket?.expiresAt<=Date.now()){providers.cancelTurn(turn.ticket);turns.delete(id);}
   const currentPrincipal=await auth.principal(request);requireValue(currentPrincipal&&userKey(currentPrincipal)===userKey(principal),'Sign in again.',401);store.job(currentPrincipal,job.id,{technicianOnly:true});
   if(action==='voice/cancel') {
    const ticket=input.ticket??{turnId:input.turnId},turn=turns.get(ticket?.turnId);
    requireValue(turn&&userKey(turn.scope)===userKey(currentPrincipal)&&turn.scope.jobId===job.id,'This voice turn is unavailable.',403);
    providers.cancelTurn(turn.ticket);turns.delete(turn.ticket.turnId);json(res,200,{cancelled:true});return true;
   }
   const ctx=await context(request,job.id);
   requireValue(input.expectedRevision===undefined||input.expectedRevision===ctx.job.revision,'The displayed assignment changed; reopen this work order.',409);
   timing.mark('authorityReady');
   if(action==='voice/briefing') {
    requireValue(Object.keys(input).every(key=>key==='expectedRevision'),'Briefing text is prepared from the current assignment, not client input.');
    if(!providers.status().enabled||config.companies?.[ctx.principal.companyId]?.providers?.elevenSpeech!==true){json(res,200,{enabled:false,speech:{enabled:false},reason:'Sarah is not configured for this company.'});return true;}
    const reply=spokenPilotBrief(ctx.job.input.order);
    requireValue(bounded(reply,1600),'This briefing is too long for one spoken readout. Review the full work order on screen.',409);
    const key=userKey(ctx.scope);for(const[id,turn]of turns)if(userKey(turn.scope)===key){providers.cancelTurn(turn.ticket);turns.delete(id);}
    const placeholder={scope:ctx.scope,request,stateRevision:ctx.stateRevision,ticket:null,answer:{reply},kind:'briefing'};turns.set('starting-'+key,placeholder);
    let ticket;try{ticket=await providers.beginTurn(ctx.scope);}finally{turns.delete('starting-'+key);}
    turns.set(ticket.turnId,{...placeholder,ticket});
    const speech=await providers.grantSpeech({ticket,scope:ctx.scope,reply,validatedStateRevision:ctx.stateRevision,localValidation:{replySha256:digest(reply),stateRevision:ctx.stateRevision},cacheableBriefing:true});
    store.audit(ctx.principal,'voice.briefing',job.id,ctx.stateRevision);
    json(res,200,{enabled:true,ticket,reply,speech:{...speech,enabled:true,defaultVoice:'sarah',selectedVoice:'sarah',jobId:job.id,text:reply,displayText:reply},stateRevision:ctx.stateRevision});return true;
   }
   if(action==='voice/start') {
    if(!providers.status().enabled||config.companies?.[ctx.principal.companyId]?.providers?.metaAsr!==true){json(res,200,{enabled:false,speech:{enabled:false},reason:'Company microphone transcription is not configured. Typed questions and local recording remain available.',voiceReports:'not enabled'});return true;}
    const key=userKey(ctx.scope);for(const[id,turn]of turns)if(userKey(turn.scope)===key){providers.cancelTurn(turn.ticket);turns.delete(id);}
    // Store the authenticated request before beginTurn calls its revalidation callback.
    const placeholder={scope:ctx.scope,request,stateRevision:ctx.stateRevision,ticket:null};turns.set('starting-'+key,placeholder);
    let ticket;try{ticket=await providers.beginTurn(ctx.scope);}finally{turns.delete('starting-'+key);}
    turns.set(ticket.turnId,{...placeholder,ticket,transcript:null,audioId:null,answer:null});
    json(res,200,{enabled:true,ticket,speech:{enabled:true,defaultVoice:'sarah',selectedVoice:'sarah'},stateRevision:ctx.stateRevision,voiceReports:config.companies?.[ctx.principal.companyId]?.providers?.metaAnswers===true?'combined classification and proposal validation':'local document questions only'});return true;
   }
   if(action==='voice/transcribe') {
    const turn=turnFor(input.ticket,ctx);requireValue(input.submission==='hold_release'&&input.savedLocally===true,'Save the local clip and release Hold to speak before submitting.');
    const clip=input.clip;requireValue(clip&&bounded(clip.id,200)&&bounded(clip.name||clip.id,300),'An identified saved clip is required.');
    requireValue(!clip.jobId||clip.jobId===job.id,'Voice clip belongs to another assignment.',403);
    const wavBase64=clip.wavBase64||(clip.mime==='audio/wav'?clip.dataBase64:null);requireValue(typeof wavBase64==='string'&&wavBase64.length<=2_000_000&&/^[A-Za-z0-9+/]*={0,2}$/.test(wavBase64),'A bounded transcription WAV is required.');
    const wav=Buffer.from(wavBase64,'base64');inspectWav(wav);const wavSha256=digest(wav);
    requireValue(!clip.wavSha256||clip.wavSha256===wavSha256,'Transcription WAV hash mismatch.');
    const before=await context(request,job.id);requireValue(canonical(before.scope)===canonical(turn.scope)&&before.stateRevision===turn.stateRevision,'Voice state changed; start a new turn.',409);
    timing.start('audioAdmission','verified_original_and_wav_storage','audioAdmissionStarted');
    const ops=store.operations(ctx.principal.companyId);ops.admitAudio(job.op_job,[{...clip,jobId:job.input.order.id,wavBase64,wavSha256}]);
    const saved=ops.audio(job.op_job,clip.id);requireValue(saved.sha256===clip.sha256&&saved.wav_sha256===wavSha256,'The admitted clip does not match the submitted audio.');
    timing.finish('audioAdmission','audioAdmitted');
    timing.start('asr','guarded_adapter_call_including_access_and_accounting','asrStarted');
    const result=await providers.transcribe({ticket:turn.ticket,scope:turn.scope,audio:{jobId:job.id,audioId:saved.id,audioBase64:Buffer.from(saved.wav_bytes).toString('base64'),sha256:saved.wav_sha256,savedLocally:true,submission:'hold_release'}});
    timing.finish('asr','asrReady');
    timing.start('stateValidation','current_authority_and_turn_validation','stateValidationStarted');
    const after=await context(request,job.id);requireValue(canonical(after.scope)===canonical(turn.scope),'Voice access changed.',403);requireValue(turns.get(turn.ticket.turnId)===turn,'This voice turn was cancelled.',409);turn.transcript=result.transcript;turn.audioId=saved.id;turn.transcription=result;
    timing.finish('stateValidation','validatedStateReady');
    store.audit(ctx.principal,'voice.transcribed',job.id,ctx.stateRevision);timing.mark('responseReady');json(res,200,{...result,audioId:saved.id,submission:'hold_release',reviewed:false,reportSaved:false,serverTiming:timing.snapshot()});return true;
   }
   if(action==='voice/answer') {
    const turn=turnFor(input.ticket,ctx);requireValue(bounded(input.text,4000),'A bounded document question is required.');
    requireValue(turn.transcript?input.text===turn.transcript:input.inputKind==='typed_question','Use this turn’s submitted transcript or an explicitly typed question.');
    requireValue(!input.pendingReport&&!input.proposal&&!input.decisions&&!input.events,'Conversation state and proposals are prepared only by the server.',400);
    if(input.photoIds!==undefined){
     requireValue(input.requestKind==='photo_question'&&Array.isArray(input.photoIds)&&input.photoIds.length===1&&bounded(input.photoIds[0],200),'Explicitly choose one saved job photo for this question.');
     const turn=turnFor(input.ticket,ctx),ops=store.operations(ctx.principal.companyId),photo=ops.evidence(job.op_job,input.photoIds[0]);
     const revalidatePhotos=async()=>{const fresh=await context(request,job.id);requireValue(canonical(fresh.scope)===canonical(turn.scope)&&fresh.stateRevision===turn.stateRevision&&turns.get(turn.ticket.turnId)===turn,'Photo review context changed.',409);const current=ops.evidence(job.op_job,photo.id);requireValue(current.sha256===photo.sha256&&current.mime===photo.mime&&digest(current.bytes)===photo.sha256,'The selected image changed.',409);};
     const answer=await providers.photoAnswer({ticket:turn.ticket,scope:turn.scope,packet:{jobId:job.id,question:input.text,order:ctx.job.input.order,stateRevision:turn.stateRevision,photos:[{id:photo.id,name:photo.name,mime:photo.mime,sha256:photo.sha256,dataBase64:Buffer.from(photo.bytes).toString('base64')}]},revalidatePhotos});
     await revalidatePhotos();turn.answer=answer;let speech=null;
     if(config.companies?.[ctx.principal.companyId]?.providers?.elevenSpeech===true)speech=await providers.grantSpeech({ticket:turn.ticket,scope:turn.scope,reply:answer.reply,validatedStateRevision:turn.stateRevision});
     store.audit(ctx.principal,'voice.photo_question',job.id,ctx.stateRevision);
     json(res,200,{...answer,retrieval:{status:'not_requested',citations:[],excerpts:[]},speech:speech?{...speech,jobId:job.id,text:answer.reply,displayText:answer.reply}:null});return true;
    }
    requireValue(!input.selectedDocument||input.requestKind==='document_question','A selected document question must be explicit.');
    const options={references:ctx.job.input.contextRefs,equipment:ctx.job.input.equipment,query:input.text,selectedPage:input.selectedDocument,previousCitation:lastPages.get(userKey(ctx.scope)+'/'+job.id)};
    timing.start('retrieval','scoped_approved_document_lookup','retrievalStarted');
    const retrieval=await library.retrieve(ctx.principal.companyId,options);
    retrieval.citations=(retrieval.citations??[]).map(c=>({...c,originalUrl:`/pilot/api/jobs/${job.id}/references/${c.versionId}/original#page=${c.pdfPage}`}));
    retrieval.excerpts=(retrieval.excerpts??[]).map(x=>({...x,citation:{...x.citation,originalUrl:`/pilot/api/jobs/${job.id}/references/${x.citation.versionId}/original#page=${x.citation.pdfPage}`}}));
    timing.finish('retrieval','retrievalReady');
    let answer;const ops=store.operations(ctx.principal.companyId),saved=ops.job(job.op_job),priorEvents=saved.events;
    let pending=null,reviewInput=null,preview=null;
    if(turn.audioId&&!input.selectedDocument) {
     timing.start('reportContext','saved_audio_and_canonical_review_preparation','reportContextStarted');
     const clip=ops.audio(job.op_job,turn.audioId),transcription={rawText:input.text,reviewed:false,submission:'hold_release',provenance:{...turn.transcription.provenance,model:'muse-voice-transcribe-1.0',inputSha256:clip.wav_sha256,complete:true}};
     pending={id:'voice-turn-'+clip.id,text:input.text,audio:{id:clip.id,kind:'audio',sha256:clip.sha256,wavSha256:clip.wav_sha256,name:clip.name},transcription};
     reviewInput={events:priorEvents,text:input.text,turnId:pending.id,pendingReport:pending};preview=prepareSpokenReview(ctx.job.input.order,reviewInput);
     timing.finish('reportContext','reportContextReady');
    }else timing.skip('reportContext','No admitted ASR clip in this typed-question turn.');
    const warningReply=warningReadbackReply(retrieval);
    if(retrieval.requestKind==='warning_recall'||retrieval.requestKind==='procedure_request') {
     answer={reply:warningReply||retrieval.answer,citations:retrieval.citations,provenance:{kind:warningReply?'source_warning_readback':'source_lookup',model:'none'},intent:'question',reportSaved:false};
     timing.skip('model','Warning readback or blocked procedure uses the exact local source explanation.');
     timing.skip('conversationValidation','Read-only source information; no model classification.');
     timing.skip('proposalValidation','Reading source information cannot apply a report proposal.');
    }else if(config.companies?.[ctx.principal.companyId]?.providers?.metaAnswers===true&&pending) {
     const packet={jobId:job.id,companyName:ctx.principal.company.name,text:input.text,order:ctx.job.input.order,retrieval,reportReview:spokenReviewContext(preview),pendingSourceId:pending.id};
     timing.start('model','combined_classification_and_proposal_adapter_including_validation','modelStarted');
     answer=await providers.converse({ticket:turn.ticket,scope:turn.scope,packet,validateResult:async value=>{
      timing.mark('classificationReady');
      timing.start('conversationValidation','parsed_classification_sources_and_proposal_validation','conversationValidationStarted');
      requireValue(value?.version==='carryforward.conversation.v1'&&value.jobId===job.id&&['question','report','clarify'].includes(value.intent)&&bounded(value.reply,1600),'Invalid combined conversation output.');
      const priorState=createInvestigation(ctx.job.input.order);let original=priorState;for(const event of priorEvents)original=reduceInvestigation(original,event);
      const sourceIds=new Set(['assignment',...(retrieval.status==='found'&&!retrieval.procedureBlocked?retrieval.citations.map(x=>x.versionId):[]),...Object.keys(preview.sources)]);
      requireValue(Array.isArray(value.sourceIds)&&value.sourceIds.length<=12&&value.sourceIds.every(id=>sourceIds.has(id)),'Conversation cites an unavailable source.');
      const citationSet=new Set(retrieval.citations.map(c=>canonical(c)));requireValue(Array.isArray(value.citations)&&value.citations.every(c=>citationSet.has(canonical(c))),'Conversation cites an unavailable document.');
      if(value.intent!=='report') {
       requireValue(!value.proposal&&!(value.decisions?.length)&&value.correctsSourceId==null&&!value.sourceIds.includes(pending.id)&&!value.sourceIds.includes(pending.audio.id),'Questions cannot apply report changes or cite pending testimony.');
       timing.skip('proposalValidation','Classified question or clarification has no report proposal.');
       timing.finish('conversationValidation','conversationValidated');
       return {intent:value.intent,reply:value.reply,citations:value.citations,stateRevision:turn.stateRevision,reportSaved:false,events:priorEvents,eventRevision:priorEvents.length};
      }
      timing.start('proposalValidation','source_bound_interpretation_correction_and_owner_validation','proposalValidationStarted');
      const reviewed=acceptSpokenReview(ctx.job.input.order,reviewInput,value.proposal,value.correctsSourceId??null,value.decisions??[]);
      let next=prepareSpokenReview(ctx.job.input.order,reviewInput,value.correctsSourceId??null);
      next=reduceInvestigation(next,{id:'voice-review-'+pending.id,jobId:job.id,seq:next.seq+1,type:'interpretation.received',payload:reviewed.proposal});
      for(const decision of reviewed.decisions)next=reduceInvestigation(next,{id:'voice-decision-'+decision.branchId+'-'+pending.id,jobId:job.id,seq:next.seq+1,type:'branch.response',payload:decision});
      requireValue(!next.reviewRequired,'The spoken interpretation did not settle the saved review state.');
      timing.finish('proposalValidation','proposalValidated');
      timing.finish('conversationValidation','conversationValidated');
      return {intent:'report',reply:reviewed.reply,citations:value.citations,stateRevision:'events-'+digest(next.events),reportSaved:true,events:next.events,eventRevision:next.seq,correctsSourceId:value.correctsSourceId??null,decisions:reviewed.decisions,confirmed:false,delivered:false};
     }});
     timing.finish('model','modelCallReady');
    }else if(retrieval.status==='found'&&!retrieval.procedureBlocked&&config.companies?.[ctx.principal.companyId]?.providers?.metaAnswers===true){
     timing.start('model','bounded_factual_answer_adapter_including_validation','modelStarted');
     answer={...await providers.answer({ticket:turn.ticket,scope:turn.scope,packet:{question:input.text,retrieval,validatedReport:{revision:turn.stateRevision,followups:[],corrections:[]}}}),intent:'question',reportSaved:false};
     timing.finish('model','modelCallReady');
     timing.skip('conversationValidation','Typed factual-answer validation occurs inside the provider adapter.');
     timing.skip('proposalValidation','Typed factual question has no report proposal.');
    }else {
     answer={reply:retrieval.answer+(retrieval.status==='found'&&!retrieval.procedureBlocked?' '+(retrieval.excerpts[0]?.text??'').slice(0,1000):''),citations:retrieval.citations,provenance:{kind:'source_lookup',model:'none'},intent:'question',reportSaved:false};
     timing.skip('model','Deterministic local source lookup; no model call.');
     timing.skip('conversationValidation','Deterministic local source lookup; no model classification.');
     timing.skip('proposalValidation','Local source lookup cannot apply a report proposal.');
    }
    timing.start('stateValidation','current_authority_source_revision_and_turn_validation','stateValidationStarted');
    requireValue(bounded(answer.reply,1600),'The source answer is too long for one spoken turn.',409);
    const after=await context(request,job.id);requireValue(canonical(after.scope)===canonical(turn.scope)&&after.stateRevision===turn.stateRevision,'Voice state changed; start a new turn.',409);
    requireValue(turns.get(turn.ticket.turnId)===turn,'This voice turn was cancelled.',409);
    timing.finish('stateValidation','validatedStateReady');
    if(answer.reportSaved){timing.start('stateCommit','validated_events_persistence_and_saved_revision_check','stateCommitStarted');ops.syncEvents(job.op_job,answer.events);turn.stateRevision=stateRevision(ops,job);requireValue(turn.stateRevision===answer.stateRevision,'Saved report revision differs from the validated proposal.',409);timing.finish('stateCommit','stateCommitted');}
    else timing.skip('stateCommit','Question or clarification does not change report events.');
    turn.answer={...answer,stateRevision:turn.stateRevision};if(answer.citations[0])lastPages.set(userKey(ctx.scope)+'/'+job.id,answer.citations[0]);
    let speech=null;if(config.companies?.[ctx.principal.companyId]?.providers?.elevenSpeech===true){timing.start('speechGrant','one_use_validated_reply_grant_including_current_access_check','speechGrantStarted');speech=await providers.grantSpeech({ticket:turn.ticket,scope:turn.scope,reply:answer.reply,validatedStateRevision:turn.stateRevision,localValidation:{replySha256:digest(answer.reply),stateRevision:turn.stateRevision}});timing.finish('speechGrant','speechGrantReady');}
    else timing.skip('speechGrant','Speech is not enabled for this company.');
    store.audit(ctx.principal,answer.reportSaved?'voice.report':'voice.question',job.id,ctx.stateRevision);
    timing.mark('responseReady');json(res,200,{...answer,retrieval,stateRevision:turn.stateRevision,speech:speech?{...speech,jobId:job.id,text:answer.reply,displayText:answer.reply}:null,serverTiming:timing.snapshot()});return true;
   }
   if(action==='voice/speech') {
    requireValue(bounded(input.requestId,100),'A playback request ID is required.');const turn=turnFor({turnId:input.turnId},ctx);
    requireValue(!input.jobId||input.jobId===job.id,'Playback belongs to another job.',403);
    const controller=new AbortController(),abort=()=>controller.abort();req.once('aborted',abort);const close=()=>{if(!res.writableEnded)abort();};res.once('close',close);let count=0,info={};
    try {
     await providers.streamSpeech({grant:{token:input.token,turnId:input.turnId},scope:turn.scope,signal:controller.signal,onStart:value=>{info=value;},onChunk:async bytes=>{
      controller.signal.throwIfAborted();requireValue(bytes?.length&&bytes.length%2===0&&count+bytes.length<=4_320_000,'Invalid PCM frame.');count+=bytes.length;
      if(!res.headersSent)res.writeHead(200,{'Content-Type':'audio/pcm','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-CarryForward-Speech-Id':input.requestId,'X-CarryForward-Sample-Rate':'24000','X-CarryForward-Playback-Rate':'1.4','X-CarryForward-Speech-Model':info.model||config.elevenModel||'eleven_v4_turbo','X-CarryForward-Speech-Voice':'sarah','X-CarryForward-Speech-Cached':info.cacheHit?'1':'0'});
      if(!res.write(bytes))await once(res,'drain',{signal:controller.signal});
     }});requireValue(count>0,'No speech PCM was produced.',503);res.end();
    }catch(error){if(res.headersSent){res.destroy(error);return true;}throw error;}finally{req.removeListener('aborted',abort);res.removeListener('close',close);}
    return true;
   }
   return false;
  },
 };
 return routes;
}
