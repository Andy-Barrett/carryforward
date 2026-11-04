import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url),
  source = await readFile(new URL("public/sw.js", root), "utf8"),
  shared = JSON.parse(source.match(/const SHELL=(\[[^;]+\]);/)[1]).filter(
    (x) => x !== "/",
  );
const assets = [
  "/pilot/",
  "/pilot/app.js",
  "/pilot/cache.js",
  "/pilot/day-plan.js",
  "/pilot/work-order-files.js",
  "/pilot/pdf-page.js",
  "/pilot/voice-turn.js",
  "/pilot/voice-clip.js",
  "/pilot/briefing-voice.js",
  "/pilot/photo-import.js",
  "/pilot/history-merge.js",
  "/pilot/native-reminder-events.js",
  "/pilot/pilot.css",
  ...shared,
];
const h = createHash("sha256");
for (const a of assets)
  h.update(
    await readFile(
      new URL(
        a === "/pilot/"
          ? "pilot/public/index.html"
          : a.startsWith("/pilot/")
            ? "pilot/public/" + a.slice(7)
            : "public" + a,
        root,
      ),
    ),
  );
const cache = "carryforward-pilot-shell-" + h.digest("hex").slice(0, 16);
await writeFile(
  new URL("pilot/public/sw.js", root),
  `// Static code only. API, document originals and company evidence are never cached here.\nconst CACHE=${JSON.stringify(cache)},ASSETS=${JSON.stringify(assets)},allowed=new Set(ASSETS);\nself.addEventListener('install',e=>e.waitUntil((async()=>{try{await(await caches.open(CACHE)).addAll(ASSETS);}catch(error){await caches.delete(CACHE);throw error;}})()));\nself.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('carryforward-pilot-shell-')&&k!==CACHE)await caches.delete(k);})()));\nself.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.search||!allowed.has(u.pathname))return;e.respondWith((async()=>{const c=await caches.open(CACHE);return(await c.match(u.pathname))||fetch(e.request);})());});\n`,
);
console.log(cache);
