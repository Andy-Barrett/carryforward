import SwiftUI
import WebKit
import UIKit

@MainActor
final class VisitBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    @Published private(set) var status = "Not connected"
    @Published private(set) var configurationError: String?
    let policy: EndpointPolicy?
    let webView: WKWebView
    weak var presenter: UIViewController?
    private var started = false
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
        browser.startOnce()
        return host
    }
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) { /* Retain the same web view and origin across SwiftUI updates. */ }
}
