import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createPilotAuth } from './auth.mjs';

const PASSWORD = 'fictional-pilot-pass-12345';
const SECRET = 'fictional-auth-test-secret-12345678901234567890';
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'carryforward-auth-'));
  let service; let now = Date.now();
  const server = createServer(async (req, res) => {
    if (!await service.handler(req, res)) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const config = { databasePath: path.join(directory, 'auth.sqlite'), baseURL: origin, secret: SECRET, clock: () => now };
  service = await createPilotAuth(config);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); service.close(); await rm(directory, { recursive: true, force: true }); });
  function client() {
    let cookie = '';
    return {
      async call(url, method = 'GET', data, extra = {}) {
        const response = await fetch(`${origin}${url}`, { method, headers: { Cookie: cookie, Origin: origin, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: data === undefined ? undefined : JSON.stringify(data), redirect: 'manual' });
        const newCookies = response.headers.getSetCookie();
        if (newCookies.length) cookie = newCookies.map(value => value.split(';')[0]).join('; ');
        let result; try { result = await response.json(); } catch { result = null; }
        return { status: response.status, data: result, headers: response.headers };
      },
      async signUp(name, email) {
        const response = await this.call('/api/auth/sign-up/email', 'POST', { name, email, password: PASSWORD, role: 'owner', companyId: 'forged-company' });
        assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data.user;
      },
      async company(name) { const response = await this.call('/pilot/api/account/companies', 'POST', { name }); assert.equal(response.status, 201, JSON.stringify(response.data)); return response.data.principal; },
      cookie: () => cookie,
    };
  }
  return { client, origin, directory, config, service: () => service, advance: milliseconds => { now += milliseconds; }, restart: async () => { service.close(); service = await createPilotAuth(config); } };
}
async function invite(owner, email, role = 'technician') {
  const response = await owner.call('/pilot/api/account/invitations', 'POST', { email, role });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return { ...response.data, token: new URL(response.data.url).hash.slice('#invite='.length) };
}
async function accept(client, invitation) {
  const response = await client.call('/pilot/api/account/invitations/accept', 'POST', { token: invitation.token });
  assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data.principal;
}

test('real HTTP authentication and two companies enforce membership and server-owned roles', async t => {
  const f = await fixture(t); const a = f.client(); const b = f.client(); const tech = f.client();
  assert.equal((await a.call('/pilot/api/account')).data.selfRegistration, true);
  await a.signUp('A Owner', 'a.owner@example.invalid'); const companyA = await a.company('Fictional A Solar');
  await b.signUp('B Owner', 'b.owner@example.invalid'); const companyB = await b.company('Fictional B Wind');
  const techUser = await tech.signUp('A Technician', 'a.tech@example.invalid');
  let account = await tech.call('/pilot/api/account');
  assert.equal(account.data.principal, null); assert.deepEqual(account.data.memberships, []);
  assert.equal((await tech.call('/pilot/api/account/select-company', 'POST', { companyId: companyA.companyId, role: 'owner' })).status, 404);
  const invitation = await invite(a, techUser.email);
  assert.equal((await b.call(`/pilot/api/account/invitations/${invitation.invitation.id}/revoke`, 'POST')).status, 404);
  const principal = await accept(tech, invitation);
  assert.equal(principal.role, 'technician'); assert.equal(principal.companyId, companyA.companyId);
  assert.equal((await tech.call('/pilot/api/account/invitations', 'POST', { email: 'new@example.invalid', role: 'owner' })).status, 403);
  assert.equal((await tech.call('/pilot/api/account/select-company', 'POST', { companyId: companyB.companyId })).status, 404);
  assert.equal((await tech.call('/pilot/api/account')).data.principal.companyId, companyA.companyId);
  assert.equal((await a.call('/pilot/api/account/companies', 'POST', { name: 'Forbidden second company' })).status, 409);
  assert.equal((await b.call(`/pilot/api/account/members/${principal.membershipId}`, 'PATCH', { role: 'admin' })).status, 404);
  const bMembers = await b.call('/pilot/api/account/members');
  assert.equal(bMembers.data.members.length, 1); assert.equal(bMembers.data.members[0].userId, companyB.userId);
  assert.equal(f.service().isActiveMember(companyA.companyId, techUser.id, ['technician']), true);
  assert.equal(f.service().isActiveMember(companyB.companyId, techUser.id), false);
  assert.equal((await a.call('/pilot/api/account/invitations', 'POST', { email: 'escalate@example.invalid', role: 'owner' })).status, 403);
  assert.equal((await a.call(`/pilot/api/account/members/${companyA.membershipId}/revoke`, 'POST')).status, 403);
  const revoke = await a.call(`/pilot/api/account/members/${principal.membershipId}/revoke`, 'POST');
  assert.equal(revoke.status, 200); assert.equal(revoke.data.member.status, 'revoked');
  account = await tech.call('/pilot/api/account');
  assert.equal(account.data.principal, null); assert.deepEqual(account.data.memberships, []);
  assert.equal(account.data.membership.status, 'revoked');
  assert.equal((await tech.call('/pilot/api/account/companies', 'POST', { name: 'Still forbidden after revocation' })).status, 409);
  const foreignInvite = await invite(b, techUser.email);
  assert.equal((await tech.call('/pilot/api/account/invitations/accept', 'POST', { token: foreignInvite.token })).status, 409);
  const audit = await a.call('/pilot/api/account/audit');
  assert.ok(audit.data.events.some(event => event.action === 'invitation.accepted' && event.actor_id === techUser.id && event.actor_name === 'A Technician'));
  assert.ok(audit.data.events.some(event => event.action === 'member.revoked'));
  const bAudit = await b.call('/pilot/api/account/audit');
  assert.ok(bAudit.data.events.every(event => event.company_id === companyB.companyId));
});

test('invitations bind email, expiry, issuer authority, revocation and single use', async t => {
  const f = await fixture(t); const owner = f.client(); const admin = f.client(); const tech = f.client();
  await owner.signUp('Owner', 'owner@example.invalid'); await owner.company('Invitation Fixture');
  await admin.signUp('Admin', 'admin@example.invalid'); await tech.signUp('Tech', 'tech@example.invalid');
  const ai = await invite(owner, 'admin@example.invalid', 'admin'); const ap = await accept(admin, ai);
  assert.equal((await owner.call('/pilot/api/account/invitations/accept', 'POST', { token: ai.token })).status, 400);
  assert.equal((await admin.call('/pilot/api/account/invitations', 'POST', { email: 'another@example.invalid', role: 'admin' })).status, 403);
  assert.equal((await admin.call(`/pilot/api/account/members/${ap.membershipId}`, 'PATCH', { role: 'owner' })).status, 403);
  const revoked = await invite(owner, 'tech@example.invalid');
  assert.equal((await owner.call(`/pilot/api/account/invitations/${revoked.invitation.id}/revoke`, 'POST')).status, 200);
  assert.equal((await tech.call('/pilot/api/account/invitations/accept', 'POST', { token: revoked.token })).status, 400);
  const mismatch = await invite(owner, 'someone.else@example.invalid');
  assert.equal((await tech.call('/pilot/api/account/invitations/accept', 'POST', { token: mismatch.token })).status, 400);
  const replaced = await invite(owner, 'tech@example.invalid');
  const replacement = await invite(owner, 'tech@example.invalid');
  assert.notEqual(replaced.token, replacement.token);
  assert.equal((await tech.call('/pilot/api/account/invitations/accept', 'POST', { token: replaced.token })).status, 400);
  const expires = await owner.call('/pilot/api/account/invitations', 'POST', { email: 'tech@example.invalid', role: 'technician', expiresHours: 0.05 });
  f.advance(4 * 60_000);
  assert.equal((await tech.call('/pilot/api/account/invitations/accept', 'POST', { token: new URL(expires.data.url).hash.slice(8) })).status, 400);
  const issuedByAdmin = await invite(admin, 'tech@example.invalid');
  await owner.call(`/pilot/api/account/members/${ap.membershipId}/revoke`, 'POST');
  assert.equal((await tech.call('/pilot/api/account/invitations/accept', 'POST', { token: issuedByAdmin.token })).status, 400);
  const usable = await invite(owner, 'tech@example.invalid'); await accept(tech, usable);
  assert.equal((await tech.call('/pilot/api/account/invitations/accept', 'POST', { token: usable.token })).status, 400);
});

test('one enduring company per user is automatic on login and restart; logout invalidates its session', async t => {
  const f = await fixture(t); const owner = f.client(); const secondLogin = f.client();
  await owner.signUp('Single Owner', 'single@example.invalid');
  const a = await owner.company('Workspace A');
  assert.equal((await owner.call('/pilot/api/account/companies', 'POST', { name: 'Workspace B' })).status, 409);
  assert.equal((await owner.call('/pilot/api/account')).data.principal.companyId, a.companyId);
  await f.restart();
  assert.equal((await owner.call('/pilot/api/account')).data.principal.companyId, a.companyId);
  assert.equal((await secondLogin.call('/api/auth/sign-in/email', 'POST', { email: 'single@example.invalid', password: PASSWORD })).status, 200);
  assert.equal((await secondLogin.call('/pilot/api/account')).data.principal.companyId, a.companyId);
  assert.equal((await secondLogin.call('/pilot/api/account/select-company', 'POST', { companyId: 'forged-company' })).status, 404);
  assert.equal((await owner.call('/pilot/api/account')).data.principal.companyId, a.companyId);
  assert.equal((await owner.call('/api/auth/sign-out', 'POST', {})).status, 200);
  assert.equal((await owner.call('/pilot/api/account')).data.authenticated, false);
  assert.equal((await secondLogin.call('/pilot/api/account')).data.principal.companyId, a.companyId);
  const database = new DatabaseSync(f.config.databasePath);
  assert.throws(() => database.prepare('INSERT INTO pilot_member VALUES (?,?,?,?,?,?,NULL)').run('forged-membership', a.companyId, a.userId, 'technician', 'active', Date.now()), /UNIQUE constraint failed/);
  database.close();
});

test('Better Auth recovery is local-only, single-use, expiring and revokes sessions; pending links can be revoked', async t => {
  const f = await fixture(t); const user = f.client(); const anonymous = f.client();
  await user.signUp('Recovery User', 'recover@example.invalid'); await user.company('Recovery Fixture');
  const request = await anonymous.call('/api/auth/request-password-reset', 'POST', { email: 'recover@example.invalid', redirectTo: `${f.origin}/pilot/` });
  assert.equal(request.status, 200); assert.equal(request.data.token, undefined); assert.equal(request.data.url, undefined);
  const outbox = path.join(f.directory, 'auth-outbox');
  let files = await readdir(outbox); assert.equal(files.length, 1);
  const delivery = JSON.parse(await readFile(path.join(outbox, files[0]), 'utf8'));
  assert.equal(delivery.localOnly, true); const token = new URL(delivery.url).hash.slice('#recovery='.length);
  assert.equal((await anonymous.call('/api/auth/reset-password', 'POST', { token, newPassword: 'new-fictional-pass-12345' })).status, 200);
  assert.equal((await user.call('/pilot/api/account')).data.authenticated, false);
  assert.equal((await anonymous.call('/api/auth/reset-password', 'POST', { token, newPassword: PASSWORD })).status, 400);
  assert.equal((await user.call('/api/auth/sign-in/email', 'POST', { email: 'recover@example.invalid', password: PASSWORD })).status, 401);
  assert.equal((await user.call('/api/auth/sign-in/email', 'POST', { email: 'recover@example.invalid', password: 'new-fictional-pass-12345' })).status, 200);
  await anonymous.call('/api/auth/request-password-reset', 'POST', { email: 'recover@example.invalid' });
  files = await readdir(outbox); const secondFile = files.find(file => file !== `${delivery.id}.json`);
  const second = JSON.parse(await readFile(path.join(outbox, secondFile), 'utf8'));
  const secondToken = new URL(second.url).hash.slice('#recovery='.length);
  assert.equal((await user.call('/pilot/api/account/recovery/revoke', 'POST', {})).status, 200);
  assert.equal((await anonymous.call('/api/auth/reset-password', 'POST', { token: secondToken, newPassword: PASSWORD })).status, 400);
  await anonymous.call('/api/auth/request-password-reset', 'POST', { email: 'recover@example.invalid' });
  files = await readdir(outbox); const thirdFile = files.find(file => file !== `${delivery.id}.json` && file !== `${second.id}.json`);
  const third = JSON.parse(await readFile(path.join(outbox, thirdFile), 'utf8'));
  const db = new DatabaseSync(f.config.databasePath); db.prepare("UPDATE verification SET expiresAt=0 WHERE identifier LIKE 'reset-password:%'").run(); db.close();
  assert.equal((await anonymous.call('/api/auth/reset-password', 'POST', { token: new URL(third.url).hash.slice('#recovery='.length), newPassword: PASSWORD })).status, 400);
  const unknown = await anonymous.call('/api/auth/request-password-reset', 'POST', { email: 'unknown@example.invalid' });
  assert.equal(unknown.status, 200); assert.deepEqual(unknown.data, request.data);
});

test('account mutations reject foreign/missing origins, forged hosts and oversized requests', async t => {
  const f = await fixture(t); const client = f.client();
  assert.equal((await client.call('/pilot/api/account/companies', 'POST', { name: 'Anonymous' })).status, 401);
  assert.equal((await client.call('/api/auth/sign-up/email', 'POST', { name: 'A', email: 'origin@example.invalid', password: PASSWORD }, { Origin: 'https://evil.example' })).status, 403);
  const missing = await fetch(`${f.origin}/api/auth/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'origin@example.invalid', name: 'A', password: PASSWORD }) });
  assert.equal(missing.status, 403);
  const forgedHost = await new Promise((resolve, reject) => {
    const request = httpRequest(`${f.origin}/pilot/api/account`, { headers: { Host: 'forged.invalid' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    request.on('error', reject); request.end();
  });
  assert.equal(forgedHost, 421);
  assert.equal((await client.call('/api/auth/sign-up/email', 'POST', { payload: 'x'.repeat(33_000) })).status, 413);
  assert.equal((await client.call('/api/auth/sign-up/email', 'POST', { name: 'A', email: 'origin@example.invalid', password: 'short' })).status, 400);
});

test('library login rate limit cannot be bypassed by client-supplied forwarding headers', async t => {
  const f = await fixture(t); const user = f.client();
  await user.signUp('Rate Fixture', 'rate@example.invalid');
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await user.call('/api/auth/sign-in/email', 'POST', { email: 'rate@example.invalid', password: 'wrong-fictional-password' }, {
      'X-Forwarded-For': `198.51.100.${i + 1}`, 'X-CarryForward-Client-IP': `203.0.113.${i + 1}`,
    })).status);
  }
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.equal(statuses[10], 429);
});
