# Development record

## October 30, 2026 — direction and baseline

Andy Barrett narrowed CarryForward from a broad business-transition idea to a field-operations product informed by running Perihelion Solar. The accepted direction is a short, natural interview that uses job photos and work-order context to identify missing observations and unfinished commitments. New evidence may open or resolve investigation branches. Communication style can adapt; evidence requirements do not.

Codex prepared the initial work-order/closeout prototype, repository documentation, investigation architecture and bounded implementation handoff. Baseline `c526a52` passed five domain tests and GitHub Checks. Local architecture/handoff commit `db6898a` followed; it has not been pushed as of this entry.

## October 30, 2026 — first Meta-assisted implementation

- Tool: Muse Code 1.4.14, using Meta `muse-spark-1.3` at medium reasoning effort.
- Owner authority: up to $10 aggregate across coding and product inference; source access limited to CarryForward and fictional examples. Andy approved Meta's free-credit product-improvement notice. Billing showed $150 free credits in use.
- Codex role: translate Andy's direction into a bounded task, configure a loopback budget guard, inspect progress, and review results.
- Muse role: implement durable job sessions, local photo attachments, evidence links, media export and revision-bound confirmation.
- Guard behavior: count input tokens before dispatch; cap output; reserve uncached input plus a safety margin and maximum output cost against the persistent $10 ceiling. No refunds for retries or interrupted calls. Hosted tools and other model routes are blocked. Reservations are conservative bounds, not actual charges.
- First pass: drafted `public/evidence.js`, `public/jobstore.js` and the field-interface changes. It reported syntax checks and explicitly left serving, styling, additional tests and browser verification unfinished. Its phrase “no model calls” described product integrations; actual Meta development inference did occur.
- A completion pass was started to finish serving/styling, add focused tests and address persistence/confirmation issues. Final acceptance results will be added after independent review.

No claim of product AI, physical-device support, deployment or completed Operations integration follows from using Muse to develop the code. Raw session exports are retained locally outside Git; only reviewed summaries belong here. No credentials or customer records are included.

## Independent review checkpoint

The completion pass added static module routing, responsive photo styles, atomic photo/event insertion, photo exclusion that detaches observation links, and stale-confirmation filtering. Codex reran all 11 tests successfully. Browser review at localhost confirmed that a synthetic PNG is saved, appears as an observation-link candidate, and survives a reload; no browser warnings/errors were observed in that flow. Codex corrected the upload timestamp label from “Captured” to “Added”.

This checkpoint is not full Slice 1 acceptance. Job-switch isolation, exported byte readback, real transaction rollback/quota behavior, confirmation lifecycle across reload, and physical iPhone/Android camera behavior remain to be exercised. The Node test covers unavailable IndexedDB rather than simulating a successful browser transaction. No product inference, deployment, push or external Operations write was performed. The aggregate guard reserved $4.210843 across the two development passes; this is not an invoice or measured actual spend.

## Investigation foundation — Codex implementation

Codex added a pure ordered-event reducer and bounded interpretation validator, preserving source/interpretation distinctions, historical corrections and explicit human deferrals. Stale results, unsupported references, conflicting duplicates and evidence-free reopening are rejected. Equivalent question suppression uses branch/evidence state rather than wording. These are synthetic domain tests, not Meta findings, and the module is not yet wired into the interview UI.

Evidence-path review also added export-time byte/hash verification, upload/switch overlap prevention, session snapshots before asynchronous persistence, visible event errors, a truthful saved-photo slot count, and blob-image CSP support. Full browser acceptance is still pending for these changes. No new model calls or provider costs were incurred in this increment.

## Saved text interview — Codex implementation

The UI now has a separate Interview step, backed by replayable job-scoped events. Saved answers remain technician testimony; corrections retain the superseded text. Explicit deferrals retain an owner and require a human reopening. The technician can copy current answers into report notes; closeout exports include the interview record and unresolved branches. Interview input revisions participate in confirmation invalidation.

Browser walkthrough at localhost:4313 confirmed saving a narration, reloading the conversation, marking a question already answered, deferring production to Operations, and saving a correction from 4.2 to 2.4 kW while retaining the original. Deterministic questions visibly repeat information in a broad narration until the technician uses Already answered; this remains a known limitation requiring real semantic interpretation. No live AI or voice experience is claimed.

Browser export readback verified both original and corrected turns, latest 2.4 kW summary, deferred production, Operations follow-up owner, pending Operations acceptance and a revision-bound technician confirmation. No console warnings/errors were captured in that flow. A phone-width browser layout was exercised without horizontal document overflow; this does not establish physical-device support. Full objective remains incomplete: live Meta interpretation, voice capture, evidence-to-interview integration, authenticated API delivery and evaluation still remain.

## First product-side Meta review — Codex integration

Added `lib/meta-review.mjs`, local review/config endpoints, same-origin intent/session controls, replay-based request validation, image ownership/hash checks and browser review controls. The existing loopback aggregate guard remains the only provider route. No provider key reaches the browser. Calls are manual and synthetic-only; three selected images/1 MB total encoded bytes and a 1.9 MB request limit apply. Five attempts per job/process supplement the unchanged $10 aggregate cap.

Four actual product-side `muse-spark-1.3` calls were made through the existing guard:
1. Incomplete testimony: valid source-linked output, but a pending warranty obligation was classified supported and the question repeated an explicitly missing reading. This was a development failure to refine, not a success metric. Latency 14,508 ms, 980 input/2,716 output tokens.
2. Refined prompt: kept missing production/monitoring evidence and unfinished warranty open, retained Operations owner, and asked whether a missing reading could be obtained now or deferred. Latency 26,193 ms, 1,059 input/4,662 output tokens.
3. Image check: a synthetic green image with no meter display did not verify the alleged 2.4 kW reading; production remained needs_verification and the follow-up requested a readable dated reading or deferral. Latency 35,321 ms, 1,203 input/5,970 output tokens.
4. Browser-driven review with low reasoning effort: parsed a fuller fictional narrative into technician-reported repair, production and monitoring claims; kept unfinished warranty needs_verification with Operations owner and asked no extra question. Browser displayed 18,498 ms and 4,345 total tokens. No console warnings/errors were observed.

The guard now reserves $4.360497 across 40 coding/product requests, with cap $10. Reservations are not measured charges. Raw development responses are retained outside Git. These four checks were manual development examples, not a benchmark or proof of general accuracy. The code and tests in this increment were written by Codex; Muse's earlier contribution is documented separately.

27 automated tests pass, including disabled routing, provider/malformed/stale failures, photo hash/association checks and omitted-photo reference rejection. Live voice, physical-device capture, production authentication, actual Operations API delivery and a held-out evaluation remain incomplete. Even low reasoning took about 18.5 seconds in this sample, so conversational latency remains unresolved. Model findings remain separate from deterministic form completeness; no automatic work-order completion is implemented.

## Persistent local Operations handoff — Codex implementation

Added a separate Node 24 built-in SQLite simulator under ignored `.local/operations.sqlite`, canonical job IDs, immutable assignment scope, bounded original evidence bytes, append-only event admission and server-derived SHA-256 packet revisions. Same-origin local session controls protect the versioned API. Browser controls exercise source assignment submission, confirmed delivery, source polling, explicit receipt and exact-revision acceptance. This is not production authentication or a Perihelion integration.

A browser walkthrough used the existing saved narrative, uploaded the synthetic green PNG, corrected the earlier 2.4 kW claim, and ran a fifth actual product-side Meta call. It returned a targeted question asking whether a dated measurement could be obtained or deferred. The technician explicitly deferred production to Operations. Latest model record: muse-spark-1.3, 17,247 ms, 1,792 input / 3,057 output / 4,849 total tokens. This remains a manual development example, not a comparative accuracy result.

The confirmed handoff traveled through HTTP APIs to the local source inbox. Receipt and acceptance were separate UI actions. Database readback verified both technician turns and their supersession link, two actual model review records, source-linked image observations, deferred production, an Operations-owned warranty obligation and exact original photo SHA-256. A source-photo HTTP download matched all 180 original bytes. The first accepted packet revision was 3670e35d81b7d4d1d16d685c4bc66e85355a1ad2b180879a89d10b00afb993e8.

Review was then made consistent: supported interview claims now appear as **reported**, distinct from independently unverified but fully documented form observations; deferred/contradicted/missing-evidence branches remain open. Client confirmations include review contract v2. The browser showed two recorded outcomes and two follow-ups, required confirmation of the updated review, queued a new server revision beginning 478105ab2464d1e2 with receipt/acceptance pending, and separately accepted that revision with follow-ups retained. The earlier acceptance did not transfer.

33 tests pass on Homebrew Node 24, including a real isolated HTTP server test, cross-job/refusal cases, immutable event-prefix checks, report/evidence-change invalidation and database reopen persistence. No browser warnings/errors were captured in the first accepted flow. A visual proof is retained outside Git. The guard reserves $4.392416 across 41 coding/product requests against the unchanged $10 cap; no reset or new service was used.

Remaining scope includes voice capture/handling, actual phone/device checks, complete/incomplete/contradictory held-out evaluation against a plain same-model summary, communication usability and contest/public-release readiness. No Git push, deployment, live Perihelion action or role-reversal experiment was performed.

## Reviewed voice input and original-audio handoff — Codex implementation

Added bounded local recording/upload controls, playback, browser WAV normalization, IndexedDB audio storage and raw-transcript/reviewed-answer links. The implementation stops a recorder at 30 seconds, stops tracks, attempts partial-save on navigation interruption, preserves a memory recovery download after failed storage, and retains text/upload fallback. Microphone permission and physical-device interruption behavior were not exercised; the agent never activated the microphone. Browser verification used newly generated fictional macOS speech only.

Official Meta documentation identifies a dedicated `muse-voice-transcribe-1.0` endpoint and warns that Spark 1.3 audio understanding is degraded. The dedicated ASR route was added to the existing aggregate guard using its published $0.18/hour whole-second rate, with a conservative minimum $0.01 reservation per bounded clip before dispatch. The old guard was confirmed terminal before its runtime lock was replaced. The entire prior ledger/request prefix was preserved; the financial cap was not reset or expanded. The reviewed guard source now lives in `scripts/meta-budget-guard.mjs` and requires explicit private credential/ledger/token/lock paths.

Two real dedicated ASR calls processed the generated approximately 9.16-second clip in 2,082 ms and 1,918 ms. They retained the unfinished warranty obligation but differed in capitalization/punctuation and emitted a doubled final period. The browser preserved the raw machine text across reload, allowed a punctuation correction, and saved the reviewed words as a turn linked to the immutable original. These are small development examples, not ASR accuracy or latency benchmarks.

A sixth real product-side Spark review reconciled the reviewed voice answer: 11,301 ms, 2,540 input/1,771 output/4,311 total tokens. Production remained human-deferred and warranty remained Operations-owned. Material input after earlier reasoning is now flagged for reconciliation rather than silently inheriting older supported findings. Unlinked original media participates in confirmation revision v3, preventing a report confirmation from covering an attachment added later.

The voice-inclusive packet (revision 849678f453ff2186dc2032751420f6f7e8e9d82f656b9c41ab6bbb770bcde473) was confirmed, queued, received and separately accepted with follow-ups. HTTP readback reproduced all 297,338 original voice bytes and SHA-256 42bb5a261ff23f2e120b337d1aaee43dab9af5df8bc0cc8192da1c5572b907c1. It retained the original/normalized WAV hashes, raw ASR text, edited reviewed text, source identities and both unfinished obligations. The browser-exported media bundle also reproduced original and transcription-WAV bytes and included the linked reviewed turn.

A separate fictional browser job verified that first-job voice did not leak into it, adding unlinked audio invalidated its existing confirmation, and switching back restored the original job's independent clip/transcript. Phone-width (390 px) and desktop (1100 px) layouts showed no horizontal overflow. No browser console warnings/errors were captured in the voice handoff flow.

44 tests pass on Node 24, including duration parsing, stereo/sample-rate conversion, invalid originals, raw/reviewed transcript separation, stale local writer rejection, cross-job audio, handoff preservation and a real isolated guard denial before provider dispatch when its aggregate cap cannot cover audio. The live ledger now reserves $4.445270 across 44 coding/product requests against the unchanged $10 cap; those conservative reservations are not actual charges.

Remaining scope: real microphone/phone tests, spoken replies/full-duplex behavior if retained, naturalness/usability improvements, held-out complete/incomplete/contradictory evaluation against a plain same-model summary, and contest/public-release readiness. No new service/subscription, Git push, deployment or live Perihelion transfer occurred.


## October 30, 2026 — cloud conversation and job-source recall

Andrew requested a modern interface that feels like talking to a cloud: start with the work order, bring an image, PDF region or playable clip into view, and support conversational references such as “show me that last PDF” and “what was the warning before I remove the cover.” Efficiency and enjoyment are design aims; no measured improvement is claimed.

Codex implemented the cloud as the default local workspace, with on-demand job/source dialogs, a hidden typing fallback and an adapter to the existing saved-interview and reviewed-voice path. Source navigation stays separate from technician testimony. Job identity, source revision, page and provenance remain visible. Detailed report editing, explicit guarded Meta review and exact-revision confirmation/receipt/acceptance retain their existing controls. Local read-aloud uses an available local browser voice only after an explicit action; this increment is not continuous or full-duplex conversation.

The current packet combines work-order history, the job's saved photos and, for the exact fictional sample job only, a labeled real two-page PDF, rendered page, synthetic image and short generated video. These reference fixtures do not establish equipment state or approved procedures. General PDF parsing, document-library ingestion, retrieval and video indexing remain unbuilt. No external assets, customer records, credentials or provider configuration were used for this UI increment.

Source recall persists per job/system and matching revision. An action-specific warning requires explicitly approved trusted application metadata matching the system, source revision and requested action. Missing, unapproved, ambiguous or mismatched material returns unavailable; the app clears unrelated imagery rather than generating a procedure. There is no import or source-approval workflow in this increment.

Independent review corrected stale asynchronous job refresh, narration beginning with “show,” exact source-ID selection, truthful partial/failed photo status, navigation-command draft cleanup and preservation of unsent narration across ordinary navigation. Browser review found and corrected a centered oversized PDF whose left edge was outside the scrollable region. Closing a source now returns to the job conversation.

Final verification: **80 Node 24 tests pass**, including thirteen source-router cases; affected JavaScript syntax and whitespace checks pass. A fresh AI-disabled localhost origin with an isolated fictional simulator store verified PDF recall after reload, current-source zoom, missing-warning response with no stale preview, one-copy narration persistence, unsent draft preservation through Handoff and return, executed field-report command cleanup, and corrupt-image rejection stating nothing new was saved. Console warning/error capture was empty in that desktop flow. Desktop and 390×844 phone emulation verified the layout, complete left/right PDF zoom, fit-to-view and source-close behavior. The actual supplied WebM played to completion in the integrated browser review. Preview images are retained in the oversight artifacts outside Git.

No microphone was activated and no actual model calls were made for this increment. Existing synthetic ASR/Meta receipts remain historical evidence for the underlying path, not validation of new continuous voice. Physical iPhone/Android access, recording/interruption, a realistic technician trial, general retrieval and final publication remain separate acceptance work. This is a local implementation; no push, deployment, provider write or contest submission occurred.


## October 31, 2026 — prepare the technician before the visit

Andrew corrected the story and opening experience: CarryForward must brief the technician on the system, problem, troubleshooting ideas, customer preferences, gates/access, safety hints and ladder rules before capture. Codex added a brief-first cloud view, source-tagged optional work-order context, explicit gaps, reviewed local readout control and natural brief recall. The assignment and dated history remain available. Viewing/continuing the brief is not approval, safety acknowledgment or confirmation of field work.

Imported planning ideas remain hypotheses/context. Safety and ladder notes are unapproved references, not operating procedures, and are omitted from spoken rules. Approval injection is rejected. Meta receives the context but cannot cite its note IDs as admitted evidence to close a branch. No actual manufacturer/site/ladder rule was invented or fetched. The new fictional DEMO-WO-1043 packet is a real three-page PDF with matching note/source/page metadata; original1042 jobs are preserved rather than silently upgraded under their immutable IDs.

The increment was prepared on top of the existing private-phone access commit288ca9d and preserves that work. 95 Node 24 tests pass, plus affected syntax and whitespace checks. Browser QA checked all seven sections at desktop and390×844 emulation, Continue, recall, revision-specific resume and unsent-draft preservation. The actual supplied PDF preview loaded. No speech or microphone activation, actual model call, production/provider change, public deployment, push or contest submission occurred. Actual approved/applicable safety and ladder sources, physical-device acceptance and general source ingestion remain open.

## October 31, 2026 — join the cloud evidence and handoff loop

Codex replaced cloud-to-legacy review navigation with an explicit in-cloud photo selection sheet and a shared guarded review runner. It added original-preserving smaller copies in that sheet, visible over-limit preflight, question-bound owned deferral, and draft handoff preparation from saved testimony. Existing detailed correction/report tools, source authority, explicit confirmation and revision-specific simulator acceptance remain intact. Unsent narration is excluded visibly and preserved.

99 Node 24 tests pass. One actual synthetic Meta review asked about post-replacement photo timing; production was explicitly deferred to Operations. The browser then confirmed, delivered, recorded receipt and accepted the exact packet with three follow-ups. Original and copy hashes matched simulator readback. Desktop/390px checks, draft cancellation/reload and no-warning/error console inspection are recorded in `CLOUD_VISIT_LOOP.md`. Shared reservations are $5.387732/$10; the original ledger was preserved on guard restart. This is a developer walkthrough, not a human usability study. Physical-phone capture and the normal technician trial remain pending; no push, deployment or external Operations transfer occurred.
