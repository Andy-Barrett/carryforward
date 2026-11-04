import {WebSocket} from 'ws';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {encodeMonoWav} from './public/audio.js';

for(const cap of [10,15]) {
test('larger selected-image payload reaches token preflight but cannot bypass the aggregate cap',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cf-image-budget-test-'));
 const ledger={capUsd:cap,reservedUsd:cap-0.001,requests:[{id:'prior-reservation',reservedUsd:cap-0.001}]};
 await writeFile(join(dir,'key'),'not-a-provider-key');await writeFile(join(dir,'ledger'),JSON.stringify(ledger));
 const existingToken='a'.repeat(64);await writeFile(join(dir,'token'),existingToken,{mode:0o600});
 // Stub only upstream transport in this child. The real HTTP guard and ledger
 // checks execute; no provider endpoint is contacted.
 await writeFile(join(dir,'transport.mjs'),`import {appendFile} from 'node:fs/promises';globalThis.fetch=async(url,options)=>{await appendFile(${JSON.stringify(join(dir,'dispatches'))},String(url)+'\\n');if(!url.endsWith('/input_tokens'))throw Error('Generation must not dispatch');return new Response(JSON.stringify({input_tokens:1000}));};`);
 const child=spawn(process.execPath,['--import',join(dir,'transport.mjs'),'scripts/meta-budget-guard.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,CF_GUARD_REUSE_TOKEN:'1',CF_GUARD_KEY_FILE:join(dir,'key'),CF_GUARD_LEDGER_FILE:join(dir,'ledger'),CF_GUARD_TOKEN_FILE:join(dir,'token'),CF_GUARD_LOCK_FILE:join(dir,'lock'),CF_GUARD_PORT:'0'},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Guard startup timeout')),10000);child.on('exit',code=>{clearTimeout(timer);reject(Error('Guard exited '+code));});child.stdout.on('data',data=>{text+=data;const match=text.match(/loopback:(\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  const token=(await readFile(join(dir,'token'),'utf8')).trim();
  assert.equal(token,existingToken,'Explicit recovery preserves the existing phone-server token.');
  const packet={model:'muse-spark-1.3',input:[{role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,'+Buffer.alloc(2_100_000).toString('base64')}]}],max_output_tokens:900};
  const response=await fetch(`http://127.0.0.1:${port}/v1/responses`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(packet)});
  assert.equal(response.status,400);assert.match((await response.json()).error.message,/budget exhausted/);
  assert.equal((await readFile(join(dir,'dispatches'),'utf8')).trim(),'https://api.meta.ai/v1/responses/input_tokens');
  assert.deepEqual(JSON.parse(await readFile(join(dir,'ledger'),'utf8')),ledger);
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await rm(dir,{recursive:true,force:true});}
});

test('real guard refuses duration-priced audio before dispatch when aggregate cap cannot cover reservation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'carryforward-guard-test-'));
 const ledger={capUsd:cap,reservedUsd:cap-0.001,requests:[{id:'prior-fixture',reservedUsd:cap-0.001}]};
 await writeFile(join(dir,'key'),'non-provider-fixture-key');await writeFile(join(dir,'ledger'),JSON.stringify(ledger));
 const child=spawn(process.execPath,['scripts/meta-budget-guard.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,CF_GUARD_KEY_FILE:join(dir,'key'),CF_GUARD_LEDGER_FILE:join(dir,'ledger'),CF_GUARD_TOKEN_FILE:join(dir,'token'),CF_GUARD_LOCK_FILE:join(dir,'lock'),CF_GUARD_PORT:'0'},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Guard startup timeout')),10000);child.on('exit',code=>{clearTimeout(timer);reject(new Error(`Guard exited ${code}`));});child.stdout.on('data',data=>{text+=data;const match=text.match(/loopback:(\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  const token=await readFile(join(dir,'token'),'utf8'),bytes=Buffer.from(encodeMonoWav([new Float32Array(16000)],16000));
  const response=await fetch(`http://127.0.0.1:${port}/v1/asr/transcribe`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({model:'muse-voice-transcribe-1.0',audioBase64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')})});
  assert.equal(response.status,400);assert.match((await response.json()).error.message,/budget exhausted/);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'ledger'),'utf8')),ledger);
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await rm(dir,{recursive:true,force:true});}
});


test('real guard refuses a live socket at exhausted budget without changing the existing ledger',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'carryforward-live-budget-test-'));
 const ledger={capUsd:cap,reservedUsd:cap-0.001,requests:[{id:'retained-fixture',reservedUsd:cap-0.001}]};
 await writeFile(join(dir,'key'),'non-provider-fixture-key');await writeFile(join(dir,'ledger'),JSON.stringify(ledger));
 const child=spawn(process.execPath,['scripts/meta-budget-guard.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,CF_GUARD_KEY_FILE:join(dir,'key'),CF_GUARD_LEDGER_FILE:join(dir,'ledger'),CF_GUARD_TOKEN_FILE:join(dir,'token'),CF_GUARD_LOCK_FILE:join(dir,'lock'),CF_GUARD_PORT:'0'},stdio:['ignore','pipe','pipe']});
 let ws;
 try{
  const port=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Guard startup timeout')),10000);child.once('exit',code=>{clearTimeout(timer);reject(Error('Guard exited '+code));});child.stdout.on('data',data=>{output+=data;const match=output.match(/loopback:(\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  const token=(await readFile(join(dir,'token'),'utf8')).trim();ws=new WebSocket(`ws://127.0.0.1:${port}/v1/asr/realtime`,{headers:{Authorization:`Bearer ${token}`}});
  const events=[];ws.on('message',raw=>events.push(JSON.parse(raw.toString())));
  await once(ws,'open');const closed=once(ws,'close');ws.send(JSON.stringify({type:'start',version:1,synthetic:true,jobId:'DEMO-BUDGET',audioId:'ev-0123456789abcdef'}));await closed;
  assert.equal(events[0].type,'error');assert.match(events[0].message,/budget exhausted/);assert.deepEqual(JSON.parse(await readFile(join(dir,'ledger'),'utf8')),ledger);
 }finally{ws?.terminate();if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await rm(dir,{recursive:true,force:true});}
});

}
