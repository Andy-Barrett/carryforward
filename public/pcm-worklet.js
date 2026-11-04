// Downmix and resample across render blocks; send 100 ms of mono 16-bit PCM.
class CarryForwardPCM extends AudioWorkletProcessor {
  constructor() { super(); this.samples=[];this.position=0;this.packet=[];this.sent=0;this.stopped=false;
    this.port.onmessage=event=>{if(event.data==='stop'){this.flush();this.stopped=true;this.port.postMessage({type:'stopped'});}};
  }
  flush() { if(!this.packet.length)return;const bytes=new ArrayBuffer(this.packet.length*2),view=new DataView(bytes);for(let i=0;i<this.packet.length;i++)view.setInt16(i*2,this.packet[i],true);this.port.postMessage({type:'pcm',bytes},[bytes]);this.packet=[]; }
  process(inputs) {
    if(this.stopped)return false;
    const channels=inputs[0];if(!channels?.length)return true;
    for(let i=0;i<channels[0].length;i++){let sum=0;for(const c of channels)sum+=c[i];this.samples.push(sum/channels.length);}
    const step=sampleRate/16000;
    while(this.position+1<this.samples.length&&this.sent<480000){const at=Math.floor(this.position),fraction=this.position-at;let value=this.samples[at]*(1-fraction)+this.samples[at+1]*fraction;value=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;this.packet.push(Math.round(value*(value<0?32768:32767)));this.sent++;this.position+=step;if(this.packet.length===1600)this.flush();}
    const used=Math.min(Math.floor(this.position),this.samples.length-1);this.samples.splice(0,used);this.position-=used;
    if(this.sent>=480000){this.flush();this.stopped=true;this.port.postMessage({type:'limit'});return false;}
    return true;
  }
}
registerProcessor('carryforward-pcm',CarryForwardPCM);
