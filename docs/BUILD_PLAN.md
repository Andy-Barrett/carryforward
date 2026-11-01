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

The local end-to-end path is implemented and exercised. Andrew’s October 30 cloud-interface direction is now the default local workspace, with a source-tagged pre-visit brief, job-scoped source recall, PDF inspection, supplied clips and the existing reviewed-voice/text path. General document ingestion/retrieval and continuous voice remain unbuilt; see [cloud interface](CLOUD_INTERFACE.md). See [readiness evidence](READINESS_REVIEW.md) for what is verified and what remains. The slices below retain their original acceptance intent; a local prototype is not a completed field deployment.

## Slice 1 — durable job evidence

Start with docs/MUSE_HANDOFF.md. Store sessions/events/photo blobs in IndexedDB, keep jobs isolated, handle failed writes visibly, preserve confirmations against exact revisions, and export actual media. Keep the form working as a fallback. No model or service-worker work in this slice.

Done means two photos survive reload and job switching; actual bytes/hashes survive export; a failed write cannot be mistaken for a save; changing a confirmed report invalidates that confirmation.

## Slice 2 — investigation state and contracts

Implementation checkpoint: `public/investigation.js` now provides a pure event reducer and bounded model-output validator, with synthetic unit cases covering correction history, stale output, excluded/cross-job sources, human deferral, duplicate events and equivalent-question suppression. It is connected to the saved interview and guarded Meta review; the first twelve-case same-model comparison is documented in `docs/EVALUATION_FIRST_PASS.md`. Independent and human-effort evaluation remain pending.

Implement a pure reducer over ordered job events, with branch states and evidence ownership checks. Add a schema validator for proposed model observations, branch changes, and one next question. Use explicitly labeled fixtures, not live calls.

Done means a new photo can open one branch while another stays resolved; a correction supersedes the relevant claim without erasing its source; stale interpretation results cannot overwrite newer turns; equivalent questions are suppressed; unknown/deferred outcomes remain visible. Add malformed-output and duplicate-event cases.

## Slice 3 — simple interview capture

Partial implementation: a job-local text interview is connected to the event reducer. Answers, explicit corrections, already-answered responses and owner-assigned deferrals persist through reload. Question selection has a labeled deterministic fallback plus guarded live Meta interpretation. Local recording controls, playback, synthetic audio transcription and reviewed transcript-to-answer links now exist. Unsent text and reviewed voice drafts recover separately from submitted testimony. Explicit job-local direct/conversational style is implemented. Uploaded WAV persistence and delivery were verified; microphone/interruption on physical devices remains unverified.

Add voice recording, explicit capture state, playback, interruption recovery, and a text fallback. The UI offers one question at a time plus already answered, can't verify, and follow up later. Use explicit direct/conversational style settings; keep requirements identical. No inferred personality profile or cross-job memory.

Done means a technician can narrate, add a photo mid-session, correct a statement, defer a question, and resume the saved job. Inspect real iPhone/Android permission and recorder behavior. Photo review and confirmation remain parked activities.

## Slice 4 — Meta-backed review

Implementation checkpoint: guarded `muse-spark-1.3` review and `muse-voice-transcribe-1.0` transcription are connected. Actual synthetic calls, usage and latency are retained. The fixed twelve-case comparison and three-case development retest are documented; no accuracy advantage over a strong summary was demonstrated. Original-preserving review copies were exercised through actual model interpretation, export and simulator readback. An explicit local-browser read-aloud action is implemented when a local voice is available; full-duplex conversation remains unimplemented and physical voice checks remain pending. Readable text is the accepted contest fallback.

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

October 31 native checkpoint: the private iPhone wrapper compiles for simulator and physical iOS without signing. Persistent WKWebView, same-origin navigation, confirmation handlers and native export/share delegation are implemented. Xcode setup is complete; the actual brief and visit workspace render in the iPhone Air simulator. An owner-approved signed build is installed on the physical iPhone; iOS developer-certificate trust is the current first-launch dependency. Continue with the explicit first-launch acceptance in `ios/README.md`. Do not treat generic build success as the technician trial or physical capture acceptance.
