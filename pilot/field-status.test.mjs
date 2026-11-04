import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { demoOrder } from "../public/engine.js";
import { createInvestigation, reduceInvestigation } from "../public/investigation.js";
import { classifyHistory } from "./public/history-merge.js";
import { createTurnTiming } from "../public/turn-timing.js";
import { spokenPilotBrief } from "../public/visit-brief.js";
import { createBriefingVoice } from "./public/briefing-voice.js";
import { loadAdmittedPhotos } from "./public/photo-import.js";

const source = await readFile(new URL("./public/app.js", import.meta.url), "utf8");
// Execute the real integration callbacks with deferred I/O and a small DOM
// double. This is a lifecycle regression, not rendered browser/device proof.
function actualFunction(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, "Use the actual pilot app functions.");
  return source.slice(first, last);
}
const application = actualFunction("function run(", "function controls(") +
  actualFunction("async function field(", "async function departure(");
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function fixture(serverEvents = []) {
  const job = {
    id: demoOrder.id, companyId: "fictional-company-a", externalId: "A-WO-100",
    revision: "assignment-a", order: structuredClone(demoOrder),
  };
  const messages = [], writes = [], buttons = [], photoRenders = [];
  const local = {
    events: [], photos: [], audio: [], draft: "", conversation: [],
    assignmentRevision: job.revision,
  };
  const cacheA = {
    scope: "fictional-company-a:technician-a", expiresAt: Date.now() + 900000,
    get: async () => local,
    put: async (id, value) => {if(hooks.failSave)throw Error("Fixture storage quota exceeded");return writes.push({ scope: "A", id, value: structuredClone(value) });},
  };
  const principal = {
    companyId: "fictional-company-a", userId: "technician-a", sessionId: "session-a",
  };
  const hooks = { evidence: async () => ({}), sync: async () => ({}), media: async () => new Response(Uint8Array.from([1,2,3]),{headers:{'Content-Type':'image/png'}}) };
  let callbacks, voiceCallbacks;
  const view = () => {};
  Object.assign(view, {
    refresh() {}, setActivity() {}, setConnection() {}, setDraft() {}, setResponse() {},
    setPhotos: (photos) => photoRenders.push(photos),
    draftSnapshot: () => ({ text: local.draft }),
    extraTools: { prepend: (...items) => buttons.push(...items) },
  });
  const context = vm.createContext({
    epoch: 0, account: { user: { id: principal.userId }, principal }, cache: cacheA,
    cleanup: null, speaker: null, current: null, app: {},
    checkpoint() {}, message: (text) => messages.push(text),
    $: () => ({}),
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelectorAll: () => [], createElement: () => ({}),
    },
    window: {}, AbortController, crypto: webcrypto, structuredClone, performance,
    Uint8Array, Blob, URL, atob, btoa, setTimeout,
    createInvestigation, reduceInvestigation, classifyHistory, createTurnTiming, spokenPilotBrief, createBriefingVoice, loadAdmittedPhotos,
    digest: async (bytes) => createHash("sha256").update(bytes).digest("hex"),
    base64: (bytes) => Buffer.from(bytes).toString("base64"),
    mountCloud: (_root, options) => { callbacks = options; return view; },
    createReplySpeaker: () => ({ dispose() {}, stop() {} }),
    createPilotVoiceTurn: options => {voiceCallbacks=options;return { dispose() {}, cancel() {} };},
    bindNativeReminderEvents: () => ({ dispose() {} }),
    createWorkOrderFiles: () => ({dispose(){},focus(){},rememberCitation(){},route:async()=>null,list:async()=>({items:local.photos})}),
    bindVisitSwipes: () => () => {},
    fetch: (path,options)=>hooks.media(path,options),
    api: async (path, options = {}) => {
      if (path === "jobs/" + job.id) return job;
      if (path.endsWith("/events"))
        return options.method === "POST" ? hooks.sync(options) : { events: serverEvents };
      if (path.endsWith("/evidence")) return hooks.evidence(options);
      assert.fail("Unexpected test request: " + path);
    },
  });
  new vm.Script(application, { filename: "actual-pilot-field-callbacks.js" }).runInContext(context);
  await context.field(job.id);
  function switchAccount() {
    context.cleanup?.();
    context.epoch++;
    context.account = {
      user: { id: "technician-b" },
      principal: { companyId: "fictional-company-b", userId: "technician-b", sessionId: "session-b" },
    };
    context.cache = { scope: "fictional-company-b:technician-b", put() { assert.fail("A callback cannot write B's cache"); } };
    messages.length = 0;
    messages.push("B current status");
  }
  return { context, callbacks, voiceCallbacks, hooks, messages, writes, buttons, photoRenders, local, switchAccount };
}
function photo() {
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  return { name: "fictional-A-photo.png", type: "image/png", size: bytes.length, arrayBuffer: async () => bytes.buffer };
}

function suppliedPhotoEvent(){return {id:'supplied-import',jobId:demoOrder.id,seq:1,type:'source.added',payload:{id:'supplied-photo',kind:'photo',sha256:createHash('sha256').update(Uint8Array.from([1,2,3])).digest('hex'),name:'Supplied fictional photo',origin:'Approved packet'}};}
test('an ordinary cited spoken answer stays in conversation without fetching or focusing a PDF',async()=>{
 const f=await fixture();f.hooks.media=()=>assert.fail('An answer must not fetch the cited original automatically.');
 await f.voiceCallbacks.showAnswer({reply:'The assigned inverter is SE7600H-US.',citations:[{versionId:'brief-r1',pdfPage:1}]});
 assert.equal(f.messages.length,0);
});
test('the actual Files callback imports and persists a supplied server photo without inventing another source event',async()=>{
 const f=await fixture([suppliedPhotoEvent()]);const files=await f.callbacks.onGetFiles();assert.equal(files.items.length,1);assert.equal(files.items[0].id,'supplied-photo');assert.equal(f.local.events.length,1);assert.equal(f.local.photos[0].syncStatus,'synced');assert.equal(f.writes.at(-1).value.photos[0].id,'supplied-photo');
});
test('the actual Files import cannot save late photo bytes into another account',async()=>{
 const f=await fixture([suppliedPhotoEvent()]),started=deferred(),response=deferred();f.hooks.media=()=>{started.resolve();return response.promise;};const pending=f.callbacks.onGetFiles();await started.promise;f.switchAccount();response.resolve(new Response(Uint8Array.from([1,2,3]),{headers:{'Content-Type':'image/png'}}));await assert.rejects(pending,/closed/);assert.equal(f.local.photos.length,0);assert.deepEqual(f.messages,['B current status']);
});

test("photo capture releases before upload completes, retains A's original and suppresses a late error after B opens", async () => {
  const f = await fixture(), entered = deferred(), upload = deferred();
  f.hooks.evidence = () => { entered.resolve(); return upload.promise; };
  const pending = f.callbacks.onPhotoFiles([photo()]);
  await entered.promise;
  await pending; // A pending upload cannot keep capture/Files locked.
  assert.equal(f.writes.at(-1).value.photos.length, 1);
  const photoRenders = f.photoRenders.length;
  f.switchAccount();
  upload.reject(Error("A-only delayed photo failure"));
  await pending;await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.messages, ["B current status"]);
  assert.equal(f.photoRenders.length, photoRenders);
  assert.equal(f.local.photos.length, 1);
});

test("actual field testimony callback suppresses a late sync failure while retaining A's admitted update", async () => {
  const f = await fixture(), entered = deferred(), sync = deferred();
  f.hooks.sync = () => { entered.resolve(); return sync.promise; };
  const pending = f.callbacks.onSaveAnswer("Fictional A-only correction: 2.4 kW.");
  await entered.promise;
  assert.equal(f.writes.at(-1).value.events.length, 1);
  f.switchAccount();
  sync.reject(Error("A-only delayed event failure"));
  await pending;
  assert.deepEqual(f.messages, ["B current status"]);
  assert.equal(f.local.events.length, 1);
});

test("a photo read finishing after account change cannot admit bytes or expose its stale wrapper error", async () => {
  const f = await fixture(), entered = deferred(), bytes = deferred();
  const selected = { ...photo(), arrayBuffer: () => { entered.resolve(); return bytes.promise; } };
  const pending = f.context.run(() => f.callbacks.onPhotoFiles([selected]))();
  await entered.promise;
  f.switchAccount();
  bytes.resolve(Uint8Array.from([1, 2, 3, 4]).buffer);
  await pending;
  assert.deepEqual(f.messages, ["B current status"]);
  assert.equal(f.local.photos.length, 0);
  assert.equal(f.writes.length, 0);
});

test("actual field sync control cannot publish stale success or rejection after its visit closes", async () => {
  for (const failed of [false, true]) {
    const f = await fixture(), entered = deferred(), sync = deferred();
    f.hooks.sync = () => { entered.resolve(); return sync.promise; };
    const pending = f.buttons.find((button) => button.textContent === "Sync saved work").onclick();
    await entered.promise;
    // Same account, new visit: the explicit field predicate also matters.
    f.context.epoch++;
    f.messages.length = 0;
    f.messages.push("New visit current status");
    if (failed) sync.reject(Error("Old visit sync error"));
    else sync.resolve({});
    await pending;
    assert.deepEqual(f.messages, ["New visit current status"]);
  }
});

test("actual run wrapper suppresses cross-account errors but retains useful current-account failures", async () => {
  const f = await fixture(), delayed = deferred();
  const pending = f.context.run(() => delayed.promise)();
  f.switchAccount();
  delayed.reject(Error("A-only outer callback failure"));
  await pending;
  assert.deepEqual(f.messages, ["B current status"]);
  await f.context.run(async () => { throw Error("Current B action failed"); })();
  assert.equal(f.messages.at(-1), "Current B action failed");
});

test("current field photo and event failures still explain that admitted work is retained", async () => {
  const f = await fixture();
  f.hooks.evidence = async () => { throw Error("Fixture photo offline"); };
  await f.callbacks.onPhotoFiles([photo()]);await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.messages.at(-1), /Photo saved encrypted locally; waiting for sync.*Fixture photo offline/);
  f.hooks.sync = async () => { throw Error("Fixture event offline"); };
  await f.callbacks.onSaveAnswer("Fictional locally retained update.");
  assert.match(f.messages.at(-1), /Saved encrypted on this device; waiting to reconnect.*Fixture event offline/);
});


test('a failed local photo transaction leaves no unsaved thumbnail or evidence event to sync',async()=>{
 const f=await fixture();let uploads=0;f.hooks.failSave=true;f.hooks.evidence=async()=>{uploads++;};
 const renders=f.photoRenders.length;
 await assert.rejects(f.callbacks.onPhotoFiles([photo()]),/storage quota exceeded/);
 assert.equal(f.local.photos.length,0);assert.equal(f.local.events.length,0);assert.equal(f.photoRenders.length,renders);assert.equal(uploads,0);
});
