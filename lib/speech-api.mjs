import {once} from 'node:events';
export async function handleSpeech(req,res,{authorize,service,tickets}){
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(!authorize())return json(403,{error:'Speech requires this authenticated app'});
  if(!service)return json(503,{error:'Expressive speech is not configured; local voice is available'});
  if(req.headers['content-type']!=='application/json')return json(415,{error:'Expected application/json'});
  const abort=new AbortController();res.on('close',()=>{if(!res.writableFinished)abort.abort();});
  try{let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>2000)throw Error('Speech request too large');}
    const input=JSON.parse(text);if(!input||Object.keys(input).some(k=>!['jobId','turnId','token','requestId','voice'].includes(k))||!/^[a-f0-9-]{36}$/.test(input.requestId))throw Error('Invalid speech identity');
    const permitted=tickets.take(input);
    await service.stream({text:permitted.text,voice:input.voice,signal:abort.signal,onStart:meta=>{res.writeHead(200,{'Content-Type':'audio/pcm','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-CarryForward-Speech-Id':input.requestId,'X-CarryForward-Sample-Rate':'24000','X-CarryForward-Speech-Model':meta.model,'X-CarryForward-Speech-Voice':meta.voice||'fixture'});},onChunk:async bytes=>{abort.signal.throwIfAborted();if(!res.write(bytes))await once(res,'drain',{signal:abort.signal});}});
    res.end();
  }catch(error){if(!res.headersSent)json(400,{error:error.message});else res.destroy();}
}
