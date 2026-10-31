import SwiftUI

@main
struct CarryForwardApp: App {
    @StateObject private var browser = VisitBrowser()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            VStack(spacing: 0) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("CarryForward · Development").font(.caption.bold())
                        Text(browser.route).font(.caption2).textSelection(.enabled)
                        Text(browser.status).font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Back", systemImage: "chevron.left") { browser.back() }.labelStyle(.iconOnly).accessibilityLabel("Back to previous job view")
                    Button("Reconnect", systemImage: "arrow.clockwise") { browser.confirmReload() }.labelStyle(.iconOnly).accessibilityLabel("Reconnect to the same origin")
                }.padding(12).background(.thinMaterial)
                if let error = browser.configurationError {
                    ContentUnavailableView("Development origin required", systemImage: "network.slash", description: Text(error))
                } else {
                    VisitWebView(browser: browser)
                }
            }
            .onChange(of: phase) { _, next in
                if next == .background { browser.interruptCapture() }
                // Activation deliberately does not reload, start capture or retry a request.
            }
        }
    }
}
