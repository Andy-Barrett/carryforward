/** Deliberate briefing playback has its own server grant; it never starts ASR. */
export function createBriefingVoice({jobId,text,request,ensure,speak,stopSpeech,onUnavailable=()=>{}}) {
  let generation=0,active=null;
  const cancelTicket=ticket=>{if(!ticket)return;try{ensure();Promise.resolve(request('voice/cancel',{ticket})).catch(()=>{});}catch{/* The account has closed. */}};
  function cancel(){generation++;stopSpeech();const previous=active;active=null;cancelTicket(previous);}
  async function play(options={}) {
    cancel();const identity=generation;
    ensure();
    const result=await request('voice/briefing',{});
    if(identity!==generation){cancelTicket(result.ticket);return;}
    try{ensure();}catch(error){cancelTicket(result.ticket);throw error;}
    if(!result.enabled){onUnavailable(result.reason);throw Error('Sarah is unavailable. '+(result.reason||'Company speech is not configured.')+' The briefing remains on screen.');}
    active=result.ticket;
    if(result.reply!==text||result.speech?.jobId!==jobId||result.speech?.displayText!==text||result.speech?.turnId!==result.ticket?.turnId){cancel();throw Error('The briefing changed. Reopen this work order before listening.');}
    return speak(text,{...options,speech:result.speech,config:result});
  }
  return {play,cancel,dispose:cancel};
}
