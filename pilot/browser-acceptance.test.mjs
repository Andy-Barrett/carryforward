// HTTP/cipher-boundary regression supporting browser acceptance. This is not a
// claim that a real browser, IndexedDB, UI or WKWebView lifecycle was exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPilotServer } from './server.mjs';
import { seedFictionalPilot } from './demo.mjs';
import { seal, unseal, openScopedCache } from './public/cache.js';

async function portNumber() { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r)); return port; }
function session(origin, initialCookie = '') {
  let cookie = initialCookie;
  return { cookie: () => cookie, async request(path, method = 'GET', input, extra = {}) {
    const r = await fetch(origin + path, { method, headers: { Origin: origin, 'X-CarryForward-Intent': 'pilot', Cookie: cookie, ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: input === undefined ? undefined : JSON.stringify(input) });
    const cookies = r.headers.getSetCookie(); if (cookies.length) cookie = cookies.map(x => x.split(';')[0]).join('; ');
    return { status: r.status, data: await r.json() };
  }, async ok(path, method = 'GET', input, extra) { const r = await this.request(path, method, input, extra); assert.ok(r.status < 400, `HTTP ${r.status} for ${path}`); return r.data; } };
}
async function importLease(lease) { return crypto.subtle.importKey('raw', Buffer.from(lease.key, 'base64url'), 'AES-GCM', false, ['encrypt', 'decrypt']); }
const scopeFor = (lease, jobId) => `${lease.scope.companyId}:${lease.scope.userId}:job:${jobId}`;

test('HTTP account A→logout→B→new session→A isolates durable cache grants and preserves only the original user’s unsent cipher', async t => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'cf-account-cipher-'));
  const port = await portNumber(), origin = `http://127.0.0.1:${port}`;
  const app = await createPilotServer({ directory, port, baseURL: origin }); await app.listen();
  t.after(async () => { app.server.closeAllConnections(); await app.close(); await rm(directory, { recursive: true, force: true }); });
  const [a, b] = await seedFictionalPilot({ origin });
  const browser = session(origin), adminA = session(origin);
  await browser.ok('/api/auth/sign-in/email', 'POST', { email: a.tech.email, password: a.tech.password });
  const aAccount = await browser.ok('/pilot/api/account');
  const leaseA = await browser.ok('/pilot/api/cache-lease');
  assert.equal(leaseA.scope.companyId, a.companyId); assert.equal(leaseA.scope.userId, a.technicianId);
  assert.ok(leaseA.expiresAt > Date.now() + 14 * 60_000 && leaseA.expiresAt <= Date.now() + 16 * 60_000);
  const keyA = await importLease(leaseA), scopeA = scopeFor(leaseA, a.assignmentId);
  const pending = { draft: 'Unsent A-only correction: pre-work reading was 2.4 kW; warranty stays with Operations.', orderSnapshot: { customer: 'A-only fictional customer' }, owners: ['Operations'] };
  const envelope = await seal(pending, keyA, scopeA);
  assert.equal(JSON.stringify(envelope).includes('2.4 kW'), false);
  const oldCookieA = browser.cookie();
  await browser.ok('/api/auth/sign-out', 'POST', {});
  assert.equal((await browser.ok('/pilot/api/account')).authenticated, false);
  assert.equal((await session(origin, oldCookieA).request('/pilot/api/cache-lease')).status, 401, 'A cleared cookie is also invalid in server session storage.');

  await browser.ok('/api/auth/sign-in/email', 'POST', { email: b.tech.email, password: b.tech.password });
  const bAccount = await browser.ok('/pilot/api/account');
  const leaseB = await browser.ok('/pilot/api/cache-lease');
  assert.equal(bAccount.principal.companyId, b.companyId); assert.equal(leaseB.scope.userId, b.technicianId);
  assert.ok(leaseA.key !== leaseB.key, 'Different company/user receives a different private cache key.');
  await assert.rejects(unseal(envelope, await importLease(leaseB), scopeFor(leaseB, a.assignmentId)));
  const bJobs = await browser.ok('/pilot/api/jobs');
  assert.deepEqual(bJobs.items.map(x => x.id), [b.assignmentId]);
  assert.equal((await browser.request(`/pilot/api/jobs/${a.assignmentId}`)).status, 404);
  const forged = await browser.ok(`/pilot/api/cache-lease?companyId=${encodeURIComponent(a.companyId)}&userId=${encodeURIComponent(a.technicianId)}`);
  assert.equal(forged.scope.companyId, b.companyId); assert.equal(forged.scope.userId, b.technicianId);
  assert.ok(forged.key === leaseB.key, 'Client-supplied scope cannot substitute the company/user cache key.');

  const reloadedB = session(origin, browser.cookie());
  assert.equal((await reloadedB.ok('/pilot/api/account')).principal.companyId, b.companyId);
  const againB = await reloadedB.ok('/pilot/api/cache-lease');
  assert.ok(againB.key === leaseB.key, 'Same authenticated user can reopen its own encrypted work.');
  await assert.rejects(unseal(envelope, await importLease(againB), scopeFor(againB, a.assignmentId)));
  await browser.ok('/api/auth/sign-out', 'POST', {});

  await browser.ok('/api/auth/sign-in/email', 'POST', { email: a.tech.email, password: a.tech.password });
  const returnedA = await browser.ok('/pilot/api/account'), nextLeaseA = await browser.ok('/pilot/api/cache-lease');
  assert.ok(returnedA.principal.sessionId !== aAccount.principal.sessionId, 'Reauthentication establishes a new library session.');
  assert.ok(nextLeaseA.key === leaseA.key, 'Durable key remains bound to the same authorized company/user across sessions.');
  const recovered = await unseal(envelope, await importLease(nextLeaseA), scopeFor(nextLeaseA, a.assignmentId));
  assert.deepEqual(recovered, pending);
  assert.equal((await browser.request(`/pilot/api/jobs/${b.assignmentId}`)).status, 404);

  await adminA.ok('/api/auth/sign-in/email', 'POST', { email: a.owner.email, password: a.owner.password });
  const people = await adminA.ok('/pilot/api/account/members'), technician = people.members.find(m => m.userId === a.technicianId);
  await adminA.ok(`/pilot/api/account/members/${technician.id}/revoke`, 'POST', {});
  assert.equal((await browser.request('/pilot/api/cache-lease')).status, 401);
  assert.equal((await browser.request(`/pilot/api/jobs/${a.assignmentId}`)).status, 401);
  const revoked = await browser.ok('/pilot/api/account');
  assert.equal(revoked.principal, null); assert.equal(revoked.membership.status, 'revoked');
  // Revocation denies the next online grant. It cannot erase a key/ciphertext
  // already held by a disconnected client during its prior bounded lease.
  assert.deepEqual(await unseal(envelope, keyA, scopeA), pending);
});

// Deliberately small asynchronous storage double, not browser/IndexedDB proof.
// It can hold a real cache module's write completion across lock/account change
// and fails a queued transaction if its database is closed too early.
function deferredDatabase(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const records = new Map(), writes = [], waiters = [];
  const factory = { open() {
    const request = {};
    const db = { closed: false, createObjectStore() {}, close() { this.closed = true; }, transaction() {
      if (db.closed) throw Error('Database is already closed.');
      const tx = { error: null, objectStore() { return {
        get(id) { const r = {}; queueMicrotask(() => { r.result = records.has(id) ? structuredClone(records.get(id)) : undefined; r.onsuccess?.(); }); return r; },
        put(value, id) { const record = structuredClone(value); queueMicrotask(() => {
          const entry = { id, record, settled: false, commit() { this.settled = true; if (db.closed) { tx.error = Error('Closed before pending transaction completed.'); tx.onabort?.(); } else { records.set(id, record); tx.oncomplete?.(); } }, abort() { this.settled = true; tx.error = Error('Fictional quota failure'); tx.onabort?.(); } };
          writes.push(entry); for (const notify of waiters.splice(0)) notify();
        }); return {}; },
      }; } }; return tx;
    } };
    queueMicrotask(() => { request.result = db; request.onupgradeneeded?.(); request.onsuccess?.(); }); return request;
  } };
  Object.defineProperty(globalThis, 'indexedDB', { value: factory, writable: true, configurable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'indexedDB', previous); else delete globalThis.indexedDB; });
  return { records, async nextWrite(prefix = '') { while (true) { const entry = writes.find(x => !x.settled && x.id.startsWith(prefix)); if (entry) return entry; await new Promise(resolve => waiters.push(resolve)); } } };
}
function localLease(companyId, userId, keyByte) { return { scope: { companyId, userId }, key: Buffer.alloc(32, keyByte).toString('base64url'), expiresAt: Date.now() + 60_000 }; }

test('real cache module drains immutable pre-lock A writes while rejecting late admission and isolating a new B cache', async t => {
  const db = deferredDatabase(t), leaseA = localLease('company-a', 'user-a', 1), leaseB = localLease('company-b', 'user-b', 2);
  const a = await openScopedCache(leaseA), local = { draft: 'Earlier A text', owners: ['Operations'] };
  const first = a.put('job:shared-id', local);
  local.draft = 'Latest A text including the final keystroke';
  const final = a.put('job:shared-id', local);
  local.draft = 'Mutation after admission must not replace the saved snapshot'; local.owners.push('Unadmitted owner');
  const firstWrite = await db.nextWrite('company-a:user-a:');
  const drained = a.lock(); let completed = false; drained.then(() => { completed = true; });
  assert.throws(() => a.put('job:late', { draft: 'late old callback' }), /Unlock/);
  await assert.rejects(a.get('job:shared-id'), /Unlock/);
  assert.equal(completed, false);
  const b = await openScopedCache(leaseB), bSaved = b.put('job:shared-id', { draft: 'Only B text' });
  const bWrite = await db.nextWrite('company-b:user-b:'); bWrite.commit(); await bSaved;
  assert.equal((await b.get('job:shared-id')).draft, 'Only B text');
  firstWrite.commit(); await first;
  const finalWrite = await db.nextWrite('company-a:user-a:'); finalWrite.commit(); await final; await drained;
  assert.equal(completed, true);
  assert.equal(JSON.stringify([...db.records.values()]).includes('Latest A text'), false);
  assert.equal((await b.get('job:shared-id')).draft, 'Only B text');
  const returnedA = await openScopedCache(leaseA), recovered = await returnedA.get('job:shared-id');
  assert.equal(recovered.draft, 'Latest A text including the final keystroke'); assert.deepEqual(recovered.owners, ['Operations']);
  assert.equal(await returnedA.get('job:late'), null);
  await returnedA.lock(); await b.lock();
});

test('a failed admitted write does not redirect scope or prevent a later checkpoint from draining before lock', async t => {
  const db = deferredDatabase(t), lease = localLease('company-a', 'user-a', 3), cache = await openScopedCache(lease);
  const failed = cache.put('job:a', { draft: 'Earlier snapshot' });
  const failedCheck = assert.rejects(failed, /quota/);
  const checkpoint = cache.put('job:a', { draft: 'Latest retained snapshot' });
  const firstWrite = await db.nextWrite(); const drained = cache.lock(); firstWrite.abort(); await failedCheck;
  const finalWrite = await db.nextWrite(); finalWrite.commit(); await checkpoint; await drained;
  const restored = await openScopedCache(lease);
  assert.equal((await restored.get('job:a')).draft, 'Latest retained snapshot'); await restored.lock();
});
