import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, realpath, lstat, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPilotServer } from './server.mjs';

const PASSWORD = 'fictional-lease-test-pass-12345';
async function exists(file) { try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'carryforward-lease-'));
  const reserve = createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const app = await createPilotServer({ directory, port, baseURL: origin, ...options }); await app.listen();
  t.after(async () => { app.server.closeAllConnections(); await app.close(); await rm(directory, { recursive: true, force: true }); });
  function client() {
    let cookie = '';
    return { async call(path, method = 'GET', input, extra = {}) {
      const response = await fetch(origin + path, { method, headers: { Cookie: cookie, Origin: origin, 'X-CarryForward-Intent': 'pilot', ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: input === undefined ? undefined : JSON.stringify(input) });
      const newCookies = response.headers.getSetCookie(); if (newCookies.length) cookie = newCookies.map(x => x.split(';')[0]).join('; ');
      return { status: response.status, data: await response.json() };
    }, async signup(name, email) { const response = await this.call('/api/auth/sign-up/email', 'POST', { name, email, password: PASSWORD }); assert.equal(response.status, 200); return response.data.user; },
    async company(name) { const response = await this.call('/pilot/api/account/companies', 'POST', { name }); assert.equal(response.status, 201); return response.data.principal; } };
  }
  return { client, origin };
}
async function lease(client, duration, path = '/pilot/api/cache-lease', method = 'GET', input, headers) {
  const before = Date.now(), response = await client.call(path, method, input, headers), after = Date.now();
  assert.equal(response.status, 200);
  assert.ok(response.data.expiresAt >= before + duration && response.data.expiresAt <= after + duration, 'Deadline must use only the bounded server-owned lease duration.');
  assert.ok(typeof response.data.key === 'string' && /^[A-Za-z0-9_-]{43}$/.test(response.data.key), 'Authenticated member receives a bounded cache key.');
  return response.data;
}

test('invalid cacheLeaseMs is rejected before directories, locks, secrets or database state are opened', async t => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'carryforward-invalid-lease-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const invalid = [0, -1, 900001, 1.5, NaN, Infinity, '25000', null, true];
  for (const [index, cacheLeaseMs] of invalid.entries()) {
    const absent = join(directory, `unopened-${index}`);
    await assert.rejects(createPilotServer({ directory: absent, cacheLeaseMs }), /cacheLeaseMs must be a positive integer/);
    assert.equal(await exists(absent), false);
  }
  await writeFile(join(directory, 'keep.txt'), 'Existing state is untouched.');
  await assert.rejects(createPilotServer({ directory, cacheLeaseMs: 900001 }), /cacheLeaseMs/);
  assert.deepEqual(await readdir(directory), ['keep.txt']);
  assert.equal(await readFile(join(directory, 'keep.txt'), 'utf8'), 'Existing state is untouched.');
});

test('default authenticated member cache lease remains fifteen minutes', async t => {
  const f = await fixture(t), user = f.client();
  await user.signup('Default Lease Owner', 'default.lease@example.invalid');
  const principal = await user.company('Fictional Default Lease Company');
  const result = await lease(user, 900000);
  assert.deepEqual(result.scope, { companyId: principal.companyId, userId: principal.userId });
  const page = await fetch(f.origin + '/pilot/');
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('Content-Security-Policy').split(';').map(value => value.trim()).includes("form-action 'self'"), 'Static pages restrict form submissions to the same origin.');
});

test('short QA lease requires active company membership; client query/body/header cannot extend or rescope it', async t => {
  const f = await fixture(t, { cacheLeaseMs: 25000 }), admin = f.client(), technician = f.client(), other = f.client(), anonymous = f.client();
  assert.equal((await anonymous.call('/pilot/api/cache-lease')).status, 401);
  await technician.signup('QA Lease Technician', 'qa.lease.tech@example.invalid');
  assert.equal((await technician.call('/pilot/api/cache-lease')).status, 401);
  await admin.signup('QA Lease Owner', 'qa.lease.owner@example.invalid');
  const principal = await admin.company('Fictional Short Lease Company');
  const invited = await admin.call('/pilot/api/account/invitations', 'POST', { email: 'qa.lease.tech@example.invalid', role: 'technician' });
  assert.equal(invited.status, 201);
  const accepted = await technician.call('/pilot/api/account/invitations/accept', 'POST', { token: new URL(invited.data.url).hash.slice(8) });
  assert.equal(accepted.status, 200);
  await other.signup('Other Lease Owner', 'other.lease.owner@example.invalid');
  const otherPrincipal = await other.company('Fictional Other Lease Company');
  const original = await lease(technician, 25000);
  assert.deepEqual(original.scope, { companyId: principal.companyId, userId: accepted.data.principal.userId });
  const query = await lease(technician, 25000, `/pilot/api/cache-lease?cacheLeaseMs=900000&expiresAt=9999999999999&companyId=${otherPrincipal.companyId}&userId=${otherPrincipal.userId}`);
  const body = await lease(technician, 25000, '/pilot/api/cache-lease', 'POST', { cacheLeaseMs: 900000, expiresAt: 9999999999999, companyId: otherPrincipal.companyId, userId: otherPrincipal.userId }, { 'X-CarryForward-Cache-Lease-Ms': '900000' });
  for (const result of [query, body]) {
    assert.deepEqual(result.scope, original.scope);
    assert.ok(result.key === original.key, 'A client-supplied company/user cannot obtain a different scope key.');
  }
  const otherLease = await lease(other, 25000);
  assert.ok(otherLease.key !== original.key, 'Distinct company/user keys remain isolated.');
  const revoked = await admin.call(`/pilot/api/account/members/${accepted.data.principal.membershipId}/revoke`, 'POST', {});
  assert.equal(revoked.status, 200);
  assert.equal((await technician.call('/pilot/api/cache-lease?cacheLeaseMs=900000')).status, 401);
});
