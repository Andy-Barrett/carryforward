import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { lstat, realpath, readdir, mkdir, readFile, writeFile, copyFile, chmod, unlink } from 'node:fs/promises';
import { resolve, relative, join, dirname, posix, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = 'carryforward.private-backup.v1';
const MAX_FILES = 20_000;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const REQUIRED_DATABASES = Object.freeze({
  'auth.sqlite': ['user', 'pilot_company', 'pilot_member'],
  'documents.sqlite': ['pilot_documents', 'pilot_document_versions', 'pilot_document_pages'],
  'data/platform.sqlite': ['assignments', 'integrations', 'report_history'],
});
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const inside = (root, target) => { const rel = relative(root, target); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

async function exists(file) { try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function directory(file) {
  const stat = await lstat(file);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('A real directory is required; symlinks are not supported.');
  const canonical = await realpath(file);
  if (canonical !== resolve(file)) fail('Source/bundle paths must not contain symlink components.');
  return canonical;
}
async function freshDirectory(file, protectedRoots = []) {
  const target = resolve(file);
  if (protectedRoots.some(root => inside(root, target) || inside(target, root))) fail('Source, bundle and restore directories must be separate non-nested locations.');
  if (await exists(target)) fail('Destination already exists; no files were overwritten or deleted.');
  const parent = await directory(dirname(target));
  if (parent !== dirname(target)) fail('Destination parent must not contain symlinks.');
  await mkdir(target, { mode: 0o700 });
  return target;
}
function relativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || value.includes('\\') || value.includes('\0') || value.includes(':') || posix.isAbsolute(value) || posix.normalize(value) !== value || value.split('/').some(x => x === '.' || x === '..' || !x)) fail('Manifest contains an invalid or traversing relative path.');
  if (value === 'runtime.pid' || /(?:-wal|-shm|-journal)$/.test(value)) fail('Manifest must not restore live runtime locks or raw SQLite journals.');
  return value;
}
async function hashFile(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function regularFile(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('Backup files must be regular files; links and special files are rejected.');
  return stat;
}
async function walk(root, prefix = '', output = [], snapshot = false) {
  const names = (await readdir(join(root, prefix))).sort();
  for (const name of names) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (snapshot && (rel === 'runtime.pid' || /(?:\.sqlite-(?:wal|shm|journal))$/.test(rel))) continue;
    relativePath(rel);
    const stat = await lstat(join(root, rel));
    if (stat.isSymbolicLink()) fail('Symbolic links are not permitted in pilot state or bundles.');
    if (stat.isDirectory()) await walk(root, rel, output, snapshot);
    else if (stat.isFile()) output.push(rel);
    else fail('Special files are not permitted in pilot state or bundles.');
    if (output.length > MAX_FILES) fail('Pilot snapshot exceeds the bounded file inventory.');
  }
  return output;
}
function inspectSqlite(file, required = []) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') fail('SQLite integrity check failed.');
    const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name));
    if (!required.every(table => names.has(table))) fail('Expected isolated pilot database schema was not found.');
    return { integrity: 'ok', tableCount: names.size };
  } finally { db.close(); }
}
async function validateLayout(root, files) {
  for (const [rel, tables] of Object.entries(REQUIRED_DATABASES)) {
    if (!files.includes(rel)) fail(`Missing required isolated pilot database: ${rel}`);
    inspectSqlite(join(root, rel), tables);
  }
  if (!files.includes('auth-secret')) fail('Private auth-secret is required for a restorable pilot bundle. Keep externally configured secrets in a separately approved recovery process.');
  const secret = await readFile(join(root, 'auth-secret'), 'utf8');
  if (secret.trim().length < 32 || secret.length > 4096) fail('Private authentication configuration is invalid.');
}
function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; return true; }
}
async function claimStoppedPilot(root) {
  const file = join(root, 'runtime.pid');
  if (await exists(file)) {
    const stat = await regularFile(file); if (stat.size > 4096) fail('Invalid runtime lock; resolve it explicitly before backup.');
    const raw = (await readFile(file, 'utf8')).trim();
    let value; try { value = JSON.parse(raw); } catch { value = raw; }
    const pid = Number(typeof value === 'object' ? value?.pid : value);
    if (Number.isInteger(pid) && pid > 0 && processAlive(pid)) fail('Candidate is active. Stop this isolated candidate cleanly before backup.');
    fail('A stale or invalid runtime.pid remains. Confirm the candidate is stopped and resolve this lock explicitly; backup will not delete it.');
  }
  const value = { pid: process.pid, kind: 'offline-backup', nonce: randomUUID() };
  try { await writeFile(file, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code === 'EEXIST') fail('Candidate or another backup acquired the runtime lock.'); throw error; }
  return async () => {
    const current = JSON.parse(await readFile(file, 'utf8'));
    if (current.pid !== value.pid || current.nonce !== value.nonce) fail('Runtime lock ownership changed; it was not deleted.');
    await unlink(file);
  };
}
async function secureParent(file) { await mkdir(dirname(file), { recursive: true, mode: 0o700 }); }

/** Offline full-state export, including credential hashes, sessions and secret configuration. Never publish this bundle. */
export async function backupPilot({ sourceDirectory, bundleDirectory } = {}) {
  if (!sourceDirectory || !bundleDirectory) fail('sourceDirectory and bundleDirectory are required.');
  const source = await directory(resolve(sourceDirectory));
  const release = await claimStoppedPilot(source);
  let bundle;
  try {
    const files = await walk(source, '', [], true);
    await validateLayout(source, files);
    bundle = await freshDirectory(bundleDirectory, [source]);
    const payload = join(bundle, 'payload'); await mkdir(payload, { mode: 0o700 });
    const manifest = { version: VERSION, complete: true, private: true, includesSecrets: true, encryption: 'none; use protected encrypted storage for transport and retention', offline: true, createdAt: new Date().toISOString(), files: [] };
    for (const rel of files) {
      const from = join(source, rel), to = join(payload, rel);
      const before = await regularFile(from); await secureParent(to);
      let details = {};
      if (rel.endsWith('.sqlite')) {
        const db = new DatabaseSync(from, { readOnly: true });
        try { await sqliteBackup(db, to); } finally { db.close(); }
        // SQLite backup retains the source's WAL journal mode. Make the exported
        // target self-contained through SQLite before hashing; never copy WAL bytes.
        const exported = new DatabaseSync(to);
        try { exported.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;'); } finally { exported.close(); }
        details = inspectSqlite(to, REQUIRED_DATABASES[rel] || []);
      } else {
        await copyFile(from, to, constants.COPYFILE_EXCL);
        const after = await regularFile(from);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('Pilot file changed during the offline snapshot. Restart the backup after identifying the writer.');
      }
      await chmod(to, 0o600);
      const copied = await regularFile(to);
      manifest.files.push({ path: rel, bytes: copied.size, sha256: await hashFile(to), kind: rel.endsWith('.sqlite') ? 'sqlite' : rel.startsWith('originals/') ? 'document-original' : 'private-state', ...details });
    }
    const raw = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(bundle, 'manifest.json'), raw, { flag: 'wx', mode: 0o600 });
    const manifestSha256 = sha(raw);
    await writeFile(join(bundle, 'manifest.sha256'), manifestSha256 + '\n', { flag: 'wx', mode: 0o600 });
    return { bundleDirectory: bundle, manifestSha256, files: manifest.files.length, sqliteDatabases: manifest.files.filter(x => x.kind === 'sqlite').length, bytes: manifest.files.reduce((sum, x) => sum + x.bytes, 0), private: true, includesSecrets: true, realProviderCalls: 0 };
  } finally { await release(); }
}

/** Verify against a digest retained OUTSIDE the bundle; hashes inside a modified bundle alone are not authentication. */
export async function verifyPilotBackup({ bundleDirectory, expectedManifestSha256 } = {}) {
  if (!validHash(expectedManifestSha256)) fail('A separately retained trusted expectedManifestSha256 is required.');
  const bundle = await directory(resolve(bundleDirectory));
  const manifestFile = join(bundle, 'manifest.json');
  const stat = await regularFile(manifestFile);
  if (stat.size > MAX_MANIFEST_BYTES) fail('Backup manifest exceeds the size limit.');
  const raw = await readFile(manifestFile);
  if (sha(raw) !== expectedManifestSha256) fail('Backup manifest digest does not match the trusted receipt.');
  let manifest; try { manifest = JSON.parse(raw); } catch { fail('Backup manifest is not valid JSON.'); }
  if (manifest.version !== VERSION || manifest.complete !== true || manifest.private !== true || manifest.includesSecrets !== true || manifest.offline !== true || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > MAX_FILES) fail('Invalid or incomplete private pilot manifest.');
  const paths = new Set();
  for (const entry of manifest.files) {
    relativePath(entry.path);
    if (paths.has(entry.path) || !validHash(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !['sqlite', 'document-original', 'private-state'].includes(entry.kind) || (entry.kind === 'sqlite') !== entry.path.endsWith('.sqlite')) fail('Invalid or duplicate manifest file entry.');
    paths.add(entry.path);
  }
  const payload = await directory(join(bundle, 'payload'));
  const actual = await walk(payload);
  if (actual.length !== paths.size || actual.some(file => !paths.has(file))) fail('Backup payload contains missing or unlisted files.');
  for (const entry of manifest.files) {
    const file = join(payload, entry.path); const current = await regularFile(file);
    if (current.size !== entry.bytes || await hashFile(file) !== entry.sha256) fail('Backup payload failed its size or SHA-256 check.');
    if (entry.kind === 'sqlite') inspectSqlite(file, REQUIRED_DATABASES[entry.path] || []);
  }
  await validateLayout(payload, actual);
  return { bundleDirectory: bundle, payloadDirectory: payload, manifest, manifestSha256: expectedManifestSha256 };
}

export async function restorePilot({ bundleDirectory, destinationDirectory, expectedManifestSha256 } = {}) {
  if (!destinationDirectory) fail('destinationDirectory is required.');
  const checked = await verifyPilotBackup({ bundleDirectory, expectedManifestSha256 });
  // No writes to destination occur until the entire trusted manifest, every original and every SQLite file passed verification.
  const destination = await freshDirectory(destinationDirectory, [checked.bundleDirectory]);
  for (const entry of checked.manifest.files) {
    const file = join(destination, entry.path); await secureParent(file);
    await copyFile(join(checked.payloadDirectory, entry.path), file, constants.COPYFILE_EXCL);
    await chmod(file, 0o600);
    if (await hashFile(file) !== entry.sha256) fail('Restored file did not match the verified snapshot. Destination is incomplete; it was not started.');
  }
  await validateLayout(destination, checked.manifest.files.map(x => x.path));
  return { destinationDirectory: destination, manifestSha256: expectedManifestSha256, files: checked.manifest.files.length, private: true, includesSecrets: true, requiresOnlineAuthentication: true, realProviderCalls: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, first, second, digest] = process.argv.slice(2);
  try {
    const result = command === 'backup' ? await backupPilot({ sourceDirectory: first, bundleDirectory: second })
      : command === 'verify' ? await verifyPilotBackup({ bundleDirectory: first, expectedManifestSha256: second })
      : command === 'restore' ? await restorePilot({ bundleDirectory: first, destinationDirectory: second, expectedManifestSha256: digest })
      : fail('Use backup SOURCE NEW_BUNDLE, verify BUNDLE TRUSTED_SHA256, or restore BUNDLE NEW_DESTINATION TRUSTED_SHA256.');
    console.log(JSON.stringify(command === 'verify' ? { private: true, verified: true, files: result.manifest.files.length, manifestSha256: result.manifestSha256 } : result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
