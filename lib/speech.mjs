import {dialoguePcm} from './eleven-dialogue.mjs';
import {readFile,writeFile,mkdir,rename,open,unlink} from 'node:fs/promises';
import {speechText} from '../public/speech-text.js';
import {dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
export const SPEECH_LIMITS=Object.freeze({text:1600,bytes:4_320_000,seconds:90,characters:6000,requests:60,sampleRate:24000});
export const SPEECH_MODELS=Object.freeze(['eleven_v4_turbo','eleven_flash_v2_5']);
export const SPEECH_VOICES=Object.freeze({sarah:{id:'EXAVITQu4vr4xnSDxMaL',name:'Sarah · calm'},jessica:{id:'cgSgspJ2msm6clMCkdW9',name:'Jessica · bright'},matilda:{id:'XrExE9yKIg1WjnnlVkGX',name:'Matilda · clear'}});
const bounded=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max;
const digest=text=>createHash('sha256').update(text).digest('hex');
export class SpeechTickets{
  constructor({now=Date.now,ttl=600000}={}){this.now=now;this.ttl=ttl;this.rows=new Map();}
  issue({jobId,turnId=randomUUID(),text}){
    if(!/^DEMO-/.test(jobId)||!bounded(jobId,300)||!bounded(turnId,200)||!bounded(text,SPEECH_LIMITS.text))return null;
    for(const [id,row] of this.rows)if(row.expiresAt<this.now())this.rows.delete(id);
    if(this.rows.size>=500)this.rows.delete(this.rows.keys().next().value);
    const spoken=speechText(text);if(spoken.length>SPEECH_LIMITS.text)return null;
    const token=randomUUID(),row={jobId,turnId,text:spoken,displayText:text,token,sha256:digest(text),expiresAt:this.now()+this.ttl};this.rows.set(token,row);return row;
  }
  take({jobId,turnId,token}){const row=this.rows.get(token);if(!row||row.jobId!==jobId||row.turnId!==turnId||row.expiresAt<this.now())throw Error('Speech permission expired or belongs to another turn');this.rows.delete(token);return row;}
}
// Conservative reservations are never refunded after dispatch, including cancellation.
export class SpeechLedger{
  constructor(path){this.path=path;this.busy=false;}
  async reserve({characters,model,voice,remaining}){
    if(this.busy)throw Error('Speech accounting is busy');this.busy=true;let lock;
    try{await mkdir(dirname(this.path),{recursive:true,mode:0o700});lock=await open(this.path+'.lock','wx',0o600);let data;
      try{data=JSON.parse(await readFile(this.path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;data={version:1,characterCap:SPEECH_LIMITS.characters,requestCap:SPEECH_LIMITS.requests,reservedCharacters:0,requests:[]};}
      if(data.version!==1||data.characterCap!==SPEECH_LIMITS.characters||data.requestCap!==SPEECH_LIMITS.requests||!Number.isInteger(data.reservedCharacters)||!Array.isArray(data.requests)||data.requests.some(r=>!Number.isInteger(r.characters)||r.characters<1||r.characters>SPEECH_LIMITS.text||!SPEECH_MODELS.includes(r.model)||!SPEECH_VOICES[r.voice])||data.requests.reduce((n,r)=>n+r.characters,0)!==data.reservedCharacters)throw Error('Speech ledger failed validation; no reset permitted');
      if(!Number.isInteger(characters)||characters<1||characters>SPEECH_LIMITS.text||data.reservedCharacters+characters>data.characterCap||data.requests.length>=data.requestCap||remaining<characters)throw Error('Included speech allowance or local speech cap reached');
      const record={id:randomUUID(),at:new Date().toISOString(),characters,model,voice,state:'reserved'};data.reservedCharacters+=characters;data.requests.push(record);
      const temporary=this.path+'.'+randomUUID();await writeFile(temporary,JSON.stringify(data,null,2),{mode:0o600});await rename(temporary,this.path);return record;
    }finally{if(lock){await lock.close();await unlink(this.path+'.lock');}this.busy=false;}
  }
}
export class ElevenSpeech{
  constructor({key,ledger,model='eleven_v4_turbo',voice='sarah',plan='free',fetchImpl=fetch,dialogueImpl=dialoguePcm}){
    if(!key||!['free','starter'].includes(plan)||!SPEECH_MODELS.includes(model)||!SPEECH_VOICES[voice])throw Error('Speech configuration unavailable');
    Object.assign(this,{key,ledger,model,voice,plan,fetchImpl,dialogueImpl});this.busy=false;
  }
  async access(signal){
    const headers={'xi-api-key':this.key};
    const accountRequest=this.fetchImpl('https://api.elevenlabs.io/v1/user/subscription',{headers,signal,redirect:'error'}).then(async response=>{if(!response.ok)throw Error(`ElevenLabs account check failed (${response.status}); no synthesis dispatched`);return response.json();});
    const catalogRequest=this.catalog?.expiresAt>Date.now()?Promise.resolve(this.catalog):Promise.all([
      this.fetchImpl('https://api.elevenlabs.io/v1/models',{headers,signal,redirect:'error'}),
      this.fetchImpl('https://api.elevenlabs.io/v1/voices',{headers,signal,redirect:'error'}),
    ]).then(async([models,voices])=>{
      if(!models.ok||!voices.ok)throw Error('Speech model or stock voice entitlement unavailable');
      const [modelList,voiceList]=await Promise.all([models.json(),voices.json()]);
      const model=modelList.find(m=>m.model_id===this.model&&m.can_do_text_to_speech===true&&m.requires_alpha_access!==true),multiplier=model?.model_rates?.character_cost_multiplier;
      if(!model||!Number.isFinite(multiplier)||multiplier<=0||multiplier>1||!Number.isInteger(model.maximum_text_length_per_request)||model.maximum_text_length_per_request<SPEECH_LIMITS.text)throw Error('Configured speech model or conservative credit rate unavailable');
      const catalog={expiresAt:Date.now()+600000,voices:(voiceList.voices||[]).filter(v=>v.category==='premade').map(v=>v.voice_id)};this.catalog=catalog;return catalog;
    });
    const [account,catalog]=await Promise.all([accountRequest,catalogRequest]);
    const free=this.plan==='free';
    const planMatches=account.tier===this.plan&&(free?['free','active'].includes(account.status)&&(account.billing_period==null||account.billing_period==='monthly_period'):account.status==='active'&&account.billing_period==='monthly_period');
    // Starter can include two months of rollover in addition to its 30k monthly quota.
    // This validates the account balance; the separate local ledger still caps all use.
    const includedCreditCeiling=free?10000:90000;
    if(!planMatches||account.allowed_to_extend_character_limit!==false||account.max_credit_limit_extension!==0||!Number.isInteger(account.character_count)||!Number.isInteger(account.character_limit)||account.character_limit>includedCreditCeiling||account.character_count<0||account.character_count>=account.character_limit)throw Error('Selected plan included-credit / no-overage terms are not verified');
    return {remaining:account.character_limit-account.character_count,voices:catalog.voices};
  }
  async stream({text,voice=this.voice,signal,onChunk,onStart}){
    if(this.busy)throw Error('Another spoken reply is running');
    if(!bounded(text,SPEECH_LIMITS.text)||!SPEECH_VOICES[voice]||!signal||typeof onChunk!=='function')throw Error('Invalid bounded speech request');
    this.busy=true;const begun=Date.now(),controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal]);let timer=setTimeout(()=>controller.abort(),20000),reader;
    try{
      const access=await this.access(combined);if(!access.voices.includes(SPEECH_VOICES[voice].id))throw Error('Selected stock voice is not available');
      const reservation=await this.ledger.reserve({characters:text.length,model:this.model,voice,remaining:access.remaining});combined.throwIfAborted();
      let pcm;
      if(this.model==='eleven_v4_turbo'){
        pcm=this.dialogueImpl({key:this.key,model:this.model,voiceId:SPEECH_VOICES[voice].id,text,signal:combined});
      }else{
      const response=await this.fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${SPEECH_VOICES[voice].id}/stream?output_format=pcm_24000`,{method:'POST',headers:{'xi-api-key':this.key,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:this.model,voice_settings:{stability:0.5,similarity_boost:0.75,speed:1.15}}),signal:combined,redirect:'error'});
      if(!response.ok||!response.body)throw Error(`Speech provider unavailable (${response.status}); no retry made`);
      const contentType=response.headers.get('content-type')||'';if(!/^(audio\/(?:x-)?pcm|application\/octet-stream)(?:;|$)/i.test(contentType))throw Error('Speech provider returned an unexpected format');
        reader=response.body.getReader();
        pcm={async *[Symbol.asyncIterator](){while(true){const part=await reader.read();if(part.done)return;if(part.value?.length)yield part.value;}}};
      }
      const provenance={provider:'ElevenLabs',model:this.model,voice,voiceId:SPEECH_VOICES[voice].id,reservationId:reservation.id,characters:text.length,sampleRate:SPEECH_LIMITS.sampleRate};
      let total=0,firstByteMs=null,remainder=null;
      for await(const value of pcm){combined.throwIfAborted();if(!value?.length)continue;
        total+=value.length;if(total>SPEECH_LIMITS.bytes)throw Error('Spoken audio exceeded its duration/byte limit');
        if(firstByteMs===null){clearTimeout(timer);timer=setTimeout(()=>controller.abort(),SPEECH_LIMITS.seconds*1000);firstByteMs=Date.now()-begun;await onStart?.({...provenance,firstByteMs});}
        let bytes=remainder?Buffer.concat([remainder,Buffer.from(value)]):Buffer.from(value);remainder=bytes.length%2?bytes.subarray(-1):null;if(remainder)bytes=bytes.subarray(0,-1);
        for(let at=0;at<bytes.length;at+=16384){combined.throwIfAborted();await onChunk(bytes.subarray(at,at+16384));}
      }
      combined.throwIfAborted();
      if(!total||remainder)throw Error('Speech stream ended without complete PCM samples');
      return {...provenance,firstByteMs,bytes:total,completedMs:Date.now()-begun};
    }finally{clearTimeout(timer);controller.abort();await reader?.cancel().catch(()=>{});this.busy=false;}
  }
}
export async function configuredSpeech(env=process.env){
  if(env.CARRYFORWARD_SPEECH_PROVIDER!=='elevenlabs'||!env.CARRYFORWARD_ELEVENLABS_KEY_FILE)return null;
  const key=(await readFile(env.CARRYFORWARD_ELEVENLABS_KEY_FILE,'utf8')).trim();
  return new ElevenSpeech({key,model:env.CARRYFORWARD_SPEECH_MODEL||'eleven_v4_turbo',voice:env.CARRYFORWARD_SPEECH_VOICE||'sarah',plan:env.CARRYFORWARD_SPEECH_PLAN||'free',ledger:new SpeechLedger(env.CARRYFORWARD_SPEECH_LEDGER||new URL('../.local/elevenlabs-speech-ledger.json',import.meta.url).pathname)});
}
