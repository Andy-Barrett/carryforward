import SwiftUI
import WebKit
import UIKit
import AVFAudio

@MainActor
final class VisitBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    @Published private(set) var status = "Not connected"
    @Published private(set) var configurationError: String?
    let policy: EndpointPolicy?
    let webView: WKWebView
    weak var presenter: UIViewController?
    private var started = false
    private let playbackSession = LocalPlaybackSession()
    private let speechSession = LocalSpeechSession()
    private var downloads: [ObjectIdentifier: URL] = [:]
    var route: String { policy?.origin.absoluteString ?? "No valid origin configured" }

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
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
        playbackSession.onPlay = { [weak self] in self?.speechSession.stop() }
        playbackSession.webView = webView
        playbackSession.policy = policy
        playbackSession.onFailure = { [weak self] in self?.status = $0 }
        let controller = webView.configuration.userContentController
        controller.add(playbackSession, name: "carryForwardPlayback")
        controller.add(speechSession, name: "carryForwardSpeech")
        controller.addUserScript(WKUserScript(source: """
            (() => {
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
        webView.allowsBackForwardNavigationGestures = true
    }

    func startOnce() {
        guard !started, let policy else { return }
        started = true
        status = "Opening configured origin…"
        webView.load(URLRequest(url: policy.origin))
    }
    func back() { if webView.canGoBack { webView.goBack() } }
    func confirmReload() {
        confirm("Reconnect to this same origin? Capture may stop. Saved job data stays in this app; requests will not be automatically replayed.") { [weak self] accepted in
            if accepted { self?.status = "Reopening configured origin…"; self?.webView.reload() }
        }
    }
    func interruptCapture() {
        let wasCapturing = webView.microphoneCaptureState != .none || webView.cameraCaptureState != .none
        webView.setMicrophoneCaptureState(.none)
        webView.setCameraCaptureState(.none)
        webView.pauseAllMediaPlayback()
        speechSession.stop()
        playbackSession.deactivate()
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

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, policy?.allows(url) == true else {
            status = "Navigation blocked outside the configured origin."
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
        decisionHandler(.prompt) // User tap and OS permission remain required. Never auto-grant.
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
    weak var webView: WKWebView?
    var policy: EndpointPolicy?
    private let synth = AVSpeechSynthesizer()
    private var current: AVSpeechUtterance?
    private var currentID: String?

    override init() {
        super.init()
        synth.delegate = self
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
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
        stop()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try session.setActive(true)
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate
            utterance.volume = 1
            current = utterance; currentID = id
            synth.speak(utterance)
        } catch { emit(id, "error") }
    }
    func stop() {
        guard let id = currentID else { return }
        current = nil; currentID = nil
        synth.stopSpeaking(at: .immediate)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        emit(id, "ready")
    }
    private func emit(_ id: String, _ state: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["id": id, "state": state]),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('carryforward-speech',{detail: \(json)}));", completionHandler: nil)
    }
    private func speechChanged(_ identity: ObjectIdentifier, state: String) {
        guard let utterance = current, ObjectIdentifier(utterance) == identity, let id = currentID else { return }
        if state == "speaking" { emit(id, state) } else { stop() }
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
        Task { @MainActor [weak self] in self?.speechChanged(identity, state: "ready") }
    }
    @objc private nonisolated func audioInterrupted(_ notification: Notification) {
        if notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.began.rawValue {
            Task { @MainActor [weak self] in self?.stop() }
        }
    }
    @objc private nonisolated func routeChanged(_ notification: Notification) {
        if notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
            Task { @MainActor [weak self] in self?.stop() }
        }
    }

}
