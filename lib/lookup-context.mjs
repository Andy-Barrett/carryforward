// Narrow question-only routing. Reports, ambiguous references, safety and any
// saved field testimony retain the full conversation/evidence path.
export function lookupTopic(text,{testimony=[]}={}){
  const q=String(text).toLowerCase().replace(/[’]/g,"'").trim();
  if(q.length>200||testimony.length||! /^(?:(?:uh|um|hey|please)[, .]*)*(?:what\b|what's\b|which\b|tell me\b|remind me\b|can you (?:tell|give)\b|could you (?:tell|give)\b)/.test(q))return null;
  if(/\b(?:and|but|changed?|new|before|previous|last|earlier|repair|replaced?|fixed|safe|safety|alone|climb|wiring|procedure|roof|troubleshoot|bypass|switch|disconnect|wrong|not|isn't|doesn't|i'm|i am|we|my|currently)\b/.test(q))return null;
  const access=/\b(?:gate|entry|access)\b/.test(q),equipment=/\b(?:model|manufacturer|capacity|kilowatts)\b/.test(q)&&/\b(?:inverter|listed|assignment|work order)\b/.test(q);
  return access!==equipment?(access?'access':'system'):null;
}
export function directAssignmentAnswer(input){
 const topic=lookupTopic(input.text,{testimony:input.testimony});if(!topic)return null;
 const text=String(input.text).toLowerCase();
 if(topic==='access'&&!/\bcode\b/.test(text)||topic==='system'&&!/\bmodel\b/.test(text))return null;
 if((input.history||[]).some(row=>/\b(?:changed?|new|wrong|correct)\b/i.test(row.question)))return null;
 const notes=(input.order.briefing?.[topic]||[]).filter(note=>topic==='access'?/gate code/i.test(note.text):/\b(?:inverter|inventory)\b/i.test(note.text)&&/\bmodel\b|[A-Z]{2}\d{3,}/.test(note.text));
 if(notes.length!==1)return null;
 const note=notes[0];
 if(/\b(?:old|previous|superseded|changed|expired|ignore|instruction)\b/i.test(note.text))return null;
 const excerpt=note.text.match(/^(.+?\.)(?:\s|$)/)?.[1];
 if(!excerpt||excerpt.length>300||topic==='access'&&!/gate code\s*:?\s*[0-9*#]{3,12}/.test(excerpt))return null;
 // A generic first sentence is not an equipment-model answer.
 if(topic==='system'&&!/\b[A-Za-z]{2,}\d[A-Za-z0-9+/_-]*/.test(excerpt))return null;
 const reply='The work order says: '+excerpt;
 return {version:'carryforward.conversation.v1',jobId:input.order.id,intent:'question',reply,sourceIds:[note.id],correctsSourceId:null,
  provenance:{provider:'CarryForward',model:'sourced-assignment-lookup',source:{id:note.id,...note.source},excerpt,latencyMs:0,usage:{input_tokens:0,output_tokens:0},note:'Exact assignment excerpt; no model reasoning or current field verification.'}};
}
