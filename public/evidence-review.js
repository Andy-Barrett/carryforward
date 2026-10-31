import {requestReview} from './review-request.js';
import {hashBytes,selectReviewPhotos} from './evidence.js';
const inventory=photos=>JSON.stringify(photos.map(p=>({id:p.id,jobId:p.jobId,sha256:p.sha256,status:p.status,derivedFrom:p.derivedFrom||null,sourceSha256:p.sourceSha256||null})).sort((a,b)=>a.id.localeCompare(b.id)));

// Shared by the detailed interview and cloud. Neither UI can bypass selection,
// byte identity, job ownership, or the revision check after a provider wait.
export async function reviewEvidence({order,selected,readState,readPhotos,dispatch,ensureCurrent=()=>{},request=requestReview}){
  ensureCurrent();
  const stored=await readPhotos();ensureCurrent();
  if(stored.some(photo=>photo.jobId!==order.id))throw Error('Photos belong to another job.');
  const chosen=selectReviewPhotos(stored,selected,order.id);
  let state=await readState();ensureCurrent();
  for(const photo of stored){
    if(!Object.hasOwn(state.sources,photo.id)&&photo.status!=='excluded'){
      await dispatch('source.added',{id:photo.id,kind:'photo',sha256:photo.sha256,name:photo.name,...(photo.derivedFrom?{derivedFrom:photo.derivedFrom,sourceSha256:photo.sourceSha256,derivation:photo.derivation}:{})});
    }else if(state.sources[photo.id]){
      if(photo.status==='excluded'&&!state.sources[photo.id].excluded)await dispatch('source.excluded',{id:photo.id});
      if(photo.status!=='excluded'&&state.sources[photo.id].excluded)await dispatch('source.restored',{id:photo.id});
    }
  }
  const packed=[];
  for(const photo of chosen){
    const bytes=new Uint8Array(await photo.blob.arrayBuffer());ensureCurrent();
    if(await hashBytes(bytes)!==photo.sha256)throw Error('Saved photo failed its hash check.');
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    packed.push({id:photo.id,jobId:order.id,mime:photo.mime,dataBase64:btoa(binary)});
  }
  state=await readState();ensureCurrent();
  const revision=state.seq,photoRevision=inventory(stored);
  const data=await request('/api/review',{order,events:state.events,photos:packed});ensureCurrent();
  const latest=await readState(),latestPhotos=await readPhotos();ensureCurrent();
  if(latest.seq!==revision||inventory(latestPhotos)!==photoRevision)throw Error('The job or photos changed during review. Stale result was not applied.');
  await dispatch('interpretation.received',data.proposal);
  return data.proposal;
}
