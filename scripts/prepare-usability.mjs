import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {demoOrder,validateOrder} from '../public/engine.js';
import {displayPng} from '../evaluation/cases.mjs';
const name=process.argv.find(a=>a.startsWith('--name='))?.slice(7)||`pilot-${Date.now()}`;
if(!/^[a-z0-9-]{1,64}$/.test(name))throw Error('Use a short lowercase run name.');
const base=new URL('../.local/usability/',import.meta.url);await mkdir(base,{recursive:true,mode:0o700});
const out=new URL(name+'/',base);await mkdir(out,{mode:0o700}); // Refuse replacement of an existing trial.
const manifest={version:'carryforward.usability-kit.v1',name,createdAt:new Date().toISOString(),status:'not_run',notes:['No participant observations or success scores have been recorded.','Preparation makes no provider requests.','Observer expectations must not be uploaded as job evidence.'],cases:[]};
for(const [suffix,reading] of [['a','2.4'],['b','3.1']]){
 const dir=new URL(suffix+'/',out);await mkdir(dir,{mode:0o700});
 const order=validateOrder({...structuredClone(demoOrder),id:`DEMO-USER-${name}-${suffix}`});
 const photo=displayPng(reading,order.systemId);
 await writeFile(new URL('work-order.json',dir),JSON.stringify(order,null,2),{flag:'wx',mode:0o600});
 await writeFile(new URL('synthetic-display.png',dir),photo,{flag:'wx',mode:0o600});
 const card=`# Technician card ${suffix.toUpperCase()} — fictional visit\n\nUse only the matching work order and photo. Speak or type naturally; do not paste the observer sheet into the app.\n\nYou replaced the inverter on ${order.systemId} on October 30, 2026 at 14:00 -05:00. Monitoring showed connected at 14:20 -05:00. The warranty certificate has not been sent; Operations owns sending it October 31.\n\nStart with your own version of: “Swapped the inverter. Still alive. Monitoring is connected. The office has the warranty paperwork.” Add the actual dates above when asked. You may be conversational, but don't invent extra evidence.\n\nAdd the supplied photo. Its display reads ${reading} kW, but you do not know whether it was taken before or after replacement. You have left the site and cannot obtain a fresh reading during this exercise. State that plainly if asked; use Can't verify or Follow up later and assign Operations.\n\nReview the handoff. Keep unknown production and pending warranty work visible. Confirm only after reviewing; source receipt and acceptance are separate simulator actions.\n`;
 await writeFile(new URL('technician-card.md',dir),card,{flag:'wx',mode:0o600});
 manifest.cases.push({case:suffix,jobId:order.id,reading,photoSha256:createHash('sha256').update(photo).digest('hex')});
}
await writeFile(new URL('manifest.json',out),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
await writeFile(new URL('observer-only.md',out),'# Observer only — do not send to the model\n\nBoth cases should preserve technician-reported repair and monitoring separately. Production timing is unknown and cannot be inferred from the display. The technician has left: assign/defer production rather than repeating impossible onsite questions. Warranty is unfinished with Operations, not completed. Preserve original media and source IDs. Technician confirmation is not source acceptance.\n\nA wrong timestamp, unsupported completion, missing obligation or invalid source reference is a quality failure. Count unnecessary repeated/future-onsite questions separately. A short interview that misses work is not a success.\n',{flag:'wx',mode:0o600});
await writeFile(new URL('observations.csv',out),'participant_alias,device,browser,case,condition,order,run_status,active_human_seconds,provider_wait_seconds,elapsed_seconds,missed_obligations,unsupported_completion_claims,unnecessary_questions,invalid_source_references,assistance_count,enjoyment_1_to_5,notes\n,,,,,,not_run,,,,,,,,,,\n,,,,,,not_run,,,,,,,,,,\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({out:out.pathname,status:'prepared_not_run',cases:manifest.cases.length,providerCalls:0}));
