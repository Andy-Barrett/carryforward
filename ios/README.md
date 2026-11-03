# CarryForward for iPhone — private development target

This SwiftUI/WKWebView target reuses CarryForward's existing web app and API. It does not bundle file:// HTML, duplicate the evidence reducer, embed provider credentials or introduce package dependencies. It is a development installation, not a TestFlight/App Store release.

## Start on the Mac

Use Node 24 from the repository root:

```
/opt/homebrew/opt/node@24/bin/node scripts/ios-demo-server.mjs
```

This starts only `http://127.0.0.1:4350/`, disables Meta review/transcription explicitly and uses ignored `.local/ios-simulator/operations.sqlite`. Existing browser previews, guarded inference and the separate paired HTTPS capture trial are not changed. Relative `/api` calls retain the current Host/Origin/session protection and CSP. The Mac loopback origin is for a Simulator; it does not reach the Mac from a physical phone.

Open `ios/CarryForward.xcodeproj` in Xcode. Scheme: `CarryForward`. Deployment target: iOS 18.4 or newer. For an unsigned compile, no connected device or Apple account is required:

```
xcodebuild -project ios/CarryForward.xcodeproj -scheme CarryForward \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .local/ios-build/simulator \
  CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO build
```

For the device-code-path compile, use `-sdk iphoneos`, `-destination 'generic/platform=iOS'` and a separate `.local/ios-build/device` path. Neither command installs, signs or launches an app. An actual test must select an explicit available iPhone Simulator by ID and record its model/OS; a generic destination proves compilation only.

The origin comes from `CF_ORIGIN_SCHEME`, `CF_ORIGIN_HOST` and `CF_ORIGIN_PORT` in `CarryForward/Development.xcconfig`. Separate values avoid xcconfig URL-comment parsing. Simulator defaults are `http`, `127.0.0.1`, `4350`. The target includes optional, Git-ignored `ios/Local.xcconfig` for machine-specific settings, for example:

```xcconfig
CF_ORIGIN_SCHEME[sdk=iphoneos*] = https
CF_ORIGIN_HOST[sdk=iphoneos*] = <private IPv4 address of development Mac>
CF_ORIGIN_PORT[sdk=iphoneos*] = <paired HTTPS port>
DEVELOPMENT_TEAM = <your approved team ID>
```

Use actual validated values locally. Keep signing/account settings, private network addresses, keys and pairing codes out of the shared configuration. Physical builds refuse loopback HTTP; use the existing owner-approved **private HTTPS** origin and its pairing/TLS workflow while on the same trusted network. No global cleartext or certificate-validation bypass is provided. The local-network ATS setting does not itself make an insecure phone origin acceptable. A reachable remote/hosted backend remains a separate release/access decision.

## Native boundary

- A retained web view uses the persistent default WKWebsiteDataStore. Routine SwiftUI updates and app activation do not reload it. Storage remains app/origin-specific; an origin change creates a different job store.
- The compact native toolbar keeps connection details behind the information button. Page loaded is not API readiness, source acceptance or proof that the intended transport works. Inspect the web app's actual service state and exact-revision simulator receipts.
- Same-origin main/frame navigation and blob exports are permitted; other destinations and download redirects are blocked. System TLS trust is untouched. Debug builds allow Web Inspector; no account/signing/entitlement expansion is performed by the source.
- WKUIDelegate handles web alerts, confirmation and text prompts, with safe cancellation when another dialog is already presented. Import and large export confirmations therefore have an explicit native implementation.
- WebKit's standard file-input picker remains the capture/import path. There is no full-library scanning or new native evidence store. Microphone origin requests reuse an already granted iOS app permission only for the configured trusted main frame. First OS permission remains required. Camera and combined requests still prompt. Actual permission/denial and picker behavior remain unverified.
- Main-frame media play/pause/end events from the allowed origin control an explicit native playback audio session. The original bridge accepts only fixed play/stop controls. Build 6 also accepts an explicitly selected bounded local WAV for AVAudioPlayer playback; it validates the allowed main-frame origin, byte and duration limits and request ID. This local bridge makes no network request. Playback uses the spoken-audio category, releases the session when idle, and does not take over while microphone capture is active.
- Backgrounding requests that active camera/microphone capture stop and pauses media. Activation never restarts capture. This is not a guarantee that an interrupted clip was saved; inspect the web recorder's actual saved/unsaved state.
- WKDownload writes exports to a protected app-temporary folder and opens the system share sheet after completion. It blocks known lengths over 40 MB and foreign redirects. Share cancellation/failure remains distinct from source acceptance; no automatic resume/retry or outbound share is performed. Completed/cancelled temporary exports are removed; original job evidence stays in web storage. Blob/export/share behavior still needs a running wrapper test.

## Full first-launch acceptance — still pending

Use only the fictional assignments/photos generated under `.local/usability/ios-first-launch-20261031/`. The normal technician test precedes optional role reversal; prepared files are not observations.

Record commit, native build number, SDK, explicit destination/OS, origin and inference-disabled config. Read the seven-part brief, save fictional narration and a separate unsent draft, add supplied evidence and inspect a source PDF/image/clip. Import the second fictional assignment through the file picker and confirmation dialog; verify job isolation. Terminate/relaunch and check both saved and unsent states. Exercise multiline/Unicode paste, selection/replacement, Return/Send and keyboard overlap. Export/share and reimport as appropriate. Prepare, confirm and deliver one exact revision to the isolated simulator, then separately record receipt and acceptance with unfinished work retained. Double taps, a lost response and reconnect must not silently replay inference or delivery.

Test offline cold launch inside this actual WKWebView after a successful first online run. Service-worker availability, registration, cached-shell startup and source-media availability must be observed; Safari/desktop results do not establish wrapper behavior. If it fails, record the unsupported path before choosing a native offline/capture adapter.

## One owner checklist for the later phone pass

1. Use only the intended owner-approved Apple account/team. Andrew approved his existing Personal Team for this development installation on October 31; the signed build installed successfully. No paid enrollment or TestFlight setup was used. The owner completed iOS developer-certificate trust and the app now launches. This trust is separate from the temporary HTTPS server certificate.
2. Connect/pair the intended phone; complete Developer Mode/computer trust prompts yourself if required. Select the explicit device and record its OS/build destination.
3. Use the private HTTPS endpoint on the same trusted network. The owner completed temporary certificate installation and explicit root trust, and the phone was paired successfully on October 31. For later setup, download and install the profile promptly, then enable its root trust separately; an uninstalled download expires after eight minutes. Build 8 remembers this app’s private connection in the device Keychain and renews its session on launch or explicit Reconnect, without manual code entry. Browser-only access retains the pairing gate. An away-from-home phone needs a separately approved reachable endpoint.
4. Tap capture and test microphone/camera permission **and denial**, picker imports, original codec playback and multiline/Unicode editing with the keyboard visible.
5. Lock/background/interrupt recording, then inspect actual recovery with no automatic mic restart. Test airplane-mode/reopen/reconnect, local draft/evidence retention and exact-revision delivery/acceptance. Record failures and unsaved status; do not infer a pass from a generic Ready label.

## October 31 build, launch and installation evidence

Xcode 27.2 (`27B52`) and SDK 27.2 compiled the target for generic Simulator (arm64/x86_64) and physical iOS (arm64). The Xcode first-launch setup is now complete and CoreSimulator reports 1174.21. The earlier component mismatch no longer blocks runtime access.

The development app was installed and launched on the explicit iPhone Air Simulator, iOS 26.5. Its native route label shows the loopback port 4350; the actual seven-part brief and visit workspace render, and the web app reports the service reachable. This establishes native launch and rendering. It does not establish the remaining storage, keyboard, import/export/share, capture or offline acceptance checks. The simulator boot log also recorded a data-migration warning; actual installation, launch and rendered content were observed separately.

Andrew explicitly approved signing and installation with his existing Personal Team. Xcode created/selected the managed signing profile and installed version 0.1.0/build 1 on the connected physical iPhone Air, iOS 27.0.1. The built app's signature verifies and its configured origin is the approved paired private HTTPS service. The first physical launch required developer-certificate trust, which the owner completed. Xcode then reported the app running, and its native screen visibly showed the intended HTTPS route.

The phone first rejected the untrusted temporary server certificate. The owner then installed the certificate and explicitly enabled root trust. The actual pairing page loaded over HTTPS; entering the local pairing code admitted the phone. The current seven-part briefing now renders on the physical device, with the intended private route visible. No certificate validation bypass was added.

The first paired load exposed an older test-server process whose static route map omitted newer interface modules. Only the verified isolated phone-test process was restarted, preserving its SQLite database, certificate and pairing code. Required module routes then returned HTTP 200 and the current briefing rendered after pairing again. Both Meta review and transcription remain disabled for this phone-capture trial.

The first physical launch also exposed a SwiftUI warning from publishing status during representable view construction. Initial navigation now starts from the SwiftUI task after view construction, retaining the existing start-once guard. The fix compiles for simulator and signed physical iOS; the simulator relaunched and rendered the visit, with no recurrence of that warning in its inspected runtime log. This is not a complete native usability pass.

Native Foundation endpoint-policy checks ran on the Mac, rejecting public hosts, wrong origins, credentials, nested blobs and insecure phone fallback. All 99 existing Node 24 tests passed in the native-target increment. No model calls occurred during this setup, build, signing or installation work; both native test backends disable inference.

The application identity is `com.andybarrett.carryforward.development`. The web source is recorded as `209b4307ed59b7e817d3f0351c43200aa3420dcd`; the native source, build digests, device inventory and signed-install receipt are retained under ignored `.local/ios-build/`. Account/team settings remain in ignored local configuration. Installation and simulator launch are development receipts, not field-readiness or distribution approval.

The observed phone checkpoint now includes installation, certificate trust, pairing, current brief rendering and a bounded audio pass. A saved clip initially advanced its timer without audible sound; turning off Silent Mode and releasing the live phone view did not resolve it. After the native playback-session adapter, the owner confirmed that saved clip was audible, then recorded a fresh fictional line and confirmed its playback. The native console recorded the speaker output route. This establishes the tested record/stop/play sequence on this phone, not all codecs or interruption states. Camera, permission-denial, background interruption, editing/persistence, file/share, offline and exact-revision handoff acceptance remain pending. No model calls occurred.

Apple documents [profile installation](https://support.apple.com/en-ie/102400) and [explicit certificate trust](https://support.apple.com/en-gb/102390). Install the downloaded certificate before moving to Certificate Trust Settings; downloading alone does not install it.

## Lessons carried from the PRISM audit

This implementation applies the retained PRISM audit lessons supplied to this chat: explicit intended-route verification, no automatic replay after interruption, editing as an acceptance requirement, development installation separate from TestFlight, and precise source/destination receipts. The original shell did not import PRISM source or account state. After Andrew explicitly requested conversation-code reuse, a bounded read-only review of PRISM audio code informed the new WebKit-specific playback adapter: activate a playback/spoken-audio session on play and release it on stop. No PRISM recorder, conversation engine, Bonjour/Iroh transport, runtime data or credentials were imported, and no PRISM files were changed. PRISM's old device passes do not establish CarryForward behavior. The WKWebView editing/capture path must earn its own observed acceptance before a native replacement is chosen.

## November 1 live-voice checkpoint

Build 2 adds a bounded local speech-synthesis bridge for reading a follow-up after reviewed Send. It compiled for both Simulator and signed physical iOS and was installed on the owner's phone. The normal local recorder remains available. The paired server now has an explicitly selected fictional live-voice trial; the October 31 inference-disabled setup remains the default configuration, not the current live-test state.

The first two physical live captures saved silence. The owner then confirmed the revised audio-session/resume setup with a moving input meter and audible temporary local check. The owner then confirmed live Meta words appearing, followed by a visible and audible question after reviewed Send. One complete physical push-to-talk turn is now verified; interruption/offline/permission-denial and the full technician trial remain pending. See [live voice](../docs/LIVE_VOICE.md) for boundaries, observed results and limits.


## Build 3 — explicit recovery and retained visit

Build 3 replaces Reconnect's reload with a fresh GET to the configured origin, after stopping capture. This avoids replaying a failed pairing POST. A failed code now leaves a usable phone-sized form. The physical phone verified invalid-code recovery, clean reconnect, successful pairing, retained notes/media and fresh v5 confirmation. The updated packet was separately received and accepted with four open follow-ups; authenticated downloads matched both photos and the original WAV. Signed-device and unsigned-Simulator builds passed, along with all 114 Node 24 checks. No model calls were made. See [phone validation](../docs/PHONE_VALIDATION.md) for the exact receipt and remaining interruption/offline cases.


## Builds 4–5 — offline startup and explicit reconnect

Build 4 enables WebKit app-bound navigation for only `CF_ORIGIN_HOST`, also used to populate the single `WKAppBoundDomains` entry. The existing service worker can then cache the web shell. Its signed physical and unsigned Simulator builds passed; the compiled host lists were checked against each configured origin. On the physical iPhone, cold startup with the private server stopped opened the saved visit. The owner also confirmed that the interruption-test clip survived the build update and remained audible.

The Home/background case passed in build 3: capture stopped without restarting and the owner heard the saved partial clip. Lock, competing-call and OS-kill behavior are separate pending cases. Server-stopped cold startup does not establish offline microphone capture or complete radio disconnection.

Build 5 adds a fixed query to the explicit same-origin Reconnect GET, bypassing the shell cache so an expired server session can reach pairing. Normal startup keeps its cached path. Both build 5 targets compiled, and the signed build was installed on the same physical iPhone. Before the update, the owner confirmed new recording/playback with the server stopped. After the server restart, Reconnect reached pairing and the saved visit reopened. The owner confirmed the new offline clip was still present and audible after the update and reconnection. See [phone validation](../docs/PHONE_VALIDATION.md) for the actual sequence and limits.

## Builds 7–8 — remembered connection and one hold

At the owner’s request, `PhoneConnection.swift` keeps the existing private-server credential in the origin-specific [when-unlocked, device-only Keychain](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly). A one-time development launch supplies the existing credential over USB; it is not compiled into the app, exposed to JavaScript or printed. Release code cannot take a new launch-environment credential. Startup and explicit Reconnect perform only a bounded authentication request. Its ephemeral session follows no redirects; the expected HTTPS 303 and secure HttpOnly cookie are validated before WebKit admission. No field action or inference is replayed. Failed authentication leaves a visible error and preserves the cached visit.

Build 7 compiled and installed; the physical iPhone then reopened directly from its remembered Keychain credential without code input. Its first native navigation needs an explicit Cookie header in addition to WKHTTPCookieStore admission. TLS verification remains untouched. This is a development convenience for the fixed private origin, not production account or multi-user authentication.

Build 8 reuses the phone’s existing granted microphone permission for only that origin/main frame instead of repeated WebKit permission prompts. Camera remains separately prompted. Only an explicitly tapped, bounded tel or Apple Maps customer link may open an external app; that destination cannot receive connection credentials. The OS retains control over microphone permission, calls and external app opening. Both build targets compile. New physical hold/reply acceptance is tracked in PHONE_VALIDATION.md.

## Build 9 — customer contact actions

The number is plain text with separate Call and Text links; the address opens Maps. Only an explicit main-frame link activation may open a validated tel/SMS number or bounded Apple Maps query. SMS links cannot include a message body or query, and the app does not send or dial automatically. Exact-origin navigation and credential restrictions are unchanged. Signed-device/unsigned-Simulator builds and Mac policy checks pass. The owner confirmed no recurring microphone popup and one spoken gate-code reply in build 8; reliable first-hold setup and a complete new report remain separate acceptance items.


## Build 10 — speech session and contact opening

Spoken replies use an iOS-managed synthesis session, separate from WebKit recording and local clip playback, with native rate 0.60. Unexpected cancellation is surfaced to the page instead of silently looking like completion. Actual trusted contact taps cross a fixed-origin bridge to validated Phone, Messages or Maps destinations; no text body, send action or credential transfer is permitted. WebKit history gestures are disabled in favor of the app's work-order swipes. Both build targets compile and the signed app is installed. Physical repeated audible replies and external contact-action acceptance must be recorded separately. See [conversation context](../docs/CONVERSATION_CONTEXT.md).


## Build 11 — optional streaming reply queue

November 3: the exact final source compiled for signed physical iOS and unsigned Simulator. The new trusted-main-frame PCM bridge accepts only bounded sequenced 24 kHz samples with request/job/turn identity. `PCMReplyQueue` uses device-playback completion, cancels old identities and handles interruptions without replay. Apple local speech remains the configured output. ElevenLabs account/key and real provider transport are still unverified; no provider audio was generated.

A quiet native executable rendered actual nonzero PCM in software and checked cancellation, stale identities, sequence limits and empty-stream failure, without speakers. Build 11 was installed/launched in iPhone Air Simulator, iOS 26.5. Reconnect then normal close/reopen activated the new cached shell without deleting evidence. The one-hold screen rendered, right swipe opened the detailed work order and left swipe returned. These are Simulator observations, not physical microphone/speaker results. No physical installation was performed overnight; the last installed phone build remains 10.

The private phone route needs attention before the next test: the Mac's current Wi-Fi address differs from the saved origin, and the retained certificate expires November 3 at 20:34:51 UTC. Do not bypass TLS or switch origins without preserving the original phone evidence. Private runtime details and the morning sequence are retained locally. See [spoken replies](../docs/VOICE_OUTPUT.md), [storage checks](../docs/LOCAL_STORAGE_VERIFICATION.md) and [morning handoff](../docs/MORNING_HANDOFF_2026-11-03.md).

## Builds 12–14 — current phone checkpoint

The November 3 replacement private origin and root trust are working. Build 13 made Briefing visible and logged speech states without text; it reproduced post-capture synthesis stalls. Build 14 uses `SpeechPCMCollector` to render local Apple speech into a bounded in-memory WAV, then native AVAudioPlayer output. Both build targets compile, and the owner confirmed two complete consecutive post-microphone replies on the installed physical build. The text-free native completion log and source/configuration receipts stay ignored. No microphone or Meta call starts from Briefing; its readout is local. See [phone validation](../docs/PHONE_VALIDATION.md) and [context boundaries](../docs/CONVERSATION_CONTEXT.md).
