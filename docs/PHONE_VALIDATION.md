# Physical-phone validation

Status: native iPhone record/stop/play, one live voice turn, one camera-photo-to-local-Operations handoff, one Home/background recording interruption, server-stopped cold startup/local recording and retained playback after reconnection have bounded passes. The full matrix below remains pending on iPhone Safari and Android Chrome. Desktop layout checks and event-target unit tests are not physical-device evidence.

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
| Connectivity loss | With an already opened job, lose connectivity, capture locally, reload only if supported, reconnect and inspect actual saved state. After an initial successful app-shell installation, test a fresh offline reopening as well. Desktop reopening and one native iPhone server-stopped cold startup, new recording/playback and post-reconnection playback sequence are verified. Airplane mode and browser eviction remain separate pending checks. |

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

Build 5 is compiled for signed physical iOS and unsigned Simulator. Its explicit Reconnect uses a same-origin root GET with a fixed, nonsecret query so the service worker's existing query bypass reaches the pairing gate. Normal cold launch still uses the cached root. The owner confirmed both the existing interruption clip and a newly recorded fictional offline clip played while the server was stopped. The same private server/database was then restored, build 5 installed and the app relaunched. Explicit Reconnect reached the pairing page despite the cached shell and expired server session. Pairing reopened the saved visit. The owner separately confirmed the newest offline clip remained present and audible after that update and reconnection. The local voice panel was also visibly retained. No new recording was delivered to Operations or a model provider during this increment.

This is a server-unavailable test with Wi-Fi still enabled, not an airplane-mode or browser-eviction pass. Full permission, storage-failure, lock/call, import/export/share, Safari/Android and technician usability acceptance remain open. No actual model calls occurred; the existing aggregate ledger remains 80 reservations and $5.496230 of $10 reserved.

The restored local Operations simulator still held the previously accepted v5 packet, unchanged at event revision 8 with four open checks. Authenticated readback again matched both JPEGs and the original delivered WAV. The interruption/offline clips remain local and are not part of that historical accepted packet. Private install/launch, readback and owner-observation receipts are retained under ignored `.local/phone-recovery-20261101/`. The private HTTPS server is running again on the same origin and database.

## Simpler workflow and playback regression — November 2, 2026

The owner attempted the prepared workflow, reported confusing UI, an unavailable photo and silent playback. Inspection found both trial servers stopped; the current job retained a local voice note with blank transcript and no saved interview answers. This is an incomplete attempt, not a submitted report or a timed usability pass. Earlier audible-clip results remain historical evidence, not proof this new clip is audible.

[The revised visit screen](SIMPLE_VISIT.md) implements the requested work order → onsite → report → final update sequence. Native build 6 compiles for both targets and is installed on the same iPhone bundle. It adds bounded local WAV playback, visible output status and a very-quiet-signal diagnostic. The original clip and prior job are preserved. The private HTTPS service and its unchanged budget guard were restored. Device Hub reported an active phone/VoIP call, so physical shell activation, new playback and the simplified owner walkthrough remain pending. No microphone was started remotely and no retained recording was sent for transcription.


## Build 6 shell activation and retained note — November 2, 2026

After the owner returned to CarryForward, existing-code pairing reopened the old cached visit. A separate process stop, ten-second interval and reopening activated the new four-stage shell. The private session needed pairing again after cold opening; the in-page Reconnect reached that form, and the retained code restored live-interview availability. Authentication, TLS and local storage were not bypassed or cleared. The phone showed On site, the message box, microphone, optional evidence and Report back. This is a physical rendering and reconnection pass, not a new complete visit.

The original 8:18:59 AM voice note remained visible with its original ID, blank reviewed words and the new native Play recording control. No playback, recording, transcription or interpretation was started during preparation. Device Hub was released before asking the owner to play it directly. The owner subsequently confirmed that retained recording was audible through Play recording. A fresh fictional visit was then opened at Work order without starting capture, while the earlier visit and clip remained saved. The full revised owner workflow and new capture remain pending. All 31 shell files also passed a trusted, authenticated private HTTP availability check; no model request was made, and the shared budget remains unchanged.

## Hold-to-speak and remembered connection — November 2, 2026

The owner rejected the four-stage UI’s live-demo dialog and repeated pairing. The new web surface has one hold/release conversation control. The first physical attempt stopped with “I didn’t catch that”; the owner’s screenshot also showed a recurring WebKit microphone-origin prompt. This was not a successful new ASR/reply cycle, and no report completion is established by that attempt.

Build 7 introduced origin-scoped Keychain storage of the existing development credential, provisioned once through the trusted USB launch. The first native cookie transfer needed an explicit initial Cookie header as well as WebKit cookie-store admission. After that correction, a launch without the provisioning environment reopened the actual physical iPhone directly to the enabled Hold to speak screen, with no manual pairing. Saved jobs/recordings were not cleared.

Build 8 compiles signed-device and unsigned-Simulator and is installed on the existing bundle. It reuses already granted iOS microphone permission for the fixed HTTPS main frame; first OS permission, camera and foreign-origin checks remain. The simplified header adds source-backed customer phone/address links, and moves the fictional/Meta note under Details. Old assignments without contact data are not silently amended. Activation and fresh owner hold/reply results follow below when observed.

Mac checks validate exact authentication origin, secure HttpOnly cookie, no redirect following and bounded contact-app links without accessing the Keychain or network. The separately generated fictional ASR/Spark smoke sample made two actual calls, not a physical-microphone test. Guard totals are 92 conservative reservations / $5.729667 of $10. No new packet was delivered or accepted through this replacement.

## November 2 owner hold/release result and final header

On native build 8 with the updated web shell, the owner confirmed the recurring microphone popup was gone. The owner needed multiple presses before a held control turned red, then speech went through and CarryForward spoke the supplied gate code. The saved original has machine words “What is the gate code?” and actual `muse-voice-transcribe-1.0` latency 1,685 ms. There were no report testimony turns from this source question. A later short attempt showed phase opening, 0 samples/0 ms audio and 1,261 ms elapsed in the local diagnostic. This establishes one successful question/reply, not reliable first-hold readiness or a complete report/Spark/final-update phone pass.

The subsequent web change removes an await on the stale initial AudioContext resume after the input route changes, awaits a fresh current-route resume, and changes amber wording to Keep holding. A synthetic regression reproduces a never-resolving first resume; current-route capture proceeds and preserves the first PCM. That improvement needs its own physical retest. Red means capture is on; gray means processing. No microphone remains open between holds and cancelled setup never starts later by itself.

Native build 9 compiles for signed physical iOS and unsigned Simulator, retaining automatic authentication and the same data store. The contact header lists the number as plain text beside Call and Text, with a separate Maps address. Link policy checks reject foreign destinations, invalid numbers and SMS bodies/queries. No call or text was sent during verification. Mobile/desktop browser views have no horizontal overflow; the bottom test note is absent and supporting information stays under Details. All 125 Node checks pass, alongside Mac native policy checks; the current source's physical first-hold behavior remains pending.

There have now been three actual provider calls in this increment: the generated-fictional ASR/Spark pair and the owner’s fictional gate-question ASR. The unchanged aggregate ledger is 93 conservative reservations / $5.739667 of $10. No new report was confirmed, delivered or accepted in this replacement.


## November 2 answer quality and speech interruption follow-up

The owner reported poor answers, intermittent spoken replies and nonworking contact links after several holds. Inspection observed a generic unavailable reply to the inverter-manufacturer question and a customer-summary question stored as unreviewed field testimony. Exact older source-lookup answers were not durably logged, so the full prior spoken exchange cannot be reconstructed from transcripts alone.

The revised answer route and richer fictional work order are documented in [conversation context](CONVERSATION_CONTEXT.md). Eight live guarded answer cases, one shortened-report retest, one in-app manufacturer answer and one actual evidence review exercised the change. The evidence review kept missing output and pending warranty work open with Operations as warranty owner. The in-app question left zero report testimony turns, and its question/reply survived closing and reopening the browser.

Build 10 passed signed-device and unsigned-Simulator builds, installed on the same bundle and reopened through the saved connection without a code. The physical phone's left swipe opened the saved work-order list. The phone view then became black; control was released and the owner was asked to unlock CarryForward. Right-swipe details, the revised contact bridge, and repeated complete audible replies at the faster rate remain pending physical checks. The latest richer fixture is used for new visits; old visits and clips are retained. No microphone was started remotely, and no call, text, new Operations delivery or production change occurred. The final web shell is served by the private server; normal close/reopen activation is required if an older shell is still active.

Local automated checks: 131 passed; native authentication/contact boundary checks passed. These do not establish physical audio acceptance.


## November 3 overnight checkpoint — phone acceptance pending

The owner reported one spoken answer followed by intermittent cutoffs. Build 10 separates Apple synthesis from WebKit's recording session and is installed; repeated full replies have not been confirmed. Build 11 adds an optional streaming PCM queue, cancellation identity, explicit failures and faster text reasoning. Both targets compile. The Simulator rendered the one-hold screen and right-swipe work-order details, then returned by left swipe. Software-only native/browser audio rendering is not a speaker/listening pass.

No physical microphone, camera, call/text action or audible playback was started overnight. Build 11 was not installed on the phone. The next acceptance is ten short consecutive holds with complete audible replies, an intentional interrupt/new hold, a measurement correction and job switching, followed by the complete briefing → onsite question → report → final-update run. Check contact opening separately without completing a call/text.

The Mac's Wi-Fi address now differs from the phone's fixed private origin. Its LAN preflight timed out; no successful phone reconnection is claimed. The retained server certificate expires November 3 at 20:34:51 UTC. Preserve the existing phone/origin evidence and Keychain credential before resolving the route/certificate. No security bypass or storage reset was introduced. Account and route details belong in ignored local receipts. See [morning handoff](MORNING_HANDOFF_2026-11-03.md).

## November 3 — new private origin, briefing and consecutive replies

The Mac's trusted Wi-Fi address changed. Build 12 uses the new private HTTPS origin and a uniquely named three-day test CA. The owner downloaded, installed and enabled full trust for that root directly on the iPhone; no TLS bypass was added. The new origin's existing connection secret was provisioned over USB into device-only Keychain without printing it. The phone then reopened without a pairing-code prompt. The previous origin was privately backed up; all 96 original IndexedDB files matched after both the build-12 and build-14 updates. A new origin has a separate visit store; preserved old-origin media is not thereby visible in the new visit.

Build 12's first reply played fully; its second cut out with the app still open. Build 13 added text-free native state/counter diagnostics and a visible Briefing/Stop briefing control. The owner heard two restarted briefing readouts, but then reported both microphone-following replies cut out. The native log showed speech start and partial synthesis progress without an application stop/cancel/finish at the cutoff. This supported changing the output path; it did not prove the underlying iOS cause.

Build 14 renders Apple speech to a bounded in-memory mono WAV through `AVSpeechSynthesizer.write`, then plays it with the native AVAudioPlayer path. A new renderer owns each utterance; cancellation invalidates its collector, stale completion cannot start playback, rendering has a ten-second deadline, and generated audio is limited to 180 seconds. Only allowed-origin/main-frame bounded readouts are admitted. Rate remains 0.60. Backgrounding, a new hold, output interruption or explicit stop still cancels; nothing restarts capture automatically.

The signed iPhone and unsigned Simulator builds pass. A silent Mac check verified PCM bounds, single terminal completion, cancellation, duration rejection, two actual Apple renders and WAV decoding. It did not play hardware audio. On the physical iPhone Air/iOS 27.0.1, the owner then asked the gate code and inverter model and confirmed **both replies played completely**. The build-14 native log separately records two player completions, approximately 2.96 and 6.96 seconds, with no error. This establishes those two consecutive post-microphone replies, not universal interruption or field-readiness acceptance.

The approved safety-manual context, candidate manufacturer references and dated demo history are described in [conversation context](CONVERSATION_CONTEXT.md). No actual customer records or retained recordings were used for the text context checks. Apple voice was selected by the owner; ElevenLabs remains unconfigured and unused. Android remains deferred.

## November 3 Sarah/camera update

Build 15: the owner confirmed two complete Sarah replies on the physical iPhone, then reported slow startup and speech pace. App-scoped timing metadata corroborated ElevenLabs v4 Turbo/Sarah; it did not independently measure audibility. Build 17 is installed with 1.4× playback, exact assignment lookup and the selected icon. Automatic stable-host connection was observed. The owner accepted the shorter gate-code wait and brisker Sarah pace; right-swipe camera opening failed. The Mac changed DHCP address; the private connection now uses a stable local hostname under the same already-trusted CA. The new hostname has separate origin storage; earlier visit records and backups remain intact. Corrected physical swipe/camera acceptance and launcher-icon observation remain pending. See FIELD_TRIAL_2026-11-03.md.


November 3 build 17 follow-up: the owner confirmed that the gate-code wait was shorter and Sarah’s brisker pace was clear. The requested right swipe did not work. A touch-based recovery is implemented with 169 passing Node checks; physical camera opening/capture/thumbnail after this correction remains pending. No broader latency or camera acceptance is inferred from this narrow voice pass.
