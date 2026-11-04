import test from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE_LIMITS,
  validatePhotoForJob,
  findDuplicatePhoto,
  requireSameJob,
  linkEvidenceToEntry,
  excludePhotoFromReport,
  reportRevision,
  confirmationApplies,
  confirmationToPersist,
  buildMediaBundle,
  hashBytes,
  newEvidenceId,
} from "./public/evidence.js";
import { openDb } from "./public/jobstore.js";

const photo = (over = {}) => ({
  id: "ev-1",
  jobId: "JOB-1",
  name: "panel.jpg",
  mime: "image/jpeg",
  size: 1000,
  sha256: "abc123",
  captureTime: "2026-10-30T14:00:00Z",
  fileModifiedTime: "unknown",
  addedAt: "2026-10-30T14:01:00Z",
  status: "admitted",
  dataBase64: "aGk=",
  ...over,
});

const report = (over = {}) => ({
  technician: "Sam",
  summary: "Replaced inverter.",
  promises: "",
  followupOwner: "",
  entries: {
    repair: {
      status: "observed",
      note: "Swapped unit",
      reference: "WO-1",
      observedAt: "2026-10-30T13:00:00Z",
      evidenceIds: ["ev-1"],
    },
  },
  ...over,
});

test("photo admission rejects unsupported, empty, and oversize files", () => {
  assert.throws(
    () => validatePhotoForJob({ mime: "image/gif", size: 10, existingCount: 0 }),
    /Unsupported photo format/,
  );
  assert.throws(
    () => validatePhotoForJob({ mime: "image/jpeg", size: 0, existingCount: 0 }),
    /no readable data/,
  );
  assert.throws(
    () =>
      validatePhotoForJob({
        mime: "image/png",
        size: EVIDENCE_LIMITS.MAX_PHOTO_BYTES + 1,
        existingCount: 0,
      }),
    /per-photo limit/,
  );
  assert.throws(
    () =>
      validatePhotoForJob({
        mime: "image/webp",
        size: 10,
        existingCount: EVIDENCE_LIMITS.MAX_PHOTOS_PER_JOB,
      }),
    /already has 10 photos/,
  );
  assert.equal(
    validatePhotoForJob({ mime: "image/jpeg", size: 10, existingCount: 0 }),
    true,
  );
});

test("duplicate detection and wrong-job guards refuse cross-job evidence", () => {
  assert.equal(
    findDuplicatePhoto([photo()], "abc123")?.id,
    "ev-1",
  );
  assert.equal(findDuplicatePhoto([photo()], "other"), null);
  assert.throws(
    () => requireSameJob(photo({ jobId: "JOB-2" }), "JOB-1"),
    /belongs to another job/,
  );
  assert.throws(
    () =>
      linkEvidenceToEntry(report(), "repair", photo({ jobId: "JOB-2" }), "JOB-1"),
    /belongs to another job/,
  );
  assert.throws(
    () =>
      linkEvidenceToEntry(
        report(),
        "repair",
        photo({ status: "excluded" }),
        "JOB-1",
      ),
    /excluded and cannot be linked/,
  );
});

test("excluding a linked photo changes the revision and drops the confirmation", () => {
  const before = report();
  const rev = reportRevision(before);
  const confirmation = { name: "Sam", confirmedAt: "x", reportRevision: rev };
  assert.equal(confirmationApplies(confirmation, before), true);
  assert.equal(confirmationToPersist(confirmation, before), confirmation);

  const after = excludePhotoFromReport(before, "ev-1");
  assert.deepEqual(after.entries.repair.evidenceIds, []);
  assert.notEqual(reportRevision(after), rev);
  assert.equal(confirmationApplies(confirmation, after), false);
  assert.equal(confirmationToPersist(confirmation, after), null);

  const untouched = excludePhotoFromReport(before, "ev-missing");
  assert.equal(reportRevision(untouched), rev);
});

test("media bundle packs bytes, lists excluded without bytes, never drops silently", () => {
  const text = JSON.parse(
    buildMediaBundle({
      order: { id: "JOB-1", systemId: "SYS-1" },
      review: null,
      photos: [photo(), photo({ id: "ev-2", status: "excluded" })],
    }),
  );
  assert.equal(text.photoCount, 2);
  assert.equal(text.data["ev-1"], "aGk=");
  assert.equal(text.data["ev-2"], undefined);
  assert.equal(
    text.manifest.find((m) => m.id === "ev-2").bytesIncluded,
    false,
  );
  assert.throws(
    () =>
      buildMediaBundle({
        order: { id: "JOB-1" },
        review: null,
        photos: [photo({ id: "ev-9" })].map(({ dataBase64, ...m }) => m),
      }),
    /bytes are missing/,
  );
  assert.throws(
    () =>
      buildMediaBundle({
        order: { id: "JOB-1" },
        review: null,
        photos: [photo({ jobId: "JOB-2" })],
      }),
    /belongs to another job/,
  );
  assert.throws(
    () =>
      buildMediaBundle({
        order: { id: "JOB-1" },
        review: null,
        photos: [photo({ size: EVIDENCE_LIMITS.MAX_BUNDLE_BYTES + 1 })],
      }),
    /bundle limit/,
  );
});

test("hashBytes matches the known SHA-256 of 'abc'", async () => {
  assert.equal(
    await hashBytes(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.match(newEvidenceId(), /^ev-[0-9a-f]+$/);
});

test("openDb rejects with an actionable error where IndexedDB is absent", async () => {
  // Node has no IndexedDB: this exercises the real unavailable-storage
  // path, not a fake browser. Browser commit/rollback behavior remains
  // untested here (see report).
  await assert.rejects(openDb(), /Local job storage is unavailable/);
});

test('new interview evidence invalidates a prior report confirmation', () => {
  const report = { technician: 'Synthetic tech', summary: 'Inspected inverter', entries: {}, interviewRevision: 1 };
  const confirmation = { name: 'Synthetic tech', reportRevision: reportRevision(report) };
  assert.equal(confirmationToPersist(confirmation, {...report, interviewRevision: 2}), null);
});

test('media export includes original voice and transcription WAV; missing/cross-job clips fail',()=>{
 const order={id:'job-1',systemId:'system1'},clip={id:'clip1',jobId:'job-1',mime:'audio/wav',sha256:'a'.repeat(64),size:3,dataBase64:'YWJj',wavSize:3,wavBase64:'YWJj'};
 const bundle=JSON.parse(buildMediaBundle({order,review:null,photos:[],audio:[clip]}));
 assert.equal(bundle.audioData.clip1.original,'YWJj');assert.equal(bundle.audioManifest[0].sha256,clip.sha256);assert.equal(bundle.totalBytes,6);
 assert.throws(()=>buildMediaBundle({order,photos:[],audio:[{...clip,jobId:'other'}]}),/another job/);
 assert.throws(()=>buildMediaBundle({order,photos:[],audio:[{...clip,wavBase64:null}]}),/WAV bytes/);
});

test('adding an unlinked voice/photo original invalidates confirmation of the evidence packet',async()=>{
  const {evidenceRevision}=await import('./public/evidence.js');
  const report={technician:'Synthetic tech',summary:'Field visit',entries:{},evidenceRevision:evidenceRevision()};
  const confirmation={name:'Synthetic tech',reportRevision:reportRevision(report)};
  const changed={...report,evidenceRevision:evidenceRevision([],[{id:'voice1',sha256:'a'.repeat(64)}])};
  assert.equal(confirmationToPersist(confirmation,changed),null);
});
