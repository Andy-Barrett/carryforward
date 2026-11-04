import { readFile, realpath, lstat, mkdir, statfs, open, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createPilotServer } from './server.mjs';

export const HOSTED_SCOPE = 'fictional-private-pilot-v1';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const fail = message => { throw Error(message); };
const within = (parent, child) => { const r = relative(parent, child); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };

// No credentials or runtime configuration are inferred from the local pilot.
export function hostedConfiguration(env = process.env) {
  if (env.CF_PILOT_RELEASE_SCOPE !== HOSTED_SCOPE) fail('Set the explicit fictional private-pilot release scope. Real-company onboarding is not enabled.');
  let url;
  try { url = new URL(env.CF_PILOT_PUBLIC_ORIGIN || (env.RENDER_EXTERNAL_HOSTNAME ? 'https://' + env.RENDER_EXTERNAL_HOSTNAME : '')); } catch { fail('CF_PILOT_PUBLIC_ORIGIN must be an HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname) || /\.(local|localhost)$/.test(url.hostname)) fail('CF_PILOT_PUBLIC_ORIGIN must be an HTTPS service hostname without credentials, path or custom port.');
  if (env.RENDER_EXTERNAL_HOSTNAME && env.RENDER_EXTERNAL_HOSTNAME !== url.hostname) fail('The configured origin must match the Render service hostname. Use its initial onrender.com hostname for this rehearsal.');
  const port = Number(env.PORT || 10000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('PORT must be an integer from 1024 to 65535.');
  const diskPath = env.CF_PILOT_DISK_PATH || '/var/data';
  const directory = env.CF_PILOT_STATE_DIR || join(diskPath, 'carryforward');
  if (!isAbsolute(diskPath) || !isAbsolute(directory) || resolve(diskPath) !== diskPath || resolve(directory) !== directory || diskPath === '/' || !within(diskPath, directory) || within(projectRoot, directory) || directory === projectRoot) fail('State must use a distinct absolute directory beneath the persistent disk, outside the source checkout.');
  const enrollmentEmails = String(env.CF_PILOT_ALLOWED_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!enrollmentEmails.length || enrollmentEmails.length > 50 || enrollmentEmails.some(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) || x.length > 254) || new Set(enrollmentEmails).size !== enrollmentEmails.length) fail('Set 1–50 distinct approved private-pilot test email addresses.');
  if (env.CARRYFORWARD_PILOT_PROVIDER_CONFIG || env.CF_PILOT_PROVIDER_CONFIG) fail('This first hosted rehearsal keeps inference off. Existing provider keys and spend ledgers are not copied or reset.');
  const bootstrapFile = env.CF_PILOT_BOOTSTRAP_FILE || '/etc/secrets/carryforward-pilot-accounts.json';
  if(!isAbsolute(bootstrapFile) || resolve(bootstrapFile)!==bootstrapFile)fail('The operator bootstrap file must use an absolute path.');
  return Object.freeze({ origin:url.origin, port, diskPath, directory, bootstrapFile, enrollmentEmails:Object.freeze(enrollmentEmails), minFreeBytes:64n*1024n*1024n });
}

export function mountedReadWriteDisk(mountinfo, diskPath) {
  const decode = value => value.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
  return mountinfo.split('\n').some(line => {
    const parts = line.split(' - ');
    if (parts.length !== 2) return false;
    const fields = parts[0].split(' '), filesystem = parts[1].split(' ');
    return fields.length >= 6 && decode(fields[4]) === diskPath && fields[5].split(',').includes('rw') && !['tmpfs','ramfs','overlay','proc','sysfs'].includes(filesystem[0]) && filesystem[2]?.split(',').includes('rw');
  });
}

export async function verifyRenderDisk(config) {
  if (process.platform !== 'linux') fail('The hosted entry point requires a Linux mounted disk. Use the isolated local rehearsal for macOS development.');
  const stat = await lstat(config.diskPath);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(config.diskPath) !== config.diskPath || !mountedReadWriteDisk(await readFile('/proc/self/mountinfo','utf8'), config.diskPath)) fail('The persistent disk is not mounted read-write. Refusing ephemeral storage.');
  return true;
}

async function existingFile(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function storageCheck(config, verifyDisk) {
  if (await verifyDisk(config) !== true) return false;
  if (await realpath(config.directory) !== config.directory) return false;
  const space = await statfs(config.directory, { bigint:true });
  if (space.bavail * space.bsize < config.minFreeBytes) return false;
  const probe = join(config.directory, '.readiness-' + randomUUID());
  let handle;
  try { handle=await open(probe,'wx',0o600); await handle.writeFile('ready'); await handle.sync(); }
  finally { if(handle) { await handle.close(); await unlink(probe); } }
  return true;
}

export async function createHostedPilot(config, { verifyDisk = verifyRenderDisk } = {}) {
  // verifyDisk is injectable only by local tests, never by an HTTP request or env flag.
  if (await verifyDisk(config) !== true) fail('The persistent disk is unavailable.');
  if (await realpath(config.diskPath) !== config.diskPath) fail('The disk path must be canonical.');
  await mkdir(config.directory, {recursive:true,mode:0o700});
  if (await realpath(config.directory) !== config.directory) fail('The state directory must not contain symlinks.');
  const core=['auth.sqlite','documents.sqlite','data/platform.sqlite'];
  const existing=await Promise.all(core.map(name=>existingFile(join(config.directory,name))));
  const secretStat=await existingFile(join(config.directory,'auth-secret'));
  if ((existing.some(Boolean) || secretStat) && (!existing.every(Boolean) || !secretStat)) fail('Existing hosted state is incomplete. Use the reviewed restore procedure; no new database or secret was substituted.');
  for(const item of [...existing,secretStat].filter(Boolean)) if(!item.isFile()||item.isSymbolicLink()) fail('Hosted database and secret files must be regular private files.');
  if(secretStat){const secret=await readFile(join(config.directory,'auth-secret'),'utf8');if(secret.trim().length<32||secret.length>4096)fail('The retained authentication secret is invalid.');}
  if (!await storageCheck(config, verifyDisk)) fail('Persistent storage is not ready or has less than 64 MiB free.');
  const app=await createPilotServer({ directory:config.directory,port:config.port,listenHost:'0.0.0.0',baseURL:config.origin,authOptions:{enrollmentEmails:config.enrollmentEmails},providerConfig:{},maxDocumentUploads:1,readiness:()=>storageCheck(config,verifyDisk) });
  try {
    if(!app.auth.enrollmentReady()){
      const stat=await lstat(config.bootstrapFile);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768||await realpath(config.bootstrapFile)!==config.bootstrapFile)fail('Use a bounded regular private operator bootstrap file.');
      const bootstrap=JSON.parse(await readFile(config.bootstrapFile,'utf8'));
      if(bootstrap.scope!==HOSTED_SCOPE)fail('The bootstrap must declare the fictional private-pilot scope.');
      await app.auth.provisionTestAccounts(bootstrap.users);
    }
  }catch(error){await app.close();throw error;}
  const listen=app.listen.bind(app);
  app.listen=async()=>{try{return await listen();}catch(error){await app.close();throw error;}};
  return app;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let app;
  try {
    const config=hostedConfiguration();
    app=await createHostedPilot(config);
    await app.listen();
    console.log('CarryForward private fictional pilot listening; inference disabled.');
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;try{await app.close({forceAfterMs:8000});process.exitCode=0;}catch{console.error('Hosted shutdown did not complete; preserve the volume and inspect its runtime lock.');process.exitCode=1;}};
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
  }catch{console.error('Hosted startup refused. Check the origin, approved test accounts, mounted volume and private state; no local-pilot fallback was used.');process.exitCode=1;}
}
