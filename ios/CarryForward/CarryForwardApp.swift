import SwiftUI

@main
struct CarryForwardApp: App {
    @StateObject private var browser = VisitBrowser()
    @State private var showConnection = false
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            VStack(spacing: 0) {
                HStack {
                    Text("CarryForward").font(.headline)
                    Spacer()
                    Button("Connection details", systemImage: "info.circle") { showConnection = true }.labelStyle(.iconOnly)
                    Button("Reconnect", systemImage: "arrow.clockwise") { browser.confirmReload() }.labelStyle(.iconOnly).accessibilityLabel("Reconnect to the same origin")
                }.padding(.horizontal, 16).padding(.vertical, 10).background(.thinMaterial)
                if let error = browser.configurationError {
                    ContentUnavailableView("Development origin required", systemImage: "network.slash", description: Text(error))
                } else {
                    VisitWebView(browser: browser)
                }
            }
            .sheet(isPresented: $showConnection) {
                NavigationStack {
                    Form {
                        Section("Development connection") { Text(browser.route).textSelection(.enabled); Text(browser.status) }
                    }.navigationTitle("Connection details").toolbar { Button("Done") { showConnection = false } }
                }
            }
            .task { browser.startOnce() }
            .onChange(of: phase) { _, next in
                if next == .background { browser.interruptCapture() }
                // Activation deliberately does not reload, start capture or retry a request.
            }
        }
    }
}
