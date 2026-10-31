import http from 'node:http';
import {readFile,writeFile,open,unlink} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {inspectWav} from '../public/audio.js';
import {createHash} from 'node:crypto';
for(const name of ['CF_GUARD_KEY_FILE','CF_GUARD_LEDGER_FILE','CF_GUARD_TOKEN_FILE','CF_GUARD_LOCK_FILE'])if(!process.env[name])throw new Error(name+' is required');
const key=(await readFile(process.env.CF_GUARD_KEY_FILE,'utf8')).trim();
const ledgerPath=process.env.CF_GUARD_LEDGER_FILE;
const tokenPath=process.env.CF_GUARD_TOKEN_FILE;
const token=randomBytes(32).toString('hex');
const ledger=JSON.parse(await readFile(ledgerPath,'utf8'));
if(ledger.capUsd!==10||!Number.isFinite(ledger.reservedUsd)||ledger.reservedUsd<0||!Array.isArray(ledger.requests))throw new Error('Invalid existing ledger');
const lock=await open(process.env.CF_GUARD_LOCK_FILE,'wx',0o600);
await writeFile(tokenPath,token,{mode:0o600});
let busy=false;
const headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
const server=http.createServer(async(req,res)=>{
 const fail=(status,message)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{type:'budget_guard',message}}));};
 if(req.headers.authorization!==`Bearer ${token}`)return fail(401,'Invalid local token');
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&path==='/muse-code/models'){const upstream=await fetch('https://api.meta.ai/muse-code/models',{headers,signal:AbortSignal.timeout(30000)});res.writeHead(upstream.status,{'Content-Type':'application/json'});res.end(await upstream.text());return;}
 if(req.method==='GET'&&path==='/v1/models'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({object:'list',data:[{id:'muse-spark-1.3',object:'model',owned_by:'meta'}]}));return;}
 if(req.method==='POST'&&path==='/v1/asr/transcribe'){
  if(busy)return fail(429,'One model request at a time');busy=true;
  try{
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2000000)throw new Error('Audio request exceeds limit');chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks));
   if(body.model!=='muse-voice-transcribe-1.0'||typeof body.audioBase64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.audioBase64))throw new Error('Invalid bounded transcription request');
   const bytes=Buffer.from(body.audioBase64,'base64'),audio=inspectWav(bytes);
   if(createHash('sha256').update(bytes).digest('hex')!==body.sha256)throw new Error('Audio hash mismatch');
   // Published rate: $0.18/hour, whole-second metering. Reserve at least
   // one cent, including a one-second margin; never refund on failure.
   const reserve=Math.max(0.01,Math.ceil((Math.ceil(audio.seconds)+1)*0.18/3600*1e6)/1e6);
   if(ledger.reservedUsd+reserve>ledger.capUsd)throw new Error('Aggregate $10 budget exhausted; transcription not sent');
   const entry={id:randomUUID(),at:new Date().toISOString(),model:body.model,audioSeconds:audio.seconds,rateUsdPerHour:0.18,reservedUsd:reserve,state:'reserved'};
   ledger.requests.push(entry);ledger.reservedUsd=Number((ledger.reservedUsd+reserve).toFixed(6));
   await writeFile(ledgerPath,JSON.stringify(ledger,null,2),{mode:0o600});
   const form=new FormData();form.append('request',new Blob([JSON.stringify({mode:'PUSH_TO_TALK',model:body.model,audioEncoding:'WAV'})],{type:'application/json'}));form.append('audio',new Blob([bytes],{type:'audio/wav'}),'answer.wav');
   const upstream=await fetch('https://api.meta.ai/v1/asr/transcribe',{method:'POST',headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},body:form,signal:AbortSignal.timeout(90000)});
   entry.state='dispatched';entry.httpStatus=upstream.status;
   const result=await upstream.json();
   if(upstream.ok){entry.audioDurationMs=result.audioDurationMs;entry.sessionId=result.sessionId;}
   await writeFile(ledgerPath,JSON.stringify(ledger,null,2),{mode:0o600});
   console.log(JSON.stringify({event:'audio_reserved',request:ledger.requests.length,totalReservedUsd:ledger.reservedUsd,httpStatus:upstream.status}));
   res.writeHead(upstream.status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
  }catch(e){if(!res.headersSent)fail(400,e.message);else res.end();}finally{busy=false;}
  return;
 }
 if(req.method!=='POST'||path!=='/v1/responses'){console.log('Blocked endpoint',req.method,path);return fail(400,'Only bounded Responses requests are enabled');}
 if(busy)return fail(429,'One model request at a time');busy=true;
 try{
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2000000)throw new Error('Request exceeds local size limit');chunks.push(chunk);}
 const body=JSON.parse(Buffer.concat(chunks));
 if(body.model!=='muse-spark-1.3')throw new Error('Only muse-spark-1.3 standard route is enabled');
 if(body.previous_response_id||body.conversation)throw new Error('Hidden server-side history is disabled');
 if((body.tools||[]).some(t=>!(t.type==='function'||(t.type==='namespace'&&Array.isArray(t.tools)&&t.tools.every(c=>c.type==='function')))))throw new Error('Unsupported tool definitions: '+JSON.stringify((body.tools||[]).map(t=>({type:t.type,name:t.name,childTypes:t.tools?.map(c=>c.type)}))));
 body.max_output_tokens=Math.min(Number.isInteger(body.max_output_tokens)&&body.max_output_tokens>0?body.max_output_tokens:8192,8192);
 body.store=false;
 const countBody={...body};delete countBody.stream;delete countBody.stream_options;
 const counted=await fetch('https://api.meta.ai/v1/responses/input_tokens',{method:'POST',headers,body:JSON.stringify(countBody),signal:AbortSignal.timeout(45000)});
 if(!counted.ok)throw new Error(`Token preflight refused (${counted.status}); generation not sent`);
 const result=await counted.json();const input=result.input_tokens;
 if(!Number.isInteger(input)||input<0||input>200000)throw new Error('Token preflight is unavailable or exceeds 200k input cap');
 // Reserve full uncached input, a 10k input safety margin and the entire output limit.
 // No reservation refunds, including interrupted/error responses. This bounds all retries.
 const reserve=Math.ceil(((input+10000)*1.25/1e6+body.max_output_tokens*4.25/1e6)*1e6)/1e6;
 if(ledger.reservedUsd+reserve>ledger.capUsd)throw new Error('Aggregate $10 budget exhausted; generation not sent');
 const entry={id:randomUUID(),at:new Date().toISOString(),model:body.model,inputTokensPreflight:input,maxOutputTokens:body.max_output_tokens,reservedUsd:reserve,state:'reserved'};
 ledger.requests.push(entry);ledger.reservedUsd=Number((ledger.reservedUsd+reserve).toFixed(6));
 await writeFile(ledgerPath,JSON.stringify(ledger,null,2),{mode:0o600});
 console.log(JSON.stringify({event:'reserved',request:ledger.requests.length,reservedUsd:reserve,totalReservedUsd:ledger.reservedUsd}));
 const upstream=await fetch('https://api.meta.ai/v1/responses',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 entry.httpStatus=upstream.status;entry.state='dispatched';await writeFile(ledgerPath,JSON.stringify(ledger,null,2),{mode:0o600});
 res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-store'});
 if(upstream.body)await new Promise((resolve,reject)=>{const stream=Readable.fromWeb(upstream.body);stream.on('error',reject);res.on('close',resolve);stream.on('end',resolve);stream.pipe(res);});else res.end();
 }catch(e){console.log('Guard:',e.message);if(!res.headersSent)fail(400,e.message);else res.end();}finally{busy=false;}
});
server.listen(Number(process.env.CF_GUARD_PORT || 4421),'127.0.0.1',()=>console.log(`Budget guard listening on loopback:${server.address().port}. Aggregate reservation cap $10.`));

for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{if(busy){console.error('A request is active; wait before stopping the guard.');return;}server.close(async()=>{await lock.close();await unlink(process.env.CF_GUARD_LOCK_FILE);process.exit(0);});});
