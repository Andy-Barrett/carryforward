/** Fetch only admitted photo IDs from this job's source history. No model call. */
export async function loadAdmittedPhotos({jobId,sources,photos,fetchOriginal,ensure,digest,encode}) {
  ensure();
  const pending=Object.values(sources).filter(s=>s.kind==='photo'&&!s.excluded&&!s.supersededBy);
  if(new Set([...photos.map(p=>p.id),...pending.map(p=>p.id)]).size>10)throw Error('This visit exceeds the ten-photo cache limit. Ask Operations to review it.');
  const additions=[];
  for(const source of pending){
    ensure();if(source.jobId!==jobId||!/^[-\w]{1,200}$/.test(source.id)||!/[a-f0-9]{64}/.test(source.sha256||''))throw Error('Invalid admitted photo identity.');
    const existing=photos.find(p=>p.id===source.id);if(existing){if(existing.sha256!==source.sha256)throw Error('Saved and admitted photo hashes differ.');continue;}
    const response=await fetchOriginal(`/pilot/api/jobs/${encodeURIComponent(jobId)}/evidence/${encodeURIComponent(source.id)}`);ensure();
    if(!response.ok)throw Error('The supplied job photo is unavailable. Reconnect and open Files again.');
    const mime=response.headers.get('content-type')?.split(';')[0].trim();
    if(!['image/png','image/jpeg','image/webp'].includes(mime)||Number(response.headers.get('content-length'))>5_000_000)throw Error('Unsupported or oversized supplied photo.');
    const bytes=new Uint8Array(await response.arrayBuffer());ensure();
    if(!bytes.length||bytes.length>5_000_000||await digest(bytes)!==source.sha256)throw Error('The supplied photo failed its original-byte check.');
    ensure();additions.push({id:source.id,jobId,mime,name:source.name||'Supplied job photo',origin:source.origin||'Supplied job photo',sha256:source.sha256,dataBase64:encode(bytes),status:'included',syncStatus:'synced'});
  }
  return additions;
}
