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
export const DB_VERSION = 2;

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
export async function appendEvent(db, { id, jobId, type, at, payload }) {
  maybeFault("event write");
  const tx = db.transaction("events", "readwrite");
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
  if(existing.length>=5){tx.abort();throw new Error("This job already has five voice clips. Export them before recording another.");}
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
