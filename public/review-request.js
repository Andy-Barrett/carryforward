// Bound the browser wait. Aborting this wait does not prove provider cancellation.
export async function requestReview(url,payload,{timeoutMs=210000,fetchImpl=fetch}={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','X-CarryForward-Intent':'review'},body:JSON.stringify(payload),signal:controller.signal});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||([401,403].includes(response.status)?'Reconnect to continue the conversation.':'The request could not be completed.'));
    if(!data||typeof data!=='object')throw new Error('The service returned an unreadable response. No automatic retry was made.');
    return data;
  } catch(error) {
    if(controller.signal.aborted)throw new Error('The review wait timed out. Your saved evidence is unchanged. The provider request may still finish; no automatic retry was made.');
    throw error;
  } finally {clearTimeout(timer);}
}
