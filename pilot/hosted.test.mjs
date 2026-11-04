import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink, lstat, access, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { hostedConfiguration, createHostedPilot, mountedReadWriteDisk, HOSTED_SCOPE } from './hosted.mjs';
import { demoOrder } from '../public/engine.js';
import { evidenceRevision } from '../public/evidence.js';
import { createPilotServer } from './server.mjs';

const hostname='carryforward-pilot.example.test',origin='https://'+hostname;
const emails=['a-owner@example.test','a-tech@example.test','b-owner@example.test','b-tech@example.test'];
const password='fictional-hosted-trial-password-2026';
function env(directory,port=10000){return {CF_PILOT_RELEASE_SCOPE:HOSTED_SCOPE,CF_PILOT_PUBLIC_ORIGIN:origin,CF_PILOT_DISK_PATH:directory,CF_PILOT_STATE_DIR:join(directory,'state'),CF_PILOT_BOOTSTRAP_FILE:join(directory,'accounts.json'),CF_PILOT_ALLOWED_EMAILS:emails.join(','),PORT:String(port)};}
async function freePort(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('hosted config rejects unreviewed scope, origins, state paths, enrollment and ambient provider reuse',()=>{
  const good=env('/tmp/cf-volume');assert.equal(hostedConfiguration(good).origin,origin);
  assert.equal(hostedConfiguration({...good,CF_PILOT_PUBLIC_ORIGIN:undefined,RENDER_EXTERNAL_HOSTNAME:hostname}).origin,origin);
  for(const patch of [{CF_PILOT_RELEASE_SCOPE:''},{CF_PILOT_PUBLIC_ORIGIN:'http://pilot.example.test'},{CF_PILOT_PUBLIC_ORIGIN:'https://user:secret@pilot.example.test'},{CF_PILOT_PUBLIC_ORIGIN:origin+'/pilot/'},{CF_PILOT_PUBLIC_ORIGIN:origin+'?secret=no'},{CF_PILOT_PUBLIC_ORIGIN:'https://192.168.1.2'},{CF_PILOT_PUBLIC_ORIGIN:'https://localhost'},{RENDER_EXTERNAL_HOSTNAME:'other.example.test'},{PORT:'not-a-port'},{PORT:'0'},{CF_PILOT_STATE_DIR:'/tmp/outside'},{CF_PILOT_STATE_DIR:'/tmp/cf-volume'},{CF_PILOT_DISK_PATH:'relative'},{CF_PILOT_ALLOWED_EMAILS:''},{CF_PILOT_ALLOWED_EMAILS:'wrong'},{CF_PILOT_ALLOWED_EMAILS:'a@example.test,A@example.test'},{CARRYFORWARD_PILOT_PROVIDER_CONFIG:'/private/local-config'}])assert.throws(()=>hostedConfiguration({...good,...patch}));
});

test('mount check requires the exact durable read-write mount, not parent/tmpfs/overlay/read-only',()=>{
  const line='42 31 8:1 / /var/data rw,relatime - ext4 /dev/disk rw';
  assert.equal(mountedReadWriteDisk(line,'/var/data'),true);
  for(const altered of [line.replace('/var/data','/var'),line.replace('/var/data','/var/data-other'),line.replace('rw,relatime','ro,relatime'),line.replace('ext4','tmpfs'),line.replace('ext4','overlay'),line.replace('/dev/disk rw','/dev/disk ro')])assert.equal(mountedReadWriteDisk(altered,'/var/data'),false);
  assert.equal(mountedReadWriteDisk(line.replace('/var/data','/var/test\\040data'),'/var/test data'),true);
});

test('hosted startup refuses unavailable volumes and incomplete state before replacing databases/secrets',async t=>{
  const dir=await realpath(await mkdtemp(join(tmpdir(),'cf-hosted-reject-')));t.after(()=>rm(dir,{recursive:true,force:true}));
  const config=hostedConfiguration(env(dir,await freePort()));
  await assert.rejects(createHostedPilot(config,{verifyDisk:async()=>false}),/persistent disk/);
  await assert.rejects(access(config.directory));
  await mkdir(config.directory);
  await writeFile(join(config.directory,'auth.sqlite'),'retained-incomplete-test-bytes');
  await assert.rejects(createHostedPilot(config,{verifyDisk:async()=>true}),/incomplete/);
  assert.equal(await readFile(join(config.directory,'auth.sqlite'),'utf8'),'retained-incomplete-test-bytes');
  await assert.rejects(access(join(config.directory,'auth-secret')));
  await assert.rejects(access(join(config.directory,'runtime.pid')));
  await rm(join(config.directory,'auth.sqlite'));
  await writeFile(join(config.directory,'auth-secret'),'retained-valid-private-secret-at-least-32-characters',{mode:0o600});
  await assert.rejects(createHostedPilot(config,{verifyDisk:async()=>true}),/incomplete/);
  await assert.rejects(access(join(config.directory,'auth.sqlite')));
});

test('hosted startup rejects symlinked state without reading it as a new workspace',async t=>{
  const dir=await realpath(await mkdtemp(join(tmpdir(),'cf-hosted-link-')));t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(join(dir,'other'));await symlink(join(dir,'other'),join(dir,'state'));
  await assert.rejects(createHostedPilot(hostedConfiguration(env(dir,await freePort())),{verifyDisk:async()=>true}),/symlinks/);
  await assert.rejects(access(join(dir,'other','auth-secret')));
});

test('failed initialization releases only its own runtime lock and retains the invalid secret for review',async t=>{
  const dir=await realpath(await mkdtemp(join(tmpdir(),'cf-hosted-init-')));t.after(()=>rm(dir,{recursive:true,force:true}));
  await writeFile(join(dir,'auth-secret'),'invalid-retained-secret',{mode:0o600});
  await assert.rejects(createPilotServer({directory:dir,port:await freePort()}),/32 characters/);
  await assert.rejects(access(join(dir,'runtime.pid')));
  assert.equal(await readFile(join(dir,'auth-secret'),'utf8'),'invalid-retained-secret');
});

// Real local TLS termination -> HTTP backend, with the fixture CA explicitly
// trusted. This never disables TLS verification or contacts a public service.
async function fixture(t){
  const dir=await realpath(await mkdtemp(join(tmpdir(),'cf-hosted-https-')));
  const port=await freePort(),config=hostedConfiguration(env(dir,port));
  await writeFile(config.bootstrapFile,JSON.stringify({scope:HOSTED_SCOPE,users:emails.map((email,i)=>({email,password,name:(i%2?'Fictional hosted tech ':'Fictional hosted owner ')+Math.floor(i/2)}))}),{mode:0o600});
  let mounted=true,app=await createHostedPilot(config,{verifyDisk:async()=>mounted});await app.listen();
  const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN='+hostname,'-addext','subjectAltName=DNS:'+hostname],{stdio:'ignore'});
  const ca=await readFile(cert),proxy=https.createServer({key:await readFile(key),cert:ca},(req,res)=>{
    const upstream=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers},answer=>{res.writeHead(answer.statusCode,answer.headers);answer.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
  });
  await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
  t.after(async()=>{proxy.closeAllConnections();await new Promise(r=>proxy.close(r));await app.close();await rm(dir,{recursive:true,force:true});});
  function client(){const cookies=new Map();return async(path,body,extra={})=>{
    const result=await new Promise((resolve,reject)=>{
      const request=https.request({hostname:'127.0.0.1',port:proxy.address().port,servername:hostname,ca,path,method:body===undefined?'GET':'POST',headers:{Host:hostname,Origin:origin,'X-CarryForward-Intent':'pilot',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(body===undefined?{}:{'Content-Type':'application/json'}),...extra}},response=>{const chunks=[];response.on('data',x=>chunks.push(x));response.on('end',()=>{const bytes=Buffer.concat(chunks);let value;try{value=JSON.parse(bytes);}catch{}resolve({status:response.statusCode,headers:response.headers,bytes,value});});});
      request.on('error',reject);request.end(body===undefined?undefined:JSON.stringify(body));
    });
    for(const raw of result.headers['set-cookie']||[]){const[k,v]=raw.split(';')[0].split('=');v?cookies.set(k,v):cookies.delete(k);}
    return result;
  };}
  return{dir,config,client,get app(){return app;},setMounted(value){mounted=value;},async restart(list=emails){await app.close();app=await createHostedPilot({...config,enrollmentEmails:list},{verifyDisk:async()=>mounted});await app.listen();}};
}

test('real TLS proxy rehearsal: restricted enrollment, two-company work, exact confirmation and persistent restart',async t=>{
  const f=await fixture(t),anonymous=f.client(),owners=[f.client(),f.client()],workers=[f.client(),f.client()];
  assert.equal((await anonymous('/readyz')).status,200);
  assert.equal((await anonymous('/pilot/api/account')).value.selfRegistration,false);
  const signup=await anonymous('/api/auth/sign-up/email',{email:'unapproved@example.test',name:'Unapproved',password});assert.equal(signup.status,403);
  for(const path of ['/api/auth/sign-up/email/','/api/auth//sign-up/email','/api/auth/change-email'])assert.equal((await anonymous(path,{email:'unapproved@example.test',name:'Unapproved',password})).status,404);
  assert.equal((await anonymous('/pilot/api/jobs')).status,401);
  assert.equal((await anonymous('/readyz',undefined,{Host:'forged.example.test','X-Forwarded-Host':hostname})).status,421);
  assert.equal((await anonymous('/api/auth/sign-up/email',{email:emails[0],name:'Forged origin',password},{Origin:'https://forged.example.test'})).status,403);
  const records=[];
  for(let i=0;i<2;i++){
    const owner=owners[i],worker=workers[i],ownerName='Fictional hosted owner '+i,techName='Fictional hosted tech '+i;
    assert.equal((await owner('/api/auth/sign-up/email',{email:emails[i*2],name:ownerName,password})).status,403);
    const created=await owner('/api/auth/sign-in/email',{email:emails[i*2],password},{'X-Forwarded-For':'203.0.113.1','X-Forwarded-Proto':'http'});
    assert.equal(created.status,200,JSON.stringify(created.value));
    assert((created.headers['set-cookie']||[]).some(c=>/; Secure/i.test(c)&&/; HttpOnly/i.test(c)));
    const company=await owner('/pilot/api/account/companies',{name:'Fictional hosted company '+i});assert.equal(company.status,201);
    assert.equal((await owner('/pilot/api/account/invitations',{email:'not-approved@example.test',role:'technician'})).status,403);
    const invited=await owner('/pilot/api/account/invitations',{email:emails[i*2+1],role:'technician'});assert.equal(invited.status,201);
    assert.equal((await worker('/api/auth/sign-in/email',{email:emails[i*2+1],password})).status,200);
    const member=await worker('/pilot/api/account/invitations/accept',{token:new URL(invited.value.url).hash.slice(8)});assert.equal(member.status,200);
    const uploaded=await owner('/pilot/api/documents',{title:'Fictional hosted context '+i,issuer:'Fictional QA',revision:'QA-1',mime:'text/plain',applicability:{kind:'job_reference'},dataBase64:Buffer.from('Host fixture '+i+'\nRecord observations separately from physical work completion.').toString('base64')});assert.equal(uploaded.status,201);
    const doc=uploaded.value;assert.equal((await owner('/pilot/api/documents/'+doc.versionId+'/approve',{})).status,200);
    if(i===0){
      let release,entered;const held=new Promise(r=>{entered=r;}),wait=new Promise(r=>{release=r;}),upload=f.app.library.upload;
      f.app.library.upload=async(...args)=>{entered();await wait;return upload(...args);};
      const body={title:'Held fictional source',issuer:'QA',revision:'1',mime:'text/plain',applicability:{kind:'job_reference'},dataBase64:Buffer.from('Held fixture').toString('base64')};
      const first=owner('/pilot/api/documents',body);await held;
      try{assert.equal((await owner('/pilot/api/documents',body)).status,429);}finally{release();}
      assert.equal((await first).status,201);f.app.library.upload=upload;
    }
    const input={version:'carryforward.assignment.v2',externalId:'SAME-HOSTED-WO',sourceRevision:'1',assigneeUserIds:[member.value.principal.userId],customerRef:'customer-'+i,siteRef:'site-'+i,systemRef:'system-'+i,equipment:[],contextRefs:[{documentId:doc.documentId,versionId:doc.versionId,purpose:'job_reference',required:true}],order:{...demoOrder,customer:'Fictional customer '+i,customerContact:undefined,history:[]}};
    const jobResult=await owner('/pilot/api/jobs',input,{'Idempotency-Key':randomUUID()});assert.equal(jobResult.status,201,JSON.stringify(jobResult.value));const job=jobResult.value;
    const bytes=await readFile(new URL('../public/job-assets/display-example.jpg',import.meta.url));
    const photo={id:'hosted-photo-'+i,jobId:job.id,name:'Fictional inverter display',mime:'image/jpeg',sha256:createHash('sha256').update(bytes).digest('hex'),dataBase64:bytes.toString('base64')};
    assert.equal((await worker(`/pilot/api/jobs/${job.id}/evidence`,{photos:[photo]})).status,200);
    const entries=Object.fromEntries(job.order.checks.map(x=>[x.id,{status:'pending',note:'Unverified; Operations follow-up required.'}]));
    const candidate=await worker(`/pilot/api/jobs/${job.id}/closeout`,{eventRevision:0,report:{technician:techName,summary:'Fictional visual inspection only. Unverified checks remain with Operations.',recordedAt:new Date().toISOString(),followupOwner:'Operations',promises:'Operations to review open checks.',interviewRevision:0,evidenceRevision:evidenceRevision([photo]),entries}});
    assert.equal(candidate.status,200,JSON.stringify(candidate.value));
    assert.equal((await worker(`/pilot/api/jobs/${job.id}/confirmations`,{name:techName,revision:candidate.value.revision,reportRevision:candidate.value.reportRevision,confirmedAt:new Date().toISOString()})).status,200);
    assert.equal((await worker(`/pilot/api/jobs/${job.id}/deliveries`,{revision:candidate.value.revision})).status,200);
    assert.equal((await owner(`/pilot/api/jobs/${job.id}/receipts`,{revision:candidate.value.revision})).status,200);
    assert.equal((await owner(`/pilot/api/jobs/${job.id}/acceptances`,{revision:candidate.value.revision})).value.decision,'accepted_with_followups');
    records.push({job,doc,photo,bytes,userId:member.value.principal.userId,companyId:member.value.principal.companyId,revision:candidate.value.revision});
  }
  assert.equal((await workers[0]('/pilot/api/jobs/'+records[1].job.id)).status,404);
  assert.equal((await owners[0]('/pilot/api/documents/'+records[1].doc.versionId+'/original')).status,404);
  assert.equal((await workers[0](`/pilot/api/jobs/${records[1].job.id}/evidence/${records[1].photo.id}`)).status,404);
  const secret=await readFile(join(f.config.directory,'auth-secret'));
  assert.equal((await lstat(join(f.config.directory,'auth-secret'))).mode&0o777,0o600);
  // A changed/stale initial secret file cannot rotate existing credentials.
  await writeFile(f.config.bootstrapFile,JSON.stringify({scope:HOSTED_SCOPE,users:emails.map(email=>({email,password:'changed-bootstrap-password-should-not-apply',name:'Changed'}))}),{mode:0o600});
  await f.restart();
  assert.deepEqual(await readFile(join(f.config.directory,'auth-secret')),secret);
  for(let i=0;i<2;i++){
    const worker=workers[i],account=(await worker('/pilot/api/account')).value;
    assert.equal(account.principal.companyId,records[i].companyId);assert.equal(account.memberships.length,1);
    const report=(await worker(`/pilot/api/jobs/${records[i].job.id}/closeout`)).value;
    assert.equal(report.revision,records[i].revision);assert.equal(report.authenticatedAuthorship.authorUserId,records[i].userId);assert.equal(report.closeout.openCount,4);
    assert.equal(report.confirmation.revision,records[i].revision);assert.equal(report.closeout.followupOwner,'Operations');
    assert.equal((await worker(`/pilot/api/jobs/${records[i].job.id}`)).value.status.decision,'accepted_with_followups');
    assert.deepEqual((await worker(`/pilot/api/jobs/${records[i].job.id}/evidence/${records[i].photo.id}`)).bytes,records[i].bytes);
    const original=await owners[i]('/pilot/api/documents/'+records[i].doc.versionId+'/original');
    assert.equal(original.status,200);assert.equal(createHash('sha256').update(original.bytes).digest('hex'),records[i].doc.sha256);
  }
  f.setMounted(false);assert.equal((await anonymous('/readyz')).status,503);f.setMounted(true);assert.equal((await anonymous('/readyz')).status,200);
  await f.restart(emails.filter(x=>x!==emails[1]));
  assert.equal((await workers[0]('/pilot/api/jobs/'+records[0].job.id)).status,401);
  assert.equal((await workers[1]('/pilot/api/jobs/'+records[1].job.id)).status,200);
});

test('bounded drain aborts a slow HTTP body, preserves completed data and releases the runtime lock',async t=>{
  const f=await fixture(t),worker=f.client();
  assert.equal((await worker('/api/auth/sign-in/email',{email:emails[0],password})).status,200);
  const before=createHash('sha256').update(await readFile(join(f.config.directory,'auth-secret'))).digest('hex');
  const entered=new Promise(resolve=>f.app.server.once('request',resolve));
  const slow=http.request({hostname:'127.0.0.1',port:f.config.port,path:'/api/auth/sign-in/email',method:'POST',headers:{Host:hostname,Origin:origin,'Content-Type':'application/json','Transfer-Encoding':'chunked'}});
  slow.on('error',()=>{});slow.write('{"email":');await entered;
  await f.app.close({forceAfterMs:30});
  await assert.rejects(access(join(f.config.directory,'runtime.pid')));
  assert.equal(createHash('sha256').update(await readFile(join(f.config.directory,'auth-secret'))).digest('hex'),before);
  await f.restart();assert.equal((await worker('/api/auth/sign-in/email',{email:emails[0],password})).status,200);
  slow.destroy();
});
