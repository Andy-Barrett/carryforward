# Company-pilot identity and people

The isolated company pilot uses **Better Auth 1.7.16**, pinned in the npm lockfile. Better Auth owns credential hashing and verification, signed session cookies, session expiry, password-reset tokens, reset-driven session revocation and authentication rate limits. CarryForward owns company membership and its work permissions. The old contest pairing credential is not an account or company identity. Andrew’s November 4 direction is **one company per user**; company switching is not supported.

The service supports **many independent companies** on the same backend. Each user account belongs to exactly one of them; this is not one company shared by every account. The authenticated principal resolves that company automatically, with no company selector. Reviewing a different fictional company on the same device requires signing out and signing in with that company's distinct account.

This is a locally runnable candidate. Account recovery and invitations have **local rehearsal delivery**, not working email delivery or a production identity-verification process. No hosted authentication account or paid service was added.

The prepared [Render profile](RENDER_PILOT.md) adds `enrollmentEmails` and internal operator provisioning through Better Auth. In that profile, all public signup is forbidden, only approved pre-provisioned test users can reach company data, and the login hides Create account. `GET /pilot/api/account` includes `selfRegistration:false`; the ordinary local profile returns `true`. Removing a user from the configured list denies company access on the next principal check without deleting retained membership/authorship. Existing credentials are never replaced by a changed bootstrap file. This is restricted fictional testing, not verified email ownership or commercial provisioning. Recovery/invitation delivery remains operator-only.

## Integration

```js
import { createPilotAuth } from './pilot/auth.mjs';

const identity = await createPilotAuth({
  databasePath: '/private/pilot/auth.sqlite',
  baseURL: 'http://127.0.0.1:4330',
  secret: process.env.PILOT_AUTH_SECRET,
  // Optional; defaults to auth-outbox beside auth.sqlite.
  localDeliveryPath: '/private/pilot/auth-outbox',
});

// In the Node HTTP server, before application routes:
if (await identity.handler(req, res)) return;
const principal = await identity.requirePrincipal(req);
// Use principal.companyId, userId and role for every application authorization.
// Never replace them with IDs or roles from a request body.
```

`createPilotAuth` runs Better Auth's additive schema migration against the **separate candidate auth database** before accepting requests. It also creates namespaced company, membership, invitation and audit tables. Do not point it at the contest database. No legacy identity migration or real-company population is performed. If an earlier candidate database contains one user in multiple companies, startup fails on the unique index rather than choosing a company or discarding audit history; reconcile the synthetic fixture explicitly before retrying.

Exports:

- `handler(req,res)` / `handle(req,res)` returns whether an auth/account route was handled.
- `principal(req)` returns the current active principal or `null`; `getSession(req)` can identify a signed-in user who has not established a company membership yet.
- `requirePrincipal(req, roles?)` rejects missing company membership or a disallowed role with `PilotAuthError` (`status`, `code`, `message`).
- `listMembers(companyId)` and `isActiveMember(companyId,userId,roles?)` are **internal server methods**. The caller must establish authorization before exposing their results.
- `companies()` is an internal startup/health inventory, not a public company-directory endpoint.
- `close()` releases the auth database for shutdown/restore.

The principal contains `{userId,user:{id,name,email},sessionId,companyId,membershipId,role,company:{id,name},permissions}`. Each user has one enduring company binding, enforced by a unique database index on membership `user_id`. Every principal lookup rereads the library session and that sole active membership; cookie caching is disabled. Signing in automatically resolves the bound company, with no selector or dropdown. Revocation immediately denies access while retaining the original company binding and authorship. A revoked user cannot create or join a different company; a new invitation may restore access only to the same company. Distinct companies use distinct user accounts.

## Roles

| Role | Allowed company work |
| --- | --- |
| Owner | Manage company, administrators and other people; manage documents; dispatch and review work; assigned work |
| Admin | Manage company, dispatcher/technician people and documents; dispatch/review work; assigned work |
| Dispatcher | Dispatch work and perform office review; assigned work |
| Technician | Assigned work only |

Only workspace creation establishes its owner. No invitation or member-edit request can create, replace or revoke the owner. Only the owner manages administrators; an admin cannot promote someone to admin or change an existing admin. A user cannot edit their own membership. Membership revocation is a retained state change, not a user/audit deletion. Active permissions must be checked again for jobs, context, media, model/voice grants and reconnect; a valid login cookie alone is insufficient.

## HTTP account routes

All routes use the configured single origin. POST/PATCH account and authentication requests require an exact `Origin`, JSON, and at most 32 KiB. Host mismatches are rejected. No wildcard CORS is enabled. Cookie responses are `HttpOnly`, `SameSite=Lax`, `Path=/`, with an eight-hour lifetime. HTTPS origins use `Secure` cookies; HTTP is for the loopback rehearsal. Forwarding/IP headers supplied by clients are discarded for authentication; the library rate limit receives the direct socket address. A future reverse proxy needs an explicitly reviewed trust boundary.

| Route | Purpose |
| --- | --- |
| `POST /api/auth/sign-up/email` | Better Auth signup: `{name,email,password}`. Password length 12–128. No company or role comes from signup input. |
| `POST /api/auth/sign-in/email` | Better Auth signin: `{email,password}`. |
| `POST /api/auth/sign-out` | Better Auth revokes the session and clears its cookie. |
| `GET /api/auth/get-session` | Better Auth session, not company authorization. |
| `POST /api/auth/request-password-reset` | Generic response; any usable recovery link goes only to the private local outbox. |
| `POST /api/auth/reset-password` | Better Auth validates `{token,newPassword}`; consumes the token and revokes existing user sessions. |
| `GET /pilot/api/account` | `{authenticated,user,memberships,membership,principal,localDelivery:true}` (zero/one active membership plus retained binding status); signed-out response reveals no company inventory. |
| `POST /pilot/api/account/companies` | An unbound signed-in user creates `{name}` and becomes that company’s owner. Any existing binding, including revoked membership, returns `409 COMPANY_ALREADY_BOUND`. |
| `POST /pilot/api/account/select-company` | Removed: returns 404. The sole company is resolved server-side. |
| `GET /pilot/api/account/members` | Owner/admin/dispatcher gets only the bound company's people. |
| `POST /pilot/api/account/invitations` | Owner/admin creates `{email,role,expiresHours?}` and receives a local copyable link. Default 48 hours; maximum seven days. |
| `GET /pilot/api/account/invitations` | Owner/admin lists bound-company invitation metadata, never token hashes/raw tokens. |
| `POST /pilot/api/account/invitations/accept` | Signed-in matching email redeems `{token}`. Rechecks issuer’s current permission and rejects an existing other-company binding. |
| `POST /pilot/api/account/invitations/:id/revoke` | Authorized owner/admin cancels a pending company invitation. |
| `PATCH /pilot/api/account/members/:id` | Authorized owner/admin changes `{role}` within the restrictions above. |
| `POST /pilot/api/account/members/:id/revoke` | Soft revocation; retained original identity and audit authorship. |
| `GET /pilot/api/account/audit` | Owner/admin reads up to 500 bound-company identity events with actor snapshots. |
| `POST /pilot/api/account/recovery/revoke` | Signed-in user invalidates their own outstanding reset tokens. |

Invitation tokens are random 256-bit values, only hashes are stored. A new invitation to the same company/email replaces older pending links. Redemption is single-use and email-bound; expired/revoked links and links whose issuer lost permission fail. Issuer revocation also revokes their outstanding invitations. Copy links are credentials: keep them out of public logs, screenshots and commits.

Recovery uses Better Auth's 30-minute reset token and validation. Its delivery callback writes an individual `0600` JSON file in a `0700` local outbox, containing the local reset UI URL and expiry. No HTTP endpoint lists this outbox or returns the recovery token to an anonymous requester. Files remain private until the operator removes them; an expired, consumed or revoked link is unusable even if the historical delivery file still exists. The auth database is `0600`; backup and restore must include the configured secret and database under equivalent protection. Do not copy auth state into a public source archive.

The delivery mode does not prove control of a real email address. Production needs verified email delivery, operator access controls, expiration/retention cleanup, abuse monitoring, a recovery-support policy and public-origin TLS/proxy configuration. User deletion is disabled until audit/retention and recovery behavior is designed. Purchasing/subscription entitlements remain separate from membership and access.

## Verification

`PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test pilot/auth.test.mjs` exercises real local HTTP and SQLite, not mocked authentication:

- Two independent companies, matching-email invitations, ignored forged signup role/company fields, forged company selection and wrong-company member IDs, protected owner/admin rules and immediate membership revocation.
- Invitation expiry, revocation, replacement/issuer authority and replay rejection.
- One enduring company per user, database uniqueness, automatic company resolution after sign-in/restart, rejected company switching and logout invalidation.
- Local-only recovery output, password change, prior-session revocation, consumed/revoked/expired reset links and generic unknown-email behavior.
- Foreign/missing Origin, forged Host, oversized body, short password and rate-limit resistance to spoofed forwarding headers.

These checks establish the HTTP identity boundary. Browser/native logout followed by a distinct user login, offline pending work and physical-device login/voice behavior require the separate integrated pilot checks; this module's tests do not claim them.

## Dependency decision

Better Auth's [SQLite documentation](https://better-auth.com/docs/adapters/sqlite) explicitly supports Node's built-in `DatabaseSync`; [database documentation](https://better-auth.com/docs/concepts/database) documents programmatic additive migrations. The [password documentation](https://better-auth.com/docs/authentication/email-password) documents reset expiry and session revocation, and [session guidance](https://better-auth.com/docs/concepts/session-management) explains database sessions and cookie caching. The pinned package and official repository carry [MIT licensing](https://github.com/better-auth/better-auth/blob/main/LICENSE).

The candidate also pins `pdfjs-dist@6.5.438` (Apache-2.0) for the independently implemented bounded text-PDF parser. Better Auth and PDF.js add transitive npm packages; no hosted service, native SQLite addon, install script or paid inference is required. `npm install --ignore-scripts` and `npm audit --omit=dev` completed with zero reported vulnerabilities on November 4, 2026. This is a point-in-time advisory check, not a claim that the dependencies have no security risks.
