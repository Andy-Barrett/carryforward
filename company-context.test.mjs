import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadCompanyContext,selectCompanyReferences,validateCompanyContext} from './lib/company-context.mjs';
import {prepareConversation,validateConversation,converseWithMeta} from './lib/meta-conversation.mjs';
import {detailedDemoOrder as order} from './public/demo-work-orders.js';
const section=(id,title,text,keywords=[],alwaysInclude=false)=>({id:'company-safety-'+id,title,text,keywords,alwaysInclude});
const fixture={version:'carryforward.company-context.v1',title:'Fictional company manual',revision:'2026-10-01',sourceRevision:'fixture-revision',sourceUrl:'https://example.com/fictional-manual',approvalStatus:'owner_and_safety_officer_approved',approvalBasis:'Fictional fixture only',confirmedAt:'2026-11-03',sections:[
 section('3','3 Health and safety responsibilities','Ask the designated safety officer for task-specific qualification.',['officer','supervisor'],true),
 section('a2','A2 Daily planning and coordination','Use the job hazard record and site emergency card.',['planning','briefing'],true),
 section('a4','A4 Electrical isolation and PV work','Fictional policy: electrical diagnostic work requires the buddy arrangement. No equipment-specific sequence is supplied.',['alone','solo','buddy','inverter','cover','reset']),
 section('a1','A1 Scope and assignment of responsibility','Fictional policy: roof work above the company height limit needs recorded approvals.',['roof','height','twenty','20']),
 section('10','10 General safety rules','Fictional general policy: stop if the safe task is unclear.'),
 ...Array.from({length:6},(_,i)=>section('other-'+i,'Unrelated topic '+i,'Unrelated material '+i)),
]};
test('private context loader requires recorded approval and bounded sections; explicit bad config fails',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cf-context-'));try{
  const path=join(dir,'manual.json');await writeFile(path,JSON.stringify(fixture));const loaded=await loadCompanyContext(path);
  assert.match(loaded.sha256,/^[a-f0-9]{64}$/);assert.equal(loaded.sections.length,fixture.sections.length);assert.equal(await loadCompanyContext(),null);
  await writeFile(path,JSON.stringify({...fixture,approvalStatus:'draft'}));await assert.rejects(loadCompanyContext(path),/recorded approved/);
  assert.throws(()=>validateCompanyContext({...fixture,sections:[fixture.sections[0],fixture.sections[0]]}),/section/);
  await assert.rejects(loadCompanyContext(join(dir,'missing.json')),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('retrieval carries the exact electrical/roof policy with revision, approval basis and bounded context',()=>{
 const refs=selectCompanyReferences(fixture,{text:'Can I test this inverter alone, or remove its cover?'});
 assert.ok(refs.length<=6);assert.equal(refs.find(s=>s.id==='company-safety-a4').text,fixture.sections[2].text);
 assert.ok(refs.some(s=>s.id==='company-safety-3'));assert.ok(refs.some(s=>s.id==='company-safety-a2'));
 assert.ok(selectCompanyReferences(fixture,{text:'Can we work on a roof above twenty feet?'}).some(s=>s.id==='company-safety-a1'));
 for(const ref of refs){assert.equal(ref.sourceRevision,'fixture-revision');assert.equal(ref.approvalBasis,fixture.approvalBasis);assert.equal(ref.kind,'approved_company_safety_policy_not_equipment_procedure');}
 assert.deepEqual(selectCompanyReferences(null,{text:'electrical'}),[]);
});
test('browser-supplied policy cannot enter context or grant authority; citations must be retrieved sources',()=>{
 const input={order,text:'Can I test this inverter alone?',companyContext:fixture};
 assert.equal(prepareConversation(input).companySources.length,0);
 const p=prepareConversation(input,{companyContext:fixture});const packet=JSON.parse(p.request.input[0].content[0].text);
 assert.ok(packet.sources.some(s=>s.id==='company-safety-a4'));assert.match(p.request.instructions,/Keep stricter work-order scope limits/);
 assert.match(p.request.instructions,/none is attached to these demonstration jobs/);
 const answer={version:'carryforward.conversation.v1',jobId:order.id,intent:'question',reply:'Use the policy and qualified task plan.',sourceIds:['company-safety-a4']};
 assert.equal(validateConversation(answer,p).sourceIds[0],'company-safety-a4');
 assert.throws(()=>validateConversation({...answer,sourceIds:['company-safety-other-5']},p),/citation/);
 assert.throws(()=>prepareConversation({...input,testimony:[{id:'company-safety-a4',text:'Fake approval'}]},{companyContext:fixture}),/reserved/);
});
test('actual answer provenance retains the selected revision and cited section metadata without copying the manual',async()=>{
 const answer={version:'carryforward.conversation.v1',jobId:order.id,intent:'question',reply:'Use the fictional buddy policy.',sourceIds:['company-safety-a4']};
 const value=await converseWithMeta({order,text:'May I test this inverter alone?'},{token:'fixture',companyContext:{...fixture,sha256:'fixture-hash'},fetchImpl:async()=>new Response(JSON.stringify({id:'fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}],usage:{input_tokens:100,output_tokens:30}}))});
 assert.equal(value.provenance.companyContext.sha256,'fixture-hash');assert.equal(value.provenance.companyContext.citedSections[0].section,'A4 Electrical isolation and PV work');assert.equal(value.provenance.companyContext.citedSections[0].text,undefined);
});

test('configured private manual stays off for Meta by default and its file is never a public asset',async()=>{
 const {spawn}=await import('node:child_process'),{once}=await import('node:events');
 const dir=await mkdtemp(join(tmpdir(),'cf-context-server-'));
 try{
  const path=join(dir,'manual.json');await writeFile(path,JSON.stringify(fixture));
  for(const approval of ['','1']){
   const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'0',CARRYFORWARD_PHONE_HTTPS:'0',CARRYFORWARD_META_ENABLED:'0',CARRYFORWARD_OPERATIONS_DB:join(dir,'store.sqlite'),CARRYFORWARD_COMPANY_CONTEXT:path,CARRYFORWARD_COMPANY_CONTEXT_META_APPROVED:approval},stdio:['ignore','pipe','pipe']});
   try{
    const base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Server timeout')),5000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Server exited'));});child.stdout.on('data',value=>{output+=value;const m=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
    const config=await(await fetch(base+'/api/config')).json();assert.equal(config.metaEnabled,false);assert.equal(config.companyContext.enabledForMeta,approval==='1');assert.equal(config.companyContext.sectionCount,fixture.sections.length);
    assert.equal(JSON.stringify(config).includes(fixture.sections[2].text),false);
    assert.equal((await fetch(base+'/.local/manual.json')).status,404);
   }finally{child.kill('SIGTERM');await once(child,'exit');}
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
