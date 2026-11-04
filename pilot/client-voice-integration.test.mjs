import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createPilotServer } from "./server.mjs";
import { createPilotProviders } from "./providers.mjs";
import { prepareVoiceClip } from "./public/voice-clip.js";
import { createPilotVoiceTurn } from "./public/voice-turn.js";
import { createReplySpeaker } from "../public/reply-speech.js";
import { createTurnTiming } from "../public/turn-timing.js";
import { encodeMonoWav } from "../public/audio.js";
import { evidenceRevision } from "../public/evidence.js";
import { demoOrder } from "../public/engine.js";
const sha = (x) => createHash("sha256").update(x).digest("hex");
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "cf-client-voice-")),
    reserve = http.createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const paths = {
    metaGuardTokenFile: join(directory, "fixture-guard-token"),
    metaGuardLedger: join(directory, "fixture-meta-ledger.json"),
    elevenKeyFile: join(directory, "fixture-speech-key"),
    elevenLedger: join(directory, "fixture-speech-ledger.json"),
  };
  for (const [path, value] of [
    [paths.metaGuardTokenFile, "fictional-test-token"],
    [paths.elevenKeyFile, "fictional-test-key"],
    [
      paths.metaGuardLedger,
      JSON.stringify({ capUsd: 10, reservedUsd: 0, requests: [] }),
    ],
    [
      paths.elevenLedger,
      JSON.stringify({
        version: 1,
        characterCap: 6000,
        requestCap: 60,
        reservedCharacters: 0,
        requests: [],
      }),
    ],
  ])
    await writeFile(path, value, { mode: 0o600 });
  const config = { enabled: true, ...paths, companies: {} },
    transport = { asr: 0, speech: 0, delay: null },
    pendingRequests = new Set();
  let app;
  app = await createPilotServer({
    directory: join(directory, "runtime"),
    port,
    baseURL: origin,
    providerConfig: config,
    providerFactory: (options) =>
      createPilotProviders({
        ...options,
        fetchImpl: async (url, options) => {
          assert(
            url.endsWith("/v1/asr/transcribe"),
            "Only mocked ASR is permitted by this test transport",
          );
          transport.asr++;
          const request = JSON.parse(options.body);
          assert(
            [...app.store.stores.values()].some((ops) =>
              ops.db
                .prepare("SELECT id FROM audio_evidence WHERE wav_sha256=?")
                .get(request.sha256),
            ),
            "Original and WAV must be admitted before ASR",
          );
          if (transport.delay) await transport.delay();
          return new Response(
            JSON.stringify({
              transcript: "Where is communication status?",
              audioDurationMs: 200,
              sessionId: "fixture-asr",
            }),
          );
        },
        speechImpl: {
          async stream({ onStart, onChunk, signal }) {
            transport.speech++;
            await onStart({ model: "fixture-pcm", sampleRate: 24000 });
            for (const frame of [
              Buffer.from([1, 0, 2, 0]),
              Buffer.from([3, 0]),
            ]) {
              signal.throwIfAborted();
              await onChunk(frame);
            }
            return { bytes: 6 };
          },
        },
      }),
  });
  await app.listen();
  t.after(async () => {
    // cancel/dispose intentionally dispatches a best-effort HTTP cancellation.
    // Drain it before closing auth storage; do not turn teardown into a race.
    await Promise.allSettled([...pendingRequests]);
    app.server.closeAllConnections();
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const cookies = new Map(),
    calls = [];
  async function fetchSession(path, options = {}) {
    calls.push(path);
    const response = await fetch(origin + path, {
      ...options,
      headers: {
        Origin: origin,
        "X-CarryForward-Intent": "pilot",
        Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
        ...options.headers,
      },
    });
    for (const c of response.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      v ? cookies.set(k, v) : cookies.delete(k);
    }
    return response;
  }
  function api(...args) {
    const pending = performApi(...args);
    pendingRequests.add(pending);
    pending.finally(() => pendingRequests.delete(pending)).catch(() => {});
    return pending;
  }
  async function performApi(path, body, method = body ? "POST" : "GET") {
    const response = await fetchSession(path, {
        method,
        ...(body
          ? {
              headers: {
                "Content-Type": "application/json",
                ...(path === "/pilot/api/jobs"
                  ? { "Idempotency-Key": randomUUID() }
                  : {}),
              },
              body: JSON.stringify(body),
            }
          : {}),
      }),
      value = await response.json();
    if (!response.ok)
      throw Error(`${response.status}: ${value.error || value.message}`);
    return value;
  }
  const user = await api("/api/auth/sign-up/email", {
      name: "Fictional voice owner",
      email: "voice-client@example.invalid",
      password: "fictional-voice-client-password-12345",
    }),
    { principal } = await api("/pilot/api/account/companies", {
      name: "Fictional client voice company",
    });
  config.companies[principal.companyId] = {
    approvalId: "mocked-test-only",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    fictionalInferenceApproved: true,
    providers: { metaAsr: true, metaAnswers: false, elevenSpeech: true },
  };
  let doc = await api("/pilot/api/documents", {
    title: "Fictional status reference",
    issuer: "Fictional test company",
    revision: "DEMO-1",
    mime: "text/plain",
    dataBase64: Buffer.from(
      "Communication status\nThe read-only communication status is in the Status view.",
    ).toString("base64"),
    applicability: { kind: "job_reference" },
  });
  await api(`/pilot/api/documents/${doc.versionId}/approve`, {});
  const job = await api("/pilot/api/jobs", {
    version: "carryforward.assignment.v2",
    externalId: "WO-CLIENT-VOICE",
    sourceRevision: "1",
    assigneeUserIds: [user.user.id],
    customerRef: "fictional-customer",
    siteRef: "fictional-site",
    systemRef: "fictional-system",
    equipment: [],
    contextRefs: [{ documentId: doc.documentId, versionId: doc.versionId }],
    order: {
      ...demoOrder,
      customer: "Fictional voice test",
      customerContact: undefined,
      history: [],
      briefing: {},
    },
  });
  return { app, api, fetchSession, calls, job, principal, transport };
}
function clip(jobId) {
  return prepareVoiceClip(
    jobId,
    encodeMonoWav(
      [Float32Array.from({ length: 3200 }, (_, i) => Math.sin(i / 12) / 3)],
      16000,
    ),
    { name: "Fictional client integration clip" },
  );
}
function controller(f) {
  const traces = [],
    frames = [],
    originals = new Map(),
    page = new EventTarget();
  page.visibilityState = "visible";
  let config = {};
  const speaker = createReplySpeaker({
    jobId: f.job.id,
    getConfig: () => config,
    local: {
      stop() {},
      speak() {
        throw Error("Unexpected fallback in mocked PCM integration");
      },
    },
    page,
    windowTarget: new EventTarget(),
    fetchImpl: (_path, options) =>
      f.fetchSession(`/pilot/api/jobs/${f.job.id}/voice/speech`, {
        ...options,
        headers: { ...options.headers, "X-CarryForward-Intent": "pilot" },
      }),
    makeSink: ({ onStart }) => ({
      async push(bytes) {
        onStart();
        frames.push(Buffer.from(bytes));
      },
      async finish() {},
      stop() {},
    }),
  });
  const turn = createPilotVoiceTurn({
    createTiming: createTurnTiming,
    ensure: () => {},
    request: (action, body) =>
      f.api(`/pilot/api/jobs/${f.job.id}/${action}`, body),
    saveTrace: async (value) => traces.push(value),
    applyAnswer: async (answer) => assert.equal(answer.reportSaved, false),
    showHeard: () => {},
    showAnswer: () => {},
    stopSpeech: () => speaker.stop(),
    speak: async (text, options) => {
      config = options.config;
      await speaker.speak(text, options);
    },
  });
  return { turn, traces, frames, originals, speaker };
}
test("actual client clip/controller → signed HTTP → saved WAV → mocked ASR → source answer → one-use PCM → later sync and exact media confirmation", async (t) => {
  const f = await fixture(t),
    c = controller(f),
    audio = await clip(f.job.id);
  c.originals.set(audio.id, structuredClone(audio));
  const timing = createTurnTiming({ release: performance.now() - 30 });
  timing.mark("localSaved");
  const localSavePoint = timing.snapshot().points.localSaved;
  const result = await c.turn.complete(audio, { timing });
  assert.equal(result.intent, "question");
  assert.equal(f.transport.asr, 1);
  assert.equal(f.transport.speech, 1);
  assert.equal(Buffer.concat(c.frames).length, 6);
  assert.equal(
    f.calls.filter((p) => p.endsWith("/audio")).length,
    0,
    "No duplicate upload before configured transcription",
  );
  assert.equal(c.traces.at(-1).timing.points.localSaved, localSavePoint);
  assert(c.traces.at(-1).timing.points.firstPlayable >= localSavePoint);
  assert.equal(c.traces.at(-1).reviewed, false);
  await f.api(`/pilot/api/jobs/${f.job.id}/audio`, { clips: [audio] });
  const j = f.app.store.job(f.principal, f.job.id),
    ops = f.app.store.operations(f.principal.companyId),
    stored = ops.audio(j.op_job, audio.id);
  assert.equal(sha(stored.bytes), audio.sha256);
  assert.equal(stored.wav_sha256, audio.wavSha256);
  assert.equal(
    ops.db.prepare("SELECT COUNT(*) AS n FROM audio_evidence").get().n,
    1,
  );
  const report = {
    technician: "Fictional voice owner",
    summary: "Fictional visit; all checks remain unverified.",
    recordedAt: new Date().toISOString(),
    followupOwner: "Operations",
    interviewRevision: 0,
    evidenceRevision: evidenceRevision([], [audio]),
    entries: {},
  };
  const packet = await f.api(`/pilot/api/jobs/${f.job.id}/closeout`, {
    report,
    eventRevision: 0,
  });
  assert.equal(packet.audio[0].wavSha256, audio.wavSha256);
  await f.api(`/pilot/api/jobs/${f.job.id}/confirmations`, {
    revision: packet.revision,
    reportRevision: packet.reportRevision,
    name: "Fictional voice owner",
    confirmedAt: new Date().toISOString(),
  });
  assert.equal(
    (await f.api(`/pilot/api/jobs/${f.job.id}`)).status.technicianConfirmed,
    true,
  );
  await assert.rejects(
    f.api(`/pilot/api/jobs/${f.job.id}/audio`, {
      clips: [{ ...audio, wavBase64: undefined, wavSha256: undefined }],
    }),
    /Voice identity conflict/,
  );
  assert.equal(ops.audio(j.op_job, audio.id).wav_sha256, audio.wavSha256);
  c.turn.dispose();
  c.speaker.dispose();
});
test("actual client cancellation during mocked ASR suppresses late answer/PCM while retaining the admitted original", async (t) => {
  const f = await fixture(t),
    c = controller(f),
    audio = await clip(f.job.id);
  c.originals.set(audio.id, audio);
  let enter, release;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  f.transport.delay = async () => {
    enter();
    await gate;
  };
  const pending = c.turn.complete(audio);
  await entered;
  c.turn.cancel();
  release();
  await assert.rejects(pending);
  assert.equal(f.transport.speech, 0);
  assert.equal(f.calls.filter((p) => p.endsWith("/voice/answer")).length, 0);
  assert.equal(c.originals.get(audio.id).sha256, audio.sha256);
  const j = f.app.store.job(f.principal, f.job.id),
    ops = f.app.store.operations(f.principal.companyId);
  assert.equal(sha(ops.audio(j.op_job, audio.id).bytes), audio.sha256);
  assert.equal(ops.job(j.op_job).events.length, 0);
  c.speaker.dispose();
});
