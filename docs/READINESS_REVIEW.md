# Local readiness review

CarryForward's local evidence-to-handoff loop is implemented. The full field-product goal is still open: physical-device behavior and a technician usability run have not been established. This review uses source, actual browser exercises, preserved evaluation results and local API readback, rather than treating green unit tests as proof of phone behavior.

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Assignment and briefing | Validated work-order import plus real HTTP assignment test in `operations-api.test.mjs` | Local verified |
| Saved natural-language testimony and corrections | Saved interview browser exercises; reducer correction/supersession tests | Local verified |
| Unsent answers survive reopening without becoming testimony | Browser reload, job-switch, voice-link and one-copy commit checks in `INTERVIEW_DRAFTS.md` | Desktop verified |
| Photo review and explicit selection | Actual decoded original/copy previews; phone/desktop layouts; selection-boundary tests | Desktop verified |
| Large photo without replacing original | 1,248,896-byte source → 253,286-byte copy; exact export and Operations hashes in `PHOTO_REVIEW_COPIES.md` | Desktop verified |
| Actual substantive Meta interpretation | Twelve-case run, three-case retest and reduced-photo review with retained model/usage/provenance | Verified on fictional data |
| Useful bounded follow-up, corrections and deferrals | Retained first responses and development retest; equivalent-question and three-question-limit tests | Verified on bounded synthetic cases |
| Explicit style without weakening requirements | Direct/conversational saved preference; common core instructions; browser reload and actual review | Implemented; benefit unmeasured |
| Voice input, playback and reviewed transcription | Synthetic WAV persistence/playback, actual ASR and original-byte readback | Uploaded-audio path verified |
| Real microphone and camera | Recording/camera controls and interruption handlers exist; unit events do not establish OS behavior | Physical devices pending |
| Spoken conversation | Text response fallback is implemented; no realtime or full-duplex voice claim | Spoken output absent |
| Offline startup and local capture | Backend stopped, app reloaded, answer saved/reloaded; reconnect authenticated inbox read | Desktop verified; phone pending |
| Unambiguous observation times | Offset/calendar validator, explicit form field, legacy-open behavior and browser roundtrip | Local verified |
| Accurate review and exact confirmation | Separate reported/documented/open outcomes; v4 contract; stale report/media/event rejection | Local verified |
| API handoff, receipt and acceptance | Live local simulator flow and source-byte readback; exact accepted revision with open follow-ups | Local verified |
| Budget and data boundary | Guard source and tests; persistent aggregate ledger; only CarryForward code and fictional examples | Active; no production/customer authorization |
| Accuracy/efficiency claim | Strong same-model comparison did not show an accuracy advantage; human interaction time and enjoyment not measured | No improvement claim justified |
| iPhone/Android installation and interrupted recording | See `PHONE_VALIDATION.md`; loopback-only server is not a phone-access deployment | Pending |
| Contest publication and demonstration | Professional source/docs prepared locally; no public release, hosted deployment or submission performed | Owner release decision pending |

The immediate next acceptance work is a physical-device access path and the checks in `PHONE_VALIDATION.md`, followed by a short technician usability run using `evaluation/usability/README.md`. The prepared kit remains explicitly unrun; it is not participant evidence. Keep the natural interview/evidence loop as the product; additional framework work does not replace those checks. Do not claim completion or production readiness from this local review.
