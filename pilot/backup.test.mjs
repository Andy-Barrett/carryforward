import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, mkdir, readFile, writeFile, stat, cp, symlink, unlink, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupPilot, verifyPilotBackup, restorePilot } from './backup.mjs';
import { createPilotServer } from './server.mjs';
import { seedFictionalPilot } from './demo.mjs';
import { evidenceRevision } from '../public/evidence.js';

const sha = value => createHash('sha256').update(value).digest('hex');
async function unusedPort() {
  const reserve = createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve)); return port;
}
function client(origin) {
  let cookie = '';
  return { async request(path, method = 'GET', body) {
    const response = await fetch(origin + path, { method, headers: { Origin: origin, 'X-CarryForward-Intent': 'pilot', Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const cookies = response.headers.getSetCookie(); if (cookies.length) cookie = cookies.map(x => x.split(';')[0]).join('; ');
    const bytes = Buffer.from(await response.arrayBuffer()); let data; try { data = JSON.parse(bytes); } catch { data = null; }
    return { status: response.status, bytes, data };
  }, async ok(path, method = 'GET', body) { const r = await this.request(path, method, body); assert.ok(r.status < 400, `HTTP ${r.status} at ${path}`); return r.data; } };
}
async function pathExists(file) { try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

test('private offline snapshot and fresh restore preserve two authenticated companies, original bytes, corrections and exact accepted revisions', async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'carryforward-restore-'));
  const live = new Set(); let keeper;
  t.after(async () => { for (const app of live) { app.server.closeAllConnections(); await app.close(); } keeper?.close(); await rm(root, { recursive: true, force: true }); });
  const start = async directory => {
    const port = await unusedPort(); const origin = `http://127.0.0.1:${port}`;
    const app = await createPilotServer({ directory, port, baseURL: origin }); await app.listen(); live.add(app); return { app, origin };
  };
  const source = join(root, 'source'); const original = await start(source);
  const fixtures = await seedFictionalPilot({ origin: original.origin, output: join(source, 'demo-users.private.json') });
  const expected = [];
  for (const [index, fixture] of fixtures.entries()) {
    const worker = client(original.origin), admin = client(original.origin);
    await worker.ok('/api/auth/sign-in/email', 'POST', { email: fixture.tech.email, password: fixture.tech.password });
    await admin.ok('/api/auth/sign-in/email', 'POST', { email: fixture.owner.email, password: fixture.owner.password });
    const id = fixture.assignmentId, bytes = Buffer.from(`company-${index} immutable fictional photo bytes`);
    const photo = { id: `restore-photo-${index}`, jobId: id, mime: 'image/png', name: 'Fictional restoration evidence', sha256: sha(bytes), dataBase64: bytes.toString('base64') };
    await worker.ok(`/pilot/api/jobs/${id}/evidence`, 'POST', { photos: [photo] });
    const events = [
      { id: `event-original-${index}`, jobId: id, seq: 1, type: 'turn.recorded', payload: { id: `turn-original-${index}`, text: 'The pre-work reading was 4.2 kW.' } },
      { id: `event-correction-${index}`, jobId: id, seq: 2, type: 'turn.recorded', payload: { id: `turn-correction-${index}`, text: 'Correction: the pre-work reading was 2.4 kW. Production and warranty remain with Operations.', supersedes: `turn-original-${index}` } },
    ];
    await worker.ok(`/pilot/api/jobs/${id}/events`, 'POST', { events });
    const report = { technician: fixture.tech.name, summary: 'Corrected pre-work reading: 2.4 kW. No replacement performed. Production and warranty remain with Operations.', recordedAt: '2026-11-04T01:10:00-06:00', followupOwner: 'Operations', promises: 'Operations will verify production and provide the warranty update.', interviewRevision: 2, evidenceRevision: evidenceRevision([photo]), entries: { production: { status: 'unverified', note: 'No post-work measurement was established.' }, warranty: { status: 'pending', note: 'Operations owns the warranty update.' } } };
    const packet = await worker.ok(`/pilot/api/jobs/${id}/closeout`, 'POST', { report, eventRevision: 2 });
    await worker.ok(`/pilot/api/jobs/${id}/confirmations`, 'POST', { revision: packet.revision, reportRevision: packet.reportRevision, name: fixture.tech.name, confirmedAt: report.recordedAt });
    await worker.ok(`/pilot/api/jobs/${id}/deliveries`, 'POST', { revision: packet.revision });
    await admin.ok(`/pilot/api/jobs/${id}/receipts`, 'POST', { revision: packet.revision });
    const accepted = await admin.ok(`/pilot/api/jobs/${id}/acceptances`, 'POST', { revision: packet.revision });
    assert.equal(accepted.decision, 'accepted_with_followups');
    expected.push({ fixture, id, bytes, photo, packet });
  }
  const bundle = join(root, 'bundle');
  await t.test('active candidate is refused before any bundle is created', async () => {
    assert.equal(await pathExists(join(source, 'runtime.pid')), true);
    await assert.rejects(backupPilot({ sourceDirectory: source, bundleDirectory: bundle }), /active/);
    assert.equal(await pathExists(bundle), false);
  });
  original.app.server.closeAllConnections(); await original.app.close(); live.delete(original.app);
  assert.equal(await pathExists(join(source, 'runtime.pid')), false);
  // Deliberately retain committed WAL data in an extra synthetic SQLite fixture.
  // This is not a running service or a concurrent writer.
  keeper = new DatabaseSync(join(source, 'wal-fixture.sqlite'));
  keeper.exec("PRAGMA journal_mode=WAL; CREATE TABLE fixture(value TEXT); INSERT INTO fixture VALUES ('committed WAL original');");
  const receipt = await backupPilot({ sourceDirectory: source, bundleDirectory: bundle });
  assert.equal(receipt.private, true); assert.equal(receipt.includesSecrets, true); assert.equal(receipt.realProviderCalls, 0);
  assert.equal(receipt.sqliteDatabases, 6); assert.equal(await pathExists(join(source, 'runtime.pid')), false);
  keeper.close(); keeper = null;
  const verified = await verifyPilotBackup({ bundleDirectory: bundle, expectedManifestSha256: receipt.manifestSha256 });
  assert.ok(verified.manifest.files.every(file => !/-(?:wal|shm|journal)$/.test(file.path)));
  assert.ok(verified.manifest.files.some(file => file.path === 'auth-secret'));
  assert.ok(verified.manifest.files.some(file => file.path === 'demo-users.private.json'));
  assert.ok(verified.manifest.files.some(file => file.kind === 'document-original'));
  assert.equal((await stat(bundle)).mode & 0o777, 0o700);
  for (const file of verified.manifest.files) assert.equal((await stat(join(bundle, 'payload', file.path))).mode & 0o777, 0o600);
  const walCopy = new DatabaseSync(join(bundle, 'payload', 'wal-fixture.sqlite'), { readOnly: true });
  assert.equal(walCopy.prepare('SELECT value FROM fixture').get().value, 'committed WAL original'); walCopy.close();

  await t.test('tampered manifest, traversal, payload changes, links and unlisted journals fail before restore writes', async () => {
    await assert.rejects(verifyPilotBackup({ bundleDirectory: bundle }), /trusted/);
    let index = 0;
    async function variant(modify, expectedError, changeReceipt = false) {
      const copy = join(root, `tampered-${index}`), destination = join(root, `denied-${index++}`);
      await cp(bundle, copy, { recursive: true, errorOnExist: true, force: false });
      await modify(copy);
      const expectedHash = changeReceipt ? sha(await readFile(join(copy, 'manifest.json'))) : receipt.manifestSha256;
      await assert.rejects(restorePilot({ bundleDirectory: copy, destinationDirectory: destination, expectedManifestSha256: expectedHash }), expectedError);
      assert.equal(await pathExists(destination), false);
    }
    await variant(async copy => { const manifest = JSON.parse(await readFile(join(copy, 'manifest.json'))); manifest.createdAt = 'changed'; await writeFile(join(copy, 'manifest.json'), JSON.stringify(manifest)); }, /digest/);
    await variant(async copy => { const manifest = JSON.parse(await readFile(join(copy, 'manifest.json'))); manifest.files[0].path = '../escape'; await writeFile(join(copy, 'manifest.json'), JSON.stringify(manifest)); }, /traversing/, true);
    await variant(async copy => { const manifest = JSON.parse(await readFile(join(copy, 'manifest.json'))); manifest.files.push(manifest.files[0]); await writeFile(join(copy, 'manifest.json'), JSON.stringify(manifest)); }, /duplicate/, true);
    await variant(async copy => { await writeFile(join(copy, 'payload', 'auth-secret'), 'tampered-private-configuration'); }, /SHA-256/);
    await variant(async copy => { await writeFile(join(copy, 'payload', 'auth.sqlite-wal'), 'unlisted raw journal'); }, /journals/);
    await variant(async copy => { await symlink(join(source, 'auth-secret'), join(copy, 'payload', 'linked-secret')); }, /links/);
  });
  await t.test('existing destinations and symlinked source state are never overwritten or deleted', async () => {
    const existing = join(root, 'existing'); await mkdir(existing); await writeFile(join(existing, 'keep.txt'), 'keep this original');
    await assert.rejects(restorePilot({ bundleDirectory: bundle, destinationDirectory: existing, expectedManifestSha256: receipt.manifestSha256 }), /already exists/);
    assert.equal(await readFile(join(existing, 'keep.txt'), 'utf8'), 'keep this original');
    await assert.rejects(backupPilot({ sourceDirectory: source, bundleDirectory: bundle }), /already exists/);
    assert.equal((await verifyPilotBackup({ bundleDirectory: bundle, expectedManifestSha256: receipt.manifestSha256 })).manifestSha256, receipt.manifestSha256);
    await symlink(join(source, 'auth-secret'), join(source, 'linked-private-state'));
    await assert.rejects(backupPilot({ sourceDirectory: source, bundleDirectory: join(root, 'linked-denied') }), /links/);
    await unlink(join(source, 'linked-private-state'));
  });

  const restoredDirectory = join(root, 'restored');
  const restored = await restorePilot({ bundleDirectory: bundle, destinationDirectory: restoredDirectory, expectedManifestSha256: receipt.manifestSha256 });
  assert.equal(restored.files, receipt.files); assert.equal(await pathExists(join(restoredDirectory, 'runtime.pid')), false);
  assert.equal((await stat(restoredDirectory)).mode & 0o777, 0o700);
  const restarted = await start(restoredDirectory);
  await t.test('fresh service authenticates the original users and preserves membership, reports, media and source-linked corrections', async () => {
    for (const item of expected) {
      const worker = client(restarted.origin), admin = client(restarted.origin);
      await worker.ok('/api/auth/sign-in/email', 'POST', { email: item.fixture.tech.email, password: item.fixture.tech.password });
      await admin.ok('/api/auth/sign-in/email', 'POST', { email: item.fixture.owner.email, password: item.fixture.owner.password });
      const account = await worker.ok('/pilot/api/account');
      assert.equal(account.principal.companyId, item.fixture.companyId); assert.equal(account.principal.userId, item.fixture.technicianId);
      const jobs = await worker.ok('/pilot/api/jobs'); assert.deepEqual(jobs.items.map(x => x.id), [item.id]);
      const packet = await worker.ok(`/pilot/api/jobs/${item.id}/closeout`);
      assert.equal(packet.revision, item.packet.revision); assert.equal(packet.confirmation.revision, item.packet.revision);
      assert.equal(packet.closeout.followupOwner, 'Operations');
      assert.equal(packet.closeout.interview.turns[0].supersededBy, packet.closeout.interview.turns[1].id);
      assert.ok(packet.closeout.interview.turns[1].text.includes('2.4 kW'));
      assert.deepEqual((await worker.request(`/pilot/api/jobs/${item.id}/evidence/${item.photo.id}`)).bytes, item.bytes);
      const status = await worker.ok(`/pilot/api/jobs/${item.id}`); assert.equal(status.status.decision, 'accepted_with_followups');
      const original = await worker.request(`/pilot/api/jobs/${item.id}/references/${item.fixture.documentVersionId}/original`);
      assert.equal(original.status, 200);
      const metadata = await admin.ok(`/pilot/api/documents/${item.fixture.documentVersionId}`); assert.equal(sha(original.bytes), metadata.sha256);
      const otherId = expected.find(x => x.id !== item.id).id;
      assert.equal((await worker.request(`/pilot/api/jobs/${otherId}`)).status, 404);
    }
  });
});

test('stale/invalid runtime PID and non-pilot storage are refused without deleting locks', async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'carryforward-backup-guard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'); await mkdir(source);
  const lock = join(source, 'runtime.pid'); await writeFile(lock, '2147483647');
  await assert.rejects(backupPilot({ sourceDirectory: source, bundleDirectory: join(root, 'stale-denied') }), /stale/);
  assert.equal(await readFile(lock, 'utf8'), '2147483647');
  await unlink(lock);
  await assert.rejects(backupPilot({ sourceDirectory: source, bundleDirectory: join(root, 'not-pilot') }), /Missing required isolated pilot/);
  assert.equal(await pathExists(lock), false);
  assert.equal(await pathExists(join(root, 'not-pilot')), false);
});
