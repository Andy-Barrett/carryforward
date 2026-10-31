export async function handleOperations(req,res,path,{store,authorize}) {
  if(!path.startsWith('/api/v1/'))return false;
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(!authorize()) {json(403,{error:'Open this local application before using the Operations simulator'});return true;}
  try{
    let body={};
    if(req.method==='POST'){
      if(req.headers['content-type']!=='application/json')throw new Error('Expected application/json');
      let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>35000000)throw new Error('API payload exceeds 35 MB');parts.push(chunk);}
      body=JSON.parse(Buffer.concat(parts));
    }
    if(path==='/api/v1/work-orders'&&req.method==='POST'){json(200,store.assign(body.order));return true;}
    if(path==='/api/v1/simulator/inbox'&&req.method==='GET'){json(200,{sourceSystem:'local-operations-simulator',items:store.inbox()});return true;}
    const matched=path.match(/^\/api\/v1\/jobs\/([^/]+)(?:\/(.*))?$/);
    if(!matched){json(404,{error:'Unknown API route'});return true;}
    const id=decodeURIComponent(matched[1]), action=matched[2]||'';
    if(req.method==='GET'&&!action){json(200,store.status(id));return true;}
    if(req.method==='GET'&&action==='closeout'){json(200,store.closeout(id));return true;}
    if(req.method==='GET'&&action.startsWith('evidence/')){
      const photo=store.evidence(id,decodeURIComponent(action.slice(9)));
      res.writeHead(200,{'Content-Type':photo.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(photo.bytes);return true;
    }
    if(req.method!=='POST'){json(405,{error:'Unsupported API method'});return true;}
    let result;
    if(action==='evidence')result=store.admitEvidence(id,body.photos);
    else if(action==='turns')result=store.syncEvents(id,body.events);
    else if(action==='closeout')result=store.candidate(id,body.report,body.eventRevision);
    else if(action==='confirmations')result=store.confirm(id,body);
    else if(action==='deliveries')result=store.queue(id,body.revision);
    else if(action==='receipts')result=store.receipt(id,body.revision);
    else if(action==='acceptances')result=store.accept(id,body.revision);
    else {json(404,{error:'Unknown API route'});return true;}
    json(200,result);
  }catch(error){json(400,{error:error.message});}
  return true;
}
