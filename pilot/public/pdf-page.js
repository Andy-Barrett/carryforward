// Render the actual authenticated original, never a generated replacement drawing.
export async function renderPdfPage(bytes,pageNumber,{ensure=()=>{},signal,load=()=>import('/pilot/vendor/pdf.mjs')}={}) {
  ensure();signal?.throwIfAborted();
  const pdfjs=await load();ensure();signal?.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc='/pilot/vendor/pdf.worker.mjs';
  const loading=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,enableXfa:false,useWasm:false,wasmUrl:'/pilot/vendor/wasm/',standardFontDataUrl:'/pilot/vendor/standard_fonts/',cMapUrl:'/pilot/vendor/cmaps/',cMapPacked:true});
  let document,render;
  const abort=()=>{render?.cancel();void loading.destroy();};signal?.addEventListener('abort',abort,{once:true});
  try{
    document=await loading.promise;ensure();signal?.throwIfAborted();
    if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>document.numPages)throw Error('That PDF page is not in this original.');
    const page=await document.getPage(pageNumber),base=page.getViewport({scale:1});
    const scale=Math.min(2.5,1400/base.width,Math.sqrt(2_800_000/(base.width*base.height))),viewport=page.getViewport({scale});
    const canvas=globalThis.document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    render=page.render({canvasContext:canvas.getContext('2d'),viewport});await render.promise;ensure();signal?.throwIfAborted();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('The PDF page could not be rendered.')),'image/png'));
    ensure();signal?.throwIfAborted();return {blob,pageCount:document.numPages};
  }finally{signal?.removeEventListener('abort',abort);await loading.destroy();}
}
