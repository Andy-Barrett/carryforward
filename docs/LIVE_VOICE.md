# Hold-to-speak conversation — November 2, 2026

The main interface now uses `public/held-voice.js`: press starts local PCM capture, release stops it, saves the bounded WAV and requests `/api/conversation/transcribe`. Recognized work-order questions use bounded source lookup; ordinary narration records an explicitly unreviewed transcript and runs `/api/conversation/review`. A local system voice reads the reply. There is no main-screen live-demo dialog, spoken preflight, Finish speaking, transcript review or Send action.

These are sequential file-ASR and text-review requests, not streaming/full-duplex speech. First captured PCM is retained. Thirty seconds, 30 saved clips per job, 30 process-local requests of each conversation kind/job, one provider request at a time and the unchanged aggregate $10 guard bound the path. Existing manual endpoints retain their five-attempt limits. A failed/cancelled turn never retries automatically. Interruption can retain a partial clip locally but never submits it as a released turn.

Automatic transcription is `reviewed:false`, `submission:hold_release`, with exact admitted audio identity/hash and model provenance. It is not a human-approved report or independent verification. Final technician confirmation, source receipt and Operations acceptance remain distinct. Existing photos and retained audio are not implicitly uploaded. Native build 9 remembers authentication and reuses already approved microphone permission only for the configured HTTPS main frame. See [the current simple flow](SIMPLE_VISIT.md) and [phone observations](PHONE_VALIDATION.md).

The November 2 actual generated-fictional-speech sample took 2,570 ms for ASR and 13,728 ms for review. The initial physical hold attempt failed before usable words; the owner then confirmed no recurring popup and a spoken gate-code reply after several presses. The physical ASR result took 1,685 ms; the answer used the supplied work-order source, not Spark reasoning. First-hold readiness remains incomplete. The earlier physical pass below applies only to that older reviewed-Send implementation.

## Historical streaming slice — November 1, 2026


The implemented loop is push-to-talk: new speech → Meta transcription → human review and Send → saved testimony → guarded text evidence review → one locally spoken follow-up. It is not full-duplex voice, automatic microphone restart, or a finished phone usability pass.

## What the user does

Tap **Talk to CarryForward**. The dialog offers **Check microphone locally**, **Start live demo**, and Cancel. The local check uses the same PCM capture path, makes no network inference request, and offers a temporary playback clip. That clip stays in memory and disappears when leaving/reloading; it is not admitted as job evidence and does not consume one of the five saved clip slots.

For the fictional live demo, say “testing” during the local input check. Once the app says **Listening live with Meta**, narrate the fictional visit. Preflight audio is discarded. Finish speaking, inspect/correct the returned words, then explicitly Send. Partial or machine-final words are never automatically technician testimony. Empty or unfinished results produce an actionable message; local recording and text remain available.

After Send, the existing evidence reviewer checks saved job text. This automatic follow-up sends no photo bytes or retained recording bytes. Images still require separate explicit selection. The native development wrapper uses Apple AVSpeechSynthesizer to read the resulting follow-up locally. Browsers use an available local system voice; no Meta speech-generation capability is implied.

## Capture and transport

`public/live-voice.js` requests the default microphone with `audio:true`, resumes its AudioContext before and after permission, and selects `navigator.audioSession.type = 'play-and-record'` where supported. Cleanup stops tracks, closes the context and restores the prior session type. An input meter reports the level of the actual PCM packets. A six-second local preflight refuses to open a provider session if no signal arrives. A nonzero signal establishes input, not intelligibility or correctness.

`public/pcm-worklet.js` downmixes and resamples to mono 16 kHz, signed little-endian 16-bit PCM in 100 ms frames. Only post-handshake packets are both streamed and retained in the local WAV. Capture is bounded to 30 seconds, with frame, byte, pacing and backlog limits. Permission, audio setup, connection and final-drain waits have deadlines. Background/page exit/track loss stop capture; nothing restarts or retries automatically.

The browser connects only to the same-origin `/api/voice/live`. `lib/live-transport.mjs` requires the application session and exact origin, then relays through the existing loopback budget guard at `/v1/asr/realtime`. Only the guard knows the provider credential and fixed Meta destination. Cumulative partials replace earlier partials; completed turns retain order and source IDs. Incoming transcripts remain untrusted data.

The guard serializes live and ordinary inference, reserves the greater of $0.01 or 31 seconds at $0.18/hour before connecting to Meta, and never refunds reservations. The original approved $10 aggregate ledger includes coding, text, image, file-ASR and live-ASR requests. Do not reset it. Per-job five-session limits are additional process-local bounds, not the financial cap.

## Enabling the private trial

Install the exact locked MIT-licensed `ws` dependency with `npm ci --ignore-scripts`. Start the existing approved aggregate guard using its retained credential/ledger paths. On the app process, set:

```
CARRYFORWARD_META_ENABLED=1
CARRYFORWARD_LIVE_VOICE_ENABLED=1
CARRYFORWARD_GUARD_TOKEN_FILE=<existing guard token file>
```

Live mode is otherwise off. Private HTTPS additionally requires the established certificate, private host, pairing code and isolated Operations database settings, plus the exact explicit opt-in:

```
CARRYFORWARD_PHONE_META_TRIAL=synthetic-live-voice
```

No trusted Wi-Fi or pairing requirement is relaxed. The browser receives no provider secret. Current authority covers CarryForward source and fictional examples only. Do not stream customers, real field visits or retained recordings. The ASR API has no documented `store:false` equivalent here; do not infer its retention from the separate Responses API.

A filled five-clip visit offers **Start fresh fictional visit** in the live dialog. This creates a separate sample work order and keeps existing jobs, recordings and drafts; it does not reset the aggregate inference budget.

App-shell updates wait for old clients to close. A native app relaunch can require pairing again because the cookie is session-only. Confirm that the new dialog actually appears before a device test; do not clear IndexedDB or discard recordings to refresh code.

## Observed checks

- Node 24: 112 local tests passed, including actual worklet resampling, cumulative correction/order, origin/session rejection, exhausted-budget refusal, reservation/cancellation serialization, disconnect handling, setup timeout, silent-input refusal, local-only check, and empty-ASR failure. Tests use local fixtures and do not call Meta.
- Native build 2 compiled for physical iOS and Simulator with Xcode 27.2. The signed development build was installed and launched on the owner's iPhone Air, iOS 27.0.1. This does not establish Android or Safari behavior.
- One newly generated fictional speech file streamed through the real paired application → guard → Meta path: 10.752 seconds of audio, first words at 1.941 seconds, completion at 11.885 seconds. Its raw result contained duplicated words; this is transport evidence, not an accuracy result.
- Two initial phone attempts reached Meta but returned no words. The owner confirmed the saved live clip was silent. After the recording-session/resume change and local preflight, the owner confirmed that the input meter moved and the temporary local clip played clearly. These checks used no further Meta requests.
- After opening a separate fresh fictional visit (keeping all five earlier clips), the owner confirmed live words appearing, then confirmed that Send produced a visible and audible follow-up. The observed question requested a post-work production reading with time and instrument, labeled `muse-spark-1.3`. This establishes one physical speech → review/Send → guarded interpretation → local spoken response cycle. It does not establish general transcription accuracy or a full technician usability pass. Background interruption, permission denial, offline reopening, keyboard recovery, photo capture, and the full technician trial remain pending.

Private audio, raw responses, signed binaries, account settings and local receipts stay under ignored `.local/` or private temporary paths. The completed Nov 1 checkpoint has 79 aggregate reservations, totaling $5.460016 reserved of the approved $10; these are conservative reservations, not a bill.

Primary references: [Meta speech-to-text](https://dev.meta.ai/docs/speech-to-text), [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits), [W3C Audio Session draft](https://www.w3.org/TR/audio-session/), [Apple play-and-record category](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord), [ws source and license](https://github.com/websockets/ws). API support and the physical test result must be checked separately; the draft does not establish universal browser support.
