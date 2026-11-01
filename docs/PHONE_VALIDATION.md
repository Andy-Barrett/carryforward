# Physical-phone validation

Status: native iPhone record/stop/play, one live voice turn, and one camera-photo-to-local-Operations handoff have bounded passes. The full matrix below remains pending on iPhone Safari and Android Chrome. Desktop layout checks and event-target unit tests are not physical-device evidence.

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
| Connectivity loss | With an already opened job, lose connectivity, capture locally, reload only if supported, reconnect and inspect actual saved state. After an initial successful app-shell installation, test a fresh offline reopening as well. Desktop server-stopped reopening is verified; phone behavior is not. |

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

This is a bounded assisted developer check, not a technician usability study or an accuracy benchmark. The phone retained the saved voice/photo material through the intervening app reconnection; it does not establish the complete offline, interruption, storage-failure, HEIC or Android matrix. The accepted phone packet used review contract v4. The final v5 contract bump is covered by local regression checks and requires a fresh confirmation after the updated shell activates; cold activation of that final bump has not been checked on the phone.

The mobile question controls now give the owner field its own row, use 16 px form text and at least 48 px response buttons. Desktop-browser checks at 390×844 and 1280×900 found no horizontal overflow; the mobile response buttons measured 48.5 px high. An abandoned voice dialog also clears its stale opening-microphone message. No additional inference was used for these UI checks. The shared guard remains at 80 reservations, $5.496230 of the $10 cap; reservations are not actual charges.
