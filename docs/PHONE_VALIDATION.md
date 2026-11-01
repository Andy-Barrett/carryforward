# Physical-phone validation

Status: native iPhone record/stop/play, one live voice turn, one camera-photo-to-local-Operations handoff, one Home/background recording interruption and server-stopped cold startup have bounded passes. The full matrix below remains pending on iPhone Safari and Android Chrome. Desktop layout checks and event-target unit tests are not physical-device evidence.

Use only a fictional assignment and newly recorded synthetic narration. Keep provider transcription disabled unless the recording is synthetic and the existing guarded development route is used. Do not expose the local development server publicly for this check. Phone microphone access requires an appropriate secure origin. Use the owner-authorized paired private HTTPS trial below; the default loopback-only server remains Mac-only.

Record the device, OS, browser version, origin, source commit, exact actions, observed result and any console/error evidence. Mark each case pass, fail or not run; do not infer results across platforms.

| Case | Required observation |
| --- | --- |
| First permission request | Record requests microphone access only after a tap; refusal preserves text fallback and the job. |
| Normal stop | Record fictional narration, stop, play the original, reload and play it again. Confirm the microphone indicator turns off. |
| Background or lock | Begin recording, background or lock the phone, return. Capture must not restart by itself. Inspect whether a partial clip was actually saved and plays; record OS differences. |
| Microphone interruption | Interrupt capture through an OS-supported competing audio action. Verify visible recovery and original partial clip when available. |
| Thirty-second limit | Recording stops, releases microphone and saves a playable clip within the validated duration limit. |
| Navigation | Navigate to another job during capture. Any recovered partial clip belongs only to its original job. |
| Storage failure | A failed save must say unsaved and offer recovery download while the page remains open. Never report local save before commit. |
| Transcript correction | Transcribe a synthetic clip, change a word, save the answer. Original audio and raw machine words remain distinct from the reviewed answer. |
| Evidence change | Confirm a handoff, then add a clip/photo or correction. Confirmation is invalidated; stale acceptance is rejected. |
| Connectivity loss | With an already opened job, lose connectivity, capture locally, reload only if supported, reconnect and inspect actual saved state. After an initial successful app-shell installation, test a fresh offline reopening as well. Desktop reopening and native iPhone server-stopped cold startup are verified; new offline phone recording and reconnection are still being checked. |

The interruption handlers request stop on hidden-page, pagehide and track-ended events. The normal recorder stop handler attempts to save the original. An OS killing or suspending the page can prevent asynchronous storage from completing; this is not a guaranteed background-save mechanism. Do not claim it is until the actual device evidence supports that claim.

## Private Wi-Fi access prepared October 31

See [private phone HTTPS](PRIVATE_PHONE_HTTPS.md) for the owner-authorized paired local-network trial. Its encrypted access checks and 83 passing local tests do not complete any physical-device row above. Capture-only mode keeps inference disabled and uses a separate simulator database. Certificate installation/trust and actual iPhone actions remain owner steps until observed.

## Native iPhone audio checkpoint — October 31, 2026

Tested destination: physical iPhone Air, iOS 27.0.1; private SwiftUI/WKWebView development app version 0.1.0/build 1, Xcode/SDK 27.2. The origin was the owner-approved paired private HTTPS service; Meta review/transcription were disabled. Web-source base is `209b4307ed59b7e817d3f0351c43200aa3420dcd`; the native playback change and build/install logs are recorded separately. This build number alone does not identify the exact native source.

| Check | Observed result |
| --- | --- |
| Existing recording | The original failure was a moving timer with no sound. After the native playback-session adapter was installed and the phone paired again, the owner confirmed audible playback. The console reported the speaker route. |
| Fresh capture after playback | The owner recorded a new short fictional line, stopped it and confirmed the new clip played audibly. |
| Inference | Disabled throughout this phone pass; no recording was sent to Meta. |
| Remaining acceptance | Permission denial, microphone-indicator release, background/lock/interruption, duration limit, reload/offline recovery, job isolation and exact-revision handoff were not established by these two playback confirmations. |

The adapter applies the explicit local playback-session lifecycle identified during the owner-requested bounded PRISM source review. It is new WebKit glue, not a port of PRISM's continuous conversation system. Original recordings and transcripts remain in the existing local web store.


## Camera, review and API closeout — November 1, 2026

Physical iPhone Air, iOS 27.0.1, native development build 2 on the same owner-trusted paired private HTTPS origin. Web source started at `cc6bbe3`, with the mobile controls and explicit owner-correction changes described below. The owner photographed the Mac's labeled fictional 2.4 kW display and confirmed the photo was saved locally. No customer evidence was used.

| Check | Observed result |
| --- | --- |
| Camera original | Saved JPEG, 2,672,636 bytes. It exceeded the model review limit. |
| Smaller copy | Explicit local preparation produced a 1200×1600 JPEG, 273,031 bytes, linked to the unchanged original. Only the selected copy was sent. |
| Actual image interpretation | One guarded `muse-spark-1.3` call, 6,964 ms and 6,704 total tokens. It read the fictional 2.4 kW display and asked whether that reading followed the replacement. The image did not establish that timing. |
| Question response limitation | The recorded response was Already answered, not Can't verify. Production remained unverified. The requested physical Can't verify case did not pass; a separate desktop-browser case later verified owned deferral. |
| Editing | Remote keyboard focus was unreliable. The owner reset the unsaved form and entered the handoff directly. The final technician name was Andy Barrett, with Operations as report-level owner and the requested production/monitoring/warranty commitment. |
| Ownership correction | Review exposed an unexpected existing production owner. The new unchecked-by-default assignment control explicitly assigned all four unresolved checks to Operations through an append-only event. The previous response remains in history. The phone showed that the earlier confirmation no longer applied. |
| API delivery | The corrected report was confirmed, queued, received and separately accepted through the phone UI. Source decision: `accepted_with_followups`, four open checks, all owned by Operations. No work-order outcome was silently completed. |
| Original-byte readback | Authenticated source downloads reproduced the 2,672,636-byte original, 273,031-byte copy and 357,718-byte voice WAV. Every size, MIME and SHA-256 matched the admitted manifest. The reviewed transcript, raw machine words and copy derivation remained attached. |

Accepted local packet: `5770d194f681d4b811f71850730ad7391e6898441df46c5ad4d429b825f34d92`, event revision 8. Private receipts and screenshots are retained under ignored `.local/phone-photo-closeout-20261101/`; no recordings, private identifiers or runtime credentials belong in Git.

This is a bounded assisted developer check, not a technician usability study or an accuracy benchmark. The phone retained the saved voice/photo material through the intervening app reconnection; it does not establish the complete offline, interruption, storage-failure, HEIC or Android matrix. The accepted phone packet used review contract v4. The final v5 contract bump is covered by local regression checks and requires a fresh confirmation after the updated shell activates; cold activation of that final bump was still pending at this checkpoint. The build 3 check below subsequently verified it.

The mobile question controls now give the owner field its own row, use 16 px form text and at least 48 px response buttons. Desktop-browser checks at 390×844 and 1280×900 found no horizontal overflow; the mobile response buttons measured 48.5 px high. An abandoned voice dialog also clears its stale opening-microphone message. No additional inference was used for these UI checks. The shared guard remains at 80 reservations, $5.496230 of the $10 cap; reservations are not actual charges.


## Build 3 recovery and v5 activation — November 1, 2026

The cold-start check found two recovery problems: the pairing form was cramped, and native Reconnect reloaded a failed form POST. Build 3 changes Reconnect to stop capture and load a fresh GET at the configured origin. The pairing page uses a vertical 16 px form and preserves a usable form after an invalid code, without echoing the submitted value. Its stylesheet is allowed by an exact CSP hash; script restrictions, authentication and attempt limits stay in force.

On the same physical iPhone, an intentionally invalid fictional code produced the recoverable form. Reconnect returned to a clean pairing page, and the existing correct code reopened the saved visit. The report notes, owner decisions and media survived the app update and reopening. The old report confirmation no longer applied under v5. A fresh confirmation produced report revision `rev-c9ab5d7dbb8a37a3`; the phone queued, received and separately accepted packet `cd4f601ab53b0807e7e04a8e7a3c8f8a08bbe086cd94035349b7a137a5d2ec3e`, event revision 8. Source readback again matched all three files. Four checks remained open and owned by Operations.

Signed physical and unsigned Simulator builds passed. All 114 Node 24 checks passed, including failed-pairing recovery and unchanged attempt limits. An isolated preview with a fictional code verified 390×844 and 1280×900 layouts without horizontal overflow; inputs and buttons measured 50 px high. No console warnings/errors were captured in that preview. This activation/recovery check made no model calls. Original budget reservations remain 80 / $5.496230 of $10. Further recording interruption and offline cases are separate physical checks.


## Background recording and offline startup — November 1, 2026

Same physical iPhone Air/iOS 27.0.1; web-source base `b0edb7e` with the changes in this increment. In native build 3, the owner recorded a short fictional interruption line, swiped Home while recording, then reopened CarryForward. The owner confirmed capture had stopped without restarting and the saved partial clip played. After installing build 4 and reopening, the owner separately confirmed that same clip was still present and audible. This covers one Home/background case, not screen lock, a competing call, process termination during capture or every interruption route.

Stopping the private HTTPS process exposed a separate build 3 failure: cold launch could not open the app shell. Build 4 enables the existing service worker through WebKit's app-bound-domain configuration, restricted to the single configured host. Both compiled Info.plists were checked against their configured development origin. Signed-device and unsigned-Simulator builds passed. After one successful online opening, the private server was stopped again and the app process was relaunched. The physical phone opened the saved fictional visit, with its existing answer and four unresolved checks. No certificate-validation exception, public host or new permission was added.

The configuration follows the [WebKit app-bound-domain mechanism](https://webkit.org/blog/10882/app-bound-domains/) and the service-worker gate in [WebKit's WKWebView implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/Cocoa/WKWebView.mm). The physical startup result is the evidence for this phone; the source explanation alone is not a device pass.

Build 5 is compiled for signed physical iOS and unsigned Simulator. Its explicit Reconnect uses a same-origin root GET with a fixed, nonsecret query so the service worker's existing query bypass reaches the pairing gate. Normal cold launch still uses the cached root. Build 5 installation, expired-session reconnection and playback of a newly recorded offline clip are pending the owner's current offline recording check. The private server is deliberately stopped for that check. No new recording has been delivered to Operations or a model provider during this increment.

This is a server-unavailable test with Wi-Fi still enabled, not an airplane-mode or browser-eviction pass. Full permission, storage-failure, lock/call, import/export/share, Safari/Android and technician usability acceptance remain open. No actual model calls occurred; the existing aggregate ledger remains 80 reservations and $5.496230 of $10 reserved.
