import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PilotStore } from "./store.mjs";
import { demoOrder } from "../public/engine.js";

const owner = { companyId: "history-company-a", userId: "office-reader", role: "owner" };
const technician = { ...owner, userId: "retained-author", role: "technician" };
const wrongCompany = { companyId: "history-company-b", userId: "other-office", role: "owner" };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const input = {
  version: "carryforward.assignment.v2", externalId: "HISTORY-WO-100", sourceRevision: "1",
  assigneeUserIds: [technician.userId], customerRef: "fictional-customer",
  siteRef: "fictional-site", systemRef: "fictional-system", equipment: [], contextRefs: [],
  order: structuredClone(demoOrder),
};
function prepared(store, { retainAuthor = true } = {}) {
  const job = store.assign(owner, input, { key: "initial", memberCheck: () => true });
  const candidate = store.prepareCloseout(technician, job.id, {
    technician: "Fictional Shared Display Name",
    summary: "No repair performed; unverified work remains with Operations.",
    recordedAt: "2026-11-04T12:00:00Z", followupOwner: "Operations",
    promises: "Operations to follow up.", interviewRevision: 0, entries: {},
  }, 0);
  if (retainAuthor) store.db.prepare("INSERT OR IGNORE INTO report_actors VALUES(?,?,?,?)")
    .run(owner.companyId, job.id, candidate.revision, technician.userId);
  const operations = store.operations(owner.companyId);
  const operationJob = store.job(technician, job.id).op_job;
  operations.confirm(operationJob, {
    revision: candidate.revision, reportRevision: candidate.reportRevision,
    name: "Fictional Shared Display Name", confirmedAt: "2026-11-04T12:01:00Z",
  });
  operations.queue(operationJob, candidate.revision);
  operations.receipt(operationJob, candidate.revision);
  assert.equal(operations.accept(operationJob, candidate.revision).decision, "accepted_with_followups");
  return { job, candidate, operations, operationJob };
}
function storedArchive(store, job, revision) {
  return store.db.prepare("SELECT packet FROM report_history WHERE company=? AND job_id=? AND revision=?")
    .get(owner.companyId, job.id, revision).packet;
}
function revised(store, job) {
  return store.assign(owner, { ...input, sourceRevision: "2" }, {
    key: "refresh", expectedRevision: job.revision, memberCheck: () => true,
  });
}

test("raw assignment-refresh archives regain scoped authorship through read projection and restart without changing stored JSON or revision", () => {
  const directory = mkdtempSync(join(tmpdir(), "cf-raw-report-history-"));
  let store = new PilotStore({ directory });
  try {
    const { job, candidate, operations, operationJob } = prepared(store);
    const rawPacket = JSON.stringify(operations.closeout(operationJob));
    const rawDigest = hash(rawPacket);
    const current = store.closeout(technician, job.id);
    assert.equal(current.authenticatedAuthorship.authorUserId, technician.userId);
    assert.equal(current.authenticatedAuthorship.technicianConfirmed, true);
    revised(store, job); // This public path archives raw Operations JSON first.
    assert.equal(storedArchive(store, job, candidate.revision), rawPacket);
    assert.equal(JSON.parse(rawPacket).authenticatedAuthorship, undefined);
    for (const reader of [owner, technician]) {
      const history = store.reportHistory(reader, job.id);
      assert.equal(history.length, 1);
      assert.equal(history[0].revision, candidate.revision);
      assert.deepEqual(history[0].packet, current);
      const { authenticatedAuthorship, ...legacyPacket } = history[0].packet;
      assert.deepEqual(legacyPacket, JSON.parse(rawPacket));
      assert.equal(authenticatedAuthorship.authorUserId, technician.userId);
      assert.notEqual(authenticatedAuthorship.authorUserId, owner.userId);
    }
    assert.equal(hash(storedArchive(store, job, candidate.revision)), rawDigest);
    assert.throws(() => store.reportHistory(wrongCompany, job.id), /Unavailable/);
    store.close();
    store = new PilotStore({ directory });
    const restored = store.reportHistory(owner, job.id)[0];
    assert.deepEqual(restored.packet, current);
    assert.equal(restored.packet.confirmation.revision, candidate.revision);
    assert.equal(restored.packet.authenticatedAuthorship.packetRevision, candidate.revision);
    assert.equal(hash(storedArchive(store, job, candidate.revision)), rawDigest);
    assert.equal(store.db.prepare("SELECT user_id FROM report_actors WHERE company=? AND job_id=? AND revision=?")
      .get(owner.companyId, job.id, candidate.revision).user_id, technician.userId);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("already enriched confirmed archives keep the same response and exact stored JSON through assignment refresh", () => {
  const directory = mkdtempSync(join(tmpdir(), "cf-enriched-report-history-"));
  const store = new PilotStore({ directory });
  try {
    const { job, candidate } = prepared(store);
    const original = store.archive(technician, job.id);
    const stored = storedArchive(store, job, candidate.revision);
    revised(store, job);
    assert.deepEqual(store.reportHistory(owner, job.id)[0].packet, original);
    assert.equal(storedArchive(store, job, candidate.revision), stored);
    assert.equal(JSON.parse(stored).authenticatedAuthorship.authorUserId, technician.userId);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("missing exact author sidecar stays explicitly unknown; another company/job/revision or display name cannot supply it", () => {
  const directory = mkdtempSync(join(tmpdir(), "cf-unknown-report-author-"));
  const store = new PilotStore({ directory });
  try {
    const { job, candidate, operations, operationJob } = prepared(store, { retainAuthor: false });
    const insert = store.db.prepare("INSERT INTO report_actors VALUES(?,?,?,?)");
    insert.run(wrongCompany.companyId, job.id, candidate.revision, "wrong-company-author");
    insert.run(owner.companyId, "wrong-job", candidate.revision, "wrong-job-author");
    insert.run(owner.companyId, job.id, "wrong-revision", "wrong-revision-author");
    const raw = JSON.stringify(operations.closeout(operationJob));
    assert.equal(store.closeout(owner, job.id).authenticatedAuthorship.authorUserId, null);
    revised(store, job);
    const history = store.reportHistory(owner, job.id)[0];
    assert.equal(history.packet.authenticatedAuthorship.authorUserId, null);
    assert.equal(history.packet.authenticatedAuthorship.companyId, owner.companyId);
    assert.equal(history.packet.authenticatedAuthorship.technicianConfirmed, true);
    assert.equal(history.packet.confirmation.name, "Fictional Shared Display Name");
    assert.equal(storedArchive(store, job, candidate.revision), raw);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
