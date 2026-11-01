# Local readiness review

CarryForward's local evidence-to-handoff loop is implemented. The full field-product goal is still open: the broader physical-device matrix and a technician usability run remain incomplete. This review uses source, actual browser exercises, preserved evaluation results and local API readback, rather than treating green unit tests as proof of phone behavior.

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Assignment and pre-visit briefing | Validated source-tagged seven-section brief, recall, legacy import and immutable-scope tests; desktop and phone-width checks; see `PRE_VISIT_BRIEF.md` | Local and physical iPhone rendering verified; wider acceptance pending |
| Saved natural-language testimony and corrections | Saved interview browser exercises; reducer correction/supersession tests | Local verified |
| Unsent answers survive reopening without becoming testimony | Browser reload, job-switch, voice-link and one-copy commit checks in `INTERVIEW_DRAFTS.md` | Desktop verified |
| Photo review and explicit selection | Actual decoded original/copy previews; phone/desktop layouts; selection-boundary tests | Desktop and one native iPhone pass |
| Large photo without replacing original | Desktop fixture and 2,672,636-byte phone original → 273,031-byte copy; exact Operations hashes in `PHOTO_REVIEW_COPIES.md` | Desktop and one native iPhone pass |
| Actual substantive Meta interpretation | Twelve-case run, three-case retest and reduced-photo review with retained model/usage/provenance | Verified on fictional data |
| Useful bounded follow-up, corrections and deferrals | Retained first responses and development retest; equivalent-question and three-question-limit tests | Verified on bounded synthetic cases |
| Explicit style without weakening requirements | Direct/conversational saved preference; common core instructions; browser reload and actual review | Implemented; benefit unmeasured |
| Voice input, playback and reviewed transcription | Synthetic WAV persistence/playback, actual ASR and original-byte readback | Uploaded-audio path verified |
| Real microphone and camera | Owner-confirmed local iPhone audio, live input and Nov 1 camera original/copy with exact API readback | Bounded iPhone audio/camera and Home/background passes; other interruption routes/devices pending |
| Cloud workspace and job-source recall | Actual PDF/image/video reference viewers; job-local recall, zoom and unavailable-warning checks in `CLOUD_INTERFACE.md`; 95 tests total | Desktop and phone-width verified; general retrieval pending |
| Spoken conversation | One owner-confirmed physical speech → Meta transcript → reviewed Send → Spark follow-up → local spoken response; see `LIVE_VOICE.md` | One iPhone cycle verified; full-duplex and broader usability pending |
| Offline startup and local capture | Native server-stopped cold launch; owner-confirmed new local record/play; build 5 pairing/reconnect and retained audible clip | Desktop and one native iPhone server-unavailable sequence verified; airplane mode/eviction pending |
| Unambiguous observation times | Offset/calendar validator, explicit form field, legacy-open behavior and browser roundtrip | Local verified |
| Accurate review and exact confirmation | Separate reported/documented/open outcomes; v5 contract; stale report/media/event rejection | Local verified |
| API handoff, receipt and acceptance | Live local simulator flow and source-byte readback; exact accepted revision with open follow-ups, including Nov 1 physical iPhone packet | Local and one native iPhone pass |
| Budget and data boundary | Guard source and tests; persistent aggregate ledger; only CarryForward code and fictional examples | Active; no production/customer authorization |
| Accuracy/efficiency claim | Strong same-model comparison did not show an accuracy advantage; human interaction time and enjoyment not measured | No improvement claim justified |
| Broader phone and interrupted-recording acceptance | Owner confirmed Home/background stop, partial-clip playback and retained playback after build update | Partial; lock/call, other matrix cases and Android pending |
| Contest publication and demonstration | Tracked-source candidate independently extracted/tested; see `RELEASE_CANDIDATE.md`. No public release, hosted deployment or submission performed | Owner release decision pending |

The private physical-device access path and one assisted end-to-end iPhone loop now work. Next are the remaining checks in `PHONE_VALIDATION.md`, followed by a short technician usability run using `evaluation/usability/README.md`. The prepared kit remains explicitly unrun; it is not participant evidence. Keep the natural interview/evidence loop as the product; additional framework work does not replace those checks. Do not claim completion or production readiness from this local review.

The cloud loop now has an actual synthetic model-to-simulator acceptance exercise; see [October 31 receipt and limits](CLOUD_VISIT_LOOP.md). The November 1 phone pass extends that evidence; the full device matrix and human usability rows remain open.

A native SwiftUI/WKWebView development target now has signing-disabled simulator/device build receipts and executed Mac-side endpoint-policy checks. The CoreSimulator component mismatch is resolved; the actual brief and visit workspace render in the iPhone Air simulator. The owner-approved Personal Team build now loads the current briefing on the physical iPhone over the intended trusted, paired private HTTPS route. An older test-server process initially omitted newly added module routes; restarting that isolated process preserved its database and resolved the load failure. Local record/stop/play and one bounded live voice turn are now owner-confirmed. The November 1 pass also covered direct handoff editing, camera capture, copy preparation, retained media after reconnection, and simulator delivery. A later build 3 Home/background case preserved a playable partial clip, and build 4 opened the saved visit after server-stopped cold launch. The owner also confirmed a new local recording played with the server stopped and remained audible after build 5 installation and fresh pairing. General storage recovery, import/export/share, other interruption routes, airplane mode and Android remain pending. See [iPhone target](../ios/README.md).

November 1: all 112 Node 24 checks passed. The live voice screen was reviewed at desktop and phone widths; its console showed no captured errors. Actual phone results and conservative budget reservations are recorded in [live voice](LIVE_VOICE.md).

November 1 photo checkpoint: all 114 Node 24 checks pass. The physical packet was accepted with four follow-ups and exact readback of both JPEGs and the voice WAV. Owner correction is explicit and preserves prior events. That first phone packet used v4. The follow-on build 3 pass verified cold activation, fresh v5 confirmation and separate receipt/acceptance with the same original media intact. See [precise device receipt and limits](PHONE_VALIDATION.md).
