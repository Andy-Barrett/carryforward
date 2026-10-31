import http from "node:http";
import { readFile, mkdir, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { transcribeWithMeta } from "./lib/meta-transcribe.mjs";
import { reviewWithMeta } from "./lib/meta-review.mjs";
import { OperationsStore } from "./lib/operations.mjs";
import { handleOperations } from "./lib/operations-api.mjs";
await mkdir(new URL(".local/", import.meta.url), {recursive:true, mode:0o700});
const operationsPath = process.env.CARRYFORWARD_OPERATIONS_DB || new URL(".local/operations.sqlite",import.meta.url).pathname;
const operations = new OperationsStore(operationsPath);
await chmod(operationsPath,0o600);
const localSession = randomBytes(32).toString("hex");
const enabled = process.env.CARRYFORWARD_META_ENABLED === "1";
const guardToken = enabled ? (await readFile(process.env.CARRYFORWARD_GUARD_TOKEN_FILE, "utf8")).trim() : null;
let reviewBusy = false;
const reviews = new Map();
const files = {
  "/": ["index.html", "text/html"],
  "/sw.js": ["sw.js", "text/javascript"],
  "/offline.js": ["offline.js", "text/javascript"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/app-icon.svg": ["app-icon.svg", "image/svg+xml"],
  "/app.js": ["app.js", "text/javascript"],
  "/observation-time.js": ["observation-time.js", "text/javascript"],
  "/engine.js": ["engine.js", "text/javascript"],
  "/evidence.js": ["evidence.js", "text/javascript"],
  "/investigation.js": ["investigation.js", "text/javascript"],
  "/audio.js": ["audio.js", "text/javascript"],
  "/capture-lifecycle.js": ["capture-lifecycle.js", "text/javascript"],
  "/review-copy.js": ["review-copy.js", "text/javascript"],
  "/review-request.js": ["review-request.js", "text/javascript"],
  "/voice.js": ["voice.js", "text/javascript"],
  "/operations-client.js": ["operations-client.js", "text/javascript"],
  "/interview.js": ["interview.js", "text/javascript"],
  "/jobstore.js": ["jobstore.js", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
};
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || "";
  if (!/^127\.0\.0\.1:\d+$/.test(host)) { res.writeHead(421); res.end("Use loopback address"); return; }
  const path = new URL(req.url, "http://localhost").pathname;
  const json = (status, body) => { res.writeHead(status, {"Content-Type":"application/json", "Cache-Control":"no-store"}); res.end(JSON.stringify(body)); };
  if (await handleOperations(req,res,path,{store:operations,authorize:()=>req.headers["x-carryforward-intent"] === "operations" && (!req.headers.origin || req.headers.origin===`http://${host}`) && (req.headers.cookie||"").split("; ").includes(`carryforward_session=${localSession}`)})) return;
  if (path === "/api/config" && req.method === "GET") { res.setHeader("Set-Cookie", `carryforward_session=${localSession}; HttpOnly; SameSite=Strict; Path=/`); return json(200, {metaEnabled:enabled,model:enabled ? "muse-spark-1.3" : null,transcriptionEnabled:enabled}); }
  if (["/api/review", "/api/transcribe"].includes(path) && req.method === "POST") {
    if (!enabled) return json(503,{error:"Meta review disabled"});
    if (req.headers.origin !== `http://${host}` || req.headers["x-carryforward-intent"] !== "review" || !(req.headers.cookie || "").split("; ").includes(`carryforward_session=${localSession}`)) return json(403,{error:"Open this local application before requesting a review"});
    if (req.headers["content-type"] !== "application/json") return json(415,{error:"Expected application/json"});
    if (reviewBusy) return json(429,{error:"Another review is running. Saved work is unchanged."});
    reviewBusy = true;
    try {
      const chunks=[]; let size=0;
      for await (const chunk of req) { size+=chunk.length; if(size>1900000) throw new Error("Review exceeds 1.9 MB request limit"); chunks.push(chunk); }
      const input=JSON.parse(Buffer.concat(chunks));
      const id=input.order?.id || input.jobId;
      if (typeof id!=="string" || !id || id.length>300) throw new Error("A bounded job identity is required");
      const kind=path === "/api/transcribe" ? "transcription" : "review";
      const countKey=`${kind}:${id}`;
      if ((reviews.get(countKey)||0)>=5) throw new Error(`Five-${kind} session limit reached for this job; keep unresolved work visible`);
      reviews.set(countKey,(reviews.get(countKey)||0)+1);
      if (path === "/api/transcribe") return json(200,await transcribeWithMeta(input,{token:guardToken}));
      const proposal=await reviewWithMeta(input,{token:guardToken});
      return json(200,{proposal});
    } catch (error) { return json(400,{error:error.message}); }
    finally { reviewBusy=false; }
  }
  const file = files[path];
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const body = await readFile(new URL(`public/${file[0]}`, import.meta.url));
    res.writeHead(200, {
      "Content-Type": file[1],
      "Cache-Control": "no-store",
      ...(path === "/" ? {"Set-Cookie": `carryforward_session=${localSession}; HttpOnly; SameSite=Strict; Path=/`} : {}),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("Unable to load application");
  }
});
server.listen(Number(process.env.PORT || 4310), "127.0.0.1", () =>
  console.log(`CarryForward: http://127.0.0.1:${server.address().port}`),
);
