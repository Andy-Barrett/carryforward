import {fileIntent,selectQuestionPhoto} from '/file-intent.js';
import {renderPdfPage} from './pdf-page.js';
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function createWorkOrderFiles({job,getPhotos,getBrief,getPages,fetchOriginal,ensure,show,choose,queryDocument}){
  let alive=true,focused=null,lastCitation=null,generation=0,controller=null;
  const urls=new Map();
  const current=()=>{ensure();if(!alive)throw Error('This file view has closed.');};
  function url(id,blob,sha){const old=urls.get(id);if(old?.sha===sha)return old.url;if(old)URL.revokeObjectURL(old.url);const value=URL.createObjectURL(blob);urls.set(id,{url:value,sha});return value;}
  function photoItems(){current();return getPhotos().filter(p=>p.jobId===job.id&&p.status!=='excluded').map(p=>{
    const bytes=Uint8Array.from(atob(p.dataBase64),c=>c.charCodeAt(0));
    return {...p,kind:'image',title:p.name||'Job photo',imageUrl:url(p.id,new Blob([bytes],{type:p.mime}),p.sha256),sourceUrl:url(p.id,new Blob([bytes],{type:p.mime}),p.sha256),syncLabel:p.syncStatus==='synced'?'Saved and synced':'Saved locally; sync unconfirmed',origin:p.origin||'Saved job photo',availability:'Original retained; timing and current conditions are unverified'};
  });}
  async function list(){
    current();let docs=[],notice='';
    try{const brief=await getBrief();current();if(brief.job?.id!==job.id||brief.job?.companyId!==job.companyId||brief.job?.revision!==job.revision){focused=null;lastCitation=null;show(null);throw Error('Assignment changed; reopen the work order.');}docs=brief.context.map(d=>({id:d.versionId,versionId:d.versionId,jobId:job.id,kind:'document',title:d.title||'Unavailable attachment',mime:d.mime,revision:d.revision,sha256:d.sha256,pageCount:d.processing?.pageCount,status:d.status,available:d.status==='approved'&&d.processing?.status==='ready',origin:d.issuer||'Assignment reference',availability:d.status==='approved'?'Approved source version; task authorization is separate':`Source ${d.status||'unavailable'}; ask dispatch to refresh`}));}
    catch(error){current();if(error.message==='Assignment changed; reopen the work order.')throw error;notice='Attached documents are unavailable. Reconnect to open their originals; saved job photos remain here.';}
    const items=[...photoItems(),...docs];items.sort((a,b)=>Number(b.id===focused?.id)-Number(a.id===focused?.id));
    return {items,notice:notice||(!items.length?'No files are attached to this work order yet.':'Opening a file does not send it for AI review.')};
  }
  async function open(item,{page=item.page||1,citation=null,preview=false,ensureOpen=()=>{}}={}){
    current();ensureOpen();if(item.jobId!==job.id)throw Error('That file belongs to another work order.');
    const at=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;
    const check=()=>{current();ensureOpen();signal.throwIfAborted();if(at!==generation)throw Error('A newer file was selected.');};
    if(item.kind==='image'){
      const original=photoItems().find(p=>p.id===item.id&&p.sha256===item.sha256);if(!original)throw Error('This job photo is unavailable or changed.');
      const p=getPhotos().find(p=>p.id===item.id&&p.jobId===job.id);const bytes=Uint8Array.from(atob(p.dataBase64),c=>c.charCodeAt(0));if(await hash(bytes)!==p.sha256)throw Error('The local photo failed its original-byte check.');check();focused=original;show(original,{preview});return original;
    }
    const fresh=(await list()).items.find(x=>x.id===item.id&&x.kind==='document');check();
    if(!fresh?.available||fresh.sha256!==item.sha256)throw Error('This source changed or is unavailable. Ask dispatch to refresh the assignment.');
    const originalPath=`/pilot/api/jobs/${job.id}/references/${fresh.versionId}/original`;
    const resource={...fresh,page,sourceUrl:originalPath+'#page='+page,sourceLabel:'Open original',origin:`${fresh.origin} · ${fresh.revision}`,availability:'Actual attached source. Viewing is not permission to perform work.',excerpt:citation?.excerpt||''};
    if(fresh.mime==='application/pdf'){
      const bytes=await fetchOriginal(originalPath,{signal});check();
      if(bytes.byteLength>16_000_000||await hash(bytes)!==fresh.sha256)throw Error('The original document failed its byte check.');check();
      const rendered=await renderPdfPage(bytes,page,{ensure:check,signal});check();
      resource.imageUrl=url('page-'+fresh.versionId,rendered.blob,`${fresh.sha256}:${page}`);resource.pageCount=rendered.pageCount;
    }else{
      const pages=await getPages(fresh.versionId);check();const found=(Array.isArray(pages)?pages:pages.pages).find(p=>p.pdfPage===page);if(!found)throw Error('That source page is unavailable.');resource.excerpt=found.text;resource.printedLabel=found.printedLabel;
    }
    focused=resource;lastCitation=citation?.versionId===fresh.versionId?citation:null;show(resource,{preview});return resource;
  }
  async function showCitation(citation,excerpt='',{preview=false}={}){
    current();if(!citation)return;
    const source=(await list()).items.find(x=>x.versionId===citation.versionId&&x.sha256===citation.sha256&&x.revision===citation.revision);current();
    if(!source)throw Error('The cited source is not in the current assignment.');
    return open(source,{page:citation.pdfPage,citation:{...citation,excerpt},preview});
  }
  function rememberCitation(citation){current();if(citation)lastCitation={...citation};}
  async function route(text){
    current();const intent=fileIntent(text);if(intent.kind==='none')return null;
    if(intent.kind==='files'){await choose();current();return {handled:true,reply:'Your work-order files are open.'};}
    if(intent.kind==='interpret'){
      if(focused?.kind==='document'&&!intent.latest)return {selectedDocument:{versionId:focused.versionId,sha256:focused.sha256,revision:focused.revision,pdfPage:focused.page||1},requestKind:'document_question'};
      const selected=selectQuestionPhoto(text,{jobId:job.id,photos:getPhotos(),selectedId:focused?.kind==='image'?focused.id:null});
      if(selected.kind==='photo'){const p=getPhotos().find(p=>p.id===selected.photoIds[0]&&p.jobId===job.id);const bytes=Uint8Array.from(atob(p.dataBase64),c=>c.charCodeAt(0));if(await hash(bytes)!==p.sha256)throw Error('The selected photo failed its byte check.');current();return {photoIds:selected.photoIds,requestKind:'photo_question'};}
      await choose(selected.message);current();return {handled:true,reply:selected.message};
    }
    if(intent.kind==='again'&&focused){await open(focused,{page:focused.page||1,citation:focused.kind==='document'?lastCitation:null,preview:true});current();return {handled:true,reply:focused.kind==='document'?`Here is page ${focused.page||1} again.`:'Here is that photo again.'};}
    if(intent.kind==='again'&&lastCitation){await showCitation(lastCitation,'',{preview:true});current();return {handled:true,reply:`Here is page ${lastCitation.pdfPage}.`};}
    const files=(await list()).items.filter(f=>f.kind==='document');current();
    if(!files.length)return {handled:true,reply:'No available document is attached to this work order. Ask dispatch to attach the applicable source.'};
    const named=files.filter(f=>intent.query.includes(f.title.toLowerCase())||intent.query.includes(f.id.toLowerCase()));
    const simple=/^(?:show|open|display|pull up|bring up)(?: me)? (?:(?:the|that|this|a) )?(?:(?:pdf|manual|document)(?: page \d+)?|page(?: \d+)?)(?: again)?$/.test(intent.query);
    const category=intent.query.match(/^(?:show|open|display|pull up|bring up)(?: me)? (?:(?:the|that|this|a|current|approved) )?(drawing|manual|diagram|schematic|plan)(?: page \d+)?(?: again)?$/)?.[1];
    const categorized=category?files.filter(f=>new RegExp('\\b'+category+'\\b','i').test(f.title)):[];
    const selected=named.length===1?named[0]:categorized.length===1?categorized[0]:simple&&focused?.kind==='document'?files.find(f=>f.id===focused.id):simple&&lastCitation?files.find(f=>f.id===lastCitation.versionId):simple&&files.length===1?files[0]:null;
    if(selected){const page=intent.page||(lastCitation?.versionId===selected.id?lastCitation.pdfPage:1);await open(selected,{page,citation:lastCitation?.versionId===selected.id?lastCitation:null,preview:true});current();return {handled:true,reply:`Here is page ${page}.`};}
    const answer=await queryDocument(text,lastCitation);current();
    if(answer.citations?.[0]){await showCitation(answer.citations[0],answer.retrieval?.excerpts?.[0]?.text,{preview:true});return {handled:true,reply:answer.reply};}
    await choose('I could not locate that drawing or page in the attached text. Choose the actual source to inspect it.');current();return {handled:true,reply:'I could not locate that drawing or page in the attached text. The work-order files are open.'};
  }
  return {list,open,route,showCitation,rememberCitation,focus:item=>{current();if(!item){focused=null;lastCitation=null;generation++;controller?.abort();}else if(item.jobId===job.id)focused=item;},selected:()=>focused,dispose(){alive=false;generation++;controller?.abort();for(const item of urls.values())URL.revokeObjectURL(item.url);urls.clear();focused=null;lastCitation=null;}};
}
