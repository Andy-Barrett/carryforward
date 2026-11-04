import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createPilotServer } from "./server.mjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export async function verifyRetainedPilot({
  directory,
  credentialsFile,
  acceptedReceiptFile,
  port = 4432,
  output,
}) {
  const origin = "http://127.0.0.1:" + port,
    app = await createPilotServer({ directory, port, baseURL: origin });
  await app.listen();
  const fixtures = JSON.parse(await readFile(credentialsFile, "utf8")).fixtures,
    accepted = JSON.parse(await readFile(acceptedReceiptFile, "utf8")).results,
    results = [];
  function session() {
    const cookies = new Map();
    return async (path, { body, method = body ? "POST" : "GET" } = {}) => {
      const r = await fetch(origin + path, {
        method,
        headers: {
          Origin: origin,
          "X-CarryForward-Intent": "pilot",
          Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      for (const c of r.headers.getSetCookie()) {
        const [k, v] = c.split(";")[0].split("=");
        v ? cookies.set(k, v) : cookies.delete(k);
      }
      if (!r.ok) return { status: r.status };
      return {
        status: r.status,
        ...(/^application\/json/.test(r.headers.get("content-type") || "")
          ? { value: await r.json() }
          : { bytes: Buffer.from(await r.arrayBuffer()) }),
      };
    };
  }
  try {
    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i],
        request = session();
      assert.equal(
        (
          await request("/api/auth/sign-in/email", {
            body: { email: f.tech.email, password: f.tech.password },
          })
        ).status,
        200,
      );
      const account = (await request("/pilot/api/account")).value;
      assert.equal(account.principal.companyId, f.companyId);
      assert.equal(account.principal.userId, f.technicianId);
      assert.equal(account.memberships.length, 1);
      const job = (await request("/pilot/api/jobs/" + f.assignmentId)).value;
      assert.equal(job.status.decision, "accepted_with_followups");
      const report = (
          await request("/pilot/api/jobs/" + f.assignmentId + "/closeout")
        ).value,
        expected = accepted.find((x) => x.companyId === f.companyId);
      assert.equal(report.revision, expected.revision);
      assert.equal(report.reportRevision, expected.reportRevision);
      assert.equal(report.closeout.openCount, 2);
      assert.equal(report.authenticatedAuthorship.authorUserId, f.technicianId);
      assert(report.closeout.summary.includes("2.4"));
      const correction = report.closeout.interview.turns.find((x) => x.amends);
      assert(correction);
      assert(
        report.closeout.interview.turns.some((x) => x.id === correction.amends),
      );
      const photo = report.evidence[0],
        original = await request(
          `/pilot/api/jobs/${f.assignmentId}/evidence/${photo.id}`,
        );
      assert.equal(
        createHash("sha256").update(original.bytes).digest("hex"),
        expected.photoSha256,
      );
      const manual = await request(
        `/pilot/api/jobs/${f.assignmentId}/references/${f.documentVersionId}/original`,
      );
      assert.equal(manual.status, 200);
      const meta = app.library.read(f.companyId, f.documentVersionId);
      assert.equal(
        createHash("sha256").update(manual.bytes).digest("hex"),
        meta.sha256,
      );
      assert.equal(
        (await request("/pilot/api/jobs/" + fixtures[1 - i].assignmentId))
          .status,
        404,
      );
      results.push({
        companyId: f.companyId,
        assignmentId: f.assignmentId,
        reportRevision: report.revision,
        openCount: 2,
        originalPhotoHash: expected.photoSha256,
        manualHash: meta.sha256,
        sourceLinkedCorrection: true,
        oppositeCompanyDenied: true,
        authenticatedAuthorPreserved: true,
      });
    }
    const receipt = {
      at: new Date().toISOString(),
      kind: "actual restored local HTTP readback",
      directory,
      results,
      realProviderCalls: 0,
    };
    if (output)
      await writeFile(output, JSON.stringify(receipt, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
    return receipt;
  } finally {
    await app.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const receipt = await verifyRetainedPilot({
    directory: resolve(process.argv[2]),
    credentialsFile: process.argv[3],
    acceptedReceiptFile: process.argv[4],
    output: process.argv[5],
  });
  console.log(
    JSON.stringify({
      companies: receipt.results.length,
      passed: true,
      realProviderCalls: 0,
    }),
  );
}
