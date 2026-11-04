# Private Render pilot preparation — November 4, 2026

Andrew chose Render for the next hosting rehearsal. The deployment configuration and local rehearsal are prepared. No Render service, disk, repository, subscription or deployment has been created by this work.

**Owner decision after reviewing the proposal: “Keep it local for now.”** Hosted release is deferred. Preserve the prepared configuration, but do not create the proposed private repository, push the pilot source, grant Render access, transfer test credentials or purchase/deploy the service without renewed direction. Continue local development and verification within the existing authority.

The first hosted pass uses fictional companies, work orders and operator-provisioned test accounts. Its purpose is to verify access and durable storage on the actual host before connecting the phone or enabling inference. The accepted local pilot and the retained contest checkout remain separate.

## Proposed service and cost

| Setting | Prepared value |
| --- | --- |
| New service | `carryforward-private-pilot` |
| Proposed source destination | New **private** `Andy-Barrett/carryforward-private-pilot` repository; not the public contest repository |
| Runtime | Node 24.19.0, one process |
| Compute | `0.5c-512mb`: 0.5 CPU, 512 MB, published $7/month |
| Region | Ohio |
| Persistent disk | 1 GB at `/var/data`, published $0.25/month |
| State directory | `/var/data/carryforward` |
| Build / start | `npm ci --ignore-scripts` / `node pilot/hosted.mjs` |
| Readiness | `/readyz` |
| Deploys | Manual; `autoDeployTrigger: "off"` |
| Initial address | Render-assigned HTTPS `onrender.com` hostname |
| Inference and speech providers | Disabled; no provider credentials or spending ledgers copied |

The published incremental base is **$7.25/month before tax, bandwidth/build usage and any existing workspace charges**. This is an estimate, not a verified dashboard quote or a guaranteed total cap. Confirm the actual workspace, prices and available billing controls before creation. Do not upgrade the workspace, increase compute/disk, add paid services or accept overages beyond the eventual approval. If an enforceable billing limit is unavailable, report that before purchase.

Read-only dashboard review found the existing workspace on Hobby with payment already configured. Billing explicitly warns that usage above shared included amounts is charged; a pipeline-spend management link is present, but no total-service or bandwidth hard cap was established. The observed shared allowance is 5 GB bandwidth and 500 pipeline minutes. Existing services were not changed. The approval must acknowledge possible usage charges rather than treating $7.25 as a hard total limit.

Render's [compute plan reference](https://render.com/docs/compute-plans) identifies the current plan ID. Its [pricing page](https://render.com/pricing) lists service and disk charges; an [official September price example](https://render.com/articles/production-rails-hosting-guide) also records the $7 plan. The [disk guide](https://render.com/docs/disks) requires a paid service and explains that files outside the mounted path are ephemeral. These references were checked November 4; verify them again at creation.

512 MB is a small functional trial, not a demonstrated production capacity. This profile admits one document extraction at a time; measure memory and latency on Render before adding users or larger PDFs. A persistent disk permits only one instance and causes deploy downtime. A higher-capacity or multi-instance architecture is a later decision.

## What gets transferred

After a separate release approval, transfer only the reviewed source checkpoint to the proposed private repository and give the existing Render GitHub integration access to that repository only. Do not alter the existing `origin`, existing public repository, its history or any Perihelion service. Use a separately named remote for the private pilot. Review the committed inventory before pushing.

Create a new synthetic account file for this service, with random unique passwords for four test identities: `northstar.owner@example.test`, `northstar.tech@example.test`, `cedar.owner@example.test`, and `cedar.tech@example.test`. The intended two company names are **Northstar Solar (fictional)** and **Cedar Field Services (fictional)**. This is a fresh hosted trial, not a copy of the local users, sessions, company IDs, private manuals, recordings or visit state.

Supply the account file through Render's secret-file facility as `/etc/secrets/carryforward-pilot-accounts.json`. Its required shape is:

```json
{
  "scope": "fictional-private-pilot-v1",
  "users": [
    { "name": "Northstar Owner (fictional)", "email": "northstar.owner@example.test", "password": "REPLACE_WITH_NEW_RANDOM_PRIVATE_PASSWORD" },
    { "name": "Northstar Technician (fictional)", "email": "northstar.tech@example.test", "password": "REPLACE_WITH_NEW_RANDOM_PRIVATE_PASSWORD" },
    { "name": "Cedar Owner (fictional)", "email": "cedar.owner@example.test", "password": "REPLACE_WITH_NEW_RANDOM_PRIVATE_PASSWORD" },
    { "name": "Cedar Technician (fictional)", "email": "cedar.tech@example.test", "password": "REPLACE_WITH_NEW_RANDOM_PRIVATE_PASSWORD" }
  ]
}
```

The placeholders are documentation, not prepared credentials. Generate the actual file locally with mode `0600` in ignored storage; never print passwords, paste them into chat, include them in a URL, or commit them. Sending this new file to Render requires the specific deployment approval. The runtime validates the exact approved account list and provisions it through Better Auth's password API. It never replaces an existing user's password, company binding or audit history. A changed bootstrap file is not a password-rotation mechanism.

## Configuration

[`render.yaml`](../render.yaml) contains the nonsecret service definition. Applying it is a paid external action, not a dry run. There is no pre-deploy command because the persistent disk is not available during build or pre-deploy.

Set the following values on this service only:

```text
NODE_VERSION=24.19.0
NODE_ENV=production
CF_PILOT_RELEASE_SCOPE=fictional-private-pilot-v1
CF_PILOT_STATE_DIR=/var/data/carryforward
CF_PILOT_ALLOWED_EMAILS=northstar.owner@example.test,northstar.tech@example.test,cedar.owner@example.test,cedar.tech@example.test
CF_PILOT_BOOTSTRAP_FILE=/etc/secrets/carryforward-pilot-accounts.json
```

Render supplies `PORT` and `RENDER_EXTERNAL_HOSTNAME`. Leave `CF_PILOT_PUBLIC_ORIGIN` unset initially; the application derives the exact HTTPS origin from the provider hostname. A custom domain is not part of this rehearsal. If an origin override is supplied, it must exactly match the provider hostname. Requests with another Host or absolute request-target origin receive 421. Secure cookies depend on the configured HTTPS origin, not client-supplied forwarding headers. The application binds `0.0.0.0` behind Render's TLS termination as described in the [web-service guide](https://render.com/docs/web-services).

Keep both provider-config variables unset. The hosted entrypoint refuses a copied local inference configuration; providers are empty. Existing Meta and ElevenLabs spending allowances remain on their original guard and ledgers. Hosted inference requires a reviewed single-authority budget design; a fresh empty ledger would incorrectly reset the allowance.

The public hostname serves the login and static code, but company data requires sign-in and current membership. Public signup is disabled, even for an approved email. Every test user is provisioned before listening, and the login hides Create account. An email allowlist alone would not establish that a person owns an address. Invites are limited to the approved test users. Recovery and invitation links remain private operator delivery; **no email is sent and no real email ownership is verified**. Authentication rate limits ignore supplied forwarding/IP headers and use the direct proxy connection, so test users can share the same rate-limit bucket. Per-client proxy trust and abuse controls remain release work.

## Storage, readiness and shutdown

The hosted entrypoint requires Linux and an actual, canonical, read-write mount at `/var/data`. Parent mounts, ephemeral overlay/tmpfs, symlink paths, insufficient free space and partial existing databases/secret fail closed. There is no environment flag to bypass the disk check. State is outside the checkout, and the existing exclusive runtime lock prevents a second writer. The generated auth secret, SQLite databases, document originals, evidence and recovery output all live beneath the state directory.

`/readyz` checks the auth, platform and document databases, the mounted disk and a write/fsync probe with at least 64 MiB free. Failure returns a generic 503 without paths, users or source content. `/healthz` remains liveness only. Readiness does not prove that email, inference, backups or physical-device behavior work.

SIGTERM stops admission, gives active requests a bounded drain, aborts remaining connections after eight seconds and closes stores before releasing its own runtime lock. Existing PDF extraction is bounded to 15 seconds. A disk service's default termination window is documented in Render's [disk limitations](https://render.com/docs/disks); the local test does not prove actual Render timing. An abrupt kill may leave a stale lock. Preserve the volume, verify no writer is active and use an explicit recovery procedure; do not delete a lock blindly or start with an empty directory to make a deploy green.

The [existing backup/restore procedure](PILOT_OPERATIONS.md) requires the service to be stopped and preserves the secret, databases, originals, exact report revisions and audit identity. Render disk snapshots are not a completed application-level backup program. Before real data, establish an encrypted off-host backup destination, retention/deletion policy, monitoring and an actual restore from that destination. This rehearsal does not purchase a backup provider or automate customer-data retention.

## Verification performed locally

`pilot/hosted.test.mjs` exercises the actual hosted factory behind a local HTTPS proxy whose fixture certificate is explicitly trusted. TLS validation is enabled. Only the Linux disk verifier is injected for the macOS fixture; the real Render mount remains unverified.

- Restricted pre-provisioning, rejected anonymous/approved-email signup, rejected route variants and HTTPS Secure/HttpOnly cookies.
- Two distinct companies with the same external work-order number, approved TXT sources, original evidence, exact author-bound reports, confirmation, delivery and separate office acceptance with open follow-ups.
- Denied cross-company jobs, documents and evidence, plus approved-user removal after restart.
- Persistent auth secret, sessions, original hashes, report revisions, authorship and follow-ups after restart. A modified bootstrap does not overwrite existing credentials.
- Unavailable disk/read-only mount rejection, partial-state preservation, readiness 503/recovery, single document admission and slow-body shutdown/restart.
- Actual login callbacks preserve the local signup path and submit existing-account sign-in in the private profile. The real private login renders on the desktop without console warnings/errors. The browser's viewport override did not change the observed 1280 px viewport; a new phone-width rendering check is still pending. No physical phone was changed.

Logs and screenshots are private under `.local/company-pilot/`; they are not bundled into the release. The complete test run and reviewed commit are recorded in the private preparation receipt. No live inference, speech, email, provider write or real-company import occurs in these tests.

The full Node suite passes 319 tests with zero skipped. Syntax checks and `git diff --check` pass. YAML parses locally and its fields were reviewed against Render's current Blueprint reference; authenticated Render-side Blueprint validation remains pending. The November 4 dependency audit reports zero advisories, a point-in-time result rather than a security guarantee.

## First live acceptance, after approval

1. Confirm the chosen account/workspace, exact service quote, private source destination and the reviewed source checkpoint. Configure the single service, disk, approved emails and new secret file. Keep auto-deploy off. If initial startup refuses a missing secret file, supply that file through the authorized secret-file path and manually retry; do not enable public signup as a workaround.
2. Verify the actual public TLS hostname, exact origin, mounted volume and readiness. Verify anonymous company-data denial and rejected signup.
3. Sign in as each fictional owner, create its company and invite only its pre-provisioned technician. Run the same-number, two-company work-order/report flow with fictional evidence; verify original hashes, exact confirmation, office receipt/acceptance and retained follow-ups.
4. Restart only this new service and repeat signed readback and opposite-company denial. Record the service ID, hostname, source commit, checks and cost; do not expose passwords or session cookies in the receipt.
5. Perform a fresh stopped-service backup/restore to an isolated destination and inspect its readback before treating hosted storage as accepted. Prepare the next phone endpoint and shared inference-budget design separately. The physical phone and contest service stay on their current configuration until that step is authorized.

At this checkpoint, the release decision is one concrete batch: permission for the new private GitHub repository/source push, the specified paid Render service and disk at the verified quote, and transfer of the four new fictional test credentials to that service. Real email delivery, real-company onboarding, hosted inference and commercial/App Store publication remain outside this batch.
