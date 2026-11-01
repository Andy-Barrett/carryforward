# Physical-phone validation

Status: a bounded native iPhone record/stop/play pass is owner-confirmed; the full matrix below remains pending on iPhone Safari and Android Chrome. Desktop layout checks and event-target unit tests are not physical-device evidence.

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
