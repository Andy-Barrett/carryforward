import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {encodeMonoWav} from './public/audio.js';

test('real guard refuses duration-priced audio before dispatch when aggregate cap cannot cover reservation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'carryforward-guard-test-'));
 const ledger={capUsd:10,reservedUsd:9.999,requests:[{id:'prior-fixture',reservedUsd:9.999}]};
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
