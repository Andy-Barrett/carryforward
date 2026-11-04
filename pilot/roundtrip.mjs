import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { client } from "./demo.mjs";
import { evidenceRevision } from "../public/evidence.js";
export async function verifyDemoRoundtrips({ credentialsFile, output }) {
  const data = JSON.parse(await readFile(credentialsFile, "utf8")),
    results = [];
  for (const f of data.fixtures) {
    const tech = client(f.origin),
      office = client(f.origin);
    await tech.ok("/api/auth/sign-in/email", {
      method: "POST",
      body: { email: f.tech.email, password: f.tech.password },
    });
    await office.ok("/api/auth/sign-in/email", {
      method: "POST",
      body: { email: f.owner.email, password: f.owner.password },
    });
    const job = await tech.ok("/pilot/api/jobs/" + f.assignmentId),
      previous = (await tech.ok("/pilot/api/jobs/" + job.id + "/events"))
        .events;
    assert.equal(
      previous.length,
      0,
      "Roundtrip fixture must start with a fresh visit; never overwrite a saved event history",
    );
    const bytes = await readFile(
        new URL("../public/job-assets/display-example.jpg", import.meta.url),
      ),
      photo = {
        id: randomUUID(),
        jobId: job.id,
        name: "Fictional display fixture; timing unknown",
        mime: "image/jpeg",
        status: "included",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        dataBase64: bytes.toString("base64"),
      };
    await tech.ok(`/pilot/api/jobs/${job.id}/evidence`, {
      method: "POST",
      body: { photos: [photo] },
    });
    const turn1 = randomUUID(),
      turn2 = randomUUID();
    const events = [
      {
        type: "source.added",
        payload: { id: photo.id, kind: "photo", sha256: photo.sha256 },
      },
      {
        type: "turn.recorded",
        payload: {
          id: turn1,
          text: "Fictional visit: before work the display read 4.2 kW. No replacement performed. Monitoring reported live. Operations owns production verification and warranty update.",
        },
      },
      {
        type: "turn.recorded",
        payload: {
          id: turn2,
          text: "Correction: the pre-work display was 2.4 kW, not 4.2 kW.",
          amends: turn1,
        },
      },
      {
        type: "branches.owner-assigned",
        payload: { branchIds: ["production", "warranty"], owner: "Operations" },
      },
    ].map((e, i) => ({
      ...e,
      id: randomUUID(),
      jobId: job.id,
      seq: i + 1,
      at: new Date().toISOString(),
    }));
    await tech.ok(`/pilot/api/jobs/${job.id}/events`, {
      method: "POST",
      body: { events },
    });
    const report = {
      technician: f.tech.name,
      summary:
        "Fictional visit: pre-work reading corrected to 2.4 kW. No replacement. Monitoring reported live. Production verification and warranty update remain open with Operations.",
      recordedAt: new Date().toISOString(),
      followupOwner: "Operations",
      promises:
        "Operations to verify post-work production and send the warranty update.",
      interviewRevision: events.length,
      evidenceRevision: evidenceRevision([photo]),
      entries: {
        repair: {
          status: "observed",
          note: "Ground-level visual inspection only; no replacement performed.",
          reference: "Technician testimony",
          observedAt: new Date().toISOString(),
        },
        monitoring: {
          status: "observed",
          note: "Technician reported monitoring communicating; no independent telemetry.",
          reference: "Technician testimony",
          observedAt: new Date().toISOString(),
        },
        production: {
          status: "pending",
          note: "Post-work production remains unverified; photo timing unknown.",
        },
        warranty: {
          status: "pending",
          note: "Operations owes the customer a warranty update.",
        },
      },
    };
    const packet = await tech.ok(`/pilot/api/jobs/${job.id}/closeout`, {
      method: "POST",
      body: { report, eventRevision: events.length },
    });
    await tech.ok(`/pilot/api/jobs/${job.id}/confirmations`, {
      method: "POST",
      body: {
        revision: packet.revision,
        reportRevision: packet.reportRevision,
        name: f.tech.name,
        confirmedAt: new Date().toISOString(),
      },
    });
    await tech.ok(`/pilot/api/jobs/${job.id}/deliveries`, {
      method: "POST",
      body: { revision: packet.revision },
    });
    const inbox = await office.ok("/pilot/api/inbox");
    assert.equal(
      inbox.items.some((x) => x.id === job.id),
      true,
    );
    await office.ok(`/pilot/api/jobs/${job.id}/receipts`, {
      method: "POST",
      body: { revision: packet.revision },
    });
    const accepted = await office.ok(`/pilot/api/jobs/${job.id}/acceptances`, {
      method: "POST",
      body: { revision: packet.revision },
    });
    assert.equal(accepted.decision, "accepted_with_followups");
    const read = await tech.ok(`/pilot/api/jobs/${job.id}/closeout`);
    assert.equal(
      read.closeout.interview.turns.find((x) => x.id === turn2).amends,
      turn1,
    );
    assert.equal(read.evidence[0].sha256, photo.sha256);
    const original = await fetch(
      f.origin + `/pilot/api/jobs/${job.id}/evidence/${photo.id}`,
    );
    assert.equal(original.status, 401);
    const status = await tech.ok("/pilot/api/jobs/" + job.id);
    assert.equal(status.status.accepted, true);
    results.push({
      company: f.name,
      companyId: f.companyId,
      externalId: job.externalId,
      jobId: job.id,
      revision: packet.revision,
      reportRevision: packet.reportRevision,
      decision: accepted.decision,
      openCount: packet.closeout.openCount,
      photoSha256: photo.sha256,
      originalByteLength: bytes.length,
      correctionLinkRetained: true,
      authenticatedAuthorId: f.technicianId,
      realProviderCalls: 0,
    });
  }
  assert.equal(new Set(results.map((x) => x.externalId)).size, 1);
  assert.equal(new Set(results.map((x) => x.companyId)).size, 2);
  const receipt = {
    at: new Date().toISOString(),
    mode: "actual local HTTP; typed fictional testimony; no model/voice simulation presented as live inference",
    results,
  };
  if (output)
    await writeFile(output, JSON.stringify(receipt, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
  return receipt;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await verifyDemoRoundtrips({
    credentialsFile:
      process.argv[2] || ".local/company-pilot/demo-users.private.json",
    output:
      process.argv[3] ||
      ".local/company-pilot/two-company-roundtrip.private.json",
  });
  console.log(
    JSON.stringify({
      companies: result.results.length,
      accepted: result.results.map((x) => x.decision),
      openCounts: result.results.map((x) => x.openCount),
      realProviderCalls: 0,
    }),
  );
}
