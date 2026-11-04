import SwiftUI
import WebKit
import UIKit
import AVFAudio
import AVFoundation

@MainActor
final class VisitBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    @Published private(set) var status = "Not connected"
    @Published private(set) var configurationError: String?
    @Published private(set) var connectionError: String?
    @Published private(set) var showingPilotSource = false
    private var opening = false
    private let departureReminders = DepartureReminders()
    private var hasSavedConnection = false
    let policy: EndpointPolicy?
    let webView: WKWebView
    weak var presenter: UIViewController?
    private var started = false
    private var pilotCandidate: Bool { Bundle.main.object(forInfoDictionaryKey: "CarryForwardCompanyPilot") as? String == "YES" }
    private let playbackSession = LocalPlaybackSession()
    private let clipPlayback = NativeClipPlayback()
    private let speechSession = LocalSpeechSession()
    private let replyAudio = NativeReplyAudio()
    fileprivate let jobCamera = NativeJobCamera()
    private var downloads: [ObjectIdentifier: URL] = [:]
    var route: String { policy?.origin.absoluteString ?? "No valid origin configured" }

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        // Enable service workers only for the configured app-bound host.
        config.limitsNavigationsToAppBoundDomains = true
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = .all
        webView = WKWebView(frame: .zero, configuration: config)
        #if targetEnvironment(simulator)
        let loopbackAllowed = true
        #else
        let loopbackAllowed = false
        #endif
        do {
            policy = try EndpointPolicy(Bundle.main.object(forInfoDictionaryKey: "CarryForwardDevelopmentOrigin") as? String ?? "", allowLoopbackHTTP: loopbackAllowed)
        } catch {
            policy = nil
            configurationError = error.localizedDescription
        }
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        speechSession.webView = webView
        speechSession.policy = policy
        playbackSession.onPlay = { [weak self] in self?.speechSession.stop(reason: "media-play"); self?.replyAudio.stop(); self?.clipPlayback.stop() }
        clipPlayback.webView = webView; clipPlayback.policy = policy
        clipPlayback.onPlay = { [weak self] in self?.speechSession.stop(reason: "clip-play"); self?.replyAudio.stop(); self?.playbackSession.deactivate() }
        speechSession.onSpeak = { [weak self] in self?.replyAudio.stop(); self?.clipPlayback.stop(); self?.playbackSession.deactivate() }
        replyAudio.webView = webView; replyAudio.policy = policy
        replyAudio.onPlay = { [weak self] in self?.speechSession.stop(reason: "provider-play"); self?.clipPlayback.stop(); self?.playbackSession.deactivate() }
        playbackSession.webView = webView
        playbackSession.policy = policy
        playbackSession.onFailure = { [weak self] in self?.status = $0 }
        let controller = webView.configuration.userContentController
        controller.add(playbackSession, name: "carryForwardPlayback")
        controller.add(clipPlayback, name: "carryForwardClipPlayback")
        controller.add(speechSession, name: "carryForwardSpeech")
        controller.add(replyAudio, name: "carryForwardSpeechAudio")
        controller.add(self, name: "carryForwardContact")
        departureReminders.webView = webView; departureReminders.policy = policy
        departureReminders.beforeAccountChange = { [weak self] in self?.interruptCapture() }
        controller.add(departureReminders, name: "carryForwardReminders")
        jobCamera.webView = webView; jobCamera.policy = policy
        jobCamera.onOpen = { [weak self] in
            self?.speechSession.stop(reason: "camera-open"); self?.replyAudio.stop()
            self?.clipPlayback.stop(); self?.playbackSession.deactivate()
            self?.webView.pauseAllMediaPlayback()
        }
        controller.add(jobCamera, name: "carryForwardCamera")
        controller.addUserScript(WKUserScript(source: """
            (() => {
              document.addEventListener('click', event => {
                const link=event.target.closest?.('a[href]');
                if(!event.isTrusted || !link || !/^(tel:|sms:|https:\\/\\/maps\\.apple\\.com\\/)/.test(link.href))return;
                event.preventDefault();
                window.webkit.messageHandlers.carryForwardContact.postMessage(link.href);
              });
              const send = value => window.webkit.messageHandlers.carryForwardPlayback.postMessage(value);
              document.addEventListener('play', event => {
                if (event.target instanceof HTMLMediaElement) send('play');
              }, true);
              const stopIfIdle = () => {
                if (![...document.querySelectorAll('audio,video')].some(media => !media.paused && !media.ended)) send('stop');
              };
              document.addEventListener('pause', stopIfIdle, true);
              document.addEventListener('ended', stopIfIdle, true);
              window.addEventListener('pagehide', () => send('stop'));
            })();
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.allowsBackForwardNavigationGestures = false
    }

    func returnFromPilotSource() {
        guard pilotCandidate else { return }
        interruptCapture()
        // Reload the authenticated pilot bootstrap rather than reveal a BFCache
        // page whose membership/assignment may have changed while reading.
        // Encrypted unsent work is retained; no field mutation is replayed.
        openConfiguredOrigin(bypassCache: false)
    }

    func remindersBecameActive() { departureReminders.presenter = presenter; departureReminders.becameActive() }

    func startOnce() {
        guard !started, policy != nil else { return }
        started = true
        openConfiguredOrigin(bypassCache: false)
    }
    func back() { if webView.canGoBack { webView.goBack() } }
    func confirmReload() {
        confirm("Reconnect to this same origin? Capture may stop. Saved job data stays in this app; requests will not be automatically replayed.") { [weak self] accepted in
            guard accepted, let self, self.policy != nil else { return }
            self.interruptCapture()
            self.openConfiguredOrigin(bypassCache: true)
        }
    }
    private func openConfiguredOrigin(bypassCache: Bool) {
        guard !opening, let policy else { return }
        opening = true
        connectionError = nil
        status = "Connecting…"
        Task { [weak self] in
            guard let self else { return }
            defer { self.opening = false }
            let connection = PhoneConnection(policy: policy)
            var sessionCookie: HTTPCookie?
            do {
                if !self.pilotCandidate, let code = try connection.credential() {
                    self.hasSavedConnection = true
                    let cookie = try await connection.signIn(code: code)
                    await self.webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
                    sessionCookie = cookie
                }
            } catch {
                self.connectionError = "Cannot connect to your Mac. Check that it is running on the same Wi-Fi, then tap Reconnect. Saved visits remain on this phone."
                let failure = error as NSError
                self.status = "Connection unavailable (\(failure.domain), \(failure.code)). No field request was retried."
                // The cached shell remains useful offline; never weaken TLS or replay work.
            }
            let startURL = self.pilotCandidate ? policy.origin.appendingPathComponent("pilot") : policy.origin
            let url = bypassCache ? startURL.appending(queryItems: [URLQueryItem(name: "reconnect", value: "1")]) : startURL
            var request = URLRequest(url: url)
            // Bootstrap the first app-initiated navigation explicitly. WebKit may
            // withhold a Strict cookie until this top-level site is established.
            if let sessionCookie {
                request.setValue(HTTPCookie.requestHeaderFields(with: [sessionCookie])["Cookie"], forHTTPHeaderField: "Cookie")
            }
            self.webView.load(request)
        }
    }
    func interruptCapture() {
        jobCamera.cancel()
        let wasCapturing = webView.microphoneCaptureState != .none || webView.cameraCaptureState != .none
        webView.setMicrophoneCaptureState(.none)
        webView.setCameraCaptureState(.none)
        webView.pauseAllMediaPlayback()
        speechSession.stop(reason: "capture-interrupted-or-background")
        replyAudio.stop()
        playbackSession.deactivate()
        clipPlayback.stop()
        if wasCapturing { status = "Capture interrupted. Review local save status before recording again." }
    }
    private func show(_ message: String) {
        guard let presenter, presenter.presentedViewController == nil else { status = message; return }
        let alert = UIAlertController(title: "CarryForward", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        presenter.present(alert, animated: true)
    }
    private func confirm(_ message: String, completion: @escaping (Bool) -> Void) {
        guard let presenter, presenter.presentedViewController == nil else { completion(false); return }
        let alert = UIAlertController(title: "CarryForward", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(false) })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completion(true) })
        presenter.present(alert, animated: true)
    }
    private func trusted(_ frame: WKFrameInfo) -> Bool {
        guard let url = frame.request.url, let policy else { return false }
        return policy.allows(url)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "carryForwardContact", message.frameInfo.isMainFrame,
              trusted(message.frameInfo), let value = message.body as? String,
              let url = URL(string: value), policy?.allowsContactAction(url) == true else { return }
        guard webView.microphoneCaptureState == .none, webView.cameraCaptureState == .none else {
            show("Finish recording before opening a contact action."); return
        }
        speechSession.stop(reason: "contact-action")
        replyAudio.stop()
        UIApplication.shared.open(url, options: [:]) { [weak self] opened in
            guard !opened else { return }
            Task { @MainActor [weak self] in self?.show("This device could not open that contact action.") }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, action.navigationType == .linkActivated,
           action.targetFrame?.isMainFrame != false, policy?.allowsContactAction(url) == true {
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
            return
        }
        guard let url = action.request.url, policy?.allows(url) == true else {
            status = "Navigation blocked outside the configured origin."
            decisionHandler(.cancel); return
        }
        if hasSavedConnection && url.path == "/pair" {
            if connectionError == nil { connectionError = "The development connection is unavailable. Tap Reconnect after checking your Mac. Saved visits remain on this phone." }
            decisionHandler(.cancel); return
        }
        if action.shouldPerformDownload { decisionHandler(.download) }
        else if action.targetFrame == nil { decisionHandler(.cancel); webView.load(action.request) }
        else { decisionHandler(.allow) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let url = response.response.url, policy?.allows(url) == true else { decisionHandler(.cancel); return }
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url, policy?.allows(url) == true else { return }
        status = "Page loaded · check service status in the visit below."
        showingPilotSource = pilotCandidate && url.path.hasPrefix("/pilot/api/")
        departureReminders.presenter = presenter
        departureReminders.becameActive()
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { navigationFailed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { navigationFailed(error) }
    private func navigationFailed(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        status = "Page could not open: \(error.localizedDescription) No request was retried."
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        status = "Web content stopped. Reconnect explicitly and inspect saved drafts before retrying any work."
    }
    // System certificate verification is untouched: no trust challenge override.
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard trusted(frame), let presenter, presenter.presentedViewController == nil else { completionHandler(); return }
        let alert = UIAlertController(title: "CarryForward", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        presenter.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard trusted(frame) else { completionHandler(false); return }
        confirm(message, completion: completionHandler)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard trusted(frame), let presenter, presenter.presentedViewController == nil else { completionHandler(nil); return }
        let alert = UIAlertController(title: "CarryForward", message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        presenter.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        guard let policy, frame.isMainFrame, trusted(frame), origin.protocol == policy.origin.scheme, origin.host == policy.origin.host, origin.port == policy.origin.port else { decisionHandler(.deny); return }
        // The owner requested that this fixed, already authorized microphone stop
        // asking on every hold. iOS app permission is still required once. Camera
        // and combined requests continue to prompt; no foreign frame is admitted.
        if type == .microphone && AVAudioApplication.shared.recordPermission == .granted { decisionHandler(.grant) }
        else { decisionHandler(.prompt) }
    }
    // WKWebView supplies its standard file-input picker. No full-library bridge.
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard let url = response.url, policy?.allows(url) == true else { completionHandler(nil); return }
        guard response.expectedContentLength <= 40_000_000 else { status = "Export exceeds the native 40 MB limit. Original job data remains in the visit."; completionHandler(nil); return }
        do {
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("CarryForward-\(UUID().uuidString)", isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
            let name = String((suggestedFilename as NSString).lastPathComponent.prefix(120))
            let file = dir.appendingPathComponent(name.isEmpty || name == "." || name == ".." ? "visit-export.json" : name)
            downloads[ObjectIdentifier(download)] = file
            status = "Preparing local export…"
            completionHandler(file)
        } catch { status = "Export could not be saved: \(error.localizedDescription)"; completionHandler(nil) }
    }
    func download(_ download: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, decisionHandler: @escaping (WKDownload.RedirectPolicy) -> Void) {
        decisionHandler(request.url.map { policy?.allows($0) == true } == true ? .allow : .cancel)
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        status = "Export saved temporarily. Choose a destination in Share."
        guard let presenter, presenter.presentedViewController == nil else {
            status = "Export is ready, but Share could not open. Export again when the dialog is closed."
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent()); return
        }
        let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = presenter.view
        share.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
        share.completionWithItemsHandler = { [weak self] _, completed, _, error in
            self?.status = error != nil ? "Sharing failed. Original job data remains in the visit." : completed ? "Export shared. This does not establish Operations acceptance." : "Sharing cancelled. Original job data remains in the visit."
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
        }
        presenter.present(share, animated: true)
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = downloads.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        status = "Export failed: \(error.localizedDescription) No download was automatically resumed."
    }
}

struct VisitWebView: UIViewControllerRepresentable {
    let browser: VisitBrowser
    func makeUIViewController(context: Context) -> UIViewController {
        let host = UIViewController()
        browser.presenter = host
        browser.jobCamera.presenter = host
        browser.webView.translatesAutoresizingMaskIntoConstraints = false
        host.view.addSubview(browser.webView)
        NSLayoutConstraint.activate([
            browser.webView.leadingAnchor.constraint(equalTo: host.view.leadingAnchor),
            browser.webView.trailingAnchor.constraint(equalTo: host.view.trailingAnchor),
            browser.webView.topAnchor.constraint(equalTo: host.view.topAnchor),
            browser.webView.bottomAnchor.constraint(equalTo: host.view.bottomAnchor)
        ])
        // Start from the SwiftUI task after this view update completes.
        return host
    }
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) { /* Retain the same web view and origin across SwiftUI updates. */ }
}

// Adapted from PRISM's explicit local playback-session lifecycle. Only fixed
// playback controls cross this bridge; recordings and transcripts remain in WebKit.
@MainActor
private final class LocalPlaybackSession: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    var policy: EndpointPolicy?
    var onFailure: ((String) -> Void)?
    var onPlay: (() -> Void)?
    private var active = false

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "carryForwardPlayback", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, policy?.allows(url) == true,
              let action = message.body as? String,
              webView?.microphoneCaptureState == WKMediaCaptureState.none else { return }
        if action == "stop" { deactivate(); return }
        guard action == "play" else { return }
        onPlay?()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try session.setActive(true)
            active = true
            NSLog("CarryForward local playback active; output=%@", session.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ","))
        } catch {
            onFailure?("Audio output could not start. Check the selected audio output and tap Play again.")
        }
    }

    func deactivate() {
        guard active else { return }
        active = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

// Local speech only. The allowed page supplies a bounded readout after a user
// action; speech events carry IDs/state, never evidence or provider credentials.
@MainActor
private final class LocalSpeechSession: NSObject, WKScriptMessageHandler, AVAudioPlayerDelegate {
    var onSpeak: (() -> Void)?
    weak var webView: WKWebView?
    var policy: EndpointPolicy?
    private var synth: AVSpeechSynthesizer?
    private var collector: SpeechPCMCollector?
    private var player: AVAudioPlayer?
    private var renderTimeout: Task<Void, Never>?
    private var progressTimer: Timer?
    private var currentID: String?
    private var diagnostics: [[String: Any]] = []

    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "carryForwardSpeech", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, policy?.allows(url) == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String,
              let id = body["id"] as? String, !id.isEmpty, id.count <= 80,
              id.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil else { return }
        if action == "stop" { if currentID == id { stop(reason: "page-stop") }; return }
        guard action == "speak", let text = body["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.count <= 8000, webView?.microphoneCaptureState == WKMediaCaptureState.none else { record("rejected", id: id); emit(id, "error"); return }
        stop(reason: "replacement"); onSpeak?()
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = 0.60; utterance.volume = 1
        let renderer = AVSpeechSynthesizer(), output = SpeechPCMCollector()
        renderer.usesApplicationAudioSession = false
        synth = renderer; collector = output; currentID = id
        record("rendering", id: id, extra: ["characters": text.utf16.count])
        renderTimeout = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(10))
            guard !Task.isCancelled, self?.currentID == id, self?.player == nil else { return }
            self?.fail(id, reason: "render-timeout")
        }
        renderer.write(utterance) { [weak self] buffer in
            guard let result = output.consume(buffer) else { return }
            Task { @MainActor [weak self] in self?.rendered(result, id: id) }
        }
    }
    func stop(reason: String = "unspecified", notify: Bool = true) {
        guard let id = currentID else { return }
        record("stop", id: id, extra: ["reason": reason])
        currentID = nil; renderTimeout?.cancel(); renderTimeout = nil
        collector?.cancel(); collector = nil
        synth?.stopSpeaking(at: .immediate); synth = nil
        progressTimer?.invalidate(); progressTimer = nil
        let hadPlayer = player != nil; player?.stop(); player = nil
        if hadPlayer && webView?.microphoneCaptureState == WKMediaCaptureState.none {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        if notify { emit(id, "ready") }
    }
    private func emit(_ id: String, _ state: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["id": id, "state": state]),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('carryforward-speech',{detail: \(json)}));", completionHandler: nil)
    }
    private func rendered(_ result: Result<RenderedSpeech, Error>, id: String) {
        guard currentID == id else { return }
        renderTimeout?.cancel(); renderTimeout = nil
        do {
            let clip = try result.get()
            guard webView?.microphoneCaptureState == WKMediaCaptureState.none else { fail(id, reason: "capture-active"); return }
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
            let audio = try AVAudioPlayer(data: clip.wav, fileTypeHint: "wav")
            player = audio; audio.delegate = self; audio.volume = 1
            guard audio.prepareToPlay(), audio.play() else { fail(id, reason: "player-start"); return }
            record("speaking", id: id, extra: ["frames": clip.frames, "sampleRate": clip.sampleRate, "duration": clip.duration, "peak": clip.peak])
            emit(id, "speaking")
            progressTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in
                    guard let self, self.currentID == id, let player = self.player else { return }
                    self.record("playback-progress", id: id, extra: ["seconds": player.currentTime, "isPlaying": player.isPlaying])
                }
            }
        } catch { fail(id, reason: "render-or-player-error") }
    }
    private func fail(_ id: String, reason: String) {
        guard currentID == id else { return }
        record("error", id: id, extra: ["reason": reason]); stop(reason: reason, notify: false); emit(id, "error")
    }
    private func finished(_ identity: ObjectIdentifier, success: Bool) {
        guard let player, ObjectIdentifier(player) == identity, let id = currentID else { return }
        record(success ? "completed" : "error", id: id, extra: ["seconds": player.currentTime, "duration": player.duration])
        stop(reason: success ? "completed" : "player-interrupted", notify: false)
        emit(id, success ? "ready" : "error")
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        let identity = ObjectIdentifier(player)
        Task { @MainActor [weak self] in self?.finished(identity, success: flag) }
    }
    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        let identity = ObjectIdentifier(player)
        Task { @MainActor [weak self] in self?.finished(identity, success: false) }
    }
    // Bounded on-device diagnostics contain states and counters only. Never
    // write utterance text, job/customer details, recordings or credentials.
    private func record(_ event: String, id: String? = nil, extra: [String: Any] = [:]) {
        #if DEBUG
        let session = AVAudioSession.sharedInstance()
        var entry: [String: Any] = ["at": ISO8601DateFormatter().string(from: Date()), "event": event,
            "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
            "capture": webView?.microphoneCaptureState.rawValue ?? 0,
            "category": session.category.rawValue, "mode": session.mode.rawValue,
            "outputs": session.currentRoute.outputs.map { $0.portType.rawValue }]
        if let id = id ?? currentID { entry["id"] = id }
        entry.merge(extra) { _, new in new }
        diagnostics.append(entry); diagnostics = Array(diagnostics.suffix(256))
        guard let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first,
              let data = try? JSONSerialization.data(withJSONObject: diagnostics, options: [.sortedKeys]) else { return }
        let directory = base.appendingPathComponent("CarryForward", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: directory.appendingPathComponent("speech-diagnostics.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch { NSLog("CarryForward speech diagnostics unavailable") }
        #endif
    }
    @objc private nonisolated func interrupted(_ notification: Notification) {
        let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt ?? 0
        Task { @MainActor [weak self] in
            self?.record("interruption", extra: ["type": value])
            if value == AVAudioSession.InterruptionType.began.rawValue, let id = self?.currentID, self?.player != nil { self?.fail(id, reason: "system-interruption") }
        }
    }
    @objc private nonisolated func routeChanged(_ notification: Notification) {
        let value = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
        Task { @MainActor [weak self] in
            self?.record("route-change", extra: ["reason": value])
            if value == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue, let id = self?.currentID { self?.fail(id, reason: "output-disconnected") }
        }
    }

}

// Plays only an explicitly selected, bounded local WAV. No network or file URL.
@MainActor
private final class NativeClipPlayback: NSObject, WKScriptMessageHandler, AVAudioPlayerDelegate {
    weak var webView: WKWebView?
    var policy: EndpointPolicy?
    var onPlay: (() -> Void)?
    private var player: AVAudioPlayer?
    private var currentID: String?

    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "carryForwardClipPlayback", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, policy?.allows(url) == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String,
              let id = body["id"] as? String, id.count <= 80,
              id.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil else { return }
        if action == "stop" { if currentID == id { stop() }; return }
        guard action == "play", let encoded = body["wavBase64"] as? String,
              encoded.count <= 2_000_000, let bytes = Data(base64Encoded: encoded),
              bytes.count >= 44, bytes.count <= 1_500_000,
              bytes.prefix(4) == Data("RIFF".utf8), bytes[8..<12] == Data("WAVE".utf8) else { emit(id, "error", "This local audio copy could not be opened. The original stays saved."); return }
        guard webView?.microphoneCaptureState == WKMediaCaptureState.none else { emit(id,"error","Stop recording before playing a clip."); return }
        stop(); onPlay?()
        do {
            let output = AVAudioSession.sharedInstance()
            try output.setCategory(.playback, mode: .spokenAudio)
            try output.setActive(true)
            let audio = try AVAudioPlayer(data: bytes, fileTypeHint: "wav")
            guard audio.duration > 0, audio.duration <= 30.1 else { throw PlaybackError.invalidDuration }
            currentID = id; player = audio; audio.delegate = self; audio.volume = 1
            guard audio.prepareToPlay(), audio.play() else { throw PlaybackError.couldNotStart }
            let route = output.currentRoute.outputs.first?.portType
            let name = route == .builtInSpeaker ? "iPhone speaker" : route == .builtInReceiver ? "iPhone receiver" : "selected audio output"
            emit(id,"playing",output.outputVolume == 0 ? "Playing, but media volume is zero." : "Playing through the \(name).")
        } catch { stop(); try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation); emit(id,"error","Audio output did not start. The original recording is still saved.") }
    }
    func stop() {
        guard let id = currentID else { return }
        player?.stop(); player = nil; currentID = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        emit(id,"ready",nil)
    }
    private func emit(_ id: String, _ state: String, _ message: String?) {
        var body=["id":id,"state":state];if let message { body["message"]=message }
        guard let data=try? JSONSerialization.data(withJSONObject:body),let json=String(data:data,encoding:.utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('carryforward-clip-playback',{detail: \(json)}));",completionHandler:nil)
    }
    private func finished(_ identity: ObjectIdentifier, success: Bool) {
        guard let audio=player,ObjectIdentifier(audio)==identity,let id=currentID else { return }
        stop();if !success { emit(id,"error","Playback stopped before the end. The original is still saved.") }
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        let identity=ObjectIdentifier(player);Task { @MainActor [weak self] in self?.finished(identity,success:flag) }
    }
    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        let identity=ObjectIdentifier(player);Task { @MainActor [weak self] in self?.finished(identity,success:false) }
    }
    @objc private nonisolated func interrupted(_ notification: Notification) {
        if notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.began.rawValue { Task { @MainActor [weak self] in self?.stop() } }
    }
    @objc private nonisolated func routeChanged(_ notification: Notification) {
        if notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { Task { @MainActor [weak self] in self?.stop() } }
    }
    enum PlaybackError: Error { case invalidDuration, couldNotStart }
}


@MainActor
private final class NativeReplyAudio: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    var policy: EndpointPolicy?
    var onPlay: (() -> Void)?
    private let queue = try? PCMReplyQueue()
    override init() {
        super.init()
        queue?.onState = { [weak self] identity, state in self?.emit(identity, state) }
        queue?.mayDeactivate = { [weak self] in self?.webView?.microphoneCaptureState == WKMediaCaptureState.none }
    }
    func stop() { queue?.stop() }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "carryForwardSpeechAudio", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, policy?.allows(url) == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String,
              let id = body["id"] as? String, UUID(uuidString: id) != nil,
              let jobId = body["jobId"] as? String,
              policy?.allowsSpeechJob(jobId, at: url, companyPilot: Bundle.main.object(forInfoDictionaryKey: "CarryForwardCompanyPilot") as? String == "YES") == true,
              let turnId = body["turnId"] as? String, !turnId.isEmpty, turnId.count <= 200 else { return }
        let identity = PCMReplyQueue.Identity(id: id, jobId: jobId, turnId: turnId)
        if action == "stop" { queue?.stop(identity); return }
        do {
            guard let queue else { emit(identity, "error"); return }
            if action == "begin" {
                guard body["sampleRate"] as? Int == 24000, webView?.microphoneCaptureState == WKMediaCaptureState.none else { emit(identity, "error"); return }
                let playbackRate = (body["playbackRate"] as? NSNumber)?.floatValue ?? 1
                onPlay?(); try queue.begin(identity, playbackRate: playbackRate)
            } else if action == "chunk" {
                guard let sequence = body["sequence"] as? Int, sequence >= 0, let encoded = body["pcmBase64"] as? String, encoded.count <= 21848, let data = Data(base64Encoded: encoded) else { emit(identity, "error"); return }
                try queue.append(identity, sequence: sequence, bytes: data)
            } else if action == "end" { queue.end(identity) }
        } catch { emit(identity, "error") }
    }
    private func emit(_ identity: PCMReplyQueue.Identity, _ state: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["id":identity.id,"jobId":identity.jobId,"turnId":identity.turnId,"state":state]), let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('carryforward-speech-audio',{detail: \(json)}));", completionHandler: nil)
    }
}


// One explicit job-scoped camera capture. No library enumeration, provider
// upload, automatic shutter, background restart or certificate override.
@MainActor
fileprivate final class NativeJobCamera: NSObject, WKScriptMessageHandler, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    weak var webView: WKWebView?
    weak var presenter: UIViewController?
    var policy: EndpointPolicy?
    var onOpen: (() -> Void)?
    private struct Request { let id: String; let jobId: String }
    private var request: Request?
    private var picker: UIImagePickerController?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "carryForwardCamera", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, policy?.allows(url) == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String,
              let id = body["id"] as? String, id.range(of: "^[A-Za-z0-9-]{1,80}$", options: .regularExpression) != nil,
              let jobId = body["jobId"] as? String, !jobId.isEmpty, jobId.count <= 200, !jobId.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { return }
        if action == "cancel" {
            if request?.id == id && request?.jobId == jobId { cancel() }
            return
        }
        guard action == "open" else { return }
        let next = Request(id: id, jobId: jobId)
        guard request == nil, let presenter, presenter.presentedViewController == nil,
              UIApplication.shared.applicationState == .active,
              webView?.microphoneCaptureState == WKMediaCaptureState.none,
              webView?.cameraCaptureState == WKMediaCaptureState.none else {
            emit(next, state: "error", message: "Finish recording or close the current screen before opening the camera."); return
        }
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            emit(next, state: "error", message: "Camera capture is unavailable on this device. Tap Photo to select a supplied test image."); return
        }
        request = next
        record("requested", id: id)
        Task { [weak self] in
            let permission = AVCaptureDevice.authorizationStatus(for: .video)
            var allowed = permission == .authorized
            if permission == .notDetermined { allowed = await AVCaptureDevice.requestAccess(for: .video) }
            guard let self, self.request?.id == next.id else { return }
            guard allowed else { self.finish(next, state: "error", message: "Camera access is off. Enable CarryForward camera access in Settings to take a photo."); return }
            guard UIApplication.shared.applicationState == .active, let host = self.presenter,
                  host.presentedViewController == nil, let current = self.webView?.url, self.policy?.allows(current) == true else {
                self.finish(next, state: "cancel"); return
            }
            self.onOpen?()
            let camera = UIImagePickerController()
            camera.sourceType = .camera; camera.mediaTypes = ["public.image"]
            camera.cameraCaptureMode = .photo; camera.cameraDevice = .rear
            camera.allowsEditing = false; camera.delegate = self
            camera.modalPresentationStyle = .fullScreen
            self.picker = camera
            host.present(camera, animated: true) { self.record("presented", id: next.id) }
        }
    }

    func cancel() {
        guard let request else { return }
        finish(request, state: "cancel")
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        guard self.picker === picker, let request else { return }
        finish(request, state: "cancel")
    }
    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        guard self.picker === picker, let request else { return }
        // This JPEG is the native camera's encoded output, not an imported
        // file or an EXIF-derived observation time. Never resize silently.
        guard let image = info[.originalImage] as? UIImage,
              let data = image.jpegData(compressionQuality: 0.92), !data.isEmpty else {
            finish(request, state: "error", message: "The captured photo could not be encoded. Nothing was saved."); return
        }
        guard data.count <= 5_000_000 else {
            finish(request, state: "error", message: "The captured photo exceeds the 5 MB limit. Nothing was saved. Use Photo to select a smaller image."); return
        }
        finish(request, state: "photo", data: data)
    }
    private func finish(_ value: Request, state: String, message: String? = nil, data: Data? = nil) {
        guard request?.id == value.id && request?.jobId == value.jobId else { return }
        request = nil
        record(state, id: value.id, bytes: data?.count)
        let camera = picker; picker = nil
        let send = { [weak self] in self?.emit(value, state: state, message: message, data: data) }
        if let camera, camera.presentingViewController != nil { camera.dismiss(animated: true) { send() } }
        else { send() }
    }
    // States and byte counts only; no image bytes, job/customer text or keys.
    private var diagnostics: [[String: Any]] = []
    private func record(_ state: String, id: String, bytes: Int? = nil) {
        #if DEBUG
        var entry: [String: Any] = ["at": ISO8601DateFormatter().string(from: Date()), "state": state, "id": id,
            "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"]
        if let bytes { entry["bytes"] = bytes }
        diagnostics.append(entry); diagnostics = Array(diagnostics.suffix(64))
        guard let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first,
              let data = try? JSONSerialization.data(withJSONObject: diagnostics) else { return }
        let directory = base.appendingPathComponent("CarryForward", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: directory.appendingPathComponent("camera-diagnostics.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #endif
    }
    private func emit(_ value: Request, state: String, message: String? = nil, data: Data? = nil) {
        guard let webView, let current = webView.url, policy?.allows(current) == true else { return }
        var payload: [String: Any] = ["id": value.id, "jobId": value.jobId, "state": state]
        if let message { payload["message"] = String(message.prefix(300)) }
        if let data {
            payload["mime"] = "image/jpeg"; payload["name"] = "camera-\(UUID().uuidString).jpg"
            payload["dataBase64"] = data.base64EncodedString()
        }
        guard let bytes = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: bytes, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('carryforward:camera',{detail:\(json)}))", completionHandler: nil)
    }
}
