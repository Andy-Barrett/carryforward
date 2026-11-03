# Local storage verification

November 3, 2026. The existing design remains IndexedDB v4 for device-local jobs/events/media/drafts/conversation and Node 24 SQLite for the separate Operations simulator. No hosted database, Perihelion migration, production data collection or new schema was introduced.

## Demonstrated failures and fixes

Three real-browser failures were reproduced before fixing them:

- A blocked v3→v4 open rejected, then silently upgraded after the blocking view closed. An abandoned open now aborts any later upgrade and closes a late successful connection.
- An exception after photo insertion could leave an orphan photo despite a failed save. Photo plus event now explicitly roll back together.
- An exception after adding an answer and deleting its draft could commit both despite reporting failure. The transaction now aborts, preserving both prior history and the unsent draft.

Completion handlers are registered before requests and synchronous exceptions abort pending writes. The test hooks are bounded and do not add a production route. The isolated validation server listens on loopback only and exposes no model/provider routes.

## Actual browser observations

`node scripts/validation-server.mjs` serves `/validation` and an isolated `/validation-app` on port 4388. Test namespaces use `carryforward.test.*`; the normal database remains version 4. Provider configuration is disabled.

The actual browser run passed **23 checks**: two fictional jobs upgraded from v3 to v4 with original photo/audio SHA-256, correction history, unsent drafts and exact-revision confirmations intact. A question/reply plus timing persisted without adding field evidence or invalidating confirmation. A new report did invalidate it. Bounded photo/answer failures rolled back and a rejected blocked upgrade stayed at v3. Actual PCM rendered in an OfflineAudioContext without speakers.

Closing the test tab and reopening passed **12 recovery cross-checks**, including media hashes, both jobs, corrections, drafts, current revision and isolation. These are overlapping assertions, not 35 independent benchmarks.

The real application UI was also exercised at the isolated origin. Injecting a photo-write failure showed “Nothing new was saved,” with zero photos and zero events. Injecting an answer/draft-clear failure kept the unsent text visible and stored, with no answer event. Retrying Save created one visible technician answer, cleared its draft, and persisted two events: that answer and the automatic fallback question. No provider was contacted. The main screen was then checked at 390×844 and 1280×900 with no inspected console warnings/errors.

Private receipts live under `.local/overnight-20261102/`: `storage-baseline.private.json`, `transaction-baseline.private.json`, `browser-validation.private.json` and `browser-reopen.private.json`. Screenshots are development artifacts outside Git.

## SQLite backup/restore rehearsal

`node scripts/rehearse-backup.mjs` creates a separate synthetic source, performs Node's SQLite backup, restores a copy and compares the original evidence bytes, correction lineage, assignment/closeout revisions, confirmation, delivery receipt and `accepted_with_followups` state. It generates a new private destination; the reusable rehearsal function refuses a pre-existing destination.

The observed rehearsal retained both media hashes and the exact status/closeout. New evidence invalidated acceptance only in the restored copy; the source remained unchanged. An automated test repeats the same recovery boundary on fresh temporary fixtures. The retained private receipt is in `.local/overnight-20261102/backup-d765f140-8460-4698-a016-9632b33c4be9/receipt.json`.

This proves recovery of the isolated simulator database, not recovery of arbitrary browser storage. The portable media export exists, but browser media-bundle import/restore and conversation-history import are not implemented. Clearing browser/app storage or changing origin can strand local evidence. Preserve the existing origin and export originals before planning an origin migration. Browser eviction, actual storage quota exhaustion, phone OS kill and full physical migration remain unverified.
