import {WebSocket,WebSocketServer} from 'ws';
import {checkLiveStart,checkPcmFrame,cleanAsrEvent,LIVE_MODEL,LIVE_LIMITS} from '../public/live-protocol.js';

// One bounded relay, used at both application and budget boundaries. A consumer
// disconnect closes the provider socket; no connection or request is replayed.
export function attachLiveRelay(server,{path,authorize,claim,release,prepare=async()=>{},connect,handshake,acknowledgement}) {
  const sockets = new WebSocketServer({noServer:true,maxPayload:LIVE_LIMITS.frameBytes,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head) => {
    const url = new URL(req.url,'http://localhost');
    const reject = status => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    if (url.pathname !== path || url.search) return reject('404 Not Found');
    if (!authorize(req)) return reject('403 Forbidden');
    if (!claim()) return reject('429 Too Many Requests');
    try { sockets.handleUpgrade(req,socket,head,ws => run(ws)); }
    catch { release(); socket.destroy(); }
  });
  function run(client) {
    let phase='start', upstream=null, total=0, readyAt=0, sessionId=null, closed=false,preparing=false,released=false;
    const releaseSlot=()=>{if(!released&&!preparing){released=true;release();}};
    let startTimer=setTimeout(()=>finish('Live voice did not start in time.'),5000), drainTimer=null;
    const timer=setTimeout(()=>finish('Live voice reached its session time limit.'),55000);
    function send(event) {
      if (client.readyState !== WebSocket.OPEN) return;
      if (client.bufferedAmount > LIVE_LIMITS.backlogBytes) { finish('Speech results could not reach this device.'); return; }
      client.send(JSON.stringify(event));
    }
    function finish(error=null,clean=false) {
      if (closed) return; closed=true; phase='closed';
      clearTimeout(startTimer); clearTimeout(timer); clearTimeout(drainTimer);
      if (error) send({type:'error',message:error});
      else if (clean) send({type:'done',sessionId,model:LIVE_MODEL,audioDurationMs:total/32});
      if (upstream) { upstream.removeAllListeners('message'); upstream.terminate(); }
      if (client.readyState === WebSocket.OPEN) client.close(error?1008:1000);
      const force=setTimeout(()=>{if(client.readyState!==WebSocket.CLOSED)client.terminate();},1000); force.unref();
      releaseSlot();
    }
    client.on('error',()=>finish('Live voice connection stopped.'));
    client.on('close',()=>finish());
    client.on('message',async(data,binary)=>{
      try {
        if (phase === 'start') {
          if (binary) throw Error('Start live voice before sending audio.');
          const input=checkLiveStart(JSON.parse(data.toString())); phase='preparing'; clearTimeout(startTimer);
          preparing=true;
          try{await prepare(input);}finally{preparing=false;if(closed)releaseSlot();}
          if(closed)return;
          upstream=connect(); phase='connecting';
          startTimer=setTimeout(()=>finish('Speech service did not become ready.'),10000);
          upstream.on('error',()=>finish('Speech service unavailable. Your local recording is unchanged.'));
          upstream.on('open',()=>{if(!closed)upstream.send(JSON.stringify(handshake(input)));});
          upstream.on('message',(bytes,isBinary)=>{
            try {
              if (closed) return;
              if (isBinary || bytes.length > 32000) throw Error('Invalid speech response.');
              const raw=JSON.parse(bytes.toString());
              if (raw.type === 'error') throw Error('Speech service stopped. Review the local recording; no retry was sent.');
              if (phase === 'connecting') {
                const id=acknowledgement(raw);
                if (!id) throw Error('Speech service did not acknowledge this session.');
                sessionId=id; phase='audio'; readyAt=Date.now(); clearTimeout(startTimer);
                send({type:'ready',sessionId,model:LIVE_MODEL}); return;
              }
              if (raw.type === 'done') return; // The application relay derives its own duration and close result.
              const event=cleanAsrEvent(raw); if(event)send(event);
            } catch(error) { finish(error.message); }
          });
          upstream.on('close',code=>{if(!closed)finish(code===1000&&phase==='ending'?null:'Speech stream ended before completion.',code===1000&&phase==='ending');});
          return;
        }
        if (binary) {
          if (phase !== 'audio') throw Error('Audio is not accepted in this session state.');
          total=checkPcmFrame(data.length,total,Date.now()-readyAt);
          if (upstream.bufferedAmount > LIVE_LIMITS.backlogBytes) throw Error('Speech connection is too slow. Recording stays local.');
          upstream.send(data,{binary:true}); return;
        }
        const control=JSON.parse(data.toString());
        if (control.type !== 'endStream' || Object.keys(control).length !== 1 || phase !== 'audio') throw Error('Invalid live voice control.');
        phase='ending'; upstream.send(JSON.stringify({type:'endStream'}));
        drainTimer=setTimeout(()=>finish('Final words did not arrive. Review the saved recording.'),12000);
      } catch(error) { finish(error.message); }
    });
  }
  server.on('close',()=>{for(const ws of sockets.clients)ws.terminate();sockets.close();});
  return sockets;
}
export const connectGuardVoice = token => new WebSocket('ws://127.0.0.1:4421/v1/asr/realtime',{headers:{Authorization:`Bearer ${token}`},maxPayload:32000,perMessageDeflate:false,handshakeTimeout:10000});
export const connectMetaVoice = () => new WebSocket('wss://api.meta.ai/v1/asr/realtime',{maxPayload:32000,perMessageDeflate:false,handshakeTimeout:10000});
export function metaVoiceHandshake(key) {
  return {authorization:{accessToken:`Bearer ${key}`},model:LIVE_MODEL,audioEncoding:'PCM_16KHZ',mode:'ENDPOINTING',partialMode:'CUMULATIVE',emitAudioProgress:true,keywords:['inverter','kilowatts','monitoring','warranty','CarryForward']};
}
export function sessionAcknowledgement(raw) { return typeof raw.sessionId==='string'&&raw.sessionId.length>0&&raw.sessionId.length<=200?raw.sessionId:null; }
