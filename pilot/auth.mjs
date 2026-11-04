import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';

export const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze(['company:manage', 'people:manage', 'context:manage', 'work:dispatch', 'work:review', 'work:assigned']),
  admin: Object.freeze(['company:manage', 'people:manage', 'context:manage', 'work:dispatch', 'work:review', 'work:assigned']),
  dispatcher: Object.freeze(['work:dispatch', 'work:review', 'work:assigned']),
  technician: Object.freeze(['work:assigned']),
});
const ROLES = Object.keys(ROLE_PERMISSIONS);
const ACCOUNT = '/pilot/api/account';
const PRIVATE_PILOT_AUTH_PATHS = new Set(['/api/auth/sign-up/email', '/api/auth/sign-in/email', '/api/auth/sign-out', '/api/auth/get-session', '/api/auth/request-password-reset', '/api/auth/reset-password']);
const hash = value => createHash('sha256').update(value).digest('hex');
const clean = (value, max = 160) => typeof value === 'string' && value.trim().length <= max && !/[\u0000-\u001f]/.test(value) ? value.trim() : '';
const emailValue = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.length < 255 ? value.trim().toLowerCase() : '';

export class PilotAuthError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function fail(status, code, message) { throw new PilotAuthError(status, code, message); }
function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'JSON_REQUIRED', 'Use application/json.');
  let raw = ''; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32_768) fail(413, 'REQUEST_TOO_LARGE', 'Account request exceeds 32 KiB.');
    raw += chunk;
  }
  try { const value = JSON.parse(raw); if (value && typeof value === 'object' && !Array.isArray(value)) return value; } catch {}
  fail(400, 'INVALID_JSON', 'A JSON object is required.');
}

/** Separate auth SQLite; never point this at the contest simulator database. */
export async function createPilotAuth({ databasePath, baseURL, secret, localDeliveryPath, enrollmentEmails, clock = Date.now } = {}) {
  const origin = new URL(baseURL).origin;
  if (new URL(baseURL).pathname !== '/') throw new Error('Auth baseURL must be an origin.');
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('PILOT_AUTH_SECRET must have at least 32 characters.');
  if (!databasePath) throw new Error('Auth databasePath is required.');
  if (enrollmentEmails !== undefined && (!Array.isArray(enrollmentEmails) || !enrollmentEmails.length || enrollmentEmails.length > 50 || enrollmentEmails.some(value => !emailValue(value)))) throw new Error('Provide 1–50 approved private-pilot email addresses.');
  const enrollment = enrollmentEmails === undefined ? null : new Set(enrollmentEmails.map(emailValue));
  if (databasePath !== ':memory:') await mkdir(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS pilot_company (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pilot_member (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES pilot_company(id), user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','dispatcher','technician')), status TEXT NOT NULL CHECK(status IN ('active','revoked')),
      created_at INTEGER NOT NULL, revoked_at INTEGER, UNIQUE(company_id,user_id));
    CREATE UNIQUE INDEX IF NOT EXISTS pilot_member_one_company_per_user ON pilot_member(user_id);
    CREATE TABLE IF NOT EXISTS pilot_invitation (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES pilot_company(id), email TEXT NOT NULL,
      role TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL,
      invited_by TEXT NOT NULL, accepted_by TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pilot_auth_audit (id TEXT PRIMARY KEY, company_id TEXT, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
      actor_email TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pilot_delivery (id TEXT PRIMARY KEY, user_id TEXT, kind TEXT NOT NULL, token_hash TEXT NOT NULL,
      status TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
  `);
  const localOutbox = localDeliveryPath || (databasePath === ':memory:' ? null : path.join(path.dirname(databasePath), 'auth-outbox'));
  async function deliver(kind, user, token, expiresAt) {
    if (!localOutbox) throw new Error('Configure private localDeliveryPath for recovery rehearsal.');
    await mkdir(localOutbox, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    const url = `${origin}/pilot/#recovery=${encodeURIComponent(token)}`;
    await writeFile(path.join(localOutbox, `${id}.json`), JSON.stringify({ id, kind, email: user.email, url, expiresAt, localOnly: true, note: 'Local rehearsal only. No email was sent. Treat this link as a credential.' }, null, 2), { mode: 0o600, flag: 'wx' });
    db.prepare('INSERT INTO pilot_delivery VALUES (?,?,?,?,?,?,?)').run(id, user.id, kind, hash(token), 'pending', expiresAt, clock());
  }
  const options = {
    appName: 'CarryForward company pilot', database: db, baseURL: origin, basePath: '/api/auth', secret,
    trustedOrigins: [origin], telemetry: { enabled: false },
    advanced: { cookiePrefix: 'carryforward-pilot', useSecureCookies: origin.startsWith('https:'), defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: ['x-carryforward-client-ip'] } },
    session: { expiresIn: 8 * 60 * 60, updateAge: 30 * 60, cookieCache: { enabled: false } },
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, autoSignIn: !enrollment,
      revokeSessionsOnPasswordReset: true, resetPasswordTokenExpiresIn: 30 * 60,
      sendResetPassword: async ({ user, token }) => deliver('password-reset', user, token, clock() + 30 * 60_000),
      onPasswordReset: async ({ user }) => {
        db.prepare("UPDATE pilot_delivery SET status='used' WHERE user_id=? AND kind='password-reset' AND status='pending'").run(user.id);
      },
    },
    // Company members are retained for authorship. Account deletion needs a separate retention/recovery design.
    disabledPaths: ['/delete-user', '/delete-user/callback', ...(enrollment ? ['/change-email'] : [])],
    rateLimit: { enabled: true, window: 60, max: 100, storage: 'database', customRules: {
      '/sign-in/email': { window: 60, max: 10 }, '/sign-up/email': { window: 60, max: 8 }, '/request-password-reset': { window: 60, max: 5 },
    } },
  };
  const migration = await getMigrations(options);
  await migration.runMigrations();
  const auth = betterAuth(options);
  if (databasePath !== ':memory:') await chmod(databasePath, 0o600);
  function audit(user, companyId, action, targetId, detail = {}) {
    db.prepare('INSERT INTO pilot_auth_audit VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(), companyId, user.id, user.name, user.email, action, targetId, JSON.stringify(detail), clock());
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  async function session(req) {
    const found = await auth.api.getSession({ headers: fromNodeHeaders(req.headers), query: { disableCookieCache: true, disableRefresh: true } });
    return found && (!enrollment || enrollment.has(emailValue(found.user.email))) ? found : null;
  }
  function memberships(userId) {
    return db.prepare(`SELECT m.id, m.company_id AS companyId, m.role, c.name AS companyName FROM pilot_member m
      JOIN pilot_company c ON c.id=m.company_id WHERE m.user_id=? AND m.status='active' ORDER BY m.created_at,m.id`).all(userId);
  }
  function binding(userId) {
    return db.prepare(`SELECT m.id,m.company_id AS companyId,m.role,m.status,c.name AS companyName FROM pilot_member m
      JOIN pilot_company c ON c.id=m.company_id WHERE m.user_id=?`).get(userId) || null;
  }
  async function principal(req) {
    const found = await session(req);
    if (!found) return null;
    const member = db.prepare(`SELECT m.id, m.role, c.id AS companyId, c.name AS companyName FROM pilot_member m
      JOIN pilot_company c ON c.id=m.company_id WHERE m.user_id=? AND m.status='active'`).get(found.user.id);
    if (!member) return null;
    return { userId: found.user.id, user: { id: found.user.id, name: found.user.name, email: found.user.email }, sessionId: found.session.id,
      companyId: member.companyId, membershipId: member.id, role: member.role, company: { id: member.companyId, name: member.companyName }, permissions: ROLE_PERMISSIONS[member.role] };
  }
  async function requirePrincipal(req, roles) {
    const p = await principal(req);
    if (!p) fail(401, 'ACTIVE_MEMBERSHIP_REQUIRED', 'Sign in with an active company membership.');
    if (roles && !roles.includes(p.role)) fail(403, 'FORBIDDEN', 'Your company role does not permit this action.');
    return p;
  }
  function listMembers(companyId) {
    return db.prepare(`SELECT m.id, m.user_id AS userId, m.role, m.status, m.created_at AS createdAt, m.revoked_at AS revokedAt, u.name, u.email
      FROM pilot_member m JOIN user u ON u.id=m.user_id WHERE m.company_id=? ORDER BY m.created_at,m.id`).all(companyId);
  }
  function isActiveMember(companyId, userId, roles) {
    if (typeof companyId !== 'string' || typeof userId !== 'string') return false;
    const row = db.prepare("SELECT id,role FROM pilot_member WHERE company_id=? AND user_id=? AND status='active'").get(companyId, userId);
    return !!row && (!roles || roles.includes(row.role));
  }
  function manageRole(p, role, existing) {
    if (!ROLES.includes(role) || role === 'owner' || existing?.role === 'owner') fail(403, 'OWNER_PROTECTED', 'The workspace owner cannot be created, replaced or revoked here.');
    if (p.role !== 'owner' && (role === 'admin' || existing?.role === 'admin')) fail(403, 'OWNER_REQUIRED', 'Only the owner can manage administrators.');
  }
  async function handler(req, res) {
    const requestURL = new URL(req.url, origin);
    const pathname = requestURL.pathname;
    if (!pathname.startsWith('/api/auth/') && pathname !== ACCOUNT && !pathname.startsWith(`${ACCOUNT}/`)) return false;
    try {
      if (req.headers.host !== new URL(origin).host) fail(421, 'UNEXPECTED_HOST', 'Use the configured pilot origin.');
      if (requestURL.origin !== origin) fail(421, 'UNEXPECTED_HOST', 'Use a relative path at the configured pilot origin.');
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (mutation && req.headers.origin !== origin) fail(403, 'ORIGIN_REQUIRED', 'Account changes require this application origin.');
      if (pathname.startsWith('/api/auth/')) {
        if (enrollment && !PRIVATE_PILOT_AUTH_PATHS.has(pathname)) fail(404, 'NOT_FOUND', 'Account route not available in this private pilot.');
        if (enrollment && pathname === '/api/auth/sign-up/email') fail(403, 'PILOT_ACCESS_RESTRICTED', 'Private-pilot accounts are provided by the pilot administrator. Sign in with your existing test account.');
        // Better Auth owns password hashing, signed cookies, resets, session expiry/revocation, CSRF and rate limits.
        const headers = fromNodeHeaders(req.headers);
        // This local server is the trust boundary. Never accept client-supplied forwarding/IP assertions.
        for (const key of ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'content-length']) headers.delete(key);
        headers.set('x-carryforward-client-ip', req.socket.remoteAddress || '127.0.0.1');
        const value = mutation ? await body(req) : undefined;
        if (enrollment && ['/api/auth/sign-up/email', '/api/auth/sign-in/email'].includes(pathname) && !enrollment.has(emailValue(value?.email))) fail(403, 'PILOT_ACCESS_RESTRICTED', 'This private pilot is limited to approved test accounts. Contact the pilot administrator.');
        const input = mutation ? JSON.stringify(value) : undefined;
        const response = await auth.handler(new Request(new URL(req.url, origin), { method: req.method, headers, body: input }));
        const responseHeaders = Object.fromEntries([...response.headers].filter(([key]) => key !== 'set-cookie'));
        responseHeaders['set-cookie'] = response.headers.getSetCookie();
        responseHeaders['cache-control'] = 'no-store';
        res.writeHead(response.status, responseHeaders);
        res.end(Buffer.from(await response.arrayBuffer()));
        return true;
      }
      const method = req.method;
      const route = pathname.slice(ACCOUNT.length);
      if (!route && method === 'GET') {
        const found = await session(req);
        send(res, 200, found ? { authenticated: true, user: { id: found.user.id, name: found.user.name, email: found.user.email }, memberships: memberships(found.user.id), membership: binding(found.user.id), principal: await principal(req), localDelivery: true, selfRegistration: !enrollment } : { authenticated: false, user: null, memberships: [], membership: null, principal: null, localDelivery: true, selfRegistration: !enrollment });
        return true;
      }
      if (route === '/companies' && method === 'POST') {
        const found = await session(req);
        if (!found) fail(401, 'SIGN_IN_REQUIRED', 'Sign in before creating a workspace.');
        const input = await body(req); const name = clean(input.name);
        if (!name) fail(400, 'COMPANY_NAME_REQUIRED', 'Enter a company name up to 160 characters.');
        if (binding(found.user.id)) fail(409, 'COMPANY_ALREADY_BOUND', 'Each user belongs to one company. This account already has a company membership, including any revoked membership.');
        const companyId = randomUUID(); const membershipId = randomUUID();
        transaction(() => {
          db.prepare('INSERT INTO pilot_company VALUES (?,?,?)').run(companyId, name, clock());
          db.prepare('INSERT INTO pilot_member VALUES (?,?,?,?,?,?,NULL)').run(membershipId, companyId, found.user.id, 'owner', 'active', clock());
          audit(found.user, companyId, 'company.created', companyId, { name });
        });
        send(res, 201, { principal: await principal(req) }); return true;
      }
      if (route === '/select-company') fail(404, 'NOT_FOUND', 'Each user has one company; company switching is not supported.');
      if (route === '/invitations/accept' && method === 'POST') {
        const found = await session(req);
        if (!found) fail(401, 'SIGN_IN_REQUIRED', 'Sign in using the invited email first.');
        const input = await body(req);
        const token = clean(input.token, 128);
        const invite = token && db.prepare('SELECT * FROM pilot_invitation WHERE token_hash=?').get(hash(token));
        if (!invite || invite.status !== 'pending' || invite.expires_at <= clock() || invite.email !== found.user.email.toLowerCase()) fail(400, 'INVITATION_INVALID', 'The invitation is expired, revoked, used or does not match your signed-in email.');
        const currentBinding = binding(found.user.id);
        if (currentBinding && currentBinding.companyId !== invite.company_id) fail(409, 'COMPANY_ALREADY_BOUND', 'Each user belongs to one company. Use a distinct account for another company.');
        const inviter = db.prepare("SELECT role FROM pilot_member WHERE company_id=? AND user_id=? AND status='active'").get(invite.company_id, invite.invited_by);
        if (!inviter || !['owner', 'admin'].includes(inviter.role) || (invite.role === 'admin' && inviter.role !== 'owner')) fail(400, 'INVITATION_INVALID', 'The invitation issuer no longer has permission.');
        transaction(() => {
          const existing = db.prepare('SELECT * FROM pilot_member WHERE company_id=? AND user_id=?').get(invite.company_id, found.user.id);
          if (existing?.status === 'active') fail(409, 'ALREADY_MEMBER', 'You already belong to this company.');
          if (existing?.role === 'owner') fail(409, 'OWNER_PROTECTED', 'Owner membership cannot be replaced.');
          db.prepare(`INSERT INTO pilot_member VALUES (?,?,?,?,?,?,NULL) ON CONFLICT(company_id,user_id)
            DO UPDATE SET role=excluded.role,status='active',revoked_at=NULL`).run(randomUUID(), invite.company_id, found.user.id, invite.role, 'active', clock());
          db.prepare("UPDATE pilot_invitation SET status='accepted',accepted_by=? WHERE id=? AND status='pending'").run(found.user.id, invite.id);
          audit(found.user, invite.company_id, 'invitation.accepted', invite.id, { role: invite.role, invitedBy: invite.invited_by });
        });
        send(res, 200, { principal: await principal(req) }); return true;
      }
      if (route === '/recovery/revoke' && method === 'POST') {
        const found = await session(req); if (!found) fail(401, 'SIGN_IN_REQUIRED', 'Sign in first.');
        transaction(() => {
          db.prepare("DELETE FROM verification WHERE value=? AND identifier LIKE 'reset-password:%'").run(found.user.id);
          db.prepare("UPDATE pilot_delivery SET status='revoked' WHERE user_id=? AND status='pending'").run(found.user.id);
          audit(found.user, null, 'recovery.revoked', found.user.id);
        });
        send(res, 200, { revoked: true }); return true;
      }
      const p = await requirePrincipal(req, ['owner', 'admin', ...(route === '/members' && method === 'GET' ? ['dispatcher'] : [])]);
      if (route === '/members' && method === 'GET') {
        send(res, 200, { members: listMembers(p.companyId) }); return true;
      }
      if (route === '/audit' && method === 'GET') {
        const rows = db.prepare('SELECT * FROM pilot_auth_audit WHERE company_id=? ORDER BY created_at,id LIMIT 500').all(p.companyId);
        send(res, 200, { events: rows.map(row => ({ ...row, detail: JSON.parse(row.detail) })) }); return true;
      }
      if (route === '/invitations' && method === 'GET') {
        send(res, 200, { invitations: db.prepare('SELECT id,email,role,status,expires_at AS expiresAt,created_at AS createdAt FROM pilot_invitation WHERE company_id=? ORDER BY created_at DESC').all(p.companyId) }); return true;
      }
      if (route === '/invitations' && method === 'POST') {
        const input = await body(req); const email = emailValue(input.email); const role = input.role;
        if (enrollment && !enrollment.has(email)) fail(403, 'PILOT_ACCESS_RESTRICTED', 'The pilot operator must approve this test email before an invitation can be created.');
        manageRole(p, role);
        if (!email) fail(400, 'EMAIL_REQUIRED', 'Enter the invited person’s email.');
        const expiresHours = input.expiresHours ?? 48;
        if (!Number.isFinite(expiresHours) || expiresHours < 0.05 || expiresHours > 168) fail(400, 'INVALID_EXPIRY', 'Invitation expiry must be between 3 minutes and 7 days.');
        const id = randomUUID(); const token = randomBytes(32).toString('base64url'); const expiresAt = clock() + expiresHours * 3_600_000;
        transaction(() => {
          db.prepare("UPDATE pilot_invitation SET status='replaced' WHERE company_id=? AND email=? AND status='pending'").run(p.companyId, email);
          db.prepare("INSERT INTO pilot_invitation VALUES (?,?,?,?,?,?, 'pending',?,NULL,?)").run(id, p.companyId, email, role, hash(token), expiresAt, p.userId, clock());
          audit(p.user, p.companyId, 'invitation.created', id, { email, role, expiresAt });
        });
        send(res, 201, { invitation: { id, email, role, expiresAt }, url: `${origin}/pilot/#invite=${token}`, localOnly: true, note: 'Copy link for local rehearsal. No email was sent.' }); return true;
      }
      const revokeInvite = /^\/invitations\/([^/]+)\/revoke$/.exec(route);
      if (revokeInvite && method === 'POST') {
        const invite = db.prepare('SELECT * FROM pilot_invitation WHERE id=? AND company_id=?').get(revokeInvite[1], p.companyId);
        if (!invite) fail(404, 'NOT_FOUND', 'Invitation not found.');
        manageRole(p, invite.role);
        transaction(() => { db.prepare("UPDATE pilot_invitation SET status='revoked' WHERE id=? AND status='pending'").run(invite.id); audit(p.user, p.companyId, 'invitation.revoked', invite.id); });
        send(res, 200, { revoked: true }); return true;
      }
      const memberRoute = /^\/members\/([^/]+)(\/revoke)?$/.exec(route);
      if (memberRoute && ((method === 'PATCH' && !memberRoute[2]) || (method === 'POST' && memberRoute[2]))) {
        const member = db.prepare('SELECT * FROM pilot_member WHERE id=? AND company_id=?').get(memberRoute[1], p.companyId);
        if (!member) fail(404, 'NOT_FOUND', 'Member not found.');
        const input = method === 'PATCH' ? await body(req) : null;
        const nextRole = input?.role ?? member.role;
        manageRole(p, nextRole, member);
        if (member.user_id === p.userId) fail(409, 'SELF_CHANGE_BLOCKED', 'Ask the workspace owner to change your own membership.');
        transaction(() => {
          if (method === 'PATCH') db.prepare('UPDATE pilot_member SET role=? WHERE id=?').run(nextRole, member.id);
          else {
            db.prepare("UPDATE pilot_member SET status='revoked',revoked_at=? WHERE id=?").run(clock(), member.id);
            db.prepare("UPDATE pilot_invitation SET status='revoked' WHERE company_id=? AND invited_by=? AND status='pending'").run(p.companyId, member.user_id);
          }
          audit(p.user, p.companyId, method === 'PATCH' ? 'member.role_changed' : 'member.revoked', member.id, { userId: member.user_id, previousRole: member.role, role: nextRole });
        });
        send(res, 200, { member: listMembers(p.companyId).find(row => row.id === member.id) }); return true;
      }
      fail(404, 'NOT_FOUND', 'Account route not found.');
    } catch (error) {
      if (!res.headersSent) send(res, error.status || 500, { error: error.code || 'ACCOUNT_ERROR', message: error.status ? error.message : 'Account operation failed.' });
      else if (!res.writableEnded) res.end();
    }
    return true;
  }
  return { handler, handle: handler, principal, requirePrincipal, listMembers, isActiveMember,
    checkStorage() { db.prepare('SELECT id FROM pilot_company LIMIT 1').get(); return true; },
    enrollmentReady() { return !!enrollment && [...enrollment].every(email => db.prepare('SELECT id FROM user WHERE lower(email)=?').get(email)); },
    async provisionTestAccounts(users) {
      if (!enrollment || !Array.isArray(users) || users.length !== enrollment.size || new Set(users.map(x=>emailValue(x?.email))).size !== enrollment.size || users.some(x=>!enrollment.has(emailValue(x?.email)) || !clean(x?.name) || typeof x?.password!=='string' || x.password.length<12 || x.password.length>128)) throw Error('Bootstrap must contain exactly the approved fictional test accounts with valid credentials.');
      // Operator-only server method. It has no HTTP route and never changes an
      // existing account password, name, membership or audit history.
      for (const input of users) {
        if (!db.prepare('SELECT id FROM user WHERE lower(email)=?').get(emailValue(input.email))) await auth.api.signUpEmail({body:{name:clean(input.name),email:emailValue(input.email),password:input.password}});
      }
    },
    async getSession(req) { return session(req); },
    companies: () => db.prepare('SELECT id,name,created_at AS createdAt FROM pilot_company ORDER BY created_at,id').all(),
    close: () => db.close(),
  };
}
