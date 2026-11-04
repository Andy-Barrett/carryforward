# Company-pilot browser and cache validation

November 4, 2026. This record separates server/cipher tests from actual browser and native observations. A populated form or passing crypto test does not establish that an account transition removes every old dialog, draft or image from the rendered app.

## Verified through actual local HTTP

`node --test pilot/browser-acceptance.test.mjs` passes the following sequence against genuine Better Auth sessions and the company pilot server:

1. Fictional technician A signs in and receives A's company/user-scoped, fifteen-minute cache lease.
2. An unsent fictional correction is encrypted with that exact lease and company/user/job associated data.
3. A signs out. The previous session cookie fails when requesting another key, independently of the browser clearing its cookie.
4. The same HTTP cookie jar signs in as fictional technician B. B sees only B's assignment and receives a different scoped cache key. B cannot decrypt A's envelope or read A's job; forged company/user query fields do not change B's lease identity.
5. B's continuing cookie session receives the same B key. A later signs in through a new session and recovers A's original unsent envelope with A's durable key.
6. A's administrator revokes A. A's existing login is immediately denied another cache lease and job access, while the account endpoint reports the retained revoked membership.

The test also records the limitation honestly: an already-disconnected client holding an earlier key can still decrypt its own ciphertext during its bounded lease. Server revocation is not a remote wipe. The app must hide/lock expired or reconnected unauthorized data through its own lifecycle checks.

Two additional Node regressions import the actual `openScopedCache` module with a deliberately deferred storage double. They pause A's writes, admit a final immutable checkpoint, lock A, open/write B, and then complete A's earlier writes. New reads/writes are denied after lock, the admitted writes finish in A's original scope, post-admission mutations do not alter the snapshot, and A recovers the last checkpoint. An earlier simulated transaction failure also permits a later valid checkpoint to drain. This exercises the module's asynchronous lifecycle; the storage double is not a browser or a real IndexedDB implementation.

The existing `pilot/client-cache.test.mjs` separately exercises wrong-company/user/job/key authentication failures, ciphertext tampering and the static-only service-worker asset list. No API result, original document or evidence URL belongs in the shell cache.

**These are HTTP and crypto checks, not an actual IndexedDB/browser, speaker/microphone or WKWebView pass.** No live model or speech call occurred.

## Interactive browser acceptance to record

Use the already authorized fictional accounts and the isolated candidate origin. Keep passwords, invitation links, integration keys and recovery content out of screenshots. Do not clear browser storage to make a failed test disappear.

| Check | Required observed result |
| --- | --- |
| Sign-in/create-account toggle | Name appears only for account creation; sign-in uses existing credentials. |
| Conventional dispatch form | Admin enters a customer, site, scope, technician, equipment identity and approved references without editing JSON. The created assignment appears for that technician. |
| Contact/system identity | New assignments do not inherit Elena's contact details or a different fixture's system identifier. Missing contact/identity stays missing. |
| Library lifecycle | Upload a small fictional TXT; inspect its extracted text; observe uploaded status before explicit approval; then approve the version and select it for a job. |
| Pending text | A types a distinctive unsent correction. Leave it unsent. Sign out immediately, including a fast final keystroke→sign-out attempt. |
| A→B | Old field content, photos, header/company label, Account details, open body dialogs and pending text disappear immediately. B's work list/field view contains no A customer or draft. |
| B relaunch→A return | Close/reopen the candidate tab. B stays in B's authorized context or must sign in. A later signs in and recovers the original unsent text, including its last characters. |
| In-flight transition | While an A question, photo read/hash or local recording completion is pending, sign out or change account. Late work cannot display/speak in B or be written with B's cache key. No provider call is necessary for a delayed local-fixture check. |
| Lease/background | At lease expiry, including after a background/resume cycle, old content and open dialogs are hidden. Unlock requires online authentication. |
| Revoked/reconnected access | After admin revocation, reconnect or a foreground revalidation locks the old view. No fresh cache key, job or evidence access is granted. Retained unsynced ciphertext is not silently deleted. |
| Phone/desktop width | Contact/briefing, Hold to speak, photo access and conventional admin forms fit the viewport without horizontal clipping. |

Record the actual tester, date, candidate revision/shell version and results alongside any clean screenshots. A server response alone does not prove these rendered outcomes.

## Integration review findings

The implementation review identified these concrete paths for the integration owner to fix and rerun:

- Field callbacks must capture their own cache and principal/epoch. A queued old draft callback or photo/voice completion must never use a newly signed-in account's global cache. Preserve already pending writes in their original scope without showing old content to the new account.
- Locking must clear header, navigation and Account identity synchronously, including a 401, expired lease or failed/offline sign-out. Clearing only the main panel leaves old identity visible.
- Navigation and cancellation must invalidate old question/playback completions. Check lease expiry on resume and permission/membership again on reconnect; background timers alone are insufficient evidence.
- The conventional assignment form must not copy another fictional customer's contact/system identity. Bound checklist items at assignment admission so an accepted overlong item cannot break departure preparation later.
- Opening a cache is asynchronous too. A stale A refresh must not install its cache into B's global session after a delayed key import/storage open. Capture the refresh epoch/principal, validate the returned lease scope, and retire any stale opened cache before assignment. A field entry must check that the cache's scope matches its captured company/user.

The integration owner has applied captured field/report caches and principals, immediate header/navigation/dialog cleanup, immutable admitted snapshots with old-scope draining, draft checkpoint access and bounded generic work-order identity/checklist fixes. The Node deferred-write checks above pass against that cache implementation. Subsequent source review also found refresh-open epoch/scope checks and resume/reconnect revalidation in place. The final post-await network/render guards still require integration review, and all rendered outcomes still require the interactive checks above. This review itself made no UI changes or real-account mutations.

## Observation boundary

The delegated CUA environment reported no available browsers, and the parent's IAB browser ID `2` was unavailable to this subagent. No replacement browser, native app or system keyboard was used while the native acceptance agent controlled Device Hub. The root agent owns the actual IAB checks; the native agent owns Simulator/WKWebView acceptance. No browser or physical-device result is claimed here without their separate recorded observations.

## Root interactive observations — November 4

Actual IAB checks used the isolated port4430 candidate and a fresh restored-state QA origin on4433. Desktop and390×844 layouts were inspected, with no horizontal document overflow on the field page. Images are private artifacts, not copies of credentials. The QA origin was explicitly used to exercise the current static files without clearing the earlier origin's saved cache; ordinary service-worker updates still wait for candidate windows to close.

Observed passes:

- Sign-up toggle shows the name only in create-account mode.
- Northstar admin created and assigned WO-UI-101 using ordinary fields: distinct fictional customer/site, explicit SE7600H-US000BNU4/SetApp/North America identity, an approved actual manual, required kit and access notes. The technician saw it. No inherited Elena phone or address appeared on this new job.
- Technician asked “Where is the Server Comm status?” Actual source text, PDF61/printed60 and a protected original-page link appeared. No question was saved as testimony. IAB lacked a local system speech voice; no audio success is claimed.
- A's unsent text ended in TAIL-Z9. Immediate sign-out hid A's name, job and draft; Cedar B saw only Cedar's work and an empty draft, including after reload. Returning to A restored the exact text with its final characters.
- In the fresh current-source QA origin, offline sign-out immediately hid company content and kept the sign-in form. Reload while the server remained off showed pending sign-out and did not automatically unlock the surviving cookie. Once the server returned, normal sign-out completed before a fresh explicit login.
- The restored QA browser submitted fictional testimony, saved a full source-linked4.2→2.4 correction, prepared the exact report, confirmed as the authenticated technician, explicitly delivered it, then signed into office review. Office readback preserved2.4, no replacement, reported monitoring and two Operations owners. Receipt and acceptance were distinct controls; accepted_with_followups was observed.
- With a protected report dialog open, sign-out in another window removed that dialog and all company identity from the first window. DOM readback showed dialogs0, empty company label and no old corrected report text.

This UI trial found that the form's global owner initially did not populate branch owners. The candidate now appends owner assignment only for unresolved **ownerless** branches, atomically with report preparation, preserving existing named owners and rejecting stale input revisions. Failed media/report validation rolls back the new event. Focused regressions and actual corrected report/office readback verified the fix. Previously prepared/confirmed packets are not rewritten.

At this checkpoint, remaining interactive checks included delayed in-flight file/voice transitions, role downgrade/lease expiry with an open dialog and actual manual upload/approval through the file chooser. The browser upload selection was rejected by the browser approval gate; no indirect upload was attempted as a workaround. HTTP upload/approval/extraction were separately tested. A final native account-isolation pass after the latest cookie/storage changes was attempted but the Mac was locked; earlier Simulator passes are retained, not recast as a current retest. No physical-phone/provider check occurred in these observations. The later approved file acceptance below supersedes the file-upload limitation.

## Continuation: report drafts, role changes and conflicts

Root IAB observations on the restored-state QA service, ports4440–4441, used genuine fictional accounts and current candidate assets. Provider configuration was disabled throughout.

- Northstar's unsent report form retained the exact summary suffix `FINAL-Q7` and commitment suffix `DRAFT-X2` through navigation, logout, Cedar login, reload and Northstar return. Cedar's report form contained neither marker. No new report was prepared or confirmed during this draft-only check.
- A separate fictional Northstar admin opened an extracted-manual dialog. The owner changed that member to technician through the authenticated HTTP API. Normal away/back navigation revalidated the account, removed the open dialog and Library/People/Integrations controls, and showed no assigned work. The original owner retained access.
- A deliberately delayed manual question entered the server retrieval path. Sign-out and Cedar login occurred before its six-second fixture delay completed. Cedar retained only its own work list; no Northstar question, answer, dialog or customer appeared after completion. This was actual browser/request cancellation, not a live inference call. Pending photo/hash and physical recording transitions remain separate checks.
- For a new fictional job, quote characters in check/checklist IDs remained literal control values. Actual report and departure views contained no injected `data-tainted` attribute. No external/script payload was executed.
- A report draft at event revision0 survived a server extension to revision1, but preparation was disabled until the technician explicitly reviewed that draft against the current testimony. Checking the review acknowledgement enabled preparation; it did not itself prepare, confirm or deliver anything.
- With that visit open, the QA server was stopped. The technician saved a local report with suffix `KEEP-LOCAL-H8`. After restart, another authenticated session appended two different server reports, making the server history longer than the local history. Reopening showed **Saved work needs reconciliation**, with reporting/sync paused and an export control. Neither history was selected automatically. The export download approval was declined by the browser gate, so downloaded-file contents were not inspected and no alternate extraction route was attempted. Local/server history comparison is also covered by seven helper regressions.
- A test-only server setting issued a25-second cache lease; clients cannot set or extend it. A protected Sources dialog was left open. After expiry, the app showed sign-in, an empty company label and zero open dialogs; the manual reference was absent. The ordinary server default remains fifteen minutes. This proves the rendered expiry path with a shortened genuine lease, not a fifteen-minute physical-device/background test.

At the end of this sequence, the Mac remained locked and latest native acceptance was pending. Browser upload and export-download approvals had been declined; those actual browser file roundtrips were still pending, without a workaround. Existing HTTP extraction/approval and backup/export evidence did not replace them. Their later approved completion is recorded below.

## Final audit follow-up

The Mac briefly became available and the dedicated native account/draft sequence passed; see [the dated native retest](PILOT_REMINDERS.md#november-4-latest-native-retest). It then locked again before the remaining native checks. The earlier blanket native-auth-pending note is superseded for that exact sequence only.

Actual IAB interaction on the final source at390×844 verified Server Comm → “Where is that setting?” retained PDF61/printed60 and the exact Verifying the Connection section, including its prerequisite and Status/S_OK text, without preceding Follower Detect/automatic-detection instructions. The warning question showed all three complete English WARNING blocks with PDF8/printed7 provenance. Long responses use18px/pre-line text in a scrollable stage; End reached the last warning/authorization caveat while the voice/photo controls remained inside the viewport. No horizontal overflow was observed. IAB local speech was unavailable, so no audible result is claimed.

Normal candidate-window closure activated the updated shell without clearing any storage. The actual final sign-out showed “Signed out.”, an empty company label and zero open dialogs. At this checkpoint browser upload and export-download gates had not been retried, and those file roundtrips plus delayed actual photo/recording account transitions remained unverified;301 passing automated checks did not replace them.

## Later approved browser file acceptance — November 4

The root tester subsequently completed both ordinary browser file paths at the isolated QA origin `http://127.0.0.1:4441`. The earlier declined attempts remain historical observations; this later run used explicit approval for the selected fictional TXT and download, with no alternate upload or extraction route. The private receipt is `.local/company-pilot/browser-file-acceptance-20261104.private.json`.

- The approved TXT was selected in the file chooser and uploaded through Library. The new version was `uploaded` with extraction `ready`, its inspected text contained `NORTHSTAR-UPLOAD-QA-1`, and the admin separately chose Approve. Authenticated original-byte readback matched the retained SHA-256. An unassigned technician received 403 for document access; the authorized admin received 200 for the approved source.
- The technician used the rendered saved-work export control on the divergent visit. The actual saved download, `carryforward-my-work.json`, matched its receipt hash and exact Northstar company/user/job scope. It retained two local events including `KEEP-LOCAL-H8` and the stale `STALE-P4` report draft. The three divergent server events remained unchanged; neither history was automatically selected or overwritten. No Cedar identifiers were present.
- These are completed chooser/upload/inspect/approval and actual downloaded-file checks, not HTTP-only substitutes. Provider calls remained zero. The separate archived-authorship read fix in `3ff88f7` projects preserved author identity from the server sidecar without rewriting stored history packets.

At this file-acceptance checkpoint, delayed actual photo/hash and recording completions across account changes remained separate boundaries. These file passes did not establish physical microphone/speaker or notification behavior. The full automated checkpoint after `3ff88f7` passed 304/304 with zero skipped. The later photo transition below supersedes the delayed-upload limitation only.

## Rendered photo/account transition — later November 4

The root tester used the explicitly approved existing `public/job-assets/display-example.jpg` on a new fictional `WO-PHOTO-SESSION-QA` at QA origin 4441. A private 15-second HTTP delay held the upload **after local file reading and hashing**. Northstar's thumbnail was saved locally before logout. After Cedar login and cancellation of that delayed request, the actual rendered view contained only Cedar's list, zero images, zero open dialogs and an empty status; no Northstar customer data or prompts appeared. There were zero server events before an explicit Sync.

Returning to Northstar recovered the thumbnail and the encrypted unsynced-work message. Explicit Sync then succeeded. Authenticated readback returned the original 41,723 bytes with SHA-256 `46cc91fcb34ae92af5b5ba63eb4d5474771c689f95aeaf90faad794767247495`, matching the fixture and its source event; Cedar's request for that protected media returned 404. The test delay was removed, and provider calls remained zero. The private receipt is `.local/company-pilot/photo-transition-acceptance-20261104.private.json`.

The receipt records shell `carryforward-pilot-shell-91b15e0b425e3318`. The later `a822c50` guard also stops an obsolete field loop before reading its next file and suppresses stale success/error status. Thirteen focused actual-field/cache/voice checks cover the source callbacks with deferred I/O; those Node checks are not a rendered paused-hash test. This browser run paused the upload after hashing, not FileReader/hash completion, and did not exercise a real microphone recording.

The current full automated checkpoint after `a822c50` passed 310/310 with zero skipped; its private log is `.local/company-pilot/full-suite-20261104-late-media-audit.log`. Later actual native site-exit, current/stale Open, permission fallback/revocation and warning-readability results are recorded in [PILOT_REMINDERS.md](PILOT_REMINDERS.md). Hardware recording/account-transition, audible speech, remaining OS notification actions and physical/background behavior stay on the owner device checklist.
