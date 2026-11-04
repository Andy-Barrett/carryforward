// Commands describe a deliberate action; merely displaying a file never sends it.
export function fileIntent(text) {
  const q=String(text||'').toLowerCase().replace(/[?!.,]/g,'').replace(/\s+/g,' ').trim();
  if(/^(?:show|open|pull up|bring up)(?: me)? (?:the |my |this jobs? )?(?:files|work order files|attachments|sources)$/.test(q))return {kind:'files',query:q};
  if(/^(?:show|open|pull up|bring up)(?: me)? (?:it|that|this|the (?:page|pdf|drawing|photo|manual)) again$/.test(q))return {kind:'again',query:q};
  if(/^(?:show|open|display|pull up|bring up)(?: me)?\b/.test(q)&&/\b(?:pdf|manual|drawing|document|page|schematic|attachment|diagram|plan)\b/.test(q))return {kind:'document',query:q,page:Number(q.match(/\bpage (\d+)\b/)?.[1])||null};
  if(/\b(?:photo|picture|image)\b/.test(q)&&/^(?:please )?(?:what|can you|could you|would you|read|review|check|interpret|analyse|analyze|tell me|look at)\b/.test(q)||/^(?:what (?:does (?:this|that|it) (?:show|mean|say|look like)|can you see (?:here|in (?:this|that|it))|is in (?:this|that|it))|review (?:this|that|it)|what do you see(?: here| in (?:this|that|it))?)$/.test(q))return {kind:'interpret',query:q,latest:/\b(?:latest|last|most recent)\b/.test(q)};
  return {kind:'none',query:q};
}

export function selectQuestionPhoto(text,{jobId,photos,selectedId}={}) {
  const intent=fileIntent(text);
  if(intent.kind!=='interpret')return {kind:'none'};
  const available=(photos||[]).filter(p=>p.jobId===jobId&&p.status!=='excluded');
  const padded=' '+intent.query+' ';
  const named=available.filter(p=>padded.includes(' '+String(p.id).toLowerCase()+' ')||p.name&&padded.includes(' '+p.name.toLowerCase().replace(/[?!.,]/g,'')+' '));
  const selected=available.find(p=>p.id===selectedId);
  if(selectedId&&!selected&&!intent.latest&&named.length!==1)return {kind:'choose',message:'The selected photo is unavailable in this job. Open Files and choose a current saved photo; another image will not be substituted.'};
  const photo=named.length===1?named[0]:intent.latest?available.at(-1):selected|| (available.length===1&&/\b(?:photo|picture|image)\b/.test(intent.query)?available[0]:null);
  if(photo)return {kind:'photo',photoIds:[photo.id]};
  return {kind:'choose',message:available.length?'Which photo? Open Files and choose the image, then ask again.':'There is no saved photo for this work order. Add a photo first; taking it will not send it for analysis.'};
}
