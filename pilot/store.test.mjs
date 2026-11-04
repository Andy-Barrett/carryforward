import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PilotStore } from "./store.mjs";
import { demoOrder } from "../public/engine.js";
const a = { companyId: "company-a", userId: "owner-a", role: "owner" },
  b = { companyId: "company-b", userId: "owner-b", role: "owner" };
const input = {
  version: "carryforward.assignment.v2",
  externalId: "WO-100",
  sourceRevision: "1",
  assigneeUserIds: ["tech"],
  customerRef: "customer",
  siteRef: "site",
  systemRef: "system",
  equipment: [],
  contextRefs: [],
  order: demoOrder,
};
function fixture(fn) {
  const d = mkdtempSync(join(tmpdir(), "cf-pilot-store-")),
    s = new PilotStore({ directory: d });
  try {
    return fn(s);
  } finally {
    s.close();
    rmSync(d, { recursive: true, force: true });
  }
}
test("same external identity coexists by company/integration; retry conflict and forged identity fail", () =>
  fixture((s) => {
    const ia = s.issueIntegration(a, "dispatch"),
      ib = s.issueIntegration(b, "dispatch"),
      pa = s.integration(ia.token),
      pb = s.integration(ib.token),
      opts = { key: "one", memberCheck: () => true };
    const ja = s.assign(pa, input, opts),
      jb = s.assign(pb, input, opts);
    assert.notEqual(ja.id, jb.id);
    assert.equal(s.assign(pa, input, opts).id, ja.id);
    assert.equal(s.assign(pa, input, { ...opts, key: "two" }).id, ja.id);
    assert.throws(
      () => s.assign(pa, { ...input, sourceRevision: "2" }, opts),
      /conflicts/,
    );
    assert.throws(
      () =>
        s.assign(
          pa,
          { ...input, companyId: b.companyId },
          { ...opts, key: "forged" },
        ),
      /authentication/,
    );
    assert.throws(() => s.job(pb, ja.id), /Unavailable/);
    s.revokeIntegration(a, ia.id);
    assert.equal(s.integration(ia.token), null);
  }));
test("assigned technicians only and revisions invalidate confirmation while retaining archived report", () =>
  fixture((s) => {
    const job = s.assign(a, input, { key: "first", memberCheck: () => true }),
      tech = { ...a, role: "technician", userId: "tech" },
      unassigned = { ...tech, userId: "other" };
    assert.equal(s.job(tech, job.id).id, job.id);
    assert.throws(() => s.job(unassigned, job.id), /Unavailable/);
    assert.throws(
      () => s.assign(tech, input, { key: "tech", memberCheck: () => true }),
      /Dispatcher/,
    );
    const next = { ...input, sourceRevision: "2" };
    assert.throws(
      () => s.assign(a, next, { key: "update", memberCheck: () => true }),
      /If-Match/,
    );
    const revised = s.assign(a, next, {
      key: "update",
      expectedRevision: job.revision,
      memberCheck: () => true,
    });
    assert.notEqual(revised.revision, job.revision);
    assert.equal(revised.id, job.id);
    assert.equal(revised.status.technicianConfirmed, false);
  }));
test("cache keys distinct per company/user, durable but not leaked in job responses", () =>
  fixture((s) => {
    const ka = s.cacheKey(a);
    assert.equal(ka, s.cacheKey(a));
    assert.notEqual(ka, s.cacheKey(b));
    assert.notEqual(ka, s.cacheKey({ ...a, userId: "someone-else" }));
    assert.equal(JSON.stringify(s.list(a)).includes(ka), false);
  }));
test("explicit form owner is appended to each unresolved branch atomically with the exact candidate; failure rolls back", () =>
  fixture((s) => {
    const job = s.assign(a, input, {
        key: "owner-form",
        memberCheck: () => true,
      }),
      tech = { ...a, role: "technician", userId: "tech" },
      report = {
        technician: "Fictional technician",
        summary:
          "No repair was performed. Operations owns the unverified checks.",
        recordedAt: new Date().toISOString(),
        followupOwner: "Operations",
        promises: "Operations to follow up.",
        interviewRevision: 0,
        entries: {},
      };
    const packet = s.prepareCloseout(tech, job.id, report, 0);
    assert.equal(packet.closeout.openCount, 4);
    assert(
      packet.closeout.findings.every((f) => f.followupOwner === "Operations"),
    );
    assert(
      packet.closeout.interview.branches.every((b) => b.owner === "Operations"),
    );
    assert.equal(packet.eventRevision, 1);
    assert.equal(
      s.operations(a.companyId).job(s.job(tech, job.id).op_job).events[0].type,
      "branches.owner-assigned",
    );
    const bad = s.assign(
      a,
      { ...input, externalId: "WO-BAD" },
      { key: "owner-rollback", memberCheck: () => true },
    );
    assert.throws(
      () =>
        s.prepareCloseout(
          tech,
          bad.id,
          { ...report, evidenceRevision: "wrong" },
          0,
        ),
      /evidence/,
    );
    const retained = s.operations(a.companyId).job(s.job(tech, bad.id).op_job);
    assert.equal(retained.events.length, 0);
    assert.equal(retained.candidate, null);
  }));

test("form preparation retains existing branch owners and rejects a stale report revision before adding any events", () =>
  fixture((s) => {
    const job = s.assign(a, input, {
        key: "owner-preserve",
        memberCheck: () => true,
      }),
      tech = { ...a, role: "technician", userId: "tech" },
      ops = s.operations(a.companyId),
      op = s.job(tech, job.id).op_job;
    const events = [
      {
        id: "e1",
        jobId: job.id,
        seq: 1,
        type: "branches.owner-assigned",
        payload: { branchIds: ["production"], owner: "Alice" },
      },
      {
        id: "e2",
        jobId: job.id,
        seq: 2,
        type: "branches.owner-assigned",
        payload: { branchIds: ["warranty"], owner: "Bob" },
      },
    ];
    ops.syncEvents(op, events);
    const report = {
      technician: "Tech",
      summary: "Existing obligations stay owned.",
      recordedAt: new Date().toISOString(),
      followupOwner: "Operations",
      interviewRevision: 0,
      entries: {},
    };
    assert.throws(
      () => s.prepareCloseout(tech, job.id, report, 2),
      /interview revision/,
    );
    assert.equal(ops.job(op).events.length, 2);
    const packet = s.prepareCloseout(
        tech,
        job.id,
        { ...report, interviewRevision: 2 },
        2,
      ),
      owners = Object.fromEntries(
        packet.closeout.interview.branches.map((b) => [b.id, b.owner]),
      );
    assert.equal(owners.production, "Alice");
    assert.equal(owners.warranty, "Bob");
    assert.equal(owners.repair, "Operations");
    assert.equal(owners.monitoring, "Operations");
  }));
