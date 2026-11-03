import WebSocket from 'ws';
import {once} from 'node:events';
// v4 Turbo uses Text-to-Dialogue, not the legacy Text-to-Speech REST route.
// One bounded reply, one voice, one socket. Never reconnect or retry synthesis.
export async function* dialoguePcm({key,model,voiceId,text,signal,Socket=WebSocket}){
  signal.throwIfAborted();
  const socket=new Socket(`wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=${model}&output_format=pcm_24000`,{headers:{'xi-api-key':key},maxPayload:512000,followRedirects:false,handshakeTimeout:20000});
  // WebSocket messages must retain their boundaries; a byte stream can merge
  // two JSON frames. Pause transport while awaiting the downstream PCM writer.
  const queue=[];let failure=null,closed=false,wake=null;
  const notify=()=>{wake?.();wake=null;};
  socket.on('message',(raw,binary)=>{socket.pause();if(binary||queue.length>=64){failure=Error('Invalid or excessive dialogue frames');socket.terminate();}else queue.push(raw);notify();});
  socket.on('error',()=>{failure=Error('Speech dialogue connection failed');notify();});
  socket.on('close',()=>{closed=true;notify();});
  const abort=()=>{failure=Error('Speech request aborted');socket.terminate();notify();};
  signal.addEventListener('abort',abort,{once:true});
  try{
    await once(socket,'open',{signal});signal.throwIfAborted();
    socket.send(JSON.stringify({voices:[voiceId]}));
    socket.send(JSON.stringify({inputs:[{text,voice_id:voiceId,new_turn:true}]}));
    socket.send(JSON.stringify({close_socket:true}));
    let count=0,final=false;
    while(true){
      signal.throwIfAborted();if(failure)throw failure;
      if(!queue.length){if(closed)break;await new Promise(resolve=>{wake=resolve;socket.resume();});continue;}
      const raw=queue.shift();if(++count>3000)throw Error('Speech provider exceeded its message limit');
      let value;try{value=JSON.parse(raw);}catch{throw Error('Speech provider returned malformed dialogue');}
      if(value.error||value.message_type==='error')throw Error('Speech provider rejected the dialogue; no retry made');
      if(value.audio){
        if(typeof value.audio!=='string'||value.audio.length>500000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.audio))throw Error('Invalid dialogue PCM encoding');
        yield Buffer.from(value.audio,'base64');
      }
      if(value.is_final===true){final=true;break;}
    }
    if(!final)throw Error('Speech dialogue ended before its final frame');
  }finally{signal.removeEventListener('abort',abort);socket.terminate();}
}
