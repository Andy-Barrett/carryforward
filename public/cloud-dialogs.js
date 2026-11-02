import {selectReviewPhotos} from './evidence.js';
const node=(tag,text)=>{const item=document.createElement(tag);if(text)item.textContent=text;return item;};
function sheet(root,title){
  const dialog=node('dialog');dialog.className='cf-dialog cf-flow-dialog';
  const heading=node('h2',title);heading.tabIndex=-1;const top=node('div');top.className='cf-dialog-head';
  const close=node('button','Close');close.type='button';close.setAttribute('aria-label','Close dialog');top.append(heading,close);dialog.append(top);
  const form=node('form');dialog.append(form);root.append(dialog);
  let resolve;const result=new Promise(r=>resolve=r);let value=null,locked=false;
  close.onclick=()=>{if(!locked)dialog.close();};
  const cancel=node('button','Back to the conversation');cancel.type='button';cancel.onclick=()=>dialog.close();
  dialog.addEventListener('cancel',event=>{if(locked)event.preventDefault();});
  dialog.addEventListener('close',()=>{dialog.remove();resolve(value);},{once:true});
  return{dialog,form,cancel,result,open(){dialog.showModal();heading.focus();},finish(v){value=v;dialog.close();},lock(v){locked=v;close.disabled=v;for(const control of form.querySelectorAll('button,input,textarea'))control.disabled=v;}};
}
function field(form,label,value='',{area=false,max=200}={}){
  const wrap=node('label',label),input=node(area?'textarea':'input');input.value=value;input.maxLength=max;if(area)input.rows=4;wrap.append(input);form.append(wrap);return input;
}
export async function chooseCloudReview(root,{photos,enabled,unsent,prepareCopy}){
  const ui=sheet(root,'Review this visit with Meta');
  ui.form.append(node('p',enabled?'Choose the saved fictional job photos to send with your saved answers. Up to three photos, 1 MB total. Nothing is sent until you request it.':'AI review is disabled on this test endpoint. Saved answers and photos remain available; outcomes stay open until reviewed.'));
  if(unsent)ui.form.append(node('p','Your unsent message is not included. Go back and Send it first if it belongs in this review.'));
  const selected=new Set(),urls=[],available=[...photos],list=node('div');list.className='cf-review-photos';ui.form.append(list);
  const status=node('p');status.setAttribute('role','status');
  const addPhoto=photo=>{
    const card=node('article');card.className='cf-review-photo';
    const img=node('img');const url=URL.createObjectURL(photo.blob);urls.push(url);img.src=url;img.alt=`Job photo: ${photo.name}`;
    card.append(img,node('p',`${photo.name} · ${Math.ceil(photo.blob.size/1000)} KB`),node('small',photo.id+(photo.derivedFrom?` · review copy of ${photo.derivedFrom}`:' · original')));
    const label=node('label'),box=node('input');box.type='checkbox';box.disabled=!enabled;box.setAttribute('aria-label',`Include ${photo.name} in this review`);
    box.onchange=()=>{if(box.checked)selected.add(photo.id);else selected.delete(photo.id);};label.append(box,document.createTextNode(' Include in this review'));card.append(label);
    if(prepareCopy&&!photo.derivedFrom){const copy=node('button','Prepare smaller review copy');copy.type='button';copy.disabled=!enabled;copy.onclick=async()=>{
      ui.lock(true);status.textContent='Preparing a local copy; original stays unchanged.';
      try{const derived=await prepareCopy(photo.id);available.push(derived);addPhoto(derived);copy.remove();status.textContent='Copy saved. Inspect it and select it explicitly; small details may be lost.';}
      catch(error){status.textContent=error.message;}finally{ui.lock(false);}
    };card.append(copy);}
    list.append(card);
  };
  for(const photo of photos.filter(p=>p.status!=='excluded'))addPhoto(photo);
  if(!list.childElementCount)list.append(node('p','No job photos saved. You can review the saved conversation without images.'));
  const consent=node('label'),check=node('input');check.type='checkbox';check.required=enabled;check.disabled=!enabled;consent.append(check,document.createTextNode(' This job and selected photos are fictional demonstration data.'));
  const submit=node('button','Review selected evidence');submit.type='submit';submit.disabled=!enabled;
  ui.form.append(consent,status,submit,ui.cancel);
  ui.form.onsubmit=event=>{event.preventDefault();if(!enabled||!check.checked)return;
    try{selectReviewPhotos(available,selected,photos[0]?.jobId||'no-photos');ui.finish(selected);}catch(error){status.textContent=error.message;}
  };ui.open();
  try{return await ui.result;}finally{for(const url of urls)URL.revokeObjectURL(url);}
}
export async function prepareCloudHandoff(root,{report,packet,unsent}){
  const ui=sheet(root,'Review your visit update');
  ui.form.append(node('p','Check your notes, name and follow-up owner. You’ll confirm the final update next.'));
  if(unsent)ui.form.append(node('p','An unsent message is still in the conversation and will not be included.'));
  const suggested=packet.turns.filter(t=>!t.supersededBy).map(t=>t.text).join('\n\n');
  const summary=field(ui.form,'Findings and work performed',report.summary||suggested.slice(0,4000),{area:true,max:4000});summary.required=true;
  if(!report.summary&&suggested.length>4000)ui.form.append(node('p','The draft notes exceed the report limit. Review and shorten them; all original answers remain in the source trail.'));
  const technician=field(ui.form,'Technician name',report.technician||'');technician.required=true;
  const owners=[...new Set(packet.branches.filter(b=>b.state!=='supported'&&b.owner).map(b=>b.owner))];
  const owner=field(ui.form,'Follow-up owner',report.followupOwner||(owners.length===1?owners[0]:''));
  const promises=field(ui.form,'Customer commitments',report.promises||'',{area:true,max:4000});
  const unresolved=packet.branches.filter(b=>b.state!=='supported');
  ui.form.append(node('p',`${unresolved.length} unresolved ${unresolved.length===1?'item remains':'items remain'}. Preparing this report does not resolve them.`));
  const assignOwners=node('input');assignOwners.type='checkbox';
  if(unresolved.length){
    const list=node('ul');
    for(const branch of unresolved)list.append(node('li',`${branch.question} — Owner: ${branch.owner||'Not assigned'}`));
    const label=node('label');label.append(assignOwners,document.createTextNode(' Assign every open check to the follow-up owner above'));
    const details=node('details');details.append(node('summary','Current follow-up owners'),list);ui.form.append(details,label,node('p','Leave unchecked to keep the individual owners.'));
  }
  const status=node('p');status.setAttribute('role','status');ui.form.append(status);
  const submit=node('button','Continue to final update');submit.type='submit';ui.form.append(submit,ui.cancel);
  ui.form.onsubmit=event=>{event.preventDefault();if(!summary.value.trim()||!technician.value.trim())return;
    if(assignOwners.checked&&!owner.value.trim()){status.textContent='Name the person or team who will own these checks.';owner.focus();return;}
    ui.finish({summary:summary.value.trim(),technician:technician.value.trim(),followupOwner:owner.value.trim(),promises:promises.value.trim(),assignOpenOwners:assignOwners.checked,interviewRevision:packet.revision,recordedAt:new Date().toISOString()});};
  ui.open();return ui.result;
}
