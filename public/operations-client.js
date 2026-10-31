const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,body){
  const response=await fetch('/api/v1/'+path,{method:body===undefined?'GET':'POST',headers:{'X-CarryForward-Intent':'operations',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Operations API request failed');return result;
}
function encode(bytes){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}

export function mountOperations(root,{getContext,onAssignment,onDecision}){
  let busy=false,message='',items=[];
  const show=()=>{
    root.innerHTML=`<section class="panel operations"><p class="eyebrow">LOCAL OPERATIONS SIMULATOR · SYNTHETIC DATA</p><h2>Bring the handoff back to the office.</h2><p>This is a separate local source-system inbox. Receipt means the packet arrived. Acceptance refers to one exact revision and keeps remaining work visible. Nothing is sent to Perihelion.</p><div class="interview-actions"><button id="api-assignment" type="button">Receive current sample through API</button><button id="api-deliver" type="button">Send confirmed handoff to simulator</button><button id="api-inbox" type="button">Refresh Operations inbox</button></div><p role="status">${esc(message)}</p><div>${items.map(({packet,status})=>`<article class="source"><h3>${esc(packet.workOrder.id)} · ${esc(packet.workOrder.customer)}</h3><p>${esc(packet.closeout.summary)}</p><p>Revision ${esc(packet.revision.slice(0,16))} · ${packet.closeout.openCount} checks needing follow-up · ${packet.evidence.length} evidence records.</p><p>${esc(packet.closeout.interview.branches.filter(b=>b.state!=='supported').map(b=>`${b.id}: ${b.state}${b.owner?' / '+b.owner:''}`).join(' · '))}</p><p>${status.accepted?`Operations decision: ${esc(status.decision)}`:status.received?'Receipt recorded; acceptance pending.':'Queued; source receipt pending.'}</p><div class="interview-actions"><button type="button" data-receipt="${esc(packet.jobId)}" ${status.received?'disabled':''}>Record source receipt</button><button type="button" data-accept="${esc(packet.jobId)}" ${!status.received||status.accepted?'disabled':''}>Accept handoff; keep follow-ups open</button></div>${packet.evidence.filter(p=>p.status==='included').map(p=>`<button type="button" data-evidence="${esc(packet.jobId)}:${esc(p.id)}">Download source photo: ${esc(p.name)}</button>`).join('')}</article>`).join('')}</div></section>`;
    root.querySelector('#api-assignment').onclick=()=>run(async()=>{
      const context=await getContext(false);
      const assigned=await api('work-orders',{order:context.order});
      await onAssignment(assigned);
      message=`Received ${assigned.externalId} through the assignment API. Source: ${assigned.sourceSystem}.`;
    });
    root.querySelector('#api-deliver').onclick=()=>run(async()=>{
      const c=await getContext(true);
      if(!c.confirmation)throw new Error('Review and confirm the current report before delivery.');
      const job=await api('work-orders',{order:c.order});
      const photos=[];
      for(const p of c.photos){const bytes=new Uint8Array(await p.blob.arrayBuffer());photos.push({id:p.id,jobId:c.order.id,mime:p.mime,name:p.name,status:p.status,sha256:p.sha256,dataBase64:encode(bytes)});}
      await api(`jobs/${job.jobId}/evidence`,{photos});
      await api(`jobs/${job.jobId}/turns`,{events:c.events});
      const packet=await api(`jobs/${job.jobId}/closeout`,{report:c.report,eventRevision:c.events.length});
      await api(`jobs/${job.jobId}/confirmations`,{revision:packet.revision,name:c.confirmation.name,reportRevision:c.confirmation.reportRevision,confirmedAt:c.confirmation.confirmedAt});
      await api(`jobs/${job.jobId}/deliveries`,{revision:packet.revision});
      items=(await api('simulator/inbox')).items;
      message=`${c.order.id} queued through the API. Receipt and Operations acceptance are still pending.`;
    });
    root.querySelector('#api-inbox').onclick=()=>run(async()=>{items=(await api('simulator/inbox')).items;message=`Operations fetched ${items.length} handoff(s) through its inbox API.`;});
    for(const button of root.querySelectorAll('[data-receipt],[data-accept]'))button.onclick=()=>run(async()=>{
      const id=button.dataset.receipt||button.dataset.accept;
      const packet=items.find(item=>item.packet.jobId===id).packet;
      const action=button.dataset.receipt?'receipts':'acceptances';
      const status=await api(`jobs/${id}/${action}`,{revision:packet.revision});
      items=(await api('simulator/inbox')).items;
      message=`${packet.workOrder.id}: ${action==='receipts'?'source receipt recorded':status.decision}. Remaining obligations are preserved.`;
      onDecision?.(`Local Operations simulator: ${message}`);
    });
    for(const button of root.querySelectorAll('[data-evidence]'))button.onclick=()=>run(async()=>{
      const [id,evidenceId]=button.dataset.evidence.split(':');
      const r=await fetch(`/api/v1/jobs/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`,{headers:{'X-CarryForward-Intent':'operations'}});
      if(!r.ok)throw new Error('Evidence download failed for this job.');
      const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=evidenceId;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      message=`Downloaded admitted evidence ${evidenceId} from the source API.`;
    });
  };
  async function run(action){
    if(busy)return;busy=true;
    for(const button of root.querySelectorAll('button'))button.disabled=true;
    root.querySelector('[role=status]').textContent='Working through the local API…';
    try{await action();}catch(error){message=`${error.message} Saved local evidence remains available; no automatic retry was sent.`;}
    finally{busy=false;show();}
  }
  show();
}
