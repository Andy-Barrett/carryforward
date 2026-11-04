# Operating and recovering the isolated company pilot

This runbook covers the local company candidate on `codex/company-pilot-20261104`. It does not deploy a service, change the contest installation, onboard real customers or establish a commercial launch. Use the CarryForward candidate checkout, not the unrelated Perihelion repository. All rehearsals use fictional records.

## Start and check the candidate

Use Node.js 24 and the pinned dependency lockfile:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm ci --ignore-scripts
CARRYFORWARD_PILOT_PORT=4430 node pilot/server.mjs
```

The ordinary CLI serves `http://127.0.0.1:4430/pilot/`. Its state defaults to `.local/company-pilot/`; a programmatic `createPilotServer({directory,port,baseURL})` can use another isolated path/unused port. Do not point it at the contest databases, phone storage or Perihelion records. Do not restart an existing service to free a port without establishing which service it is.

Before first use, verify the Node version, dependency install, intended origin/port, writable private state directory and durable local disk capacity. The auth configuration requires a secret of at least 32 characters. The server creates a random private `auth-secret` file when none is provided; preserving that secret is part of recovery. Use an exact configured origin; HTTP Host and browser mutation Origin are checked. Default CLI listening is loopback only. It is not a public HTTPS deployment configuration.

`GET /healthz` is a liveness check. It does not prove provider health, successful authentication, available disk space, restorable backups or production readiness. After a restart, sign in with a fictional user, check their company/role and assigned work, open a permitted original, and verify the office inbox with the appropriate role. Wrong-company and revoked access must remain denied. Provider configuration remains disabled by default; a fast fixture/manual lookup is not evidence of live speech latency.

The server acquires `runtime.pid` exclusively before opening databases and removes its own lock after clean shutdown. Stop **only the isolated candidate**, preferably with Ctrl+C in its own terminal. A still-running process blocks backup. A crashed constructor/process may leave a stale lock. Check the exact candidate process and directory before an operator resolves it; backup never deletes a stale/invalid lock or guesses that an active PID is safe to ignore. PID reuse deliberately fails closed.

## Private full-state export

`pilot/backup.mjs` exports all state within the isolated candidate directory. It requires the expected auth, document and platform schemas plus `auth-secret`, which also prevents accidentally treating contest storage as a pilot. It includes:

- Better Auth users, password hashes, sessions, company membership, invitations and retained audit authorship.
- Platform assignments, integration credential hashes, cache-key material, reminder state, archived reports and report-author bindings.
- Each company's Operations database, including original photo/audio bytes, event/correction history, exact confirmations and separate receipt/acceptance state.
- Document metadata, extracted pages and immutable original document bytes.
- Private configuration and any local rehearsal credential/recovery-delivery files within the candidate state directory.

This bundle contains **secrets and all companies' data**. It is a privileged operator export, not a company-scoped download for ordinary app users. Never put it in Git, the public MIT archive, the contest video, a shared link or an unprotected issue attachment. Directory/file permissions are `0700`/`0600`; **the bundle itself is not encrypted**. Use a separately approved encrypted storage/transport process before moving or retaining real data. Local filesystem permissions alone do not protect against the same OS account or device compromise.

Example after cleanly stopping the correct candidate:

```sh
mkdir -p .local/backups
node pilot/backup.mjs backup \
  .local/company-pilot \
  .local/backups/company-pilot-private-20261104
```

The destination must not exist, its parent must already exist, and source/bundle paths must be canonical directories without symlink components. Source and destination cannot be nested. The function claims the same `runtime.pid` lock exclusively during export so a cooperating server cannot start midway.

Each SQLite file is exported through Node's [SQLite backup API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html#sqlitebackupsourcedb-path-options). A source's committed WAL data is captured through SQLite; raw `-wal`, `-shm` and rollback journals are not copied. The exported target is checkpointed and switched to DELETE journal mode through SQLite, then integrity-checked and hashed as a self-contained file. This avoids a stale database/raw-WAL mixture. Cross-database consistency comes from stopping and locking the service; per-database backup alone would not provide a multi-database transaction against a running writer. External writers that ignore the lock are unsupported.

Other regular files are copied without overwriting and hashed. Symbolic links and special files are rejected. The completed bundle contains `manifest.json`, `manifest.sha256` and `payload/`. The command prints only the private bundle path, file/database counts, total bytes and manifest digest, never credential values. Retain the returned `manifestSha256` **outside the bundle** in a trusted private receipt. A hash stored only beside data is not proof against an attacker who changes both.

A failed export can leave a private partial destination. Without a valid completed manifest it is not a usable backup. The tool does not delete or reuse that directory; inspect it and choose a new destination. It releases only the runtime lock carrying its own nonce. No original source records are deleted.

## Verify and restore to a fresh destination

Use the exact digest from the separately retained trusted receipt:

```sh
node pilot/backup.mjs verify \
  .local/backups/company-pilot-private-20261104 \
  TRUSTED_MANIFEST_SHA256

node pilot/backup.mjs restore \
  .local/backups/company-pilot-private-20261104 \
  .local/company-pilot-restored-20261104 \
  TRUSTED_MANIFEST_SHA256
```

Replace the digest placeholder with the receipt's 64-character SHA-256. It is metadata, not the authentication secret. `restorePilot({bundleDirectory,destinationDirectory,expectedManifestSha256})` verifies the entire manifest against that trusted digest, bounded relative paths, duplicate entries, exact file inventory, every byte length/hash, SQLite integrity and required pilot schemas **before creating the destination**. Traversal, symlinks, missing/unlisted files, raw journals and changed originals fail closed. Existing destinations are never overwritten or deleted. A restore failure after creation leaves an incomplete private destination and does not launch it.

The restored state has no live PID lock. Open it on an unused port with the candidate factory/configuration, not by replacing the running contest service. Authenticate through the normal UI. Confirm company/user membership, assigned job IDs, document original hashes, corrected testimony, report/confirmation revision, evidence bytes, follow-up owner and office decision. Run the opposite-company denial check. Keep the original stopped source and trusted backup until the restore is reviewed; do not silently repoint production or overwrite an existing database.

The snapshot retains server sessions and integration hashes. It does not send invitations, recovery messages, report deliveries to an external company system, notifications or inference calls. Changing origin does not itself validate public-cookie/proxy configuration. For a compromise recovery, credential/session/key rotation is a separately reviewed procedure; restoring an old secret/state may also restore old access.

This exports **server state only**. Browser/native unsynced work held in account-scoped device storage is not secretly uploaded or included. Review pending work on its original device before any destructive recovery action. A disconnected device cannot be remotely wiped by this process. Do not clear its storage to troubleshoot a restore.

## Demonstrated recovery behavior

`PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test pilot/backup.test.mjs` completes an actual HTTP rehearsal:

1. Two fictional companies use distinct authenticated admins and technicians, company manuals and the same external work-order number.
2. Each job admits original evidence bytes, retains a source-linked 4.2→2.4 kW correction, confirms the exact report, queues delivery and receives separate office receipt and acceptance with follow-ups.
3. The active candidate refuses export. After clean shutdown, six SQLite databases (including an extra committed-WAL fixture) and private originals/configuration are exported and verified.
4. A fresh restored service authenticates the original users and preserves company/user/job IDs, document/photo hashes, original media bytes, correction links, exact report/confirmation revisions and Operations follow-up ownership. Opposite-company access remains denied.
5. Tampered manifests, traversal, duplicate paths, changed secrets, symlinks, unlisted journals, existing destinations, stale PID locks and non-pilot storage are rejected. Verification failures do not create the restore destination.

No live model, speech or location-provider calls occur in this rehearsal. A synthetic restore pass does not establish cloud backup durability or physical-device behavior.

## Before any private hosted pilot

Andrew selected Render on November 4. The separate [Render preparation](RENDER_PILOT.md) specifies the proposed service, cost, fictional bootstrap, local HTTPS/restart results and the pending live acceptance. Its Linux mounted-disk entrypoint is distinct from the loopback CLI. No hosted resource has been created; the broader real-company release requirements below remain open.

Prepare and verify these release steps for the selected host; they are not completed by local success:

- A durable, access-controlled volume for all SQLite databases, originals and private configuration; one supported writer process. Verify restart behavior, disk monitoring, capacity/quotas and an encrypted off-host backup/restore process. Do not use ephemeral/serverless storage as a substitute.
- Validated public origin, TLS, Secure cookies, reverse-proxy Host/IP handling, trusted proxy boundaries and protected administration. The current CLI is a loopback development entry point. Review dependency advisories and deployment configuration again at release.
- Genuine email verification, invitation and recovery delivery. The current `recovery-outbox/` is local operator rehearsal containing private JSON delivery files. No email is sent. Establish delivery failure handling, expiration/cleanup and support recovery without disclosing reset links.
- Owner-approved retention/deletion and export policy for company documents, evidence, reports, audit identity, device caches, sessions, recovery links and backups. No automatic customer-data retention policy is implied. Membership revocation retains authorship and one-company binding; account transfer needs a separate reviewed workflow.
- Company/provider configuration, data permission and current budget receipts before real inference or speech. Existing Meta/ElevenLabs limits remain unchanged. Validate isolation for every model/voice request and cancellation/reconnect path. Real company onboarding is separate from fictional fixtures.
- Review desktop and native logout→different-user/company login, relaunch and unsynced-work isolation. Complete real microphone/speaker checks and owner-run shop/site routes, background/lock/termination/reboot notification checks. Simulator results cannot establish physical timing or delivery reliability.
- Operational ownership, incident/recovery procedures, authenticated readiness checks, error-log redaction and monitoring. Define who can create a company, issue/revoke integrations, approve manuals and review follow-ups. Avoid recording customer content or credential values in general logs.

## Commercial provisioning remains incomplete

Membership and authorization are separate from billing entitlements. There is no completed purchase or subscription system in this pilot. Before selling access, choose and verify the commercial path, then implement the actual plan/seat model, company provisioning, licensed terms/privacy, payment checkout, authenticated webhook signatures, idempotent event handling, subscription renewal/cancellation, failed-payment/grace policy, invoices/tax, refund/support and entitlement enforcement. Test purchase→company access→renewal/cancellation against the selected provider's test environment. Do not represent a fake checkout or manually populated subscription row as a purchased account.

Public deployment, real customer imports, new subscriptions/purchases, production email, App Store/TestFlight publication and contest submission still require their own authorized release steps. The retained contest candidate and video path remain independent of this recovery work.

## November 4 actual candidate restore receipt

The development state directory also contained Simulator DerivedData, screenshots and test logs. To avoid treating those as runtime data, the integration owner cleanly stopped only the isolated candidate and assembled a new private runtime snapshot from `auth-secret`, `auth.sqlite`, `data/`, `documents.sqlite` and `originals/` (plus recovery-outbox if present). Original state was retained. Never copy live raw SQLite files this way; this snapshot was made after the server closed its databases and removed its runtime lock. A clean dedicated state directory is preferable for a hosted deployment.

The backup tool exported five databases and eight files (1,616,892 bytes), verified its separately retained manifest digest and restored a fresh destination. Actual signed HTTP readback on a separate port recovered both companies/users, exact report/media revisions, authenticated author IDs, original manual/photo hashes, linked corrections and two open follow-ups; opposite-company reads returned404. Credentials and manifest/restore/readback receipts remain private under `.local/company-pilot/`. No original directory was replaced, no provider was called and the physical phone was untouched.

`pilot/readback.mjs RESTORED_DIRECTORY PRIVATE_FIXTURES_JSON ACCEPTED_RECEIPT_JSON NEW_PRIVATE_OUTPUT_JSON` repeats that retained-state check on an unused local port. It does not replay or overwrite an existing visit. The later interactive QA of WO-UI-101 occurred only in the restored copy, so that extra QA report is not claimed to be in the earlier backup.

The later primary-service restart was checked through genuine signed HTTP without replaying either visit. Both companies retained the original manual/photo hashes, linked correction, exact archived confirmation, authenticated author and two follow-ups. Northstar's subsequently appended fifth fictional event correctly leaves its current candidate unconfirmed; Cedar's four-event current report remains accepted with follow-ups. Historical acceptance is not current acceptance after new evidence. The private receipt is `restart-history-readback-20261104.private.json`. Current and historical report reads project the exact company/job/revision author sidecar; archived packet bytes and legacy digests are unchanged. A missing exact sidecar remains explicitly unknown rather than adopting the reader's identity.
