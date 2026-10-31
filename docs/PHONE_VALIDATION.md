# Physical-phone validation

Status: pending on both iPhone Safari and Android Chrome. Desktop layout checks and event-target unit tests are not physical-device evidence.

Use only a fictional assignment and newly recorded synthetic narration. Keep provider transcription disabled unless the recording is synthetic and the existing guarded development route is used. Do not expose the local development server publicly for this check. Phone microphone access requires an appropriate secure origin; the current loopback-only server is not yet a phone-access deployment.

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
| Connectivity loss | With an already opened job, lose connectivity, capture locally, reload only if supported, reconnect and inspect actual saved state. Fresh offline startup remains unimplemented. |

The interruption handlers request stop on hidden-page, pagehide and track-ended events. The normal recorder stop handler attempts to save the original. An OS killing or suspending the page can prevent asynchronous storage from completing; this is not a guaranteed background-save mechanism. Do not claim it is until the actual device evidence supports that claim.
