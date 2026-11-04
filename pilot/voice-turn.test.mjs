import test from "node:test";
import assert from "node:assert/strict";
import { createPilotVoiceTurn } from "./public/voice-turn.js";
import { createTurnTiming } from "../public/turn-timing.js";
function harness(overrides = {}) {
  const calls = [],
    traces = [];
  let locked = false;
  const options = {
    createTiming: createTurnTiming,
    ensure: () => {
      if (locked) throw Error("closed account");
    },
    request: async (action, input) => {
      calls.push(action);
      if (action === "voice/start")
        return { enabled: true, ticket: { turnId: "one" } };
      if (action === "voice/transcribe")
        return {
          transcript: "Correction: 2.4 before work",
          provenance: { model: "fixture" },
        };
      if (action === "voice/answer")
        return {
          reply: "Production and warranty stay open with Operations.",
          intent: "report",
          reportSaved: true,
          events: [{ type: "fixture" }],
          confirmed: false,
          delivered: false,
        };
      return {};
    },
    saveTrace: async (t) => traces.push(t),
    applyAnswer: async (answer) => calls.push(["apply", answer]),
    showHeard: () => {},
    showAnswer: () => calls.push("show"),
    speak: async (text, { onTiming, onOutput }) => {
      calls.push("speak");
      onOutput({ provider: "mock" });
      onTiming("firstPlayableAt");
      onTiming("completedAt");
    },
    stopSpeech: () => calls.push("stop"),
    ...overrides,
  };
  return {
    calls,
    traces,
    options,
    lock: () => {
      locked = true;
    },
    controller: createPilotVoiceTurn(options),
  };
}
test("released locally saved turn makes one ASR/answer request, applies validated state before speaking and retains timing/raw provenance", async () => {
  const h = harness();
  const result = await h.controller.complete({ id: "retained-original" });
  assert.equal(result.confirmed, false);
  assert.equal(result.delivered, false);
  assert.deepEqual(
    h.calls.filter((x) => typeof x === "string" && x.startsWith("voice/")),
    ["voice/start", "voice/transcribe", "voice/answer"],
  );
  assert(h.calls.findIndex((x) => Array.isArray(x)) < h.calls.indexOf("speak"));
  const last = h.traces.at(-1);
  assert.equal(last.reviewed, false);
  assert.equal(last.rawTranscript, "Correction: 2.4 before work");
  assert.equal(last.timing.output.provider, "mock");
  assert(Number.isFinite(last.timing.points.firstPlayable));
});
test("disabled providers preserve local-only state and make no ASR/answer dispatch", async () => {
  const h = harness({
    request: async (action) => {
      assert.equal(action, "voice/start");
      return { enabled: false };
    },
  });
  assert.equal((await h.controller.complete({ id: "local" })).enabled, false);
  assert.equal(h.traces.at(-1).status, "local_only");
  assert(!h.calls.includes("speak"));
});
test("new hold supersedes pending transcription so a late prior result is never applied or spoken", async () => {
  let resolve;
  const h = harness({
    request: async (action) => {
      if (action === "voice/start")
        return { enabled: true, ticket: { turnId: "old" } };
      if (action === "voice/transcribe")
        return new Promise((r) => (resolve = r));
      return {};
    },
  });
  const pending = h.controller.complete({ id: "old-original" });
  while (!resolve) await new Promise((r) => setImmediate(r));
  h.controller.cancel();
  resolve({ transcript: "stale" });
  await assert.rejects(pending, /superseded/);
  assert(!h.calls.includes("show"));
  assert(!h.calls.includes("speak"));
});
test("account closure during pending request suppresses subsequent dispatch, state and speech without deleting the original", async () => {
  let resolve;
  const h = harness({
    request: async (action) => {
      if (action === "voice/start") return new Promise((r) => (resolve = r));
      throw Error("must not dispatch");
    },
  });
  const pending = h.controller.complete({ id: "saved-audio" });
  h.lock();
  resolve({ enabled: true, ticket: { turnId: "late" } });
  await assert.rejects(pending, /closed account/);
  assert.equal(h.traces.length, 0);
  assert(!h.calls.includes("speak"));
});


test('spoken photo/document questions forward exact selected context; navigation never asks for a model answer',async()=>{
 for(const command of [{photoIds:['selected-photo'],requestKind:'photo_question'},{selectedDocument:{versionId:'v1',sha256:'a'.repeat(64),revision:'R2',pdfPage:2},requestKind:'document_question'},{handled:true,reply:'Your work-order files are open.'}]){
  const h=harness();let submitted;const original=h.options.request;
  h.options.resolveCommand=async()=>command;
  h.options.request=async(action,input)=>{if(action==='voice/answer'){submitted=input;return {reply:'Source-linked interpretation.',reportSaved:false,intent:'question'};}return original(action,input);};
  const controller=createPilotVoiceTurn(h.options);const answer=await controller.complete({id:'saved-original'});
  if(command.handled)assert.equal(submitted,undefined);else if(command.photoIds)assert.deepEqual(submitted.photoIds,command.photoIds);else assert.deepEqual(submitted.selectedDocument,command.selectedDocument);
  assert.equal(answer.reportSaved,false);assert.equal(h.traces.at(-1).reviewed,false);assert.equal(h.traces.at(-1).status,'answered');
 }
});
