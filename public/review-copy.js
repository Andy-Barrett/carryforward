import {hashBytes,newEvidenceId} from './evidence.js';
export async function makeReviewCopy(photo){
 if(!photo?.blob||photo.status==='excluded'||photo.derivedFrom)throw Error('Choose an available original job photo.');
 if(await hashBytes(await photo.blob.arrayBuffer())!==photo.sha256)throw Error('Original photo hash changed; no copy created.');
 const url=URL.createObjectURL(photo.blob),image=new Image();
 try{
  image.src=url;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('Image exceeds the bounded review-copy dimensions.');
  const canvas=document.createElement('canvas');let result=null;
  for(const edge of [1600,1280,1024,800,640]){
   const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const context=canvas.getContext('2d');if(!context)throw Error('Image conversion is unavailable; original remains saved.');
   context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [0.85,0.7,0.55]){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(blob?.type==='image/jpeg'&&blob.size>0&&blob.size<=300000){result={blob,quality,width:canvas.width,height:canvas.height};break;}
   }
   if(result)break;
  }
  if(!result)throw Error('Could not make a readable-size review copy within 300 KB. Original remains saved.');
  return {id:newEvidenceId(),jobId:photo.jobId,name:`Review copy · ${photo.name}`,mime:'image/jpeg',size:result.blob.size,sha256:await hashBytes(await result.blob.arrayBuffer()),blob:result.blob,status:'admitted',captureTime:photo.captureTime||null,fileModifiedTime:'unknown',addedAt:new Date().toISOString(),derivedFrom:photo.id,sourceSha256:photo.sha256,derivation:{method:'browser-review-copy.v1',width:result.width,height:result.height,quality:result.quality}};
 }finally{URL.revokeObjectURL(url);}
}
