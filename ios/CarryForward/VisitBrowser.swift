import SwiftUI
import WebKit
import UIKit
import AVFAudio

@MainActor
final class VisitBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    @Published private(set) var status = "Not connected"
    @Published private(set) var configurationError: String?
    @Published private(set) var connectionError: String?
    private var opening = false
    private var hasSavedConnection = false
    let policy: EndpointPolicy?
    let webView: WKWebView
    weak var presenter: UIViewController?
    private var started = false
    private let playbackSession = LocalPlaybackSession()
    private let clipPlayback = NativeClipPlayback()
    private let speechSession = LocalSpeechSession()
    private let replyAudio = NativeReplyAudio()
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
        playbackSession.onPlay = { [weak self] in self?.speechSession.stop(); self?.replyAudio.stop(); self?.clipPlayback.stop() }
        clipPlayback.webView = webView; clipPlayback.policy = policy
        clipPlayback.onPlay = { [weak self] in self?.speechSession.stop(); self?.replyAudio.stop(); self?.playbackSession.deactivate() }
        speechSession.onSpeak = { [weak self] in self?.replyAudio.stop(); self?.clipPlayback.stop(); self?.playbackSession.deactivate() }
        replyAudio.webView = webView; replyAudio.policy = policy
        replyAudio.onPlay = { [weak self] in self?.speechSession.stop(); self?.clipPlayback.stop(); self?.playbackSession.deactivate() }
        playbackSession.webView = webView
        playbackSession.policy = policy
        playbackSession.onFailure = { [weak self] in self?.status = $0 }
        let controller = webView.configuration.userContentController
        controller.add(playbackSession, name: "carryForwardPlayback")
        controller.add(clipPlayback, name: "carryForwardClipPlayback")
        controller.add(speechSession, name: "carryForwardSpeech")
        controller.add(replyAudio, name: "carryForwardSpeechAudio")
        controller.add(self, name: "carryForwardContact")
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
                if let code = try connection.credential() {
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
            let url = bypassCache ? policy.origin.appending(queryItems: [URLQueryItem(name: "reconnect", value: "1")]) : policy.origin
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
        let wasCapturing = webView.microphoneCaptureState != .none || webView.cameraCaptureState != .none
        webView.setMicrophoneCaptureState(.none)
        webView.setCameraCaptureState(.none)
        webView.pauseAllMediaPlayback()
        speechSession.stop()
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
        speechSession.stop()
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
private final class LocalSpeechSession: NSObject, WKScriptMessageHandler, AVSpeechSynthesizerDelegate {
    var onSpeak: (() -> Void)?
    weak var webView: WKWebView?
    var policy: EndpointPolicy?
    private let synth = AVSpeechSynthesizer()
    private var current: AVSpeechUtterance?
    private var currentID: String?

    override init() {
        super.init()
        synth.delegate = self
        // WebKit owns capture. Let iOS own a separate speech session, so delayed
        // recording-session notifications cannot cancel the reply.
        synth.usesApplicationAudioSession = false
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "carryForwardSpeech", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, policy?.allows(url) == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String,
              let id = body["id"] as? String, !id.isEmpty, id.count <= 80,
              id.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil else { return }
        if action == "stop" { if currentID == id { stop() }; return }
        guard action == "speak", let text = body["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.count <= 8000, webView?.microphoneCaptureState == WKMediaCaptureState.none else { emit(id, "error"); return }
        stop(); onSpeak?()
        do {
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            utterance.rate = 0.60
            utterance.volume = 1
            current = utterance; currentID = id
            synth.speak(utterance)
        }
    }
    func stop() {
        guard let id = currentID else { return }
        current = nil; currentID = nil
        synth.stopSpeaking(at: .immediate)
        emit(id, "ready")
    }
    private func emit(_ id: String, _ state: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["id": id, "state": state]),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('carryforward-speech',{detail: \(json)}));", completionHandler: nil)
    }
    private func speechChanged(_ identity: ObjectIdentifier, state: String) {
        guard let utterance = current, ObjectIdentifier(utterance) == identity, let id = currentID else { return }
        if state == "speaking" { emit(id, state) } else {
            current = nil; currentID = nil
            emit(id, state)
        }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        let identity = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in self?.speechChanged(identity, state: "speaking") }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let identity = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in self?.speechChanged(identity, state: "ready") }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let identity = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in self?.speechChanged(identity, state: "error") }
    }
    @objc private nonisolated func routeChanged(_ notification: Notification) {
        if notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
            Task { @MainActor [weak self] in self?.stop() }
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
              let jobId = body["jobId"] as? String, jobId.hasPrefix("DEMO-"), jobId.count <= 300,
              let turnId = body["turnId"] as? String, !turnId.isEmpty, turnId.count <= 200 else { return }
        let identity = PCMReplyQueue.Identity(id: id, jobId: jobId, turnId: turnId)
        if action == "stop" { queue?.stop(identity); return }
        do {
            guard let queue else { emit(identity, "error"); return }
            if action == "begin" {
                guard body["sampleRate"] as? Int == 24000, webView?.microphoneCaptureState == WKMediaCaptureState.none else { emit(identity, "error"); return }
                onPlay?(); try queue.begin(identity)
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
