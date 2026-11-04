import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPilotServer } from "./server.mjs";
import { PilotError } from "./store.mjs";

const SAFE_ERROR = "Storage or processing failed. Saved data was not discarded.";
const PRIVATE_DETAIL = "unexposed-internal-error-marker";

async function fixture(t) {
  const reserve = createServer();
  await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const directory = await mkdtemp(join(tmpdir(), "cf-error-boundary-"));
  const app = await createPilotServer({ directory, port });
  await app.listen();
  t.after(async () => {
    app.server.closeAllConnections();
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  let cookie = "";
  async function request(path, body) {
    const response = await fetch(app.baseURL + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: app.baseURL,
        "X-CarryForward-Intent": "pilot",
        Cookie: cookie,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await request("/api/auth/sign-up/email", {
    name: "Fictional Error Boundary Owner",
    email: "error.boundary@example.invalid",
    password: "fictional-error-boundary-password-12345",
  })).status, 200);
  assert.equal((await request("/pilot/api/account/companies", {
    name: "Fictional Error Boundary Company",
  })).status, 201);
  assert.equal((await request("/pilot/api/cache-lease")).status, 200);
  return { app, request };
}

test("actual HTTP auth failures with symbolic or invalid statuses return a safe 500 and leave the server responsive", async (t) => {
  const { app, request } = await fixture(t);
  const original = app.auth.principal;
  let failure;
  app.auth.principal = async (req) => {
    assert.ok(await original(req), "Failure is injected only after genuine session membership resolves.");
    throw failure;
  };
  try {
    for (const status of ["INTERNAL_SERVER_ERROR", "401", 200, 399, 600, -1, 400.5, NaN, Infinity, null, {}]) {
      failure = Object.assign(new Error(PRIVATE_DETAIL), { status });
      const response = await request("/pilot/api/cache-lease");
      assert.equal(response.status, 500);
      assert.deepEqual(response.data, { error: SAFE_ERROR });
      assert.equal(JSON.stringify(response).includes(PRIVATE_DETAIL), false);
      assert.equal((await request("/healthz")).status, 200);
    }
  } finally {
    app.auth.principal = original;
  }
  assert.equal((await request("/pilot/api/cache-lease")).status, 200);
});

test("actual HTTP boundary sanitizes unexpected and internal errors while retaining explicit domain 4xx statuses", async (t) => {
  const { app, request } = await fixture(t);
  const original = app.auth.principal;
  let failure;
  app.auth.principal = async (req) => {
    assert.ok(await original(req));
    throw failure;
  };
  try {
    for (const [value, expectedStatus] of [
      [new Error(PRIVATE_DETAIL), 500],
      [null, 500],
      [PRIVATE_DETAIL, 500],
      [{ code: 123, message: PRIVATE_DETAIL }, 500],
      [Object.assign(new TypeError(PRIVATE_DETAIL), { status: 400 }), 500],
      [Object.assign(new Error(PRIVATE_DETAIL), { code: "ERR_SQLITE_ERROR", status: 400 }), 500],
      [Object.assign(new Error(PRIVATE_DETAIL), { code: "EACCES" }), 500],
      [Object.assign(new Error(PRIVATE_DETAIL), { status: 503 }), 503],
    ]) {
      failure = value;
      const response = await request("/pilot/api/cache-lease");
      assert.equal(response.status, expectedStatus);
      assert.deepEqual(response.data, { error: SAFE_ERROR });
    }
    failure = Object.assign(new Error(PRIVATE_DETAIL), { code: "ENOENT" });
    assert.deepEqual(await request("/pilot/api/cache-lease"), {
      status: 404, data: { error: "Unavailable" },
    });
    failure = new PilotError(409, "Assignment changed; reopen this work order");
    assert.deepEqual(await request("/pilot/api/cache-lease"), {
      status: 409, data: { error: failure.message },
    });
    failure = new PilotError(403, "Permission denied");
    assert.deepEqual(await request("/pilot/api/cache-lease"), {
      status: 403, data: { error: "Permission denied" },
    });
  } finally {
    app.auth.principal = original;
  }
  assert.equal((await request("/pilot/api/cache-lease")).status, 200);
});

test("a symbolic error escaping the account handler is contained by the outer HTTP boundary", async (t) => {
  const { app, request } = await fixture(t);
  const original = app.auth.handler;
  app.auth.handler = async () => {
    throw Object.assign(new Error(PRIVATE_DETAIL), { status: "INTERNAL_SERVER_ERROR" });
  };
  try {
    const response = await request("/pilot/api/account");
    assert.equal(response.status, 500);
    assert.deepEqual(response.data, { error: SAFE_ERROR });
    assert.equal((await request("/healthz")).status, 200);
  } finally {
    app.auth.handler = original;
  }
  assert.equal((await request("/pilot/api/account")).status, 200);
});
