# Local Operations simulator

This is a fictional source-system simulator, not Perihelion Operations. It stores at most 100 assignments and bounded job evidence in `.local/operations.sqlite` (ignored by Git). Node 24's built-in SQLite API supplies persistence without a new package. The database and its directory are created with restricted local permissions. The app still binds only to loopback.

The browser first opens `/` to obtain an HttpOnly, SameSite=Strict session cookie. Every API call supplies `X-CarryForward-Intent: operations`; an explicit Origin must match the loopback host. These are local session controls, not production authentication, tenant isolation or a third-party integration credential.

Routes:

| Method | Path | Responsibility |
| --- | --- | --- |
| POST | `/api/v1/work-orders` | Admit `{order}` from the simulator; identical external identity/scope returns the same canonical job UUID |
| GET | `/api/v1/jobs/:id` | Current assignment, event and closeout revisions and separate confirmation/queue/receipt/acceptance states |
| POST | `/api/v1/jobs/:id/evidence` | Admit `{photos}` with exact original base64 bytes, MIME, ID, job association and SHA-256 |
| GET | `/api/v1/jobs/:id/evidence/:evidenceId` | Retrieve included bytes for the correct job |
| POST | `/api/v1/jobs/:id/audio` | Admit bounded original voice clips and optional normalized WAV derivatives with independent hashes |
| GET | `/api/v1/jobs/:id/audio/:audioId` | Retrieve a job-owned original voice clip |
| POST | `/api/v1/jobs/:id/turns` | Admit `{events}` as an append-only extension of the saved investigation history |
| POST | `/api/v1/jobs/:id/closeout` | Recompute deterministic findings and attach the replayed interview, corrections, model provenance, unresolved branches and evidence manifest from `{report,eventRevision}` |
| GET | `/api/v1/jobs/:id/closeout` | Retrieve the current immutable packet revision and technician confirmation |
| POST | `/api/v1/jobs/:id/confirmations` | Bind technician attestation to both exact server packet revision and client report revision |
| POST | `/api/v1/jobs/:id/deliveries` | Queue the confirmed revision for the source simulator |
| GET | `/api/v1/simulator/inbox` | Source-system polling returns queued packets over HTTP |
| POST | `/api/v1/jobs/:id/receipts` | Source acknowledges the exact queued revision |
| POST | `/api/v1/jobs/:id/acceptances` | Source accepts only its exact current received revision; follow-ups stay open |

Browser controls below the field workflow exercise these endpoints. “Receive current sample through API” acts as the source simulator submitting the currently shown fictional assignment. “Send confirmed handoff” uploads original photos, appends events, proposes a packet, records the technician's existing confirmation, and queues it. “Refresh Operations inbox” polls as the source system; receipt and acceptance require separate actions. No automatic retry, webhook or external provider write occurs.

A server revision is SHA-256 over the complete packet: canonical job/assignment identity, report, event revision, replayed interview and evidence manifest. Changed report/event/evidence content clears prior confirmation, delivery and acceptance. Old acceptance requests are rejected. Accepted-with-follow-ups is an acceptance of a handoff, never a claim that all assigned physical work is complete. Technician names remain attestations, not authenticated identity/electronic signatures.

Limits: 10 original JPEG/PNG/WebP files per job, 5 MB each, 25 MB combined; HTTP JSON cap 35 MB; 500 investigation events; 100 assignments. Evidence IDs cannot be reused across jobs or with different bytes. Hash and MIME/size validation is not malware scanning or proof of what an image depicts. The app's image picker also checks browser decodability. Five original voice clips (5 MB each) plus bounded normalized transcription WAV derivatives may also be admitted; each clip is uploaded separately. Reviewed voice turns preserve raw transcription and model provenance in the ordered history. Database persistence and browser-local capture are distinct states.

`CARRYFORWARD_OPERATIONS_DB` can point tests at an isolated temporary database. Tests create and remove only their own temporary fixtures. Production source revision updates, broader integrations, access control, durable retry queues and deployed hosting remain unimplemented.

A second fictional job was used to check browser isolation. It initially showed no first-job voice clips. After a local report was confirmed, adding an unlinked original voice clip displayed a stale-confirmation warning and re-enabled confirmation. Switching back restored only the first job's independent clip and raw transcript. No additional provider calls were needed for that check. Desktop (1100 px) and phone-width (390 px) layouts had no horizontal document overflow; physical phone testing remains distinct.
