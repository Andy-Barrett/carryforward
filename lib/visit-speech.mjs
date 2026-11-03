import {validateOrder} from '../public/engine.js';
import {spokenDepartureBrief} from '../public/visit-brief.js';
import {spokenVisitSummary} from '../public/visit-flow.js';
import {createInvestigation,reduceInvestigation} from '../public/investigation.js';
// Grants only exact, server-derived assignment/summary text or a composition of
// existing server grants. No arbitrary browser text, media bytes or provider call.
export function visitSpeechGrant(input,tickets){
 if(!input||!['brief','final','compose'].includes(input.kind))throw Error('Invalid visit speech request');
 if(input.kind==='compose'){
   if(Object.keys(input).some(k=>!['kind','jobId','parts'].includes(k))||!Array.isArray(input.parts)||input.parts.length!==2)throw Error('Invalid speech composition');
   const parts=input.parts.map(part=>tickets.take({jobId:input.jobId,turnId:part.turnId,token:part.token}));
   return tickets.issue({jobId:input.jobId,text:parts.map(part=>part.displayText).join(' ')});
 }
 if(Object.keys(input).some(k=>!['kind','order','events'].includes(k)))throw Error('Unexpected speech field');
 const order=validateOrder(input.order);if(!order.id.startsWith('DEMO-'))throw Error('Fictional assignment required');
 let text;
 if(input.kind==='brief'){if(input.events!==undefined)throw Error('Briefing does not need field events');text=spokenDepartureBrief(order);}
 else{
   if(!Array.isArray(input.events)||input.events.length>500)throw Error('Invalid bounded summary history');
   let state=createInvestigation(order);for(const event of input.events)state=reduceInvestigation(state,event);
   text=spokenVisitSummary(order,state);
 }
 return tickets.issue({jobId:order.id,text});
}
