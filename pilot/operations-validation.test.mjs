import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { OperationsStore, OperationsValidationError } from "../lib/operations.mjs";
import { createPilotServer } from "./server.mjs";
import { demoOrder } from "../public/engine.js";
import { encodeMonoWav } from "../public/audio.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
async function fixture(t) {
  const reserve = createServer();
  await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const directory = await mkdtemp(join(tmpdir(), "cf-operations-validation-"));
  const app = await createPilotServer({ directory, port });
  await app.listen();
  t.after(async () => {
    app.server.closeAllConnections();
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  let cookie = "";
  async function request(path, input, extraHeaders = {}) {
    const response = await fetch(app.baseURL + path, {
      method: input === undefined ? "GET" : "POST",
      headers: {
        Origin: app.baseURL,
        "X-CarryForward-Intent": "pilot",
        Cookie: cookie,
        ...(input === undefined ? {} : { "Content-Type": "application/json" }),
        ...extraHeaders,
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    const bytes = Buffer.from(await response.arrayBuffer());
    const data = response.headers.get("Content-Type")?.includes("application/json")
      ? JSON.parse(bytes.toString("utf8")) : null;
    return { status: response.status, data, bytes };
  }
  const signup = await request("/api/auth/sign-up/email", {
    name: "Fictional Audio Validation Owner",
    email: "audio.validation@example.invalid",
    password: "fictional-audio-validation-password-12345",
  });
  assert.equal(signup.status, 200);
  const company = await request("/pilot/api/account/companies", {
    name: "Fictional Audio Validation Company",
  });
  assert.equal(company.status, 201);
  const principal = company.data.principal;
  const assignment = await request("/pilot/api/jobs", {
    version: "carryforward.assignment.v2",
    externalId: "FICTIONAL-AUDIO-VALIDATION-1",
    sourceRevision: "fixture-1",
    assigneeUserIds: [principal.userId],
    customerRef: "fictional-audio-customer",
    siteRef: "fictional-audio-site",
    systemRef: "fictional-audio-system",
    equipment: [],
    contextRefs: [],
    order: structuredClone(demoOrder),
  }, { "Idempotency-Key": "fictional-audio-assignment" });
  assert.equal(assignment.status, 201);
  return { app, principal, request, job: assignment.data };
}

test("Operations caller checks expose typed numeric validation errors rather than unexpected runtime errors", () => {
  const operations = new OperationsStore();
  try {
    assert.throws(() => operations.job("missing-fictional-job"), (error) => {
      assert.ok(error instanceof OperationsValidationError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "Unknown job");
      return true;
    });
  } finally {
    operations.close();
  }
});

test("actual HTTP duplicate audio identity returns a useful 4xx and preserves the saved original and WAV exactly", async (t) => {
  const { app, principal, request, job } = await fixture(t);
  function clip(amplitude) {
    const bytes = Buffer.from(encodeMonoWav([
      Float32Array.from({ length: 1600 }, (_, index) => Math.sin(index / 10) * amplitude),
    ], 16000));
    return {
      id: "fictional-immutable-audio",
      jobId: job.id,
      name: "Fictional audio validation recording",
      mime: "audio/wav",
      sha256: sha(bytes),
      dataBase64: bytes.toString("base64"),
      wavBase64: bytes.toString("base64"),
      wavSha256: sha(bytes),
    };
  }
  const original = clip(0.2);
  const admitted = await request(`/pilot/api/jobs/${job.id}/audio`, { clips: [original] });
  assert.equal(admitted.status, 200);
  const operations = app.store.operations(principal.companyId);
  const operationJob = app.store.job(principal, job.id).op_job;
  const before = operations.audio(operationJob, original.id);
  const previousStatus = operations.status(operationJob);
  const altered = clip(0.4);
  assert.notEqual(altered.sha256, original.sha256);
  const conflict = await request(`/pilot/api/jobs/${job.id}/audio`, { clips: [altered] });
  assert.equal(conflict.status, 400);
  assert.deepEqual(conflict.data, { error: "Voice identity conflict or wrong job" });
  const after = operations.audio(operationJob, original.id);
  assert.deepEqual(after, before);
  assert.equal(sha(after.bytes), original.sha256);
  assert.equal(sha(after.wav_bytes), original.wavSha256);
  assert.equal(operations.db.prepare("SELECT count(*) AS n FROM audio_evidence").get().n, 1);
  assert.deepEqual(operations.status(operationJob), previousStatus);
  const read = await request(`/pilot/api/jobs/${job.id}/audio/${original.id}`);
  assert.equal(read.status, 200);
  assert.equal(sha(read.bytes), original.sha256);
  assert.deepEqual(read.bytes, Buffer.from(original.dataBase64, "base64"));
  const replay = await request(`/pilot/api/jobs/${job.id}/audio`, { clips: [original] });
  assert.equal(replay.status, 200, "An exact retry remains idempotent.");
  assert.deepEqual(operations.audio(operationJob, original.id), before);
});
