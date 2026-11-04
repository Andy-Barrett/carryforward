# Build plan

Build one service visit end to end. The technician speaks naturally, adds job photos, answers a useful question, and returns a closeout that keeps remaining obligations visible. The evidence loop is the product; media capture and APIs support it.

## Baseline — implemented

- [x] Work-order briefing with source history and JSON import.
- [x] Field form and deterministic completeness review.
- [x] Local text drafts and JSON closeout export.
- [x] Separate repair, production, monitoring, and warranty outcomes.
- [x] Five focused domain tests and a passing GitHub Checks run at `c526a52`.

These do not establish conversational reasoning, physical-device support, live inference, or actual Operations delivery.

## Current checkpoint

November 3: the continuous fictional iPhone conversation passes through briefing, onsite access questions, a visit report, correction, explicit follow-up ownership and the final draft. The owner confirmed “Correct draft; full readout finishes.” Saved-state readback separately proves the 2.4 kW pre-work correction, retained monitoring/no-replacement testimony, and production plus warranty deferred with Operations. Both raw reports and correction links remain available. These are reported facts, not independently verified field outcomes.

Native build 18 also has a separate owner pass for right swipe → camera → Use Photo → new thumbnail. This continuous visit did not add a photo. Sarah’s brisk 1.4× pace is accepted; report latency still varies. All 186 Node checks pass, and 42 HTTPS shell assets passed. See [the field trial](FIELD_TRIAL_2026-11-03.md) and [physical validation](PHONE_VALIDATION.md).

The same visit has now completed owner confirmation, actual API admission/delivery, source receipt and separate simulator acceptance with two follow-ups retained. Seven original audio files and all eleven investigation events matched authenticated readback. Assignment admission happened at handoff; a fresh contest master should show API admission before the briefing. Next, freeze the demonstrated code and finish the recording, source/license package and submission review before expanding the company library. Android and live Perihelion integration remain deferred.

The current app preserves a text fallback, job-scoped source recall, evidence history and offline drafts. General document ingestion/retrieval, full-duplex voice and production deployment remain unbuilt. The slices below retain their original acceptance intent; a local prototype is not a completed field deployment.

## Slice 1 — durable job evidence

Start with docs/MUSE_HANDOFF.md. Store sessions/events/photo blobs in IndexedDB, keep jobs isolated, handle failed writes visibly, preserve confirmations against exact revisions, and export actual media. Keep the form working as a fallback. No model or service-worker work in this slice.

Done means two photos survive reload and job switching; actual bytes/hashes survive export; a failed write cannot be mistaken for a save; changing a confirmed report invalidates that confirmation.

## Slice 2 — investigation state and contracts

Implementation checkpoint: `public/investigation.js` now provides a pure event reducer and bounded model-output validator, with synthetic unit cases covering correction history, stale output, excluded/cross-job sources, human deferral, duplicate events and equivalent-question suppression. It is connected to the saved interview and guarded Meta review; the first twelve-case same-model comparison is documented in `docs/EVALUATION_FIRST_PASS.md`. Independent and human-effort evaluation remain pending.

Implement a pure reducer over ordered job events, with branch states and evidence ownership checks. Add a schema validator for proposed model observations, branch changes, and one next question. Use explicitly labeled fixtures, not live calls.

Done means a new photo can open one branch while another stays resolved; a correction supersedes the relevant claim without erasing its source; stale interpretation results cannot overwrite newer turns; equivalent questions are suppressed; unknown/deferred outcomes remain visible. Add malformed-output and duplicate-event cases.

## Slice 3 — simple interview capture

Partial implementation: a job-local text interview is connected to the event reducer. Answers, explicit corrections, already-answered responses and owner-assigned deferrals persist through reload. Question selection has a labeled deterministic fallback plus guarded live Meta interpretation. Local recording controls, playback, synthetic audio transcription and reviewed transcript-to-answer links now exist. Unsent text and reviewed voice drafts recover separately from submitted testimony. Explicit job-local direct/conversational style is implemented. Uploaded WAV persistence and delivery were verified. The owner confirmed saved-clip playback and a fresh record/stop/play cycle in the native iPhone app on October 31; permission-denial, interruption and Safari/Android checks remain pending.

Add voice recording, explicit capture state, playback, interruption recovery, and a text fallback. The UI offers one question at a time plus already answered, can't verify, and follow up later. Use explicit direct/conversational style settings; keep requirements identical. No inferred personality profile or cross-job memory.

Done means a technician can narrate, add a photo mid-session, correct a statement, defer a question, and resume the saved job. Inspect real iPhone/Android permission and recorder behavior. Photo review and confirmation remain parked activities.

## Slice 4 — Meta-backed review

Implementation checkpoint: guarded `muse-spark-1.3` review and `muse-voice-transcribe-1.0` transcription are connected. Actual synthetic calls, usage and latency are retained. The fixed twelve-case comparison and three-case development retest are documented; no accuracy advantage over a strong summary was demonstrated. Original-preserving review copies were exercised through actual model interpretation, export and simulator readback. An explicit local-browser read-aloud action is implemented when a local voice is available; full-duplex conversation remains unimplemented. A new guarded push-to-talk stream, reviewed Send and local spoken follow-up are implemented; the owner confirmed both the revised local microphone check and one full physical speech → reviewed Send → Meta follow-up → local spoken response cycle on November 1. Broader physical acceptance remains pending. See [live voice](LIVE_VOICE.md). Readable text is the accepted contest fallback.

Only after credits, billing route, data handling and a numeric coding/product budget are confirmed. Verify actual model capabilities and implement bounded transcription/image/text adapters. Capture model IDs, usage, latency, validation failures, and conservative cost reservations. Do not assume a paid coding subscription is covered by API promotional credits.

Done means complete, incomplete and contradictory evidence produce different actual model findings/questions; sources remain inspectable; an ambiguous photo candidate requires confirmation; a provider error leaves a recoverable draft; a budget failure prevents a call. Resolve spoken-output support early; retain readable text if speech synthesis is unavailable.

## Slice 5 — API loop and Operations simulator

Implementation checkpoint: persistent SQLite simulator, canonical job IDs, evidence-byte admission, append-only interview admission, server-derived handoff packets and SHA-256 revisions, separate confirmation, queue, source receipt and acceptance endpoints, and browser source-inbox controls. Unit tests cover restart persistence and stale/cross-job rejection; a real HTTP test covers assignment through receipt and revision-specific acceptance. Live Perihelion integration remains excluded.

Implement the bounded versioned interface in the architecture notes. Use a clearly labeled local source-system simulator. Preserve source IDs, reject cross-job access, deduplicate admission/delivery, and separate delivery receipt, technician confirmation, and source-system acceptance.

Done means an assignment enters through an API, captured evidence advances the same session, the simulator receives a closeout with unresolved obligations, and a stale acceptance cannot apply to a newer report. No live Perihelion integration or arbitrary outbound webhooks.

## Slice 6 — evaluate and submit

Prepare about 12 synthetic cases and expected findings before prompt tuning. Hold some cases out. Compare with a plain same-model summary prompt. Report actual omissions, unsupported closure, unnecessary questions, reference validity, user effort, latency and cost. Adaptive personality is a testable hypothesis, not a claimed accuracy gain. The paired-style pilot protocol and a no-inference kit generator are in `evaluation/usability/README.md`; preparation does not count as a completed study.

Freeze feature work by November 2 if feasible; use November 3 for fixes, phone checks and the three-minute recording. Target November 4 at 5 PM Central for submission, three hours before the published deadline. These are targets, not completion claims. The bounded October 30 inference approval is active; actual-device validation and release approval remain dependencies.

Before release: hosted-access review, repository/data review, owner-approved public visibility and license choice, tested links, accurate disclosure of AI assistance and newly built work. Do not turn a fixture into a claimed live result to meet the deadline.

## Cut order

Cut advanced personality learning, cross-job history, glasses, full-library access, production integration, and broad web retrieval. If needed, cut spoken responses and semantic image selection in favor of text and a photo picker. Preserve evidence capture, actual Meta review, one adaptive follow-up, and the API closeout loop.

October 31 native checkpoint: the private iPhone wrapper compiles for simulator and physical iOS without signing. Persistent WKWebView, same-origin navigation, confirmation handlers and native export/share delegation are implemented. Xcode setup is complete; the actual brief and visit workspace render in the iPhone Air simulator. The owner-approved signed build now loads the current briefing on the physical iPhone over trusted, paired private HTTPS. Continue with the explicit first-launch acceptance in `ios/README.md`. The owner subsequently confirmed saved-clip playback and a fresh record/stop/play cycle after the native playback-session fix. Do not treat these bounded passes as the full technician trial or interruption/offline acceptance.

November 1 phone closeout checkpoint: one owner-captured fictional camera photo, explicit smaller copy and actual Meta image review reached a phone-confirmed local API handoff. Receipt and acceptance were separate, all four checks stayed open, and both JPEGs plus the original voice WAV matched source downloads. Explicit owner correction now preserves earlier events and requires reconfirmation. Full interruption/offline/Android and technician usability work remain open; see [phone validation](PHONE_VALIDATION.md).


November 1 scope update: Andy deferred Android work for the current contest pass. Continue on his iPhone. This changes the immediate test priority; Android remains a planned, unverified target. The server-stopped iPhone cold-start, local recording/playback and retained playback after update/reconnection now have bounded passes in `PHONE_VALIDATION.md`. Next is a fresh fictional owner usability run, followed by fixes driven by observed friction.

## November 2 priority — one hold and a useful reply

The owner replaced the four-stage controls with a single hold/release conversation and requested remembered connection/microphone permission. The implementation preserves original evidence, unreviewed ASR, bounded source lookup, one-question review and separate final confirmation/acceptance. Customer contact links sit beneath the name; other tools stay under Details. Automatic connection is observed on the physical iPhone. The first new hold failed at microphone setup; build 8 and the full fictional work-order → onsite → report → final-update conversation need their own owner evidence. Android remains deferred.

## Next product milestone — company library and assignment context

After the current phone audio/context acceptance, use the [company-context contract](COMPANY_CONTEXT_CONTRACT.md) for two fictional companies, role/integration principals, company-scoped identity/idempotency, exact authorized source versions and offline-cache boundaries. Preserve retained prototype evidence and existing API compatibility. The November 4 isolated company pilot now implements source processing/admin forms, maintained authentication and company-scoped uploads; commercial billing remains unbuilt. See the current [pilot checkpoint](COMPANY_PILOT.md). The same note records the short departure brief, optional nonintrusive travel discussion and parked detail stages. Current hold-to-speak is not accepted driving support.


November 3 report follow-up: the continuous trial has owner passes for briefing and onsite answers. The first report preserved production/warranty follow-ups but took 31.16 s to first playable output. Classification and interpretation now share one guarded response, and replies name actual open items/owners. A generated text check validated in 7.31 s; physical latency, correction, explicit deferral and final review remain acceptance work.


November 3 persistence follow-up: the owner accepted quicker speech and clear open-work wording, but saved-state audit found production ownership was not written. Quoted follow-up events and partial report amendments now pass 184 checks and one guarded text check. Activate the web-shell update, test one correction/explicit-Operations instruction, inspect persisted owners and monitoring, then finish the same visit's final draft review. Do not count the earlier spoken acknowledgement as a persisted-owner pass.


November 3 current checkpoint: physical saved-state readback now passes partial reading correction, retained monitoring/no replacement, and both deferred Operations owners. Final readout uses current findings with raw transcript/correction history expandable. 186 checks pass. The owner then confirmed the correct draft and complete readout. Delivery and acceptance remain separate and unperformed for this visit.


November 3 API closeout: the current continuous visit was owner-confirmed, queued, received and separately accepted with two Operations follow-ups. All seven original voice-file hashes/MIME/sizes, exact report/media revision, eleven investigation events and amendment links matched actual authenticated HTTP readback. This supersedes the earlier undelivered status without changing those historical observations. No model calls or application changes occurred in this closeout.


## November 4 company-pilot checkpoint

Andrew clarified that the service supports many companies but each user has one enduring company membership, with no selector. Implemented in the isolated candidate: Better Auth sessions/roles/invitations/local recovery; approved immutable TXT/text-PDF library and actual applicable manual retrieval; company/integration-scoped v2 assignments; conventional dispatch UI; captured company/user encrypted cache with safe logout; validated optional voice routes; native opt-in departure reminder and manual fallbacks; exact report author/confirmation, original evidence, correction history and separate office receipt/acceptance. Form ownership now commits on unresolved, ownerless branches while preserving existing named owners with the candidate, with rollback on failure.

Actual HTTP two-company handoffs, restored-state readback, browser A/B draft recovery, a browser correction/confirmation/delivery and native Simulator isolation/source/notification observations are recorded in [COMPANY_PILOT.md](COMPANY_PILOT.md). Live targets and physical lifecycle checks remain separately pending. At this first checkpoint the browser file-choice test was blocked and not counted as passed; later approved results below supersede that limitation. Preserve contest commit19c447a, public main and the physical phone.

November 4 earlier continuation: exact unsent report-form recovery, role downgrade/dialog cleanup, delayed question cancellation across accounts and shortened genuine lease expiry passed in the actual browser. A divergent longer server history now pauses sync and preserves local work; stale report drafts require review against the current event revision. The voice client retains one stable original/WAV identity through transcription and later sync, with release-to-save timing preserved. That audit closed complete warning readback, explicit new-document context refresh, exact setting-section recall and office-inbox exclusion gaps;301 checks passed with zero skipped. Native A→B→relaunch→A draft isolation also passed. At that checkpoint further native checks stopped when the Mac locked, and browser file roundtrips were approval-blocked. These are historical limits, not the latest acceptance status.

November 4 resumed audit: the owner authorized the exact fictional browser file tests. Actual TXT file selection, extraction inspection and explicit approval passed; the downloaded conflict export retained the correct company/user/job, unsynced correction and stale report draft without replacing server history. A separate owner-approved photo test delayed its HTTP upload after local hashing, signed out and opened the other company, then recovered and explicitly synced the original photo under its own account. Original bytes/hash survived and the other company was denied access. Late field status callbacks now check the original account/visit scope. Signed restart readback also projects the retained authenticated author for archived reports without changing stored packets or digests. The source checkpoint after `a822c50` passes 310 checks with zero skipped. Final native results and the remaining release boundary are recorded in [the pilot handoff](COMPANY_PILOT.md).

November 4 local pilot acceptance: Simulator build 21 exercised the actual no-report and confirmed-unsent exit notices, current Open, stale notice rejection after changing assignments, sent-report suppression, location-denied manual fallback and cancellation of an armed request after location revocation. Protected original/Back, final-shell draft recovery and full warning readability also passed. Reducer/contract tests cover the broader state matrix; OS snooze/dismiss/mute and notification-permission denial are not interactively verified. The local pilot is ready for review, with physical/live timing, hosted release and commercial provisioning still separate. No candidate push, deployment, purchase, real-customer import or physical-phone change occurred.

## November 4 next step — prepare Render

Owner decision after preparation: **keep it local for now**. The Render package remains saved; cloud creation, the proposed private-repository push, integration access and credential transfer are deferred. Continue the local pilot. The next useful acceptance is a local fictional field visit through briefing, onsite questions/photos, report correction and exact final handoff; new physical-device observations must be recorded separately from prior simulator and contest results.

Owner's next local priority: technicians select and order their day's work; this context is important to the before-you-leave reminder. [My day](DAY_PLAN.md) now saves a company/user-scoped ordered plan, offers an explicitly accepted coordinate-based nearby suggestion, aggregates departure packing and identifies the next stop without changing current report status. Changes revalidate preparation; next-stop packing can remain pending after a report is sent. Three new fictional work orders support a local trial. Road routing/traffic, live multi-job voice advice and physical delivery of the new reminder reasons remain unverified/unimplemented as described in that note.

Andrew selected Render for the private hosted pilot preparation. The [prepared release](RENDER_PILOT.md) uses a separate one-process service, persistent disk, HTTPS origin, readiness/storage probes, bounded shutdown and pre-provisioned fictional accounts with public signup disabled. A real local TLS-proxy rehearsal retains two companies' exact reports, original evidence, sessions and follow-ups across restart and denies opposite-company access. Inference stays off so no existing spending allowance is reset or duplicated. Cloud creation, source publication and credential transfer await the concrete release decision; the original contest service and physical phone are unchanged.

After actual hosted storage/access acceptance: verify backup/restore on the new host; prepare the physical iPhone endpoint and one authoritative inference-budget path; then run the useful fictional briefing → onsite question/photo → report/correction → final update with hosted persistence. Real-company onboarding, verified email delivery, retention, billing and App Store release follow their own implementation and approval. Do not treat the hosting rehearsal as a subscription product.
