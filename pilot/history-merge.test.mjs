import test from "node:test";
import assert from "node:assert/strict";
import { classifyHistory } from "./public/history-merge.js";

function event(seq, text = `Fictional note ${seq}`) {
  return {
    id: `event-${seq}`,
    jobId: "fictional-work-order",
    seq,
    type: "turn.recorded",
    payload: { id: `turn-${seq}`, text },
  };
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("a longer divergent server history cannot replace an unsynced local correction", () => {
  const local = freeze([event(1), event(2, "Correction: pre-work was 2.4 kW.")]);
  const server = freeze([
    event(1),
    event(2, "Monitoring is reported live."),
    event(3, "Warranty remains open with Operations."),
  ]);
  const before = JSON.stringify({ local, server });
  assert.deepEqual(classifyHistory(local, server), {
    classification: "conflict",
    commonPrefix: 1,
  });
  assert.equal(JSON.stringify({ local, server }), before);
  assert.equal(local[1].payload.text, "Correction: pre-work was 2.4 kW.");
});

test("only exact prefixes qualify as legitimate extensions in either direction", () => {
  const shorter = freeze([event(1)]);
  const longer = freeze([event(1), event(2)]);
  assert.deepEqual(classifyHistory(shorter, longer), {
    classification: "server_extends",
    commonPrefix: 1,
  });
  assert.deepEqual(classifyHistory(longer, shorter), {
    classification: "local_extends",
    commonPrefix: 1,
  });
  assert.deepEqual(classifyHistory([], longer), {
    classification: "server_extends",
    commonPrefix: 0,
  });
  assert.deepEqual(classifyHistory(longer, []), {
    classification: "local_extends",
    commonPrefix: 0,
  });
});

test("identical and empty histories are equal without requiring shared object identity", () => {
  const local = freeze([event(1), event(2)]);
  assert.deepEqual(classifyHistory(local, structuredClone(local)), {
    classification: "equal",
    commonPrefix: 2,
  });
  assert.deepEqual(classifyHistory([], []), {
    classification: "equal",
    commonPrefix: 0,
  });
});

test("divergence is a conflict for equal or longer local histories and at the first event", () => {
  for (const [local, server, commonPrefix] of [
    [[event(1), event(2)], [event(1), event(2, "Different answer")], 1],
    [[event(1), event(2), event(3)], [event(1), event(2, "Different answer")], 1],
    [[event(1)], [event(1, "Different answer"), event(2)], 0],
  ]) {
    assert.deepEqual(classifyHistory(local, server), {
      classification: "conflict",
      commonPrefix,
    });
  }
});

test("event property order remains part of the OperationsStore JSON prefix contract", () => {
  const original = event(1);
  const reordered = {
    jobId: original.jobId,
    id: original.id,
    seq: original.seq,
    type: original.type,
    payload: original.payload,
  };
  assert.deepEqual(classifyHistory([original], [reordered]), {
    classification: "conflict",
    commonPrefix: 0,
  });
});

test("the 500-event bound is inclusive; malformed or non-JSON histories fail closed", () => {
  const bounded = Array.from({ length: 500 }, (_, index) => event(index + 1));
  assert.deepEqual(classifyHistory(bounded, structuredClone(bounded)), {
    classification: "equal",
    commonPrefix: 500,
  });
  const cyclic = event(1);
  cyclic.payload.self = cyclic;
  const sparse = [];
  sparse.length = 1;
  const invalid = [
    null, {}, "[]", [null], [[]], ["event"], sparse,
    [...bounded, event(501)],
    [{ ...event(1), payload: { value: undefined } }],
    [{ ...event(1), payload: { value: NaN } }],
    [{ ...event(1), payload: { value: Infinity } }],
    [{ ...event(1), payload: { value: 1n } }],
    [{ ...event(1), payload: { value: Symbol("unsupported") } }],
    [{ ...event(1), payload: { value: () => "unsupported" } }],
    [{ ...event(1), payload: new Date() }],
    [cyclic],
  ];
  for (const history of invalid) {
    assert.throws(() => classifyHistory(history, []), TypeError);
    assert.throws(() => classifyHistory([], history), TypeError);
  }
});

test("comparison never invokes data accessors or toJSON code", () => {
  let invoked = false;
  for (const payload of [
    { get text() { invoked = true; return "must not execute"; } },
    { toJSON() { invoked = true; return {}; } },
  ]) {
    assert.throws(() => classifyHistory([{ ...event(1), payload }], []), TypeError);
  }
  const history = [];
  Object.defineProperty(history, "0", {
    get() { invoked = true; return event(1); },
    enumerable: true,
  });
  assert.throws(() => classifyHistory(history, []), TypeError);
  const customArray = [];
  Object.setPrototypeOf(customArray, {
    toJSON() { invoked = true; return []; },
  });
  assert.throws(() => classifyHistory([{ ...event(1), payload: { customArray } }], []), TypeError);
  assert.equal(invoked, false);
});
