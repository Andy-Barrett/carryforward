import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Exercise the real browser controller; rewrite only its browser-root import.
const source=(await readFile(new URL('./public/work-order-files.js',import.meta.url),'utf8'))
  .replace("'/file-intent.js'",JSON.stringify(new URL('../public/file-intent.js',import.meta.url).href))
  .replace("'./pdf-page.js'",JSON.stringify(new URL('./public/pdf-page.js',import.meta.url).href));
const {createWorkOrderFiles}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function harness(){
  const job={id:'job-one',companyId:'company-one',revision:'assignment-one'};
  const photo=(id,jobId=job.id)=>({id,jobId,name:id+'.png',mime:'image/png',dataBase64:Buffer.from(id).toString('base64'),sha256:sha(id),status:'included'});
  let photos=[photo('first'),photo('second'),photo('foreign','other-job')],closed=false,brief={job,context:[{versionId:'manual-v1',title:'Field source',mime:'text/plain',revision:'R1',sha256:sha('source'),status:'approved',processing:{status:'ready',pageCount:2}}]};
  const shown=[],chosen=[],queries=[];
  const options={job,getPhotos:()=>photos,getBrief:async()=>brief,getPages:async()=>[{pdfPage:1,text:'First page'},{pdfPage:2,text:'Second page',printedLabel:'ii'}],fetchOriginal:()=>assert.fail('TXT must not fetch an image/PDF'),ensure:()=>{if(closed)throw Error('Account closed');},show:item=>shown.push(item),choose:async message=>chosen.push(message),queryDocument:async(...args)=>{queries.push(args);return {citations:[]};}};
  const desk=createWorkOrderFiles(options);
  return {job,desk,shown,chosen,queries,photo,options,setPhotos:x=>photos=x,setBrief:x=>brief=x,close:()=>closed=true};
}
test('Files includes unsynced local photos without inference; exact selection survives reopen and clear never guesses',async t=>{
  const h=harness();t.after(()=>h.desk.dispose());
  const listed=await h.desk.list();assert.equal(listed.items.length,3);assert.equal(listed.items.some(x=>x.id==='foreign'),false);assert.match(listed.items[0].syncLabel,/locally/);assert.equal(h.queries.length,0);
  await h.desk.open(listed.items[1]);assert.equal(h.desk.selected().id,'second');
  assert.deepEqual(await h.desk.route('What do you see here?'),{photoIds:['second'],requestKind:'photo_question'});
  await h.desk.route('Show it again');assert.equal(h.shown.at(-1).id,'second');assert.equal(h.queries.length,0);
  h.desk.focus(null);assert.equal(h.desk.selected(),null);
  assert.equal((await h.desk.route('What does this mean?')).handled,true);assert.equal(h.chosen.length,1);
  h.setPhotos([h.photo('first')]);await h.desk.route('What do you see here?');assert.equal(h.chosen.length,2,'Cleared deictic question cannot substitute even the sole photo.');
});
test('photo originals, exclusion and current job are checked before a question can name them',async t=>{
  const h=harness();t.after(()=>h.desk.dispose());const files=await h.desk.list();
  await assert.rejects(h.desk.open({...files.items[0],jobId:'other-job'}),/another work order/);
  await h.desk.open(files.items[0]);h.setPhotos([{...h.photo('first'),dataBase64:Buffer.from('changed').toString('base64')}]);
  await assert.rejects(h.desk.route('What do you see here?'),/byte check/);
  h.setPhotos([{...h.photo('first'),status:'excluded'},h.photo('second')]);
  assert.equal((await h.desk.route('What does this mean?')).handled,true);assert.equal(h.chosen.length,1);
});
test('offline Files retains local originals, while a late account or assignment change clears/blocks source focus',async t=>{
  const h=harness();t.after(()=>h.desk.dispose());h.options.getBrief=async()=>{throw Error('offline');};
  const offline=createWorkOrderFiles(h.options);t.after(()=>offline.dispose());
  const list=await offline.list();assert.equal(list.items.length,2);assert.match(list.notice,/unavailable/);await offline.open(list.items[0]);
  h.setBrief({job:{...h.job,revision:'new-assignment'},context:[]});await assert.rejects(h.desk.list(),/Assignment changed/);assert.equal(h.shown.at(-1),null);
  let release;const pendingDesk=createWorkOrderFiles({...h.options,getBrief:()=>new Promise(r=>release=r)});t.after(()=>pendingDesk.dispose());
  const pending=pendingDesk.list();h.close();release({job:h.job,context:[]});await assert.rejects(pending,/Account closed/);
});
test('an exact selected document page stays pinned for vague questions and reopening, without photo fallback',async t=>{
  const h=harness();t.after(()=>h.desk.dispose());const doc=(await h.desk.list()).items.find(x=>x.kind==='document');
  await h.desk.open(doc,{page:2});assert.equal(h.desk.selected().excerpt,'Second page');assert.equal(h.desk.selected().printedLabel,'ii');
  const question=await h.desk.route('What does this picture mean?');assert.deepEqual(question.selectedDocument,{versionId:'manual-v1',sha256:sha('source'),revision:'R1',pdfPage:2});
  await h.desk.route('Show it again');assert.equal(h.desk.selected().page,2);assert.equal(h.desk.selected().excerpt,'Second page');
  assert.equal(h.queries.length,0);assert.equal(h.chosen.length,0);
});
test('remembering an answer citation opens nothing until an explicit show command',async t=>{
  const h=harness();t.after(()=>h.desk.dispose());
  h.desk.rememberCitation({versionId:'manual-v1',sha256:sha('source'),revision:'R1',pdfPage:2});
  assert.equal(h.shown.length,0);assert.equal(h.desk.selected(),null);
  assert.equal(await h.desk.route('What inverter model is listed?'),null);assert.equal(h.shown.length,0);
  await h.desk.route('Show it again');assert.equal(h.shown.at(-1).page,2);assert.equal(h.desk.selected().excerpt,'Second page');
});


test('a single current drawing/manual can be opened by type, with the requested page pinned',async t=>{
 const h=harness();t.after(()=>h.desk.dispose());h.setBrief({job:h.job,context:[{versionId:'manual-v1',title:'Approved field manual',mime:'text/plain',revision:'R1',sha256:sha('source'),status:'approved',processing:{status:'ready',pageCount:2}}]});
 await h.desk.route('Pull up the manual page 2');assert.equal(h.desk.selected().page,2);assert.equal(h.desk.selected().excerpt,'Second page');
 await h.desk.route('Show it again');assert.equal(h.desk.selected().page,2);assert.equal(h.queries.length,0);
});


test('closing a picker while its source loads cannot select or display a late file',async t=>{
 const h=harness();let release,open=true;const desk=createWorkOrderFiles({...h.options,getPages:()=>new Promise(r=>release=r)});t.after(()=>desk.dispose());
 const doc=(await desk.list()).items.find(x=>x.kind==='document');
 const pending=desk.open(doc,{ensureOpen:()=>{if(!open)throw Error('Picker closed');}});
 while(!release)await new Promise(r=>setImmediate(r));open=false;release([{pdfPage:1,text:'Late text'}]);
 await assert.rejects(pending,/Picker closed/);assert.equal(desk.selected(),null);assert.equal(h.shown.length,0);
});
