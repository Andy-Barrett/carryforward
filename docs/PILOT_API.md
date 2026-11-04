# Company work-order API

The isolated pilot serves `/pilot/api/` on its configured loopback origin. It does not activate these routes in Perihelion Operations or change the retained `/api/v1` demo. Node 24, genuine account sessions and server-owned company membership are required. See [company flow](COMPANY_PILOT.md).

## Authority and request handling

A signed member cookie resolves the user's sole company. Browser writes require the exact configured Origin, JSON and `X-CarryForward-Intent: pilot`. Owners/admins can issue and revoke integration credentials. A random bearer token is displayed once, stored only by hash and bound to its company/integration. Its scope is assignment read/write, not account administration, uploads, media, conversation, confirmation or office acceptance. Never accept company ID, role or integration ID as authority from a body or query.

Member sessions and integration tokens are checked again after asynchronous body reads. Job downloads recheck current assignment, membership and approved reference after reading the original bytes. New/revoked roles take effect without relying on a client menu. Wrong-company/unassigned resources return unavailable; validation/conflicts do not identify another company's record.

| Method and route | Purpose |
| --- | --- |
| GET `/account` | Current user, sole membership and principal |
| POST `/account/companies` | New unbound user creates its company |
| GET `/account/members` | Office member list |
| POST `/account/invitations` | Admin creates expiring, email-bound local invitation |
| POST `/account/invitations/accept` | Matching signed-in user accepts token |
| POST `/account/members/:id/revoke` | Admin revokes membership; authorship remains |
| GET/POST `/integrations` | Admin lists/issues restricted source credentials |
| POST `/integrations/:id/revoke` | Revoke a company's integration |
| GET/POST `/documents` | Office listing / admin upload for review |
| POST `/documents/:version/approve` or `/withdraw` | Admin changes source eligibility |
| GET `/documents/:version/pages` or `/original` | Authorized office inspection |
| GET/POST `/jobs` | Assigned/office work list; dispatcher or integration assignment |
| GET `/jobs/:id` or `/brief` | Authorized canonical assignment/preparation |
| POST `/jobs/:id/question` | Read-only applicable source lookup, no testimony mutation |
| GET `/jobs/:id/references/:version/pages` or `/original` | Current approved pinned job source |
| GET/POST `/jobs/:id/events` | Assigned technician's append-only investigation history |
| POST `/jobs/:id/evidence` or `/audio` | Hash-checked original admission |
| GET `/jobs/:id/evidence/:source` or `/audio/:source` | Protected original media |
| GET/POST `/jobs/:id/closeout` | Exact report read / assigned author prepares revision |
| POST `/jobs/:id/confirmations` | Authenticated author confirms exact revision |
| POST `/jobs/:id/deliveries` | Explicitly queues confirmed exact report for local office |
| GET `/inbox` | Company office review queue |
| POST `/jobs/:id/receipts` or `/acceptances` | Distinct exact-revision office decisions |
| GET `/jobs/:id/history` | Retained report revisions |
| POST `/jobs/:id/reminders` | Assigned current-visit preparation/preferences |

Voice routes and one-use grants are specified in [PILOT_LATENCY.md](PILOT_LATENCY.md). A client may not supply an authenticated voice scope/source manifest or turn a source page into a tool instruction.

## Assignment v2

POST `/jobs` with `Idempotency-Key` and `version: "carryforward.assignment.v2"`. Fields:

- `externalId`, `sourceRevision`; distinct `customerRef`, `siteRef`, `systemRef`.
- `assigneeUserIds`: active members of this company; one to ten.
- `equipment`: up to ten records with `equipmentRef`, manufacturer/model/full part/variant/region and identity basis. Unknown identity stays unknown.
- `contextRefs`: at most twelve exact approved/processed `{documentId,versionId,purpose,equipmentRef?,required,priority}` references. References are checked in the authenticated company, not found through a whole-library search.
- `order`: validated `carryforward.work-order.v1` with customer/site, problem/scope, dated history, sourced briefing and check IDs. Canonical work-order/system IDs come from the server wrapper; an imported display record cannot overwrite them.
- Optional `departureChecklist`: unique ID, bounded label, `required|suggested|unknown` and source; at most sixty. Optional `onsiteOnly` and explicit `locations.shop/site` coordinate/radius objects. No address→coordinate inference is performed.
- Optional `historyRefs` must match the same customer/site/system references.

External IDs and retry keys are scoped by company, integration and operation. Identical retries return the existing assignment. Reusing a key for different content returns 409. Revising an existing external work order requires a new sourceRevision and `If-Match` equal to the current assignment revision. Stale writes fail, old report packets remain archived and old confirmations are invalidated. An integration can read only its own assignments; office-created assignments use a separate source namespace.

`pilot/demo.mjs` is an executable synthetic client/setup example. It generates private local fixture credentials and distinct companies; run it only against an isolated empty/test destination, with a new private output path and the separately obtained applicable manual when needed. `pilot/roundtrip.mjs` completes each **fresh** fixture's report; it refuses a nonempty prior event history rather than overwriting a visit. `pilot/readback.mjs` verifies accepted retained/restored state through real signed HTTP sessions and protected originals.

Uploads use base64 JSON plus MIME/title/issuer/revision/applicability metadata; at most 8 MB source bytes, with bounded request/parser limits and at most two processing tasks. Processing failure is actionable status, not approval. Original media uses id/hash/MIME/name/bytes and is not sent to an external model by admission alone.

Closeout preparation accepts a human report plus its saved event revision. An explicitly supplied followupOwner is recorded on unresolved, ownerless branches atomically (existing named owners are preserved) with that candidate. Confirmation names the returned reportRevision and media-inclusive packet revision; later changes require a new confirmation. Office acceptance may retain open obligations. No endpoint here sends an external customer message, changes device hardware or closes physical work by inference.

## Release boundary

This is one supported Node/SQLite writer with separate auth, library, platform and per-company Operations stores. There is no public service, production email, billing entitlement or real-company data configuration. [Operations/recovery](PILOT_OPERATIONS.md) records the missing hosted and commercial work. No wildcard CORS, ambient provider credential discovery or automatic paid-call retry is added.
