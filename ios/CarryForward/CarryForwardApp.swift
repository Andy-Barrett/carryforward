import SwiftUI

@main
struct CarryForwardApp: App {
    @StateObject private var browser = VisitBrowser()
    @State private var showConnection = false
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            ZStack {
                Color(red: 10/255, green: 15/255, blue: 31/255).ignoresSafeArea()
                VStack(spacing: 0) {
                    if browser.showingPilotSource {
                        HStack { Button("Back to CarryForward", systemImage: "chevron.left") { browser.returnFromPilotSource() }; Spacer() }.padding().background(.thinMaterial)
                    }
                    if let issue = browser.connectionError {
                        HStack {
                            Text(issue).font(.callout)
                            Spacer()
                            Button("Connection details", systemImage: "info.circle") { showConnection = true }.labelStyle(.iconOnly)
                            Button("Reconnect", systemImage: "arrow.clockwise") { browser.confirmReload() }.labelStyle(.iconOnly)
                        }.padding().background(.thinMaterial)
                    }
                    if let error = browser.configurationError {
                        ContentUnavailableView("Connection unavailable", systemImage: "network.slash", description: Text(error))
                    } else {
                        VisitWebView(browser: browser)
                    }
                }
            }
            .preferredColorScheme(.dark)
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
                if next == .active { browser.remindersBecameActive() }
                // Activation deliberately does not reload, start capture or retry a request.
            }
        }
    }
}
