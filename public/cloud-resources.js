// Supplied sources, never a claim of general document ingestion or RAG coverage.
// Demonstration references exist only on the explicitly fictional sample job.
export function resourcesForJob(order, photos = []) {
  const generated=/^DEMO-VOICE-[a-f0-9-]{36}$/.test(order.id)&&order.systemId==='DEMO-SYS-017';
  const resources = order.history.map(item => ({
    id: `history-${item.id}`, jobId: order.id, systemId: order.systemId,
    kind: 'document', title: `Work-order history ${item.id}`,
    revision: item.date, text: item.text,
  }));
  if ((generated||['DEMO-WO-1042','DEMO-WO-1043'].includes(order.id)) && order.systemId === 'DEMO-SYS-017') {
    resources.push({id:'demo-visit-reference',jobId:order.id,systemId:order.systemId,kind:'document',
      title:'Fictional visit reference.pdf',revision:'DEMO-1',page:2,
      url:'/job-assets/visit-reference.pdf',imageUrl:'/job-assets/visit-reference-page-2.png',posterUrl:'/job-assets/visit-reference-page-2.png',
      text:'A reading needs context. Record the observed value and units, observation time, source and equipment association. Keep repair, measured production, monitoring and paperwork separate. This fictional reference is not a manufacturer manual or an approved equipment procedure.'});
    resources.push({id:'demo-display-reference',jobId:order.id,systemId:order.systemId,kind:'image',
      title:'Fictional display example',revision:'DEMO-1',url:'/job-assets/display-example.jpg',
      text:'Fictional display illustration only. It has no verified capture time or association with a repair and is not automatically added as job evidence.'});
    resources.push({id:'demo-visit-clip',jobId:order.id,systemId:order.systemId,kind:'video',
      title:'Fictional handoff illustration',revision:'DEMO-1',url:'/job-assets/visit-demo.webm',
      text:'Three-second generated interface illustration. It contains no field footage or equipment procedure.'});
  }
  if ((generated||order.id === 'DEMO-WO-1043') && order.systemId === 'DEMO-SYS-017') resources.push({
    id:'DEMO-BRIEF-1043',jobId:order.id,systemId:order.systemId,kind:'document',
    title:'Fictional pre-visit briefing packet.pdf',revision:'DEMO-1',page:1,
    url:'/job-assets/pre-visit-brief-1043.pdf',posterUrl:'/job-assets/pre-visit-brief-1043-page-1.png',
    text:'Fictional dispatch context for this visit. Includes system, issue, planning ideas, customer preferences, reported gate and missing approved safety/ladder references. Source context does not establish current field conditions or authorize work.'});
  for (const photo of photos.filter(p=>p.jobId===order.id&&p.status!=='excluded'&&p.blob)) {
    resources.push({id:photo.id,jobId:order.id,systemId:order.systemId,kind:'image',
      title:photo.name||photo.id,url:photo.previewUrl,sha256:photo.sha256,
      text:photo.derivedFrom?`Saved review copy of ${photo.derivedFrom}. Small detail may be lost.`:'Saved original from this job; capture timing is not independently established.'});
  }
  return resources;
}
