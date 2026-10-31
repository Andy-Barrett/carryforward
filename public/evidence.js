// CarryForward evidence helpers (Slice 1).
//
// Pure module: no DOM, no IndexedDB, importable from Node tests and the
// browser client. It holds the explicit import/export limits, stable ID
// generation, photo admission checks, report-revision binding for
// technician confirmation, and the versioned media-bundle builder.
//
// Time model: captureTime is when the technician added the photo on this
// device; fileModifiedTime is the file's own last-modified stamp (or
// "unknown"); addedAt is when the storage transaction committed. File
// time is never treated as observation time and no EXIF is invented.

export const EVIDENCE_LIMITS = {
  // Admitted image types for this slice. Anything else is explained to
  // the technician, never silently converted or kept as evidence.
  SUPPORTED_PHOTO_MIME: ["image/jpeg", "image/png", "image/webp"],
  // Conservative per-job bounds for a small demo on a phone browser.
  MAX_PHOTOS_PER_JOB: 10,
  // Largest single admitted photo (encoded file bytes).
  MAX_PHOTO_BYTES: 5_000_000,
  // Largest total encoded photo bytes packed into one media bundle.
  MAX_BUNDLE_BYTES: 25_000_000,
  // Bundle JSON size above which the UI warns before downloading.
  BUNDLE_WARN_BYTES: 5_000_000,
  // Ordered-event log bound per job session.
  MAX_EVENTS_PER_JOB: 500,
  // Matches the existing 100 KB work-order import cap in app.js.
  WORK_ORDER_IMPORT_BYTES: 100_000,
};

export const MEDIA_BUNDLE_VERSION = "carryforward.media-bundle.v1";

const randomHex = (bytes = 8) => {
  try {
    const buf = new Uint8Array(bytes);
    globalThis.crypto?.getRandomValues?.(buf);
    if (buf.some((b) => b !== 0)) {
      return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // Fall through to Math.random below.
  }
  let out = "";
  for (let i = 0; i < bytes * 2; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
};

export const newEvidenceId = () => `ev-${randomHex()}`;
export const newSessionId = () => `sess-${randomHex()}`;
export const newEventId = () => `evt-${randomHex()}`;

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "unknown size";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Admission check for one photo file. Throws an actionable Error; the
// caller must keep the field draft and must not claim a save.
export function validatePhotoForJob({ mime, size, existingCount }) {
  if (!EVIDENCE_LIMITS.SUPPORTED_PHOTO_MIME.includes(mime)) {
    throw new Error(
      `Unsupported photo format (${mime || "unknown"}). ` +
        `Use ${EVIDENCE_LIMITS.SUPPORTED_PHOTO_MIME.join(", ")}. ` +
        "Your draft is unchanged.",
    );
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("That file has no readable data. Your draft is unchanged.");
  }
  if (size > EVIDENCE_LIMITS.MAX_PHOTO_BYTES) {
    throw new Error(
      `Photo is ${formatBytes(size)}; the per-photo limit is ` +
        `${formatBytes(EVIDENCE_LIMITS.MAX_PHOTO_BYTES)}. ` +
        "Your draft is unchanged.",
    );
  }
  if (existingCount >= EVIDENCE_LIMITS.MAX_PHOTOS_PER_JOB) {
    throw new Error(
      `This job already has ${EVIDENCE_LIMITS.MAX_PHOTOS_PER_JOB} photos. ` +
        "Excluded photos still use storage slots. Export this job before starting another visit. Your draft is unchanged.",
    );
  }
  return true;
}

// Exact-duplicate detection by content hash within one job. Returns the
// existing record or null; the caller warns instead of storing twice.
export function findDuplicatePhoto(photos, sha256) {
  if (!sha256) return null;
  return photos.find((p) => p.sha256 === sha256) || null;
}

// Guard against mingling evidence across jobs. Throws on mismatch.
export function requireSameJob(photo, jobId) {
  if (!photo || photo.jobId !== jobId) {
    throw new Error(
      `Photo ${photo?.id || "(unknown)"} belongs to another job and ` +
        "cannot be linked here. Evidence never moves across jobs.",
    );
  }
  return true;
}

// Link an admitted photo ID to one field-observation entry. The legacy
// free-text reference is preserved untouched.
export function linkEvidenceToEntry(report, checkId, photo, jobId) {
  requireSameJob(photo, jobId);
  if (photo.status === "excluded") {
    throw new Error(
      `Photo ${photo.id} is excluded and cannot be linked. ` +
        "Restore it first if it should support an observation.",
    );
  }
  const entries = report.entries || {};
  const entry = entries[checkId] || {};
  const ids = Array.isArray(entry.evidenceIds) ? [...entry.evidenceIds] : [];
  if (!ids.includes(photo.id)) ids.push(photo.id);
  return {
    ...report,
    entries: { ...entries, [checkId]: { ...entry, evidenceIds: ids } },
  };
}

// Detach an excluded photo from every observation entry. Excluding a
// photo changes which evidence supports the report, so the report
// revision changes with it and any prior confirmation stops applying
// (see confirmationApplies). The photo itself stays stored.
export function excludePhotoFromReport(report, photoId) {
  const entries = report.entries || {};
  let changed = false;
  const next = {};
  for (const key of Object.keys(entries)) {
    const ids = Array.isArray(entries[key]?.evidenceIds)
      ? entries[key].evidenceIds
      : [];
    if (ids.includes(photoId)) {
      changed = true;
      next[key] = {
        ...entries[key],
        evidenceIds: ids.filter((id) => id !== photoId),
      };
    } else {
      next[key] = entries[key];
    }
  }
  if (!changed) return report;
  return { ...report, entries: next };
}

// Remove a photo ID from one entry (unlink keeps the photo stored).
export function unlinkEvidenceFromEntry(report, checkId, evidenceId) {
  const entries = report.entries || {};
  const entry = entries[checkId] || {};
  const ids = (Array.isArray(entry.evidenceIds) ? entry.evidenceIds : []).filter(
    (id) => id !== evidenceId,
  );
  return {
    ...report,
    entries: { ...entries, [checkId]: { ...entry, evidenceIds: ids } },
  };
}

// Deterministic canonical JSON over the material report fields only.
function canonicalMaterial(report) {
  const entries = report.entries || {};
  const keys = Object.keys(entries).sort();
  return JSON.stringify({
    reviewContract: "carryforward.review.v4",
    evidenceRevision: report.evidenceRevision ?? null,
    interviewRevision: report.interviewRevision ?? null,
    technician: report.technician || "",
    summary: report.summary || "",
    promises: report.promises || "",
    followupOwner: report.followupOwner || "",
    entries: keys.map((k) => [
      k,
      {
        status: entries[k]?.status || "",
        note: entries[k]?.note || "",
        reference: entries[k]?.reference || "",
        observedAt: entries[k]?.observedAt || "",
        evidenceIds: [...(entries[k]?.evidenceIds || [])].sort(),
      },
    ]),
  });
}

// cyrb53: small synchronous hash so revision binding works identically
// in the browser and in Node tests without async crypto.
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

// Short revision string for the material report content. Technician
// confirmation is recorded against this exact value.
export function reportRevision(report) {
  return `rev-${cyrb53(canonicalMaterial(report || {}))}`;
}

// A stored confirmation applies only to the revision it was recorded
// against. Any material change invalidates it visibly (never silently).
export function confirmationApplies(confirmation, report) {
  if (!confirmation || !confirmation.reportRevision) return false;
  return confirmation.reportRevision === reportRevision(report);
}

// The only confirmation value a session may persist for a report: the
// candidate when it still matches the report revision, otherwise null.
// Persisting a stale confirmation would resurrect an approval the
// technician's latest edits already invalidated.
export function confirmationToPersist(candidate, report) {
  return confirmationApplies(candidate, report) ? candidate : null;
}

// SHA-256 hex over raw bytes. Uses SubtleCrypto in the browser and
// Node's built-in crypto module under Node. Async in both.
export async function hashBytes(u8) {
  const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

// Build the versioned media-inclusive export bundle. `photos` must carry
// every admitted photo for the job with its bytes as base64 (`dataBase64`)
// except explicitly excluded ones, which are listed in the manifest with
// bytesIncluded:false and a reason. Anything else -- a missing blob for
// an admitted photo, a cross-job photo, an over-limit bundle -- throws
// instead of silently dropping data.
export function buildMediaBundle({ order, review, photos, audio = [], exportedAt }) {
  if (!order || !order.id) throw new Error("A work order is required to export.");
  const list = Array.isArray(photos) ? photos : [];
  for (const p of list) {
    if (p.jobId !== order.id) {
      throw new Error(
        `Photo ${p.id} belongs to another job; refusing to pack it ` +
          `into ${order.id}'s bundle.`,
      );
    }
  }
  let totalBytes = 0;
  const manifest = list.map((p) => {
    const entry = {
      id: p.id,
      jobId: p.jobId,
      name: p.name || p.id,
      mime: p.mime,
      bytes: p.size,
      sha256: p.sha256,
      ...(p.derivedFrom ? {derivedFrom:p.derivedFrom,sourceSha256:p.sourceSha256,derivation:p.derivation} : {}),
      captureTime: p.captureTime,
      fileModifiedTime: p.fileModifiedTime || "unknown",
      addedAt: p.addedAt,
      status: p.status || "admitted",
      bytesIncluded: true,
    };
    if (entry.status === "excluded") {
      entry.bytesIncluded = false;
      entry.exclusionReason = "Excluded by the technician on this device.";
      return entry;
    }
    if (typeof p.dataBase64 !== "string" || !p.dataBase64.length) {
      throw new Error(
        `Photo ${p.id} is admitted but its saved bytes are missing. ` +
          "Nothing was exported; keep this page open and retry.",
      );
    }
    totalBytes += p.size || 0;
    return entry;
  });
  if (!Array.isArray(audio) || audio.length > 5) throw new Error("At most five voice clips per bundle.");
  const audioData = {};
  const audioManifest = audio.map(clip => {
    if (clip.jobId !== order.id) throw new Error("Voice clip belongs to another job.");
    if (typeof clip.dataBase64 !== "string" || !clip.dataBase64 || !Number.isFinite(clip.size) || clip.size <= 0 || clip.size > 5000000) throw new Error("Voice bytes are missing or exceed the clip limit; nothing exported.");
    if (clip.wavSize && !clip.wavBase64) throw new Error("Transcription WAV bytes are missing; nothing exported.");
    totalBytes += clip.size + (clip.wavSize || 0);
    audioData[clip.id] = {original:clip.dataBase64,transcriptionWav:clip.wavBase64 || null};
    const {dataBase64,wavBase64,...metadata}=clip;
    return {...metadata,bytesIncluded:true};
  });
  if (totalBytes > EVIDENCE_LIMITS.MAX_BUNDLE_BYTES) {
    throw new Error(
      `Photos total ${formatBytes(totalBytes)}; the bundle limit is ` +
        `${formatBytes(EVIDENCE_LIMITS.MAX_BUNDLE_BYTES)}. ` +
        "Exclude a photo and retry. Nothing was exported.",
    );
  }
  const data = {};
  for (const p of list) {
    if (p.status !== "excluded") data[p.id] = p.dataBase64;
  }
  return JSON.stringify(
    {
      version: MEDIA_BUNDLE_VERSION,
      exportedAt: exportedAt || new Date().toISOString(),
      workOrderId: order.id,
      systemId: order.systemId,
      workOrder: order,
      closeout: review || null,
      manifest,
      audioManifest,
      audioData,
      photoCount: manifest.length,
      totalBytes,
      warnOverBytes: EVIDENCE_LIMITS.BUNDLE_WARN_BYTES,
      data,
    },
    null,
    2,
  );
}

// All included/excluded originals belong to the handoff being confirmed.
export function evidenceRevision(photos = [], audio = []) {
  const records = [
    ...photos.map(p => ["photo",p.id,p.sha256,p.status === "excluded" ? "excluded" : "included"]),
    ...audio.map(c => ["audio",c.id,c.originalSha256 || c.sha256,c.wavSha256 || c.wav_sha256 || null]),
  ].sort((a,b) => `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`));
  return `media-${cyrb53(JSON.stringify(records))}`;
}

export const PHOTO_REVIEW_LIMITS={maxPhotos:3,maxBytes:1000000};
export function selectReviewPhotos(photos,selectedIds,jobId){
 const ids=[...selectedIds];
 if(ids.length>PHOTO_REVIEW_LIMITS.maxPhotos||new Set(ids).size!==ids.length)throw Error('Select at most three different job photos.');
 const selected=ids.map(id=>{const photo=photos.find(p=>p.id===id);
  if(!photo||photo.jobId!==jobId||photo.status==='excluded'||!photo.blob||(photo.derivedFrom&&!photos.some(p=>p.id===photo.derivedFrom&&p.jobId===jobId&&p.status!=='excluded'&&p.sha256===photo.sourceSha256)))throw Error('Selected photo is unavailable, excluded or belongs to another job.');
  return photo;});
 if(selected.reduce((n,p)=>n+p.blob.size,0)>PHOTO_REVIEW_LIMITS.maxBytes)throw Error('Selected originals exceed the 1 MB AI review limit. Choose fewer or smaller photos; originals remain saved.');
 return selected;
}
