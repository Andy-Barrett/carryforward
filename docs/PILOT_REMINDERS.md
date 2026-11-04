# Company-pilot departure reminders

[My day](DAY_PLAN.md) now supplies selected daily stops and next-stop packing to preparation. Changes invalidate prior preparation; a separate equipment reminder can remain after a report is sent. Build 22 compiles these generic native messages; the earlier build-21 delivery observations below do not verify the new reasons on a phone.

This candidate adds explicit **Ready to leave** and **Finish visit** checks, plus an opt-in iPhone exit backup. It does not listen in the background, contact a customer, confirm or send a report, close work, or infer packing/safety from GPS. Park before reviewing, taking photos or responding. Do not interact with reminders while driving.

## State and authority

`pilot/reminders.mjs` is a deterministic reducer. It is **not authentication**. The HTTP layer must construct snapshots from the current authenticated company member and assigned work order; it must not accept company, user, role, report status or document approval from a client. Persist one active visit per company/user. The scope includes company, user, job, visit and assignment revision. Packing acknowledgment additionally binds the brief and checklist contents; report reminders bind the exact report revision and lifecycle state. Every native refresh uses current WK cookies and server membership/assignment checks.

`createReminderState(snapshot, prior, now)` normalizes the scope and reconciles the previous state. `applyReminderEvent(state,event,now)` accepts explicit acknowledgments, opt-in, permission state, position observations and reminder actions. `reminderView` supplies manual UI; `nativeReminderSnapshot` is a bounded native grant. A grant requires a future authenticated lease and expires within four hours; the pilot server selects a shorter fifteen-minute lease. Same-scope storage is not a substitute for a valid server grant.

Checklist items require an ID, label, `required`/`suggested`/`unknown` classification, and a source such as an explicit dispatcher entry or approved source revision. Missing identity/applicability stays unknown. `review_brief` and `ack_item` must name the current brief revision. Changed assignment/brief/checklist contents reopen preparation. A location never checks an item. The manual Finish visit action displays onsite-only gaps before the technician leaves; a later reminder cannot reconstruct a reading.

| Report state | Departure behavior |
| --- | --- |
| `no_report` | Report has not been started |
| `draft` | Saved draft needs attention |
| `unconfirmed` | Exact report revision needs confirmation |
| `confirmed_unsent` | Confirmed report is waiting to send |
| `sent` / `received` | Technician report exists; no unwritten-report reminder |
| `accepted` / `accepted_with_followups` | Reporting task complete; owned physical follow-ups remain open |

Changed destination, reassignment, logout or revoked access invalidate the reducer state and cancel pending intents. On confirmation, delivery or acceptance the HTTP layer must rebuild from current server report state before returning a native grant, removing obsolete reminders. Notification taps revalidate access, job, scope and revision; a stale tap cannot expose a previous account's assignment or send a report.

## Native contract

Only the trusted main frame at the configured exact origin and `/pilot` path may call:

```js
window.webkit?.messageHandlers.carryForwardReminders?.postMessage({op: 'enable'});
// Other explicit operations: disable, sync, logout.
```

The message does not carry trusted identity, coordinates or report status. Native code fetches **GET `/pilot/api/reminders/native-state`**, with current WK session cookies, no redirect following or response cache. Return `{active: null}` when there is no assigned active visit, or `{active: nativeReminderSnapshot(state)}`. Non-200, malformed, expired and wrong-scope data fail closed. The web receives `carryforward-reminders` custom events with `detail.status` and `detail.reason`; an `open` event identifies the current reminder kind after successful server revalidation.

`bindNativeReminderEvents` in `pilot/public/native-reminder-events.js` is the web consumer. Supply `windowTarget`, `revalidate({signal})`, `open(context,{kind,finish,signal})`, and optionally `onError`. Only `open` events with reason `shop` or `site` are considered. The callback must fetch a fresh session and the currently authorized assignment, returning that context or `null`. It receives no event identity, job ID or reminder ID. Shop opens preparation; site opens Finish visit. Bind to the field lifecycle and call `stop()` or `dispose()` on logout, account change, expiry and navigation. Both invalidate pending requests; a newer qualifying event also supersedes the previous request. This helper is not an authorization layer and has no cached-assignment fallback.

The native bridge requests notification and **When in Use** location permission only after its contextual Enable action. There is no Always permission, continuous location stream, geocoding service, precise travel history, provider call or background audio capability. Denied/revoked/approximate/unavailable/stale location uses manual controls. A fresh location must be accurate to at most 65 m and safely inside the configured circle (including uncertainty plus a 25 m interior margin). A second one-time fix after at least 30 s verifies dwell before arming a one-shot `UNLocationNotificationTrigger` for exit. Initial outside/unknown state cannot arm. Only shop and active-site circles exist; overlapping circles require manual clarification. Radius is bounded to 100–1000 m.

Apple's system-managed trigger applies its own boundary heuristics and may deliver after departure. Previews name at most three remaining equipment labels and omit customer names, addresses and access-code fields. Keep dispatcher checklist labels about equipment rather than customer secrets. iOS hidden previews use a generic placeholder; the signed-in manual checklist retains the full item list. Notification actions provide up-to-fifteen-minute snooze, dismiss for the current revision, and mute for the visit. Local opaque revision IDs prevent repeated identical notices; material revisions can reopen them. Snooze uses a one-shot time trigger only after a real location-triggered reminder; it cannot exceed the current access lease. Account logout clears local action choices and pending/delivered notices. Every launch removes old native requests until a fresh authenticated state passes.

**Lifecycle limitation:** a disconnected or suspended app cannot learn a server-side membership revocation immediately, and iOS location triggers have no expiration-date field. On foreground, known logout/revocation, grant expiry while running and every notification tap, the implementation cancels or revalidates. An already armed backup may still appear while the app is suspended before it learns a change; it never grants data access. Reliable cancellation/delivery while locked, backgrounded, terminated or after reboot is not established by Simulator tests. Do not claim remote wipe or reliable real-world notification timing.

## Apple basis

Foreground delivery also requests Apple’s [notification-list presentation option](https://developer.apple.com/documentation/usernotifications/unnotificationpresentationoptions/list), so a delivered backup remains available in Notification Center for a later parked review.

Apple documents that [UNLocationNotificationTrigger](https://developer.apple.com/documentation/usernotifications/unlocationnotificationtrigger) lets iOS monitor an entry/exit trigger with When in Use permission, rather than requiring Always access. Its delivery is subject to boundary heuristics. The choice uses that narrower path; app-side background region callbacks are not being presented as verified behavior.

[Core Location's region monitoring guidance](https://developer.apple.com/documentation/corelocation/monitoring-the-user-s-proximity-to-geographic-regions) describes system limits and lifecycle concerns, including re-establishing monitoring after launch and the first unlock after reboot. This candidate arms at most two triggers. Real-device background, locked, terminated and reboot checks remain separate acceptance work.

## Isolated Simulator build

The current physical contest installation and live phone servers stay untouched. The candidate has its own bundle and container:

```sh
xcodebuild -project ios/CarryForward.xcodeproj -scheme CarryForward \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -xcconfig ios/CarryForward/CompanyPilot.xcconfig \
  -derivedDataPath .local/company-pilot/native-derived \
  COMPILER_INDEX_STORE_ENABLE=NO build
```

Bundle: `com.andybarrett.carryforward.companypilot`. Start page: `http://127.0.0.1:4430/pilot`. Loopback HTTP is accepted **only by Simulator builds** under the existing endpoint policy. Device builds continue to require a configured private HTTPS origin with normal system certificate validation. The candidate startup skips legacy pairing; genuine company account sign-in is required.

The candidate displays a native **Back to CarryForward** control while a protected original source is open. It returns through the authenticated pilot bootstrap rather than revealing a cached previous company page. The technician then reopens the assigned work order. This stops active capture, preserves encrypted unsent work, and does not replay or submit it. The main field screen has no extra native navigation bar.

Dedicated Simulator: **CarryForward Company Pilot**, iPhone 17 / iOS 26.5, UUID `2405FD22-2D90-4DA1-9EB1-7ECB0A633AF2`. Do not target `booted` in scripts while the contest Simulator or another project is active. DEBUG Simulator-only diagnostics contain statuses, opaque scope/revision IDs and scheduled IDs in the candidate app's Application Support `reminder-simulator-diagnostics.json`; no location trace or credentials are recorded.

## Verification and remaining device checks

`node --test pilot/reminders.test.mjs` exercises packing, material changes, each report state, delivery, duplicate transitions/events, grace/re-entry, initial outside/unknown, drive-bys, snooze/dismiss/mute, malformed/missing/ambiguous/overlapping locations, stale/approximate fixes, permission denial/revocation, offline expiry, assignment/company/user changes and manual fallback. Candidate Simulator compilation succeeds. These deterministic tests are not real geofence-delivery evidence. Simulator integration results are recorded separately with the pilot handoff.

### November 4 candidate Simulator results

The dedicated iOS 26.5 Simulator used genuine local account sign-in and fictional assignments. No physical phone, real location or inference provider was used. Private screenshots and bounded native diagnostics are retained under `.local/company-pilot/native-proof/`; they are excluded from Git.

| Check | Observed result |
| --- | --- |
| First location outside both circles | Native location callback recorded outside; no notification request armed |
| Shop inside fix, then second fix 33 seconds later | One shop exit request registered with iOS; required Diagnostic kit remained unchecked |
| Simulated shop exit | Actual foreground iOS banner displayed “Before you leave: Diagnostic kit. Open when safely stopped.” at 06:36 UTC |
| Explicit packing acknowledgment | Obsolete shop request disappeared; location did not check the item |
| Ready to leave and brief controls | Manual checklist showed required versus suggested equipment and dispatcher source; briefing and Stop controls responded |
| Northstar technician logout | Prior company/job and open field UI disappeared; native account cancellation ran |
| Distinct Cedar technician login | Only Cedar's assigned work order appeared; its local draft field was empty |
| Terminate and relaunch while signed into Cedar | Cedar assignment restored; no Northstar customer or draft appeared |
| Sign back into Northstar | Exact unsent Northstar draft restored after the cross-account round trip and app update; it was neither submitted nor silently discarded |
| Protected original manual | Assigned official SolarEdge PDF rendered in WKWebView with the contextual native Back control |
| Return from manual | Session was checked again, Northstar's current list returned, and reopening its work order retained the exact unsent draft |
| Web event-consumer logic | Five focused tests pass for event filtering, fresh callback context, stale-response suppression, stop/dispose and errors; native tap navigation itself remains pending |

At this earlier checkpoint, the banner proved one foreground, system-triggered Simulator exit delivery. It did not establish physical timing, background delivery, locked-screen behavior, terminated/reboot behavior or audible voice performance. The resumed results below supersede the site-exit and tap-navigation gaps only for the specified Simulator cases; other lifecycle claims remain pending.

### November 4 latest native retest

The latest account-isolation retest passed on separate fictional **WO-NATIVE-ISOLATION** assignments after the cookie/storage changes: Northstar A saved the exact single-line draft `NATIVE-A-0236 unsent.`; normal logout removed its field tools, customer and draft; Cedar B showed an empty draft before and after normal terminate/relaunch and remained signed in; signing back into A restored the exact unsent marker. No QA draft was submitted or report confirmed. This supersedes earlier native-auth-pending status for that sequence only. The private receipt is `.local/company-pilot/native-proof/latest-native-account-retest.json`; its six `qa-*.png` screenshots remain in the same ignored directory.

A subsequent normal close/relaunch completed to activate the latest shell, without clearing storage. The next observation reported the Mac locked and requiring manual unlock, so testing stopped. At that stopping point, the protected-source/Back recheck, actual site-exit delivery, stale notification tap, permission lifecycle and long-warning readability remained unproven. The resumed acceptance below records later evidence. Earlier recorded source/Back and shop-exit passes remain historical results; this is not completion of all native checks. No physical phone or inference provider was used.

An earlier Northstar **WO-100** marker attempt sent a conversation event when a newline was entered. That input hazard is retained and is not an unsent-draft pass. The original local draft was restored without further sends; no event was deleted, history rewritten or report reconfirmed. Root verified that the appended fifth event invalidated the current candidate, while the original confirmed report revision `92f913e8428aef47904eb435835c73aea9f7a3093794a1b73243fe0fd59cf7ce` remains in authenticated history with two open follow-ups. Its archived packet and frozen round-trip/backup receipts are historical evidence, not proof that the current WO-100 candidate is accepted. The receipt above records this distinction; `latest-wo100-original-draft-restored.png` retains the local restoration proof.

### November 4 resumed native acceptance (build 21)

After the Mac was unlocked, the dedicated candidate resumed against the same private database. The prior lock stopped that earlier attempt; it is not the current result for the checks below. Build 21 adds foreground Notification Center retention (`.list`) without changing reminder eligibility. It compiled successfully and installed over the same dedicated Simulator container; all 22 focused reducer/event-consumer tests passed. No physical phone, live provider, storage clearing or report submission was involved.

| Fresh fictional assignment/check | Actual Simulator observation |
| --- | --- |
| WO-NATIVE-ISOLATION protected source and Back | Assigned SolarEdge original rendered as an 82-page PDF; native Back showed session revalidation, returned to current assignments, and reopening the job retained `NATIVE-A-0236 unsent.` exactly |
| Location denied | Selecting Never for only CarryForward Pilot canceled location use and produced manual-fallback diagnostics; Finish visit still opened and showed the confirmed-unsent report state |
| WO-NATIVE-CONFIRMED site exit | Fresh inside checks 33 seconds apart armed one site request; a simulated exit reached the iOS foreground delegate, revalidated the current revision and displayed “Your confirmed report is waiting to send” in Notification Center |
| Current confirmed-unsent notice Open | Opening that actual notice revalidated access and opened Finish visit with the report still waiting to send; no report was sent |
| WO-NATIVE-NO-REPORT site exit | Finish visit showed “No visit report yet”; fresh inside/dwell checks armed one site request and the actual simulated exit delivered a readable generic report-attention notice |
| Old notice after job change | With the no-report notice retained, the technician opened WO-NATIVE-SENT and its Finish visit status. Opening the old notice revalidated the new scope and emitted `stale`; no old-job dialog opened and the sent assignment remained current |
| Armed location revocation | One shop request armed at 13:56:43 UTC; changing only candidate location permission to Never canceled scheduled IDs at 13:57:29 UTC. Manual Ready to leave remained available. While Using and Precise Location were restored afterward |
| Latest-shell preservation | Normal terminate/relaunch retained the signed-in Northstar account and exact unsent isolation marker, without storage clearing |
| Long warning readability | A source-only question on WO-NATIVE-NO-REPORT showed the citation and all three WARNING blocks at readable text size; scrolling reached the final qualification/no-work-authorization text while Hold to speak and camera stayed reachable. No report was created, confirmed or sent |
| WO-NATIVE-SENT site suppression | Finish visit said reporting was complete while office handling and physical work stayed separate. With permissions on, enabling inside the site created no site request; changing simulated location outside still produced no new report-attention delivery. This is bounded request/eligibility evidence, not proof of reliable real-world absence |

Private evidence remains under `.local/company-pilot/native-proof/`: `latest-qa-source-list.png`, `latest-qa-protected-original.png`, `latest-qa-back-revalidated.png`, `latest-qa-draft-after-source-back.png`, `latest-qa-location-denied-settings.png`, `latest-confirmed-manual-location-denied.png`, the `confirmed-unsent-*` screenshots/diagnostics, `no-report-*`, `sent-finish-status.png`, `sent-site-*-no-request.json` and `stale-no-report-notice-sent-remains.png`. Fictional variant provisioning has its own signed HTTP receipt `.local/company-pilot/native-site-exit-qa-2026-11-04T13-29-32-043Z.private.json`. The normalized receipt is `.local/company-pilot/native-proof/resumed-native-acceptance-2026-11-04.private.json`, with hashes of 28 retained screenshots/diagnostic files. `final-shell-unsent-marker-retained.png`, `sent-shop-armed-before-revoke.json`, `sent-shop-cancelled-after-revoke.json`, and `long-warning-top-controls.png` / `long-warning-bottom-controls.png` add the latest proof. The middle warning blocks were visibly inspected; their attempted disk capture was interrupted when the Mac locked, so no new middle screenshot is claimed. The unchanged WO-100 event artifact and archived-packet distinction above remain authoritative.

The last UI attempt stopped immediately at the Mac lock; it did not complete manual mute. Capture Keyboard was off. The final bounded diagnostic snapshot showed permission restoration had re-armed one fictional SENT shop request while the simulated location stayed inside that shop. No later simulated exit was performed. Native opt-in therefore remains on; do not claim this candidate was muted. This end state is included in the private receipt.

Notification permission denial, snooze/dismiss/mute gestures, account-change stale taps, locked/background/terminated/reboot delivery and suspended revocation remain unverified in native UI unless separately recorded. The actual stale tap here changed the current job within one account. Deterministic tests cover additional state rules; they do not replace those physical/lifecycle checks.

Before enabling real jobsite use, run a short owner-driven physical route with fictional shop/site locations and no customer data. While parked: enable permissions, review the brief, test missing versus acknowledged packing, and arm from inside. Leave without touching the phone; inspect delivery only after stopping. Repeat for draft, confirmed-unsent and sent report states, re-entry, changed assignment and logout. Then separately check locked, background, terminated, reboot/first-unlock, denied/approximate permissions and offline cases. Do not install this candidate over the contest app until authorized.
