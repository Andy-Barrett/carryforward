// App shell only. Never cache API responses, evidence or arbitrary requests.
const CACHE='carryforward-shell-342b4a2189d8d66f';
const SHELL=["/field.css","/football-mark-v1.png","/job-camera.js","/visit-trial.js","/speech-text.js","/turn-timing.js","/reply-speech.js","/demo-work-orders.js","/visit-navigation.js","/held-voice.js","/visit-flow.js","/live-protocol.js","/live-voice.js","/pcm-worklet.js","/local-speech.js","/cloud-dialogs.js","/evidence-review.js","/visit-brief.js","/cloud-view.js","/cloud-session.js","/cloud-resources.js","/job-context.js","/cloud.css","/","/app-icon-192.png","/app-icon-512.png","/apple-touch-icon.png","/favicon-32.png","/app.js","/audio.js","/capture-lifecycle.js","/engine.js","/evidence.js","/interview.js","/investigation.js","/jobstore.js","/manifest.webmanifest","/observation-time.js","/offline.js","/operations-client.js","/review-copy.js","/review-request.js","/style.css","/voice.js"];
const allowed=new Set(SHELL);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try{await cache.addAll(SHELL);}catch(error){await caches.delete(CACHE);throw error;}
})()));
// An update waits for old app windows to close; do not mix cached module versions.
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('carryforward-shell-')&&key!==CACHE)await caches.delete(key);
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.search||!allowed.has(url.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);const hit=await cache.match(url.pathname);
  return hit||fetch(event.request);
 })());
});
