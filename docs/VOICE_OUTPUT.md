# Spoken replies

November 3, 2026 checkpoint. Meta still handles transcription and grounded reasoning. Apple speech is the active output fallback. Optional ElevenLabs streaming output is implemented but **not activated**: the account is signed out and no server API key is available. No ElevenLabs audio has been generated or auditioned.

## One interaction

Hold to speak, release, hear the reply. The main screen adds no Send, provider selection or test dialog. A new hold stops the prior reply. Job changes and backgrounding cancel pending work; late results cannot restart speech. Original recordings remain saved before transcription. Answers remain visible if audio fails.

Replies are brief and answer the actual question first. Direct/conversational style is explicit and job-local. It can change wording, not evidence requirements. Access digits and measurements receive deterministic spoken formatting: `2468#` becomes separate digits plus “pound,” and `2.40 kW` retains both decimal places. Visible text and source evidence retain their original values. No voice cloning or impersonation is used.

Apple uses the iOS-managed synthesis session at rate 0.60; browser local speech uses rate 1.3. The optional provider uses speed 1.15. These are different provider scales, not equivalent measured speeds. Fast-rate intelligibility and consecutive complete replies need a physical listening check.

## Optional provider setup

The owner authorized the discussed monthly ElevenLabs Starter scope on November 2: advertised $1 first month, then $6/month, 30,000 included credits. Actual checkout terms, entitlement and no-overage settings remain unverified. No purchase or agreement was completed. Account access is a morning action, not a reason to leave the independent implementation unfinished.

After account setup, retain a restricted key in an ignored server-side file and set:

```sh
CARRYFORWARD_SPEECH_PROVIDER=elevenlabs
CARRYFORWARD_ELEVENLABS_KEY_FILE=<private server key-file path>
CARRYFORWARD_SPEECH_MODEL=eleven_v4_turbo
CARRYFORWARD_SPEECH_VOICE=sarah
```

Defaults are provisional. Sarah, Jessica and Matilda are the fixed stock-voice candidates; `eleven_flash_v2_5` is the other allowed model. Public stock IDs were checked, but authenticated account/model/PCM entitlement has not been exercised. Unsupported or changed API terms fail closed to local speech. No additional runtime dependency was installed.

The adapter verifies active monthly Starter, at most 30,000 included credits, disabled allowance extension and a supported model with a conservative credit multiplier no greater than one. Account balance/overage state is checked on each utterance; model/stock catalogs cache for ten minutes. Only a small generated reply reaches ElevenLabs. Original microphone audio, images, full work orders and provider keys never enter that request.

The independent speech ledger reserves at most **6,000 characters / 60 requests**, with 1,600 characters per reply. Reservations are conservative and never refunded after a cancellation/failure. They are not a billing statement. A locked or invalid ledger blocks dispatch; it is never silently reset. The existing shared **$10 Meta guard remains separate and unchanged**.

## Transport and playback

`POST /api/speech` requires the current authenticated app session, exact Origin and intent header. A short-lived, one-use server grant binds the generated text to a job and turn. The browser cannot supply arbitrary synthesis text. Responses are uncacheable 24 kHz mono signed 16-bit PCM, bounded to 4,320,000 bytes / 90 seconds; startup is bounded separately. Redirects and automatic retries are disabled.

The native bridge accepts bounded PCM chunks with request/job/turn identity and sequence. `PCMReplyQueue` schedules buffers with AVAudioEngine; physical-device completion uses `dataPlayedBack`. Browser output uses a bounded Web Audio queue. A replacement identity, new hold, background transition or disposal stops the old output and ignores stale chunks/completions. Microphone and reply playback cannot intentionally own the native session together.

A provider failure before playback falls back locally once. A failure after playback starts leaves the reply on screen rather than repeating it in full. Missing native completion reports a timeout rather than a false success. An unavailable provider does not prevent local capture or readable answers.

## Timing and actual evidence

Saved conversation Details now separate monotonic offsets from hold release: local save, ASR, classification, evidence review, TTS request, first server bytes, first playable output and completion. First playable is an application callback, not a microphone-measured acoustic event. Questions and timing updates do not change report confirmation.

A bounded live Meta comparison used the same saved synthetic speech and fixed text-only fixtures:

| Component | Earlier low setting | Minimal text setting |
| --- | ---: | ---: |
| Question classification/answer | 5.013 s | 3.182 s |
| Report classification | 5.493 s | 3.268 s |
| Report evidence review | 15.744 s | 7.005 s |
| Report ASR + classification + review | 22.871 s | 11.907 s |

The 1.634 s report ASR was reused for the comparison. Five existing author-created text fixtures passed the expected source/outcome/owner/deferral checks, as did the same question/report and procedure-gap checks. This small development check does not establish independent accuracy or phone latency. Minimal effort is selected for conversation text; explicit image review remains low. Model provenance records the actual effort.

Sixteen guarded Meta calls were made during the overnight work. At the recorded checkpoint, the aggregate ledger had 165 reservations / $7.344283 reserved against the unchanged $10 cap. No ElevenLabs call occurred. The quiet audition page at `.local/voice-auditions/index.html` contains the six prepared lines and **zero generated provider files**. `node scripts/voice-audition.mjs` prepares it without inference; `--generate` is an explicit, guarded provider action after account setup.

All 150 Node checks passed. Native signed-device and unsigned-Simulator build 11 compiled. Software-only browser and native PCM rendering passed without enabling speakers. Build 11 rendered in iPhone Air Simulator/iOS 26.5 after safe shell refresh/reopen; right swipe opened details and left swipe returned. These observations do not prove physical audio reliability. Build 11 was not installed on the physical phone overnight.

Official references: [ElevenLabs model guide](https://elevenlabs.io/docs/eleven-api/choosing-the-right-model), [streaming TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/stream), [Meta reasoning settings](https://dev.meta.ai/docs/reasoning). Actual account capabilities take precedence over advertised availability.
