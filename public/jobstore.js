import {AUDIO_LIMITS} from './audio.js';
// CarryForward durable job sessions (Slice 1).
//
// Browser-only IndexedDB store for job sessions, the ordered event log,
// and actual photo blobs. One database, three object stores:
//
//   sessions: keyPath "jobId"   { jobId, order, report, createdAt,
//                                 updatedAt, reportRevision, confirmation }
//   events:   keyPath "id"      { id, jobId, seq, type, at, payload }
//   photos:   keyPath "id"      { id, jobId, name, mime, size, sha256,
//                                 captureTime, fileModifiedTime, addedAt,
//                                 status, blob }
//
// Every read and write is scoped by jobId; cross-job access is rejected
// by the helpers in evidence.js, never merged. The UI must only show a
// photo as "locally saved" after the put transaction commits.
//
// __faults.nextWriteFails is a test hook (used by the focused tests and
// the manual acceptance walkthrough) that makes the next write reject,
// so the failure UI can be exercised without real quota pressure.

export const DB_NAME = "carryforward.jobs.v1";
export const DB_VERSION = 4;

export const __faults = { nextWriteFails: false };

function unavailable(reason) {
  return new Error(
    `Local job storage is unavailable (${reason}). ` +
      "Already saved evidence is preserved; keep this page open and retry. " +
      "Nothing new was saved.",
  );
}

function maybeFault(op) {
  if (__faults.nextWriteFails) {
    __faults.nextWriteFails = false;
    throw new Error(
      `Simulated storage failure during ${op}. ` +
        "Already saved evidence is preserved; nothing new was saved.",
    );
  }
}

export function openDb() {
  return new Promise((resolve, reject) => {
    let idb;
    try {
      idb = globalThis.indexedDB;
    } catch {
      idb = undefined;
    }
    if (!idb) {
      reject(unavailable("this browser has no IndexedDB here"));
      return;
    }
    let req;
    try {
      req = idb.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(unavailable(err?.message || "open failed"));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("conversation")) {
        const store=db.createObjectStore("conversation",{keyPath:"id"});
        store.createIndex("by-job","jobId",{unique:false});
      }
      if (!db.objectStoreNames.contains("interviewDrafts")) db.createObjectStore("interviewDrafts", {keyPath:"jobId"});
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "jobId" });
      }
      if (!db.objectStoreNames.contains("events")) {
        const store = db.createObjectStore("events", { keyPath: "id" });
        store.createIndex("by-job", "jobId", { unique: false });
      }
      if (!db.objectStoreNames.contains("audio")) {
        const store = db.createObjectStore("audio", { keyPath: "id" });
        store.createIndex("by-job", "jobId", {unique:false});
      }
      if (!db.objectStoreNames.contains("photos")) {
        const store = db.createObjectStore("photos", { keyPath: "id" });
        store.createIndex("by-job", "jobId", { unique: false });
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () =>
      reject(unavailable(req.error?.message || "open failed"));
    req.onblocked = () =>
      reject(unavailable("another tab holds the database open"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(unavailable(tx.error?.message || "write failed"));
    tx.onabort = () =>
      reject(unavailable(tx.error?.message || "write was interrupted"));
  });
}

function requestTo(promiseTarget) {
  return new Promise((resolve, reject) => {
    promiseTarget.onsuccess = () => resolve(promiseTarget.result);
    promiseTarget.onerror = () =>
      reject(unavailable(promiseTarget.error?.message || "read failed"));
  });
}

export async function getSession(db, jobId) {
  const tx = db.transaction("sessions", "readonly");
  const req = tx.objectStore("sessions").get(jobId);
  return requestTo(req);
}

export async function listSessions(db) {
  const tx = db.transaction("sessions", "readonly");
  const req = tx.objectStore("sessions").getAll();
  const rows = await requestTo(req);
  return (rows || []).sort((a, b) =>
    String(a.jobId).localeCompare(String(b.jobId)),
  );
}

export async function putSession(db, session) {
  maybeFault("session save");
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put({
    ...session,
    updatedAt: new Date().toISOString(),
  });
  await txDone(tx);
}

// Append one ordered event. The sequence number is assigned inside the
// same transaction so reloads and concurrent tabs keep a total order.
export async function appendEvent(db, { id, jobId, type, at, payload, clearDraftId }) {
  maybeFault("event write");
  const tx = db.transaction(clearDraftId ? ["events","interviewDrafts"] : ["events"], "readwrite");
  const store = tx.objectStore("events");
  const existing = await requestTo(store.index("by-job").getAll(jobId));
  try { validateEventAppend(existing || [], {jobId,type,payload}); }
  catch(error) { tx.abort(); throw error; }
  const seq = (existing || []).reduce((m, e) => Math.max(m, e.seq || 0), 0) + 1;
  store.add({
    id,
    jobId,
    seq,
    type,
    at: at || new Date().toISOString(),
    payload: payload || {},
  });
  if (clearDraftId) {
    const drafts=tx.objectStore("interviewDrafts");
    const draft=await requestTo(drafts.get(jobId));
    if(draft?.id===clearDraftId) drafts.delete(jobId);
  }
  await txDone(tx);
  return seq;
}

export async function listEvents(db, jobId) {
  const tx = db.transaction("events", "readonly");
  const rows = await requestTo(tx.objectStore("events").index("by-job").getAll(jobId));
  return (rows || []).sort((a, b) => a.seq - b.seq);
}

export async function putPhoto(db, record) {
  maybeFault("photo save");
  const tx = db.transaction("photos", "readwrite");
  tx.objectStore("photos").put(record);
  await txDone(tx);
}

// Admit one photo and its evidence.added event in a single transaction.
// Either both commit or neither does: a failed event write cannot leave
// an orphan photo, and a failed photo write cannot leave a dangling
// event. Returns the event sequence number.
export async function savePhotoWithEvent(db, record, event) {
  maybeFault("photo save");
  const tx = db.transaction(["photos", "events"], "readwrite");
  tx.objectStore("photos").put(record);
  const existing = await requestTo(
    tx.objectStore("events").index("by-job").getAll(record.jobId),
  );
  const seq = (existing || []).reduce((m, e) => Math.max(m, e.seq || 0), 0) + 1;
  tx.objectStore("events").add({
    id: event.id,
    jobId: record.jobId,
    seq,
    type: event.type || "evidence.added",
    at: event.at || new Date().toISOString(),
    payload: event.payload || {},
  });
  await txDone(tx);
  return seq;
}

export async function getPhoto(db, id) {
  const tx = db.transaction("photos", "readonly");
  return requestTo(tx.objectStore("photos").get(id));
}

// Metadata listing for one job (blobs included; the demo stays within
// the documented per-job bounds so one listing stays small).
export async function listPhotosByJob(db, jobId) {
  const tx = db.transaction("photos", "readonly");
  const rows = await requestTo(
    tx.objectStore("photos").index("by-job").getAll(jobId),
  );
  return (rows || []).sort((a, b) =>
    String(a.addedAt || "").localeCompare(String(b.addedAt || "")),
  );
}

export async function setPhotoStatus(db, id, status) {
  maybeFault("photo update");
  const tx = db.transaction("photos", "readwrite");
  const store = tx.objectStore("photos");
  const current = await requestTo(store.get(id));
  if (!current) throw new Error(`Photo ${id} is not saved on this device.`);
  store.put({ ...current, status });
  await txDone(tx);
}

export async function listAudioByJob(db,jobId){
  return requestTo(db.transaction("audio","readonly").objectStore("audio").index("by-job").getAll(jobId));
}
export async function saveAudio(db,record){
  maybeFault("audio save");
  const tx=db.transaction("audio","readwrite"),store=tx.objectStore("audio");
  const existing=await requestTo(store.index("by-job").getAll(record.jobId));
  if(existing.length>=AUDIO_LIMITS.clipsPerJob){tx.abort();throw new Error("This visit has reached its local voice storage limit. Existing recordings remain saved.");}
  store.add(record);
  await txDone(tx);
}

export async function updateAudioTranscription(db,id,jobId,transcription){
  maybeFault("transcription save");
  const tx=db.transaction("audio","readwrite"),store=tx.objectStore("audio");
  const record=await requestTo(store.get(id));
  if(!record||record.jobId!==jobId){tx.abort();throw new Error("Voice clip belongs to another job.");}
  store.put({...record,transcription});await txDone(tx);
}

export function validateEventAppend(existing,{jobId,type,payload}) {
  if (!type.startsWith("interview.")) return;
  const logical=payload?.investigationEvent;
  const history=existing.filter(e=>e.type.startsWith("interview."));
  const prior=history.reduce((max,e)=>Math.max(max,e.payload?.investigationEvent?.seq || 0),0);
  if (!logical || logical.jobId!==jobId || logical.type!==type.slice(10) || logical.seq!==prior+1) {
    throw new Error("This job changed in another view. Reopen it before saving; your unsent answer is retained.");
  }
}

export function validateInterviewDraft(draft,jobId){
 if(!draft||draft.jobId!==jobId||typeof draft.id!=='string'||!draft.id||draft.id.length>200||typeof draft.text!=='string'||draft.text.length>4000||typeof draft.correction!=='string'||draft.correction.length>200||JSON.stringify(draft).length>20000)throw Error('Invalid or wrong-job interview draft');
 if(draft.audio && (typeof draft.audio.audioId!=='string'||typeof draft.audio.transcription?.rawText!=='string'||draft.audio.transcription.rawText.length>4000||draft.audio.transcription.reviewed!==true))throw Error('Invalid draft voice reference');
 return draft;
}
export async function getInterviewDraft(db,jobId){
 const record=await requestTo(db.transaction('interviewDrafts','readonly').objectStore('interviewDrafts').get(jobId));
 return record?validateInterviewDraft(record,jobId):null;
}
export async function saveInterviewDraft(db,record){
 validateInterviewDraft(record,record.jobId);maybeFault('unsent draft save');
 const tx=db.transaction('interviewDrafts','readwrite');tx.objectStore('interviewDrafts').put({...record,updatedAt:new Date().toISOString()});await txDone(tx);
}

// Conversation is not evidence: these writes never alter report revision or confirmation.
export async function listConversation(db,jobId){
  const tx=db.transaction('conversation','readonly');
  const rows=await requestTo(tx.objectStore('conversation').index('by-job').getAll(jobId));
  return rows.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
}
export async function saveConversation(db,record){
  if(typeof record.id!=='string'||!record.id||typeof record.jobId!=='string'||!record.jobId||typeof record.question!=='string'||record.question.length>4000||typeof record.reply!=='string'||record.reply.length>2000||!['question','report','clarify','control'].includes(record.intent)||!Number.isFinite(Date.parse(record.at)))throw Error('Invalid conversation record');
  maybeFault('conversation save');
  const tx=db.transaction(['conversation','sessions'],'readwrite'),done=txDone(tx);
  try{
    const session=await requestTo(tx.objectStore('sessions').get(record.jobId));
    if(!session)throw Error('Conversation job is not saved');
    const store=tx.objectStore('conversation'),prior=await requestTo(store.get(record.id));
    if(prior){if(JSON.stringify(prior)!==JSON.stringify(record))throw Error('Conversation ID already belongs to another turn');}
    else {const count=await requestTo(store.index('by-job').count(record.jobId));if(count>=200)throw Error('Conversation storage limit reached');store.add(structuredClone(record));}
  }catch(error){tx.abort();await done.catch(()=>{});throw error;}
  await done;return record;
}
