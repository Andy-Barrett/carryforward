# Spoken replies

November 3 current checkpoint: ElevenLabs **Free / v4 Turbo / Sarah** is working on native build 18 with 1.4× playback. The owner accepted the brisker pace and complete final readout in the continuous fictional visit. That visit subsequently completed its exact-revision local API handoff with two Operations follow-ups retained. Later report turns took 13.60–20.25 s to first playable output; latency remains variable. Camera acceptance is a separate trial. See [the current field trial](FIELD_TRIAL_2026-11-03.md). No paid subscription has been purchased.

Publication review is separate from successful playback. ElevenLabs’ [publishing guidance](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform) restricts Free output to non-commercial use and requires its specified attribution for non-commercial publication. A paid plan does not retroactively license Free-generated audio for commercial use. Its [terms](https://elevenlabs.io/terms-of-use) and any applicable model/service terms still apply. The contest form requests permission for organizer promotion, so resolve the final soundtrack rights before publication; no automatic plan change or legal classification of the contest is made here.

The remaining dated sections preserve earlier results. Build-11/14/17 pending statements below describe those checkpoints, not the latest accepted behavior.

## One interaction

Hold to speak, release, hear the reply. The main screen adds no Send, provider selection or test dialog. A new hold stops the prior reply. Job changes and backgrounding cancel pending work; late results cannot restart speech. Original recordings remain saved before transcription. Answers remain visible if audio fails.

Replies are brief and answer the actual question first. Direct/conversational style is explicit and job-local. It can change wording, not evidence requirements. Access digits and measurements receive deterministic spoken formatting: `2468#` becomes separate digits plus “pound,” and `2.40 kW` retains both decimal places. Visible text and source evidence retain their original values. No voice cloning or impersonation is used.

Apple uses the iOS-managed synthesis session at rate 0.60; browser local speech uses rate 1.3. Flash uses provider speed 1.15; v4 Turbo uses 1.4× native playback with AVAudioUnitTimePitch. Browser PCM uses the corresponding Web Audio playback rate. These are different provider scales, not equivalent measured speeds. Fast-rate intelligibility and consecutive complete replies need a physical listening check.

## Optional provider setup

The owner authorized the discussed monthly ElevenLabs Starter scope on November 2: advertised $1 first month, then $6/month, 30,000 included credits. The owner subsequently chose the free allowance for this trial. The live account API verified Free status, 10,000 included credits, zero extension and the configured model/voice access. Starter was not purchased.

Retain the owner-approved seven-day restricted key in an ignored server-side file and set:

```sh
CARRYFORWARD_SPEECH_PROVIDER=elevenlabs
CARRYFORWARD_SPEECH_PLAN=free
CARRYFORWARD_ELEVENLABS_KEY_FILE=<private server key-file path>
CARRYFORWARD_SPEECH_MODEL=eleven_v4_turbo
CARRYFORWARD_SPEECH_VOICE=sarah
```

Defaults are provisional. Sarah, Jessica and Matilda are the fixed stock-voice candidates; `eleven_flash_v2_5` is the other allowed model. Authenticated stock/model access and 24 kHz PCM synthesis were exercised on Free. Unsupported or changed API terms fail closed to local speech. No additional runtime dependency was installed.

The adapter defaults to Free and verifies the selected exact plan (Free up to 10,000; explicitly configured monthly Starter up to 30,000), disabled allowance extension and a supported model with a conservative credit multiplier no greater than one. Account balance/overage state is checked on each utterance; model/stock catalogs cache for ten minutes. Only bounded reply or derived readout text reaches ElevenLabs. Original microphone audio, images, full work orders and provider keys never enter that request.

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

## November 3 local Apple output repair

Build 13 diagnostics reproduced speech-progress stalls after microphone use without a matching app stop; two local briefing restarts continued audibly. Build 14 replaces direct system `speak` output with local PCM rendering and AVAudioPlayer playback. The collector is bounded, cancellation is final, completion IDs are checked and failures leave the reply readable. The owner confirmed two complete consecutive replies after microphone use on the physical phone; native player completion logs corroborate the tested durations. This is the current Apple path. Provider streaming/ElevenLabs is unchanged and still lacks physical acceptance.

`ios/checks/SpeechRenderChecks.swift` exercises synthetic-buffer bounds/cancellation and two actual silent Apple renders with WAV decoding on the Mac. It is not a hardware listening test. See [physical observations](PHONE_VALIDATION.md).

## November 3 selected voice and response delay

The current restricted key has Text to Speech, Voices read, Models access and User access for usage checks; other endpoints are disabled. It expires after seven days, carries a 6,000-credit provider cap and retains leak protection. The server key is ignored and never delivered to the app. Free-only configuration refuses a paid tier, excess allowance or overages. The independent 6,000-character/60-request ledger is unchanged; the audition set reserved 1,425 characters in 18 requests. One account check failed before the remaining lines were dispatched; explicit resume verified hashes and generated only the five missing files, without resetting or regenerating the earlier clips.

v4 Turbo uses the documented Text-to-Dialogue WebSocket, exactly one registered voice and an explicit final frame. Flash retains the REST TTS route. The real local WebSocket test preserves JSON message boundaries, PCM decoding and short-text flush. No new dependency was added.

Two saved build-15 turns measured ASR at 1.1–1.2 s, Meta reasoning at 5.8–7.5 s and speech startup at about 0.9 s. These are application offsets, not acoustic measurements. A four-call smaller-context comparison was inconsistent (gate 3.223 s full / 5.400 s focused; model 4.727 s full / 3.743 s focused), so that model-packet optimization was not retained. The app instead quotes one exact source sentence for explicit, unambiguous gate-code/model questions with no field testimony or recent correction ambiguity. Such replies identify `CarryForward / sourced-assignment-lookup`, carry the source revision and excerpt, make zero model requests, and never become work reports. All other questions and reports retain full grounded Meta processing.

Authenticated `/api/speech/visit` grants derive briefing text from the validated assignment, final summary text from replayed investigation events, or a composition of two existing reply grants. They never accept arbitrary synthesis text or send media. Stop/new hold/background cancels a pending briefing readout. Oversized or unavailable expressive readouts use local speech. The full sourced brief stays inspectable; its short readout does not admit field evidence or equipment-procedure approval.

The selected icon and camera/trial changes are documented in [the field trial](FIELD_TRIAL_2026-11-03.md). Build 17 compiled on both targets; its faster pace and stable-host workspace were subsequently owner-accepted, followed by the build-18 camera and continuous-visit passes above.

Current protocol references: [v4 Turbo models](https://elevenlabs.io/docs/overview/models), [dialogue WebSocket](https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd), [subscription verification](https://elevenlabs.io/docs/api-reference/user/subscription/get).
