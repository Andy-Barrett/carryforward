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

The origin comes from the three target build settings `CF_ORIGIN_SCHEME`, `CF_ORIGIN_HOST` and `CF_ORIGIN_PORT`. They avoid xcconfig URL-comment parsing. Simulator defaults are `http`, `127.0.0.1`, `4350`. Physical builds refuse loopback HTTP; use the existing owner-approved **private HTTPS** origin and its pairing/TLS workflow while on the same trusted network. No global cleartext or certificate-validation bypass is provided. The local-network ATS setting does not itself make an insecure phone origin acceptable. A reachable remote/hosted backend remains a separate release/access decision.

## Native boundary

- A retained web view uses the persistent default WKWebsiteDataStore. Routine SwiftUI updates and app activation do not reload it. Storage remains app/origin-specific; an origin change creates a different job store.
- The native route label shows the configured origin. Page loaded is not API readiness, source acceptance or proof that the intended transport works. Inspect the web app's actual service state and exact-revision simulator receipts.
- Same-origin main/frame navigation and blob exports are permitted; other destinations and download redirects are blocked. System TLS trust is untouched. Debug builds allow Web Inspector; no account/signing/entitlement expansion is performed by the source.
- WKUIDelegate handles web alerts, confirmation and text prompts, with safe cancellation when another dialog is already presented. Import and large export confirmations therefore have an explicit native implementation.
- WebKit's standard file-input picker remains the capture/import path. There is no full-library scanning or new native evidence store. Microphone/camera origin requests return prompt, never automatic grant. Actual permission/denial and picker behavior remain unverified.
- Backgrounding requests that active camera/microphone capture stop and pauses media. Activation never restarts capture. This is not a guarantee that an interrupted clip was saved; inspect the web recorder's actual saved/unsaved state.
- WKDownload writes exports to a protected app-temporary folder and opens the system share sheet after completion. It blocks known lengths over 40 MB and foreign redirects. Share cancellation/failure remains distinct from source acceptance; no automatic resume/retry or outbound share is performed. Completed/cancelled temporary exports are removed; original job evidence stays in web storage. Blob/export/share behavior still needs a running wrapper test.

## First launch acceptance — prepared, not run

Use only the fictional assignments/photos generated under `.local/usability/ios-first-launch-20261031/`. The normal technician test precedes optional role reversal; prepared files are not observations.

Record commit, native build number, SDK, explicit destination/OS, origin and inference-disabled config. Read the seven-part brief, save fictional narration and a separate unsent draft, add supplied evidence and inspect a source PDF/image/clip. Import the second fictional assignment through the file picker and confirmation dialog; verify job isolation. Terminate/relaunch and check both saved and unsent states. Exercise multiline/Unicode paste, selection/replacement, Return/Send and keyboard overlap. Export/share and reimport as appropriate. Prepare, confirm and deliver one exact revision to the isolated simulator, then separately record receipt and acceptance with unfinished work retained. Double taps, a lost response and reconnect must not silently replay inference or delivery.

Test offline cold launch inside this actual WKWebView after a successful first online run. Service-worker availability, registration, cached-shell startup and source-media availability must be observed; Safari/desktop results do not establish wrapper behavior. If it fails, record the unsupported path before choosing a native offline/capture adapter.

## One owner checklist for the later phone pass

1. In Xcode, confirm the intended Apple account/team and signing status only if needed. Current signing access has not been audited; no paid enrollment or TestFlight setup is required to begin development.
2. Connect/pair the intended phone; complete Developer Mode/computer trust prompts yourself if required. Select the explicit device and record its OS/build destination.
3. Use the prepared private HTTPS endpoint on the same trusted network, install/trust its temporary certificate through the existing owner workflow and enter its pairing code. An away-from-home phone needs a separately approved reachable endpoint.
4. Tap capture and test microphone/camera permission **and denial**, picker imports, original codec playback and multiline/Unicode editing with the keyboard visible.
5. Lock/background/interrupt recording, then inspect actual recovery with no automatic mic restart. Test airplane-mode/reopen/reconnect, local draft/evidence retention and exact-revision delivery/acceptance. Record failures and unsaved status; do not infer a pass from a generic Ready label.

## October 31 checks and concrete blocker

Xcode 27.2 (`27B52`) and SDK 27.2 compiled the target for generic Simulator (arm64/x86_64) and generic physical iOS (arm64), with signing disabled. Native Foundation policy checks ran on the Mac, rejecting public hosts, wrong origins, credentials, nested blobs and insecure phone fallback. All 99 existing Node 24 tests passed. No model calls occurred in this native increment.

Available-device inventory timed out after 25 seconds. The build log reports: `CoreSimulator is out of date. Current version (1174.9.2) is older than build version (1174.21.0).` Simulator device support was disabled. This is a tooling blocker, not proof that no runtime is installed. No component update, global service restart, runtime download, signing/account change or physical-device install was performed. First launch, UI/file/download/share/media/offline behavior and physical-phone checks remain pending.

The application identity is `com.andybarrett.carryforward.development`, version 0.1.0/build 1. The web source is recorded as `209b4307ed59b7e817d3f0351c43200aa3420dcd`; the native source/build digests and logs are retained under ignored `.local/ios-build/`. These are build receipts, not field-readiness or distribution receipts.

## Lessons carried from the PRISM audit

This implementation applies the retained PRISM audit lessons supplied to this chat: explicit intended-route verification, no automatic replay after interruption, editing as an acceptance requirement, development installation separate from TestFlight, and precise source/destination receipts. It does not import PRISM source, its Bonjour/Iroh transports, account assumptions or old device passes. The WKWebView editing/capture path must earn its own observed acceptance before a native replacement is chosen.
