export const AUDIO_LIMITS={seconds:30,originalBytes:5000000,clipsPerJob:5};
export function validateAudioOriginal(mime,size){
  if(typeof mime!=="string" || !/^audio\/[a-z0-9.+-]+(?:;[a-z0-9=;_.+ \"-]+)?$/i.test(mime) || !Number.isFinite(size) || size<=0 || size>AUDIO_LIMITS.originalBytes) throw new Error("Use a recognizable audio file under 5 MB, or type your answer.");
}
export function inspectWav(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const label=(at)=>String.fromCharCode(...bytes.subarray(at,at+4));
  if(bytes.length<44||bytes.length>1500000||label(0)!=='RIFF'||label(8)!=='WAVE'||view.getUint32(4,true)!==bytes.length-8)throw new Error('Expected a bounded RIFF/WAVE file.');
  let fmt=null,data=null;
  for(let at=12;at+8<=bytes.length;){
    const type=label(at),size=view.getUint32(at+4,true),end=at+8+size;
    if(end>bytes.length)throw new Error('Truncated audio chunk.');
    if(type==='fmt '){
      if(fmt||size<16)throw new Error('Invalid audio format chunk.');
      fmt={format:view.getUint16(at+8,true),channels:view.getUint16(at+10,true),rate:view.getUint32(at+12,true),byteRate:view.getUint32(at+16,true),align:view.getUint16(at+20,true),bits:view.getUint16(at+22,true)};
    }
    if(type==='data'){if(data)throw new Error('Duplicate audio data.');data={bytes:size};}
    at=end+(size%2);
    if(at===bytes.length)break;
    if(at>bytes.length||bytes.length-at<8)throw new Error('Invalid audio chunk boundary.');
  }
  if(!fmt||!data||fmt.format!==1||fmt.channels!==1||![16000,24000].includes(fmt.rate)||fmt.bits!==16||fmt.align!==2||fmt.byteRate!==fmt.rate*2||data.bytes%2||!data.bytes)throw new Error('Use mono 16-bit PCM WAV at 16 or 24 kHz.');
  const seconds=data.bytes/fmt.byteRate;
  if(seconds>AUDIO_LIMITS.seconds)throw new Error('Keep voice answers to 30 seconds or less.');
  return {seconds,sampleRate:fmt.rate,bytes:bytes.length};
}
export function encodeMonoWav(channels,sampleRate){
  if(!Array.isArray(channels)||!channels.length||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Invalid decoded audio.');
  const length=channels[0].length;
  if(!length||channels.some(c=>c.length!==length)||length/sampleRate>AUDIO_LIMITS.seconds)throw new Error('Keep voice answers to 30 seconds or less.');
  const count=Math.floor(length*16000/sampleRate),bytes=new Uint8Array(44+count*2),view=new DataView(bytes.buffer);
  const label=(at,text)=>[...text].forEach((c,i)=>bytes[at+i]=c.charCodeAt(0));
  label(0,'RIFF');view.setUint32(4,bytes.length-8,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){
    const source=i*sampleRate/16000,lo=Math.floor(source),hi=Math.min(lo+1,length-1),t=source-lo;
    let value=0;for(const channel of channels)value+=channel[lo]*(1-t)+channel[hi]*t;value/=channels.length;
    if(!Number.isFinite(value))throw new Error('Invalid audio sample.');
    value=Math.max(-1,Math.min(1,value));view.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true);
  }
  inspectWav(bytes);return bytes;
}
export async function transcriptionWav(blob){
  if(blob.size>AUDIO_LIMITS.originalBytes)throw new Error('Recording exceeds the 5 MB local limit.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  try{inspectWav(bytes);return bytes;}catch{}
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Audio)throw new Error('Audio conversion is unavailable. Use a mono PCM WAV or the text answer.');
  const context=new Audio();
  try{const decoded=await context.decodeAudioData(bytes.buffer);return encodeMonoWav(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate);}
  finally{await context.close();}
}

// Signal level is a recording diagnostic, not speech recognition or verification.
export function wavSignal(input) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);inspectWav(bytes);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let at=12;at+8<=bytes.length;){const size=view.getUint32(at+4,true);
    if(String.fromCharCode(...bytes.subarray(at,at+4))==='data'){
      let sum=0,peak=0;for(let offset=at+8;offset<at+8+size;offset+=2){const value=view.getInt16(offset,true)/32768;sum+=value*value;peak=Math.max(peak,Math.abs(value));}
      const rms=Math.sqrt(sum/(size/2));return {rms,peak,veryQuiet:rms<0.0002};
    }at+=8+size+(size%2);
  }
  throw Error('Audio samples unavailable.');
}
