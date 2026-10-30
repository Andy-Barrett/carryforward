# Technical notes

## Current implementation

CarryForward is a small browser application served by Node’s built-in HTTP server. It has no framework, build step, database, or runtime package dependencies.

| File               | Responsibility                                                                        |
| ------------------ | ------------------------------------------------------------------------------------- |
| `server.mjs`       | Serve an explicit allowlist of application files on loopback                          |
| `public/app.js`    | Briefing, report capture, local draft storage, review, confirmation, and export       |
| `public/engine.js` | Work-order validation, evidence-completeness rules, confirmation, and export envelope |
| `public/style.css` | Desktop and phone layouts                                                             |
| `engine.test.mjs`  | Focused domain checks using Node’s test runner                                        |

## Work-order input

`carryforward.work-order.v1` includes the source work-order ID, customer and property labels, system ID, reported issue, requested work, dated history, and individual closeout checks. Download the sample from the app to inspect the full format.

The validator requires nonempty bounded text, limits the number of work items and checks, and rejects duplicate check and history IDs. Browser import limits the file to 100 KB. This is a local prototype format; it has not been adopted as a Perihelion Operations contract.

## Review behavior

Each check records a status, observation or explanation, evidence reference, and observation time.

- **Documented:** an observed result includes a note, reference, and parseable observation time. This is a completeness check, not independent verification of the source.
- **Open:** the check is pending or unverified, or required supporting information is missing.
- **Exception:** the technician supplies a not-applicable explanation. Operations still needs to review it.

The engine reviews each check independently. A documented repair cannot resolve production, monitoring, or warranty checks by implication. New customer commitments and open work require a follow-up owner; an absent owner is flagged.

Technician confirmation records a name and timestamp. It is an attestation within this prototype, not authenticated identity or an electronic signature. The Operations status remains `Awaiting Operations acceptance`.

## Persistence and export

The work order and field draft use the browser’s `localStorage` under `carryforward.field.v1`. They are local to this browser and origin. Confirmation is memory-only until downloaded. Importing another work order asks before replacing the current draft.

The JSON download contains the validated work order and `carryforward.closeout.v1` report together. It preserves original history, individual findings, open items, new commitments, and confirmation when present. No report is sent to a provider or Operations.

## Limits to address before operational use

There is no user authentication, multi-user access control, attachment storage, durable server persistence, live inference, or delivery queue. Browser storage is not a backup. Observation times entered through the form use the device’s local time without an explicit timezone in the current export; cross-system use needs an offset-aware timestamp contract.

Phone-width layout checks have been performed. Physical-device camera, microphone, installability, and offline behavior still need implementation and testing.

## Model and integration direction

Keep the assignment, technician testimony, source evidence, model findings, and human acceptance distinct. Model-generated findings must refer to admitted records, and malformed or unsupported output must remain incomplete rather than silently closing work.

API secrets belong on the server. The planned integration boundary accepts work orders and returns closeouts using stable external IDs. Authentication, duplicate handling, retries, and explicit acceptance must precede live Operations synchronization.
