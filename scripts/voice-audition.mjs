// Creates files only; never opens an audio device. --generate is explicit.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {configuredSpeech,SPEECH_VOICES} from '../lib/speech.mjs';
import {encodeMonoWav} from '../public/audio.js';
export const lines=["I've got the work order. Let's get you ready for this visit.","Two point four kilowatts. Was that reading taken after the replacement?","I don't have an approved procedure for that equipment in this job packet.","Got it. Production is still unverified, and Operations owns the follow-up.","I'll keep the paperwork on our list. It doesn't get to disappear just because the inverter is working.","Correction noted: two point four, not four point two. The original wording stays in the record."];
const directory=new URL('../.local/voice-auditions/',import.meta.url);await mkdir(directory,{recursive:true,mode:0o700});
let manifest={at:new Date().toISOString(),generated:false,account:'Sign-in and restricted server API key required; Starter/no-overage/model entitlement not verified',provisional:'sarah',lines,voices:SPEECH_VOICES,items:[]};
try{manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));}catch{}
if(process.argv.includes('--generate')){
 const service=await configuredSpeech({...process.env,CARRYFORWARD_SPEECH_PROVIDER:'elevenlabs'});if(!service)throw Error('Configure the approved ElevenLabs key file first. No speech was generated.');
 if(manifest.items.length)throw Error('Auditions already exist. Review them before deliberately creating another charged set.');
 for(const [voice] of Object.entries(SPEECH_VOICES))for(let i=0;i<lines.length;i++){
  const chunks=[],meta=await service.stream({text:lines[i],voice,signal:AbortSignal.timeout(90000),onChunk:chunk=>{chunks.push(Buffer.from(chunk));}});
  const pcm=Buffer.concat(chunks),samples=new Float32Array(pcm.length/2);for(let n=0;n<samples.length;n++)samples[n]=pcm.readInt16LE(n*2)/32768;
  const wav=Buffer.from(encodeMonoWav([samples],24000)),file=`${voice}-${service.model}-${i+1}.wav`;await writeFile(new URL(file,directory),wav,{mode:0o600});
  manifest.items.push({file,line:i+1,text:lines[i],...meta,sha256:createHash('sha256').update(wav).digest('hex'),note:'Provider startup measures server receipt of first PCM bytes, not phone playback or subjective quality.'});
  await writeFile(new URL('manifest.json',directory),JSON.stringify(manifest,null,2),{mode:0o600});
 }
 manifest.generated=true;manifest.account='Starter included-credit and configured model/voice checks passed for these requests; no overages enabled.';
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=Object.entries(SPEECH_VOICES).map(([voice,v])=>`<section><h2>${esc(v.name)}</h2>${lines.map((line,i)=>{const item=manifest.items.find(item=>item.voice===voice&&item.line===i+1);return `<article><p>${esc(line)}</p>${item?`<audio controls preload="none" src="${esc(item.file)}"></audio><small>${esc(item.model)} · ${item.firstByteMs} ms to server first PCM byte</small>`:'<small>Not generated — account setup is pending.</small>'}</article>`;}).join('')}</section>`).join('');
await writeFile(new URL('manifest.json',directory),JSON.stringify(manifest,null,2),{mode:0o600});
await writeFile(new URL('index.html',directory),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CarryForward voice audition</title><style>body{font:17px/1.6 system-ui;background:#f6f7f1;color:#183b32;margin:2rem auto;padding:0 1rem;max-width:960px}section{border-top:1px solid #cad6ce}article{background:white;padding:1rem;margin:1rem 0;border-radius:12px}small{display:block;color:#53665d}audio{width:100%}</style><h1>CarryForward voice audition</h1><p>Same six fictional lines, three stock American voices. Sarah is provisional. No cloning. Nothing plays automatically.</p><p>${esc(manifest.account)}</p><p>This page does not describe ungenerated examples as audio tests. Final voice choice and real-phone intelligibility are morning checks.</p>${rows}</html>`,{mode:0o600});
console.log('Quiet audition page: '+new URL('index.html',directory).pathname);console.log('Generated provider files: '+manifest.items.length);
