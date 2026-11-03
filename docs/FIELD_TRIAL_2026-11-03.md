# November 3 field trial

The phone conversation is still one hold/release control. Right swipe opens the camera; left swipe opens the work-order list. A small Photo control provides the same capture action without requiring a gesture. Photo thumbnails appear on the conversation only after the original and evidence event commit locally. Tap to inspect. Cancel, duplicate detection and failed saves do not invent a new saved photo or a model interpretation. Photos are never automatically sent to Meta.

The browser fixture check saved a fictional display photo, opened its preview and retained its thumbnail through reload. Phone and desktop widths were inspected without horizontal page overflow. Focused checks cover synchronous picker activation, cancellation, failed admission, busy-state exclusion, vertical/control gesture rejection and feedback boundaries. The physical right-swipe/capture/thumbnail sequence subsequently passed in build 18, as recorded below.

## Review-driven tests

A fresh app-scoped backup contained fourteen recent fictional question/reply pairs. The review found useful safety answers, but weak preparation handling: absence of a wiring list was treated too much like no need, “contingencies” was answered as a missing document section, and a past November 2 window was repeated without a present-date distinction. The prompt now supplies the current Central date, addresses practical preparation gaps, preserves unknown materials and distinguishes reported access from verified access. Two live guarded development checks confirmed those distinctions; this is a small author check, not an independent accuracy evaluation.

Details → Test this visit provides eight manual cases: briefing/preparation, two factual replies, dated customer history, changed safety conditions, photo capture/cancel/reopen, a production correction that preserves monitoring, explicit owner/deferral, and final update. Passed/Needs work/Not tried and notes stay job-local usability feedback. They never alter field evidence, confirmation, receipt or acceptance. Save conversation review includes that feedback with the text/timing record; it sends nothing externally.

## Voice

Sarah was selected from eighteen generated Eleven v4 Turbo auditions on the verified Free account. No paid subscription was purchased. The owner confirmed two complete physical replies on build 15, then requested less delay and faster speech. Build 17 includes brisker 1.4× native playback, transparent exact-source lookups for narrow gate/model questions and bounded server-derived briefing/final readout grants. Meta still handles ASR, other questions and evidence reasoning. See [voice output](VOICE_OUTPUT.md) for actual timings and limitations.

## Selected icon

The owner selected concept 2 in the oversight conversation. The unchanged 1254 px master is tracked at `assets/app-icon/circuit-laces-master-v1.png`, SHA-256 `102906ace85b6c5bdffbb2677e56535fb734486bcbe73a47fc8702cc6b496b79`. Necessary exports are the opaque 1024 px native AppIcon, 192/512 px manifest icons, 180 px Apple touch icon and 32 px favicon. Colors, framing and artwork were preserved; no new image generation occurred. The asset catalog, manifest, explicit server allowlist and versioned shell reference those exports.

Xcode compiled the icon for both targets, and the installed bundle declares AppIcon. The 32/60/120 px rounded-corner preview was inspected; the platform supplies its own final mask. Build 15 was physically installed, followed by build 17. Physical launcher appearance has not been observed and is not claimed.

## Stable private connection

During the trial the Mac's DHCP address changed. The server now binds the explicit current private interface while accepting one exact local Mac hostname. A new leaf for that hostname is signed by the same already-trusted temporary CA; no certificate validation was bypassed and no new root download is needed. The native policy accepts one configured private-IP or single-label `.local` HTTPS origin; foreign origins and public/cleartext fallbacks stay rejected. All 42 shell assets passed authenticated TLS/HTTP checks.

The stable hostname creates a fresh origin-local trial workspace. Earlier origins and evidence are retained in the app and in ignored backups; they were not silently moved or cleared. This does not implement general storage migration. Exact network/credential/runtime details remain private. Automatic connection was observed on the physical iPhone without code entry after USB provisioning. The owner confirmed the gate-code wait was shorter and Sarah’s faster pace was good on build 17. The right swipe did not open the camera. That failure remains recorded; it is not a camera pass.

## Verification and next work

166 Node checks pass. Signed device and unsigned Simulator build 17 pass. Silent native rendering exercised the brisk PCM rate; exact-origin checks cover private/mDNS admission and foreign-host rejection. These software checks do not replace physical voice/camera acceptance. Six actual guarded Meta development calls were used for preparation and latency comparisons; owner-driven app calls are recorded separately in the aggregate ledger. Eighteen actual ElevenLabs synthesis requests produced the audition set; no paid plan, topup or overage was enabled.

Finish the short owner trial, then run one continuous fictional visit through a clear unresolved office obligation and final review. Keep actual simulator receipt and Operations acceptance separate. The next platform milestone remains the bounded two-company library/assignment-context foundation in `COMPANY_CONTEXT_CONTRACT.md`; Android, live Perihelion integration and production deployment remain deferred.

## Follow-up: swipe recovery

The owner accepted the shorter gate-code wait and brisk Sarah pace, but the right-swipe camera check failed. The previous handler depended on `pointerup`, which can be canceled by scroll handling. It now tracks one touch through `touchend`, opens synchronously within that release, and prevents scrolling only after a clearly horizontal gesture. Vertical scrolling, controls, multiple touches, cancellation and active recording/save exclusion remain protected. The minimum horizontal travel is 64 CSS pixels. The Photo control remains available.

All 169 Node checks pass, including touch release after pointer cancellation, one-open behavior, vertical/control/multi-touch rejection and busy/page-change exclusion. This is a web-shell update on native build 17; no native rebuild is needed. A Simulator swipe reached the camera action, but no camera picker opened there. The physical app was refreshed and reopened without code entry; its existing thumbnail remained visible. Corrected physical swipe/capture/thumbnail acceptance remains pending. No model calls were made for this fix.


## Build 18 — native camera shortcut

The owner reported that the touch-release correction still failed while Photo worked. Direct phone inspection then reproduced a recognized swipe followed by `showPicker()` rejecting activation. The gesture was reaching the action; changing the motion threshold was not sufficient. WebKit's [file-input activation issue](https://bugs.webkit.org/show_bug.cgi?id=328902) documents the distinct click/picker activation checks; the drag rejection here is our own observed phone result.

Native build 18 registers a bounded same-origin/main-frame camera handler. An explicit right swipe opens the rear still camera. It accepts one request at a time, checks that the app is active and WebKit is not capturing, and binds the result to the request and current job. Cancel or backgrounding dismisses capture without automatic restart. The captured image is encoded as JPEG at 0.92 quality without resizing and must fit the existing 5 MB photo limit. Its first encoded bytes enter the same atomic photo/event save; no EXIF-derived observation time is invented. No photo-library enumeration or automatic upload is added. The existing Photo tap retains its working WebKit picker path. Browser swipes can still be rejected and then show the Photo fallback explicitly.

Observed on the physical iPhone: a right swipe opened the native camera; Cancel restored the controls without adding a thumbnail; a second swipe reopened it. The bounded native state log corroborates requested/presented/cancel/requested/presented. Two existing thumbnails remained after installation and shell activation. The owner then completed capture → Use Photo and confirmed “New thumbnail appears.” This completes the bounded physical camera flow; it does not establish image interpretation or field-work completion. Simulator reports unavailable camera and subsequently opens the work-order list with a left swipe, confirming recovery rather than a stuck busy state.

All 172 Node checks pass. Signed physical and unsigned Simulator build 18 compile and install. Focused checks cover duplicate, stale, wrong-job, canceled and oversized native results, page disposal, and a save remaining locked until admission finishes. Native diagnostics contain states, request IDs and byte counts only. No Meta or ElevenLabs call occurred during this fix. The app-scoped pre-update backup, install/source receipts and diagnostics remain ignored and local.

## Continuous visit — report latency and open work

The owner accepted the fresh briefing and onsite gate/parking answer. The first multi-outcome visit report was accurate but slow, and its spoken acknowledgement did not make unfinished work clear. A read-only copy of app storage confirmed that production remained `needs_verification` and warranty remained `needs_verification` with Operations as owner. Monitoring was supported as technician testimony, not independent telemetry. The report said the 4.2 kW display reading preceded work and no replacement was done.

Saved release-relative timing showed 6.82 s of ASR, 4.48 s of conversational classification, 17.55 s of separate evidence review and first playable output at 31.16 s. The spoken report path now requests classification and a bounded interpretation together in one Meta response. A provisional report projection is not committed evidence: only a classified report is saved, and its interpretation is validated again against the actual saved revision. Questions and clarifications cannot apply a proposal or cite the provisional testimony. Invalid review output leaves the clear report saved and review incomplete, without an automatic second call. Ordinary explicit photo review retains its separate selection and byte checks.

The saved-state acknowledgement now names open checks and their assigned owners before one useful follow-up. A generated fictional report check validated in 7.31 s for the combined Meta step, with no audio input or synthesis. This single check is not a controlled latency comparison or a physical iPhone result. The aggregate guard and both service caps are unchanged. Physical correction, explicit Operations deferral and final review remain pending in the same visit.

## Follow-up — spoken deferral and correction persistence

The owner confirmed that the new deferral reply named Operations, kept both items open and felt quicker. Saved timing shows 3.29 s ASR, 8.60 s combined model processing, first playable output at 13.60 s and playback completion at 21.55 s. These are two different utterances in one evolving visit, not a controlled latency benchmark. The saved state audit then found that production's owner was still unassigned: the model acknowledgement promised ownership while returning no branch changes. Warranty retained its earlier Operations owner. The usability pass alone therefore did not pass persisted-ownership acceptance.

The correction records quoted follow-up decisions as reducer-validated `branch.response` events. Speech now derives its owner statements from the resulting saved state. A partial spoken correction uses an amendment link so correcting a reading does not retract the monitoring report in the same earlier utterance. Full-answer replacement remains available in the detailed editor. Both raw testimony and corrected interpretations remain traceable.

All 184 Node checks pass, including two quoted Operations deferrals, invalid owner/quote/action rejection, preservation of unrelated testimony, and local simulator handoff retaining the amendment and both owners. One generated fictional correction/deferral check used the saved trial's text events through the aggregate guard, with no audio or image bytes sent. It returned the exact earlier report ID, a 2.4 kW pre-work observation superseding the old 4.2 kW interpretation, both deferred branches with Operations, and no follow-up question. That check took 9.05 s for the model step. Physical correction and persisted-ownership readback remain pending before final review.
