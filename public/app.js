import {
  demoOrder,
  validateOrder,
  reviewReport,
  confirmReport,
  exportCloseout,
} from "./engine.js";
import {
  EVIDENCE_LIMITS,
  validatePhotoForJob,
  findDuplicatePhoto,
  linkEvidenceToEntry,
  unlinkEvidenceFromEntry,
  excludePhotoFromReport,
  confirmationToPersist,
  reportRevision,
  evidenceRevision,
  buildMediaBundle,
  formatBytes,
  hashBytes,
  newEvidenceId,
  newEventId,
} from "./evidence.js";
import * as jobStore from "./jobstore.js";
import { mountInterview, loadInterview } from "./interview.js";
import { mountOperations } from "./operations-client.js";
import { interviewHandoff } from "./investigation.js";

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let order = validateOrder(demoOrder),
  report = {
    technician: "",
    summary: "",
    promises: "",
    followupOwner: "",
    entries: {},
  },
  review = null,
  step = "briefing";
let storageMessage = "";
try {
  const saved = JSON.parse(
    localStorage.getItem("carryforward.field.v1") || "null",
  );
  if (saved) {
    const loadedOrder = validateOrder(saved.order);
    if (
      !saved.report ||
      typeof saved.report !== "object" ||
      Array.isArray(saved.report)
    )
      throw new Error("Invalid report");
    order = loadedOrder;
    report = saved.report;
  }
} catch {
  storageMessage =
    "Saved draft could not be loaded. The synthetic sample is shown.";
}
// Durable job-session state (Slice 1). Text drafts stay in localStorage
// exactly as before; photo blobs, the ordered event log, and the
// revision-bound confirmation live in IndexedDB and are always scoped
// to one work-order ID so jobs never mingle.
let db = null,
  storeReady = false,
  storeError = "";
let photos = [];
let jobSessions = [];
let sessionConfirmation = null;
let photoMsg = "";
let photoOperation = false;
let interviewPacket = null;
let renderGeneration = 0;
const thumbUrls = new Map();
function notify(s) {
  $("#message").textContent = s;
}
function save() {
  try {
    localStorage.setItem(
      "carryforward.field.v1",
      JSON.stringify({ order, report }),
    );
    return true;
  } catch {
    notify(
      "Browser storage unavailable. Keep this page open and export your report before leaving.",
    );
    return false;
  }
}
async function persistSession() {
  if (!db) return false;
  try {
    const snapshot = structuredClone({ order, report });
    const candidate = structuredClone(review?.confirmation || sessionConfirmation || null);
    const prev = await jobStore.getSession(db, snapshot.order.id);
    await jobStore.putSession(db, {
      jobId: snapshot.order.id,
      order: snapshot.order,
      report: snapshot.report,
      createdAt: prev?.createdAt || new Date().toISOString(),
      confirmation: confirmationToPersist(
        candidate,
        snapshot.report,
      ),
    });
    jobSessions = await jobStore.listSessions(db);
    return true;
  } catch (err) {
    notify(err?.message || String(err));
    return false;
  }
}
async function refreshJobData() {
  if (!db) return;
  photos = await jobStore.listPhotosByJob(db, order.id);
  jobSessions = await jobStore.listSessions(db);
  const sess = await jobStore.getSession(db, order.id);
  sessionConfirmation = sess?.confirmation || null;
  interviewPacket = interviewHandoff(await loadInterview(db, order));
  report.interviewRevision = interviewPacket.revision;
  report.evidenceRevision = evidenceRevision(photos, await jobStore.listAudioByJob(db,order.id));
  const alive = new Set(photos.map((p) => p.id));
  for (const [id, url] of thumbUrls) {
    if (!alive.has(id)) {
      URL.revokeObjectURL(url);
      thumbUrls.delete(id);
    }
  }
}
function thumbUrl(photo) {
  if (!photo.blob) return "";
  let url = thumbUrls.get(photo.id);
  if (!url) {
    url = URL.createObjectURL(photo.blob);
    thumbUrls.set(photo.id, url);
  }
  return url;
}
function download(name, text) {
  const u = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function eventQuiet(entry) {
  if (!db) return Promise.resolve(null);
  return jobStore
    .appendEvent(db, { id: newEventId(), jobId: order.id, ...entry })
    .catch((err) => { throw new Error(`Job event was not saved: ${err.message}. Retry before handoff.`); });
}
// Decodability check: the bytes must actually decode as an image.
// Temporary object URLs are revoked immediately after the check.
async function checkDecodable(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob);
      if (bmp.close) bmp.close();
      return true;
    } catch {
      // Fall through to the <img> decode check below.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("That file could not be decoded as an image."));
      img.src = url;
    });
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function admitFiles(fileList) {
  if (photoOperation) return;
  collect();
  if (!db) {
    photoMsg =
      storeError ||
      "Local photo storage is not ready yet. Your draft is unchanged.";
    render();
    return;
  }
  photoOperation = true;
  const files = [...(fileList || [])];
  for (const file of files) {
    try {
      validatePhotoForJob({
        mime: file.type,
        size: file.size,
        existingCount: photos.length,
      });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha256 = await hashBytes(bytes);
      const dup = findDuplicatePhoto(photos, sha256);
      if (dup) {
        photoMsg = `That photo is already saved as ${dup.id}. Kept the existing copy; nothing new was stored.`;
        continue;
      }
      await checkDecodable(file);
      const addedAt = new Date().toISOString();
      const record = {
        id: newEvidenceId(),
        jobId: order.id,
        name: file.name || "photo",
        mime: file.type,
        size: file.size,
        sha256,
        captureTime: null,
        fileModifiedTime: Number.isFinite(file.lastModified)
          ? new Date(file.lastModified).toISOString()
          : "unknown",
        addedAt,
        status: "admitted",
        blob: file,
      };
      // Atomic commit: the photo and its evidence.added event land in one
      // transaction, and the UI lists the photo only after it resolves.
      // A failure claims no save and preserves already saved evidence.
      await jobStore.savePhotoWithEvent(db, record, {
        id: newEventId(),
        type: "evidence.added",
        payload: {
          evidenceId: record.id,
          name: record.name,
          mime: record.mime,
          size: record.size,
          sha256,
        },
      });
      await refreshJobData();
      photoMsg = `Photo ${record.id} saved locally for ${order.id}.`;
    } catch (err) {
      photoMsg = err?.message || String(err);
      break;
    }
  }
  save();
  await persistSession();
  photoOperation = false;
  render();
}
async function setExcluded(photoId, excluded) {
  collect();
  try {
    if (excluded) {
      // Exclusion detaches the photo from every observation first, so the
      // report revision changes and any prior confirmation visibly stops
      // applying instead of silently resting on removed evidence.
      report = excludePhotoFromReport(report, photoId);
    }
    await jobStore.setPhotoStatus(db, photoId, excluded ? "excluded" : "admitted");
    await eventQuiet({
      type: excluded ? "evidence.excluded" : "evidence.restored",
      payload: { evidenceId: photoId },
    });
    await refreshJobData();
    photoMsg = excluded
      ? `Photo ${photoId} excluded and unlinked from observations. It stays saved but no longer supports them; confirm the new revision before handoff.`
      : `Photo ${photoId} restored as admitted evidence. Relink it to an observation if it should support one.`;
  } catch (err) {
    photoMsg = err?.message || String(err);
  }
  save();
  await persistSession();
  render();
}
async function linkPhoto(checkId, photoId) {
  collect();
  try {
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) throw new Error(`Photo ${photoId} is not saved for this job.`);
    report = linkEvidenceToEntry(report, checkId, photo, order.id);
    await eventQuiet({
      type: "evidence.linked",
      payload: { evidenceId: photoId, checkId },
    });
    photoMsg = `Photo ${photoId} linked to “${checkId}”.`;
  } catch (err) {
    photoMsg = err?.message || String(err);
  }
  save();
  await persistSession();
  render();
}
async function unlinkPhoto(checkId, photoId) {
  collect();
  report = unlinkEvidenceFromEntry(report, checkId, photoId);
  await eventQuiet({
    type: "evidence.unlinked",
    payload: { evidenceId: photoId, checkId },
  });
  photoMsg = `Photo ${photoId} unlinked from “${checkId}”. The photo stays saved.`;
  save();
  await persistSession();
  render();
}
function base64Encode(u8) {
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(s);
}
async function exportBundle() {
  try {
    const packed = [];
    for (const p of photos) {
      if (p.status === "excluded") {
        const { blob, ...meta } = p;
        packed.push(meta);
        continue;
      }
      if (!p.blob) {
        throw new Error(
          `Photo ${p.id} is admitted but its saved bytes are missing. ` +
            "Nothing was exported; keep this page open and retry.",
        );
      }
      const buf = new Uint8Array(await p.blob.arrayBuffer());
      if (buf.byteLength !== p.size || await hashBytes(buf) !== p.sha256) {
        throw new Error(`Photo ${p.id} failed its saved size/hash check. Nothing was exported.`);
      }
      const { blob, ...meta } = p;
      packed.push({ ...meta, dataBase64: base64Encode(buf) });
    }
    const audio = [];
    for (const clip of await jobStore.listAudioByJob(db,order.id)) {
      const bytes = new Uint8Array(await clip.blob.arrayBuffer());
      if (await hashBytes(bytes) !== clip.originalSha256) throw new Error(`Voice clip ${clip.id} failed its saved hash check.`);
      const wav = clip.wavBlob ? new Uint8Array(await clip.wavBlob.arrayBuffer()) : null;
      if (wav && await hashBytes(wav) !== clip.wavSha256) throw new Error(`Voice clip ${clip.id} transcription WAV failed its hash check.`);
      audio.push({id:clip.id,jobId:clip.jobId,name:clip.name,mime:clip.mime,sha256:clip.originalSha256,size:bytes.length,dataBase64:base64Encode(bytes),wavSha256:clip.wavSha256,wavSize:wav?.length||0,wavBase64:wav?base64Encode(wav):null,transcription:clip.transcription,interrupted:clip.interrupted});
    }
    const text = buildMediaBundle({ order, review, photos: packed, audio });
    if (
      text.length > EVIDENCE_LIMITS.BUNDLE_WARN_BYTES &&
      !window.confirm(
        `This media bundle is ${formatBytes(text.length)} ` +
          "(photos are embedded as text). Download it anyway?",
      )
    ) {
      notify("Media export cancelled. The lightweight closeout is unchanged.");
      return;
    }
    download(`${order.id}-media-bundle.json`, text);
    notify(
      `Media bundle exported: ${packed.length} photo(s), ${audio.length} voice clip(s), ` +
        `${formatBytes(text.length)}. Excluded photos are listed without bytes.`,
    );
  } catch (err) {
    notify(`Media export failed: ${err?.message || err}`);
  }
}
async function switchJob(jobId) {
  if (photoOperation) { notify("Wait for the current photo save before switching jobs."); return; }
  if (jobId === order.id) return;
  collect();
  save();
  await persistSession();
  try {
    const target = jobSessions.find((s) => s.jobId === jobId);
    if (!target) throw new Error(`Job ${jobId} is not saved on this device.`);
    order = validateOrder(target.order);
    report = target.report || {
      technician: "",
      summary: "",
      promises: "",
      followupOwner: "",
      entries: {},
    };
    review = null;
    photoMsg = "";
    await refreshJobData();
    save();
    notify(`Switched to ${order.id}. Each job keeps its own photos.`);
  } catch (err) {
    notify(err?.message || String(err));
  }
  render();
}
function collect() {
  const form = $("#field-form");
  if (!form) return;
  const d = new FormData(form);
  report = {
    technician: d.get("technician"),
    followupOwner: d.get("followupOwner"),
    summary: d.get("summary"),
    promises: d.get("promises"),
    recordedAt: new Date().toISOString(),
    interviewRevision: report.interviewRevision ?? null,
    evidenceRevision: report.evidenceRevision ?? null,
    entries: Object.fromEntries(
      order.checks.map((c, i) => [
        c.id,
        {
          status: d.get(`status-${i}`),
          observedAt: d.get(`time-${i}`),
          note: d.get(`note-${i}`),
          reference: d.get(`ref-${i}`),
          // Linked local photo IDs live outside the form fields, so they
          // are carried over; the free-text reference is never rewritten.
          evidenceIds: report.entries?.[c.id]?.evidenceIds || [],
        },
      ]),
    ),
  };
  review = null;
}
function photoSection() {
  const admitted = photos.filter((p) => p.status !== "excluded");
  const cards = photos
    .map((p) => {
      const url = thumbUrl(p);
      return `<article class="photo-card${p.status === "excluded" ? " excluded" : ""}">
        ${url ? `<img src="${url}" alt="Job photo ${esc(p.id)}" loading="lazy">` : `<div class="photo-missing">Preview unavailable</div>`}
        <div class="photo-meta"><strong>${esc(p.id)}</strong><span>${esc(p.name)} · ${esc(formatBytes(p.size))} · ${esc(p.mime)}</span>
        <span>Added ${esc(p.addedAt)}${p.fileModifiedTime && p.fileModifiedTime !== "unknown" ? ` · file stamp ${esc(p.fileModifiedTime)}` : ""}</span>
        <span class="pill">${p.status === "excluded" ? "Excluded" : "Saved locally"}</span></div>
        <button type="button" data-exclude="${esc(p.id)}">${p.status === "excluded" ? "Restore" : "Exclude"}</button>
      </article>`;
    })
    .join("");
  return `<fieldset><legend>Job photos · saved on this device</legend>
    <p>JPEG, PNG, or WebP, up to ${EVIDENCE_LIMITS.MAX_PHOTOS_PER_JOB} photos and ${formatBytes(EVIDENCE_LIMITS.MAX_PHOTO_BYTES)} each for job ${esc(order.id)}. Files stay on this device and are treated as untrusted uploads.</p>
    ${storeReady ? "" : `<p class="warn">${esc(storeError || "Photo storage is starting…")}</p>`}
    <div class="twocol">
      <label>Take photo (camera)<input type="file" data-camera accept="image/jpeg,image/png,image/webp" capture="environment"></label>
      <label>Upload image (fallback)<input type="file" data-upload accept="image/jpeg,image/png,image/webp" multiple></label>
    </div>
    ${photoMsg ? `<p role="status">${esc(photoMsg)}</p>` : ""}
    <p>${photos.length} of ${EVIDENCE_LIMITS.MAX_PHOTOS_PER_JOB} saved photo slots used (${admitted.length} included).</p>
    <div class="photogrid">${cards || "<p>No photos for this job yet.</p>"}</div>
  </fieldset>`;
}
function linkedRow(c) {
  const ids = report.entries?.[c.id]?.evidenceIds || [];
  const options = photos
    .filter((p) => p.status !== "excluded" && !ids.includes(p.id))
    .map((p) => `<option value="${esc(p.id)}">${esc(p.id)} · ${esc(p.name)}</option>`)
    .join("");
  return `<div class="linked"><span>Linked local photos: ${
    ids.length
      ? ids.map((id) => `${esc(id)} <button type="button" data-unlink="${esc(c.id)}:${esc(id)}">Unlink</button>`).join(" · ")
      : "none"
  }</span>
  ${options ? `<label>Link a saved photo<select data-link-for="${esc(c.id)}"><option value="">Choose…</option>${options}</select></label>` : ""}</div>`;
}
function jobListHtml() {
  if (!storeReady && !storeError) return "<p>Loading saved jobs…</p>";
  if (storeError) return `<p class="warn">${esc(storeError)}</p>`;
  if (!jobSessions.length) return "<p>No other saved jobs on this device.</p>";
  return `<ul class="jobs">${jobSessions
    .map(
      (s) =>
        `<li><strong>${esc(s.jobId)}</strong> · ${esc(s.order?.customer || "Unsaved draft")}${
          s.jobId === order.id
            ? " (current)"
            : ` <button type="button" data-switch="${esc(s.jobId)}">Switch</button>`
        }</li>`,
    )
    .join("")}</ul>`;
}
function render() {
  const generation = ++renderGeneration;
  document.querySelectorAll("[data-step]").forEach((b) => {
    b.classList.toggle("active", b.dataset.step === step);
    b.setAttribute("aria-current", b.dataset.step === step ? "step" : "false");
  });
  const heading = `<div class="sectionhead"><div><p class="eyebrow">${esc(order.id)} / ${esc(order.systemId)}</p><h2>${esc(order.customer)}</h2><p>${esc(order.property)}</p></div><span class="pill">${confirmationToPersist(review?.confirmation || sessionConfirmation,report) ? "Technician confirmed" : "Local draft"}</span></div>`;
  if (step === "briefing") {
    $("#view").innerHTML =
      `${heading}<div class="workspace"><section class="panel"><h2>The reported problem</h2><p>${esc(order.reportedIssue)}</p><h4>Assigned scope</h4><ul>${order.requestedWork.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><h4>Source history</h4>${order.history.map((h) => `<article class="source"><div>${esc(h.id)} / ${esc(h.date)}</div><blockquote>${esc(h.text)}</blockquote></article>`).join("")}<button id="begin" class="primary">Start visit interview →</button></section><aside><p class="eyebrow">COLLECT BEFORE YOU LEAVE</p><h2>Make the next step clear.</h2>${order.checks.map((c) => `<article class="source"><h4>${esc(c.label)}</h4><p>${esc(c.question)}</p></article>`).join("")}<h4>Jobs on this device</h4>${jobListHtml()}<label class="import">Import an exported work order (JSON)<input id="import" type="file" accept="application/json,.json"></label><p>Use the sample format. No live Operations access. Use synthetic records in this prototype. Importing keeps your other saved jobs.</p></aside></div>`;
    $("#begin").onclick = () => {
      step = "interview";
      render();
    };
    document.querySelectorAll("[data-switch]").forEach((b) => {
      b.onclick = () => switchJob(b.dataset.switch);
    });
    $("#import").onchange = async (e) => {
      if (photoOperation) { notify("Wait for the current photo save before importing another job."); return; }
      const f = e.target.files[0];
      if (!f) return;
      try {
        if (f.size > EVIDENCE_LIMITS.WORK_ORDER_IMPORT_BYTES)
          throw new Error("Work-order files must be under 100 KB.");
        const next = validateOrder(JSON.parse(await f.text()));
        if (
          !window.confirm(
            "Switch to this work order? Your other saved jobs stay on this device. Export any needed report first.",
          )
        )
          return;
        collect();
        save();
        await persistSession();
        if (db) {
          const existing = await jobStore.getSession(db, next.id);
          if (existing) {
            order = validateOrder(existing.order);
            report = existing.report;
          } else {
            order = next;
            report = {
              technician: "",
              summary: "",
              promises: "",
              followupOwner: "",
              entries: {},
            };
            await jobStore.putSession(db, {
              jobId: order.id,
              order,
              report,
              createdAt: new Date().toISOString(),
              confirmation: null,
            });
          }
          await refreshJobData();
        } else {
          order = next;
          report = {
            technician: "",
            summary: "",
            promises: "",
            followupOwner: "",
            entries: {},
          };
        }
        review = null;
        photoMsg = "";
        save();
        notify("Work order ready. Review its scope before starting.");
        render();
      } catch (err) {
        notify(`Import failed: ${err.message}`);
      }
    };
  } else if (step === "interview") {
    $("#view").innerHTML = `${heading}<div id="interview-root"><p>Loading this job's saved conversation…</p></div>`;
    const root = $("#interview-root");
    if (!db) { root.textContent = storeError || "Job storage is starting. Try again in a moment."; return; }
    const jobId = order.id;
    mountInterview(root, {
      db, order: structuredClone(order),
      onEvidenceSaved: async () => {
        if (order.id !== jobId) return;
        await refreshJobData();
        review=null;save();await persistSession();
        notify("Evidence saved. Review and confirm the current evidence before handoff.");
      },
      onSaved: packet => {
        if (order.id !== jobId) return;
        interviewPacket = packet;
        report.interviewRevision = packet.revision;
        review = null;
        save();
        persistSession();
        if (step !== "interview") render();
      },
      onUse: packet => {
        if (order.id !== jobId) return;
        interviewPacket = packet;
        report.summary = packet.turns.filter(t => !t.supersededBy).map(t => t.text).join("\n\n").slice(0, 4000);
        report.recordedAt = new Date().toISOString();
        const owners = [...new Set(packet.branches.filter(b => b.state !== "supported" && b.owner).map(b => b.owner))];
        if (!report.followupOwner && owners.length === 1) report.followupOwner = owners[0];
        review = null;
        save();
        persistSession();
        step = "capture";
        notify("Conversation copied to the visit notes. Check the observations and remaining work before confirming.");
        render();
      },
    }).catch(err => { if (generation === renderGeneration) root.textContent = `Conversation could not load: ${err.message}`; });
  } else if (step === "capture") {
    $("#view").innerHTML =
      `${heading}<form id="field-form" class="panel"><p class="eyebrow">YOUR VISIT RECORD</p><h2>What happened on site?</h2><div class="twocol"><label>Technician name<input name="technician" required maxlength="200" value="${esc(report.technician)}"></label><label>Follow-up owner<input name="followupOwner" maxlength="200" value="${esc(report.followupOwner)}" placeholder="Who takes the next action?"></label></div><label>Findings and work performed<textarea name="summary" required maxlength="4000" rows="4" placeholder="Separate what you observed from what you suspect…">${esc(report.summary)}</textarea></label>${order.checks
        .map((c, i) => {
          const e = report.entries?.[c.id] || {};
          return `<fieldset><legend>${esc(c.label)}</legend><p>${esc(c.question)}</p><div class="twocol"><label>Result<select name="status-${i}">${[
            ["unverified", "Not verified"],
            ["observed", "Observed / evidence recorded"],
            ["pending", "Pending work"],
            ["not_applicable", "Not applicable — explain"],
          ]
            .map(
              ([v, l]) =>
                `<option value="${v}" ${(e.status || "unverified") === v ? "selected" : ""}>${l}</option>`,
            )
            .join(
              "",
            )}</select></label><label>Observation time<input type="datetime-local" name="time-${i}" value="${esc(e.observedAt)}"></label></div><label>Observation or explanation<textarea rows="2" name="note-${i}" maxlength="4000">${esc(e.note)}</textarea></label><label>Evidence reference<input name="ref-${i}" maxlength="500" value="${esc(e.reference)}" placeholder="Photo filename, meter reading record, or work-note ID"></label>${linkedRow(c)}</fieldset>`;
        })
        .join(
          "",
        )}<label>Promises made to the customer / remaining actions<textarea name="promises" maxlength="4000" rows="3">${esc(report.promises)}</textarea></label>${photoSection()}<p>Files are treated as untrusted uploads. A photo counts as saved only after it shows “Saved locally”.</p><button class="primary">Review closeout →</button><button type="button" id="save">Save draft</button></form>`;
    $("#field-form").oninput = () => {
      collect();
      save();
    };
    $("#save").onclick = async () => {
      collect();
      if (save() && await persistSession()) notify("Field draft saved in this browser.");
    };
    const camera = document.querySelector('[data-camera]');
    const upload = document.querySelector('[data-upload]');
    if (camera) {
      camera.onchange = async (e) => {
        await admitFiles(e.target.files);
        e.target.value = "";
      };
    }
    if (upload) {
      upload.onchange = async (e) => {
        await admitFiles(e.target.files);
        e.target.value = "";
      };
    }
    document.querySelectorAll("[data-exclude]").forEach((b) => {
      b.onclick = () =>
        setExcluded(b.dataset.exclude, b.textContent.trim() === "Exclude");
    });
    document.querySelectorAll("[data-link-for]").forEach((sel) => {
      sel.onchange = () => {
        if (sel.value) linkPhoto(sel.dataset.linkFor, sel.value);
      };
    });
    document.querySelectorAll("[data-unlink]").forEach((b) => {
      b.onclick = () => {
        const [checkId, photoId] = b.dataset.unlink.split(":");
        unlinkPhoto(checkId, photoId).catch(err => notify(err.message));
      };
    });
    $("#field-form").onsubmit = (e) => {
      e.preventDefault();
      try {
        collect();
        review = reviewReport(order, report, interviewPacket?.jobId === order.id ? interviewPacket : null);
        save();
        step = "review";
        notify(
          "Review generated. Open questions remain visible in the handoff.",
        );
        render();
      } catch (err) {
        notify(err.message);
      }
    };
  } else {
    if (!review) {
      try {
        review = reviewReport(order, report, interviewPacket?.jobId === order.id ? interviewPacket : null);
      } catch {
        step = "capture";
        notify("Complete the technician name and visit summary before review.");
        render();
        return;
      }
    }
    if (interviewPacket?.jobId === order.id) {
      review.interview = interviewPacket;
      if (interviewPacket.interpretations.length) review.reviewMode = "Deterministic completeness review with source-linked Meta interpretations attached; technician review required";
    }
    const rev = reportRevision(report);
    let conf = review.confirmation || null;
    let stale = null;
    if (!conf && sessionConfirmation) {
      if (sessionConfirmation.reportRevision === rev) {
        review.confirmation = sessionConfirmation;
        conf = review.confirmation;
      } else {
        stale = sessionConfirmation;
      }
    } else if (conf && conf.reportRevision !== rev) {
      stale = conf;
      conf = null;
    }
    const confBanner = stale
      ? `<p class="warn">This report changed after ${esc(stale.name || "the technician")} confirmed it — that confirmation no longer applies. Review the changes and confirm the new revision.</p>`
      : "";
    $("#view").innerHTML =
      `${heading}${confBanner}<div class="stats"><div><strong>${review.findings.filter((f) => ["documented", "reported"].includes(f.outcome)).length}</strong>Recorded claims and observations</div><div><strong>${review.openCount}</strong>Checks needing follow-up</div><div><strong>${review.findings.filter((f) => f.outcome === "exception").length}</strong>Exceptions for Operations</div></div><div class="workspace"><section class="panel"><h2>Evidence completeness review</h2><p>${esc(review.reviewMode)}</p>${review.findings.map((f) => {
        const ids = report.entries?.[f.id]?.evidenceIds || [];
        const branch = interviewPacket?.jobId === order.id ? interviewPacket.branches.find(b => b.id === f.id) : null;
        const interviewContext = branch ? `<p>Interview: ${esc(branch.state)}${branch.owner ? ` · Owner: ${esc(branch.owner)}` : ""}. ${esc(branch.reason)}</p>` : "";
        return `<article class="source ${f.outcome === "open" ? "gap" : ""}"><div>${esc(f.outcome.toUpperCase())} / ${esc(f.id)}</div><h3>${esc(f.label)}</h3><p>${esc(f.note || "No observation supplied.")}</p>${f.reference ? `<p>Reference: ${esc(f.reference)}<br>Observed: ${esc(f.observedAt || "Not supplied")}</p>` : ""}${ids.length ? `<p>Local photos: ${ids.map((id) => esc(id)).join(", ")}</p>` : ""}<p>${esc(f.reason || f.question)}</p>${interviewContext}</article>`;
      }).join("")}<button id="edit">Return to field report</button></section><aside><p class="eyebrow">HANDOFF TO OPERATIONS</p><h2>${review.openCount ? "Keep the gaps visible." : "Ready for human review."}</h2><p><strong>Technician:</strong> ${esc(review.technician)}</p><p>${esc(review.summary)}</p><h4>Customer commitments</h4><p>${esc(review.promises || "No new promises recorded; confirm this with the technician.")}</p><h4>Follow-up owner</h4><p>${esc(review.followupOwner || "Not assigned")}${review.needsOwner ? " — assign an owner for open work or commitments." : ""}</p><p>Technician confirmation preserves open items. It does not mark the Operations work order complete.${conf ? ` Confirmed revision ${esc(conf.reportRevision)}.` : ""}</p><button id="confirm" class="primary" ${conf ? "disabled" : ""}>${conf ? "Technician confirmed" : "Confirm as " + esc(review.technician)}</button><button id="export">Download closeout JSON ↓</button><button id="bundle">Download media bundle ↓</button><p>These downloads send nothing to Operations. Use the local simulator below for API delivery. The media bundle embeds this job's saved photos and voice originals with a manifest and hashes.</p></aside></div>`;
    $("#edit").onclick = () => {
      step = "capture";
      render();
    };
    $("#confirm").onclick = async () => {
      review = confirmReport(review, report.technician);
      review.confirmation.reportRevision = reportRevision(report);
      sessionConfirmation = review.confirmation;
      try {
        await eventQuiet({
          type: "report.confirmed",
          payload: { reportRevision: review.confirmation.reportRevision },
        });
      } catch (err) {
        review.confirmation = null;
        sessionConfirmation = null;
        notify(err.message);
        render();
        return;
      }
      save();
      await persistSession();
      notify(
        "Technician confirmed. Operations acceptance remains pending. Download the closeout to retain this confirmation.",
      );
      render();
    };
    $("#export").onclick = () =>
      download(`${order.id}-closeout.json`, exportCloseout(order, review));
    $("#bundle").onclick = () => exportBundle();
  }
}
document.querySelectorAll("[data-step]").forEach(
  (b) =>
    (b.onclick = () => {
      step = b.dataset.step;
      render();
    }),
);
$("#sample").onclick = () =>
  download(
    "carryforward-work-order.sample.json",
    JSON.stringify(demoOrder, null, 2),
  );
async function initStore() {
  try {
    db = await jobStore.openDb();
    storeReady = true;
    const prev = await jobStore.getSession(db, order.id);
    if (!prev) {
      await jobStore.putSession(db, {
        jobId: order.id,
        order,
        report,
        createdAt: new Date().toISOString(),
        confirmation: null,
      });
    }
    await refreshJobData();
  } catch (err) {
    storeError = err?.message || String(err);
  }
  render();
}
render();
initStore();
if (storageMessage) notify(storageMessage);

// Refresh the local session when an offline shell outlives a server restart.
await fetch("/api/config",{signal:AbortSignal.timeout(5000)}).catch(()=>null);
mountOperations($("#operations-root"), {
  getContext: async (requireConfirmation) => {
    collect();
    const snapshot = structuredClone({order,report});
    if (!requireConfirmation) return snapshot;
    if (!db) throw new Error("Local job storage must be available before API delivery.");
    const state = await loadInterview(db,snapshot.order);
    snapshot.report.interviewRevision = state.seq;
    const confirmation = confirmationToPersist(review?.confirmation || sessionConfirmation, snapshot.report);
    if (!confirmation) throw new Error("The current report has not been confirmed, or changed after confirmation.");
    return {...snapshot,confirmation,events:state.events,photos:await jobStore.listPhotosByJob(db,snapshot.order.id),audio:await jobStore.listAudioByJob(db,snapshot.order.id)};
  },
  onDecision: message => notify(message),
  onAssignment: async (assigned) => {
    if (assigned.order.id !== order.id) throw new Error("Received assignment does not match the current job.");
    await persistSession();
    notify(`Assignment ${assigned.externalId} admitted by the local Operations API.`);
  },
});
