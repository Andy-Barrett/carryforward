import Foundation
import CoreLocation
import UserNotifications
import WebKit
import UIKit

// The web bridge never supplies company identity, role, coordinates or report
// state. Every synchronization reads an authenticated server snapshot using the
// current WK cookie jar. Only the candidate /pilot surface enables this bridge.
@MainActor
final class DepartureReminders: NSObject, WKScriptMessageHandler, @preconcurrency CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
    weak var webView: WKWebView?
    weak var presenter: UIViewController?
    var policy: EndpointPolicy?
    var beforeAccountChange: (() -> Void)?
    private let manager = CLLocationManager()
    private let center = UNUserNotificationCenter.current()
    private var snapshot: Snapshot?
    private var optedIn = UserDefaults.standard.bool(forKey: "cf.departure.optIn")
    private var optInAccount = UserDefaults.standard.string(forKey: "cf.departure.account")
    private var generation = 0
    private var requestingFix = false
    private var insideSince: [String: Date] = [:]
    private var scheduled: Set<String> = []
    private var completed = Set(UserDefaults.standard.stringArray(forKey: "cf.departure.completed") ?? [])
    private var snoozes: [String: Date] = [:]
    private var snoozedRevisions = UserDefaults.standard.dictionary(forKey: "cf.departure.snoozed") as? [String: Double] ?? [:]
    #if DEBUG && targetEnvironment(simulator)
    private var diagnostics: [[String: Any]] = []
    #endif
    private var muted = Set(UserDefaults.standard.stringArray(forKey: "cf.departure.muted") ?? [])
    private var expiryTask: Task<Void, Never>?
    private var fixTask: Task<Void, Never>?
    private var fetchedAt: Date?
    private var currentScope: String?

    struct Region: Decodable { let latitude: Double; let longitude: Double; let radius: Double }
    struct Scope: Decodable { let companyId: String; let userId: String; let jobId: String; let visitId: String; let assignmentRevision: String }
    struct Reminder: Decodable {
        let kind: String; let id: String; let region: Region?; let needed: Bool
        let muted: Bool; let dismissed: Bool; let snoozedUntil: Double
        let reason: String?; let items: [String]?; let message: String?
    }
    struct Snapshot: Decodable {
        let version: Int; let scope: Scope; let scopeKey: String; let expiresAt: Double
        let briefRevision: String; let reportRevision: String; let regionKey: String
        let overlap: Bool; let reminders: [Reminder]
    }
    struct Envelope: Decodable { let active: Snapshot? }
    private final class NoRedirect: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    }

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        center.delegate = self
        let actions = [
            UNNotificationAction(identifier: "CF_SNOOZE", title: "Snooze up to 15 minutes", options: []),
            UNNotificationAction(identifier: "CF_MUTE", title: "Mute this visit", options: []),
            UNNotificationAction(identifier: "CF_DISMISS", title: "Dismiss this revision", options: [])
        ]
        center.setNotificationCategories([UNNotificationCategory(identifier: "CF_DEPARTURE", actions: actions, intentIdentifiers: [], hiddenPreviewsBodyPlaceholder: "Open CarryForward when safely stopped.", options: .customDismissAction)])
        // Do not restore/arm a stale authorization snapshot on launch. Locally
        // retained notifications are removed until current server access passes.
        removeAll()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "carryForwardReminders", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, policy?.allows(url) == true,
              url.path == "/pilot" || url.path.hasPrefix("/pilot/"),
              let body = message.body as? [String: Any], let op = body["op"] as? String else { return }
        switch op {
        case "enable": explainAndEnable()
        case "disable": optedIn = false; UserDefaults.standard.set(false, forKey: "cf.departure.optIn"); cancel(reason: "disabled")
        case "logout": accountEnded()
        case "sync": Task { await synchronize() }
        default: break
        }
    }

    func accountEnded() {
        generation += 1; beforeAccountChange?(); optedIn = false
        UserDefaults.standard.set(false, forKey: "cf.departure.optIn")
        currentScope = nil; completed = []; snoozes = [:]; snoozedRevisions = [:]; muted = []; optInAccount = nil
        UserDefaults.standard.removeObject(forKey: "cf.departure.account"); persistActions()
        cancel(reason: "signed_out")
    }

    func becameActive() {
        // Also observes permission revocation. No permission request, location
        // sample, microphone or automatic report replay is initiated here.
        Task { await synchronize(requestFix: false) }
    }

    private func explainAndEnable() {
        guard let presenter = presenter ?? webView?.window?.rootViewController, presenter.presentedViewController == nil else { emit("manual", reason: "Open CarryForward while parked to enable reminders."); return }
        let alert = UIAlertController(title: "Departure reminders", message: "Use your location only to set a shop or active-job exit reminder. Notifications are a backup and may arrive after departure. No travel history is saved or sent. Review packing and Finish visit before moving. Always stop safely before opening a reminder. Manual checklists work without permissions.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Keep manual only", style: .cancel))
        alert.addAction(UIAlertAction(title: "Enable reminders", style: .default) { [weak self] _ in
            guard let self else { return }
            self.optedIn = true; UserDefaults.standard.set(true, forKey: "cf.departure.optIn")
            self.center.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    guard granted else { self.cancel(reason: "Notifications unavailable; use Ready to leave and Finish visit."); return }
                    if self.manager.authorizationStatus == .notDetermined { self.manager.requestWhenInUseAuthorization() }
                    else { await self.synchronize() }
                }
            }
        })
        presenter.present(alert, animated: true)
    }

    @discardableResult
    private func synchronize(requestFix: Bool = true) async -> Bool {
        guard let webView, let policy, let currentURL = webView.url, policy.allows(currentURL), currentURL.path == "/pilot" || currentURL.path.hasPrefix("/pilot/") else { cancel(reason: "inactive_surface"); return false }
        generation += 1
        let token = generation
        do {
            let cookies = await webView.configuration.websiteDataStore.httpCookieStore.allCookies()
            guard token == generation else { return false }
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = nil; configuration.urlCache = nil
            configuration.timeoutIntervalForRequest = 12
            let session = URLSession(configuration: configuration, delegate: NoRedirect(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let url = policy.origin.appendingPathComponent("pilot/api/reminders/native-state")
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue(policy.origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
            let eligible = cookies.filter { cookie in
                let host = policy.origin.host ?? ""
                return host == cookie.domain || ".\(host)" == cookie.domain
            }
            request.allHTTPHeaderFields = request.allHTTPHeaderFields ?? [:]
            for (key, value) in HTTPCookie.requestHeaderFields(with: eligible) { request.setValue(value, forHTTPHeaderField: key) }
            let (data, response) = try await session.data(for: request)
            guard token == generation else { return false }
            guard let response = response as? HTTPURLResponse, response.statusCode == 200,
                  response.url == url, data.count <= 131_072,
                  response.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("application/json") == true else {
                cancel(reason: "access_requires_revalidation"); return false
            }
            let next = try JSONDecoder().decode(Envelope.self, from: data).active
            guard let next, valid(next) else { cancel(reason: "No active assigned visit; manual controls remain available."); return false }
            let account = next.scope.companyId + "|" + next.scope.userId
            if optInAccount != nil && optInAccount != account { optedIn = false; UserDefaults.standard.set(false, forKey: "cf.departure.optIn") }
            optInAccount = account; UserDefaults.standard.set(account, forKey: "cf.departure.account")
            if currentScope != nil && currentScope != next.scopeKey {
                removeAll(); snoozes = [:]; insideSince = [:]
                // An account change never inherits another account's opt-in.
                if let previous = snapshot, previous.scope.companyId != next.scope.companyId || previous.scope.userId != next.scope.userId {
                    optedIn = false; UserDefaults.standard.set(false, forKey: "cf.departure.optIn")
                }
            }
            if snapshot?.regionKey != next.regionKey { insideSince = [:] }
            currentScope = next.scopeKey; snapshot = next; fetchedAt = Date()
            let delivered = await center.deliveredNotifications()
            guard token == generation else { return false }
            for notification in delivered where next.reminders.contains(where: { $0.id == notification.request.identifier }) { completed.insert(notification.request.identifier) }
            persistActions()
            await removeObsolete(next, generation: token)
            guard token == generation else { return false }
            expiryTask?.cancel()
            expiryTask = Task { [weak self] in
                let delay = max(0, next.expiresAt / 1000 - Date().timeIntervalSince1970)
                try? await Task.sleep(for: .seconds(delay))
                guard !Task.isCancelled, self?.generation == token else { return }
                self?.cancel(reason: "access_lease_expired")
            }
            let settings = await center.notificationSettings()
            guard token == generation, valid(next) else { return false }
            guard optedIn, settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { removeAll(); insideSince = [:]; emit("manual", reason: "Reminders are off; use Ready to leave and Finish visit."); return true }
            guard manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways,
                  manager.accuracyAuthorization == .fullAccuracy else { removeAll(); insideSince = [:]; emit("manual", reason: "Precise location unavailable; manual checklists remain available."); return true }
            guard !next.overlap else { removeAll(); emit("manual", reason: "Shop and site overlap. Use manual departure checks until locations are clarified."); return true }
            for reminder in next.reminders where reminder.needed && !reminder.muted && !reminder.dismissed {
                if let due = snoozedRevisions[reminder.id], due > Date().timeIntervalSince1970 { await scheduleSnooze(reminder, snapshot: next, due: due) }
            }
            if requestFix {
                requestingFix = true; manager.requestLocation()
            } else { emit("ready", reason: "Current access revalidated. Open departure controls to arm from a fresh inside location.") }
            return true
        } catch {
            guard token == generation else { return false }
            // Cannot prove a current grant while offline: fail closed for new
            // reminders. Unsynced web work stays in its user/company partition.
            cancel(reason: "offline_revalidate_before_arming"); return false
        }
    }

    private func valid(_ value: Snapshot) -> Bool {
        let now = Date().timeIntervalSince1970 * 1000
        let fields = [value.scope.companyId, value.scope.userId, value.scope.jobId, value.scope.visitId, value.scope.assignmentRevision, value.scopeKey, value.briefRevision, value.reportRevision]
        guard value.version == 1, fields.allSatisfy({ !$0.isEmpty && $0.count <= 200 }), value.scopeKey.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil,
              value.expiresAt > now, value.expiresAt <= now + 4 * 60 * 60 * 1000 + 10_000,
              value.reminders.count <= 2, Set(value.reminders.map(\.kind)).count == value.reminders.count else { return false }
        return value.reminders.allSatisfy { reminder in
            guard ["shop", "site"].contains(reminder.kind), reminder.id.range(of: "^cf-reminder-[0-9a-f]{32}$", options: .regularExpression) != nil else { return false }
            guard let region = reminder.region else { return true }
            return region.latitude.isFinite && region.longitude.isFinite && abs(region.latitude) <= 90 && abs(region.longitude) <= 180 && (100...1000).contains(region.radius)
        }
    }

    private func removeObsolete(_ next: Snapshot, generation token: Int) async {
        let keep = Set(next.reminders.filter { $0.needed && !$0.muted && !$0.dismissed }.map(\.id))
        let requests = await center.pendingNotificationRequests()
        guard token == generation else { return }
        let obsolete = requests.filter { $0.identifier.hasPrefix("cf-reminder-") && !keep.contains($0.identifier) }.map(\.identifier)
        center.removePendingNotificationRequests(withIdentifiers: obsolete)
        center.removeDeliveredNotifications(withIdentifiers: obsolete)
        scheduled.formIntersection(keep)
    }

    private func arm(_ location: CLLocation) async {
        guard let snapshot, let fetchedAt, Date().timeIntervalSince(fetchedAt) < 30,
              location.horizontalAccuracy >= 0, location.horizontalAccuracy <= 65,
              abs(location.timestamp.timeIntervalSinceNow) < 20,
              snapshot.expiresAt > Date().timeIntervalSince1970 * 1000 else { emit("manual", reason: "Location is stale or too approximate. Use manual departure checks."); return }
        let token = generation
        var count = 0
        for reminder in snapshot.reminders {
            guard reminder.needed, !reminder.muted, !reminder.dismissed, !completed.contains(reminder.id), !muted.contains(snapshot.scopeKey + ":" + reminder.kind), !scheduled.contains(reminder.id),
                  max(reminder.snoozedUntil / 1000, snoozes[reminder.kind]?.timeIntervalSince1970 ?? 0) <= Date().timeIntervalSince1970,
                  let region = reminder.region else { continue }
            let target = CLLocation(latitude: region.latitude, longitude: region.longitude)
            // A conservative interior margin prevents an initial outside/edge
            // sample from arming. The OS handles exit heuristics after this fix.
            let inside = location.distance(from: target) + location.horizontalAccuracy + 25 < region.radius
            recordDiagnostic("location", reason: inside ? "inside_" + reminder.kind : "outside_" + reminder.kind)
            guard inside else { insideSince.removeValue(forKey: reminder.kind); continue }
            if insideSince[reminder.kind] == nil { insideSince[reminder.kind] = Date() }
            guard Date().timeIntervalSince(insideSince[reminder.kind]!) >= 30 else {
                // One delayed verification; no continuous tracking/travel log.
                fixTask?.cancel()
                fixTask = Task { [weak self] in
                    try? await Task.sleep(for: .seconds(31))
                    guard !Task.isCancelled else { return }
                    _ = await self?.synchronize()
                }
                continue
            }
            let fence = CLCircularRegion(center: target.coordinate, radius: region.radius, identifier: reminder.id)
            fence.notifyOnEntry = false; fence.notifyOnExit = true
            let content = notificationContent(reminder, snapshot: snapshot)
            do {
                try await center.add(UNNotificationRequest(identifier: reminder.id, content: content, trigger: UNLocationNotificationTrigger(region: fence, repeats: false)))
                guard token == generation else {
                    center.removePendingNotificationRequests(withIdentifiers: [reminder.id]); return
                }
                scheduled.insert(reminder.id); count += 1
            } catch { emit("manual", reason: "iOS could not schedule a location reminder. Manual controls remain available.") }
        }
        emit(count > 0 || !scheduled.isEmpty ? "armed" : "manual", reason: count > 0 || !scheduled.isEmpty ? "Exit backup armed after a fresh inside check; timing is controlled by iOS." : "Use manual checks, or open this screen while inside the configured shop/site.")
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard optedIn else { return }
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways { Task { await synchronize() } }
        else if manager.authorizationStatus != .notDetermined { cancel(reason: "Location permission unavailable; use manual departure checks.") }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard requestingFix else { return }; requestingFix = false
        if let location = locations.last { Task { await arm(location) } }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { requestingFix = false; emit("manual", reason: "Location unavailable; use Ready to leave and Finish visit.") }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        Task { @MainActor [weak self] in
            guard let self else { completionHandler([]); return }
            let id = notification.request.identifier
            let valid = await self.synchronize(requestFix: false)
            guard valid, self.snapshot?.reminders.contains(where: { $0.id == id && $0.needed && !$0.muted && !$0.dismissed }) == true else { completionHandler([]); return }
            self.completed.insert(id); self.scheduled.remove(id); self.persistActions(); self.recordDiagnostic("delivered", reason: "validated_current_revision")
            completionHandler([.banner, .list, .sound])
        }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        Task { @MainActor [weak self] in
            defer { completionHandler() }
            guard let self else { return }
            let id = response.notification.request.identifier
            // A stale tap never grants access or sends a report.
            guard await self.synchronize(requestFix: false), let snapshot = self.snapshot,
                  response.notification.request.content.userInfo["scopeKey"] as? String == snapshot.scopeKey,
                  let reminder = snapshot.reminders.first(where: { $0.id == id && $0.needed && !$0.dismissed && !$0.muted }) else { self.emit("stale", reason: "This reminder changed or access ended. Open your current assignments."); return }
            self.scheduled.remove(id)
            switch response.actionIdentifier {
            case "CF_SNOOZE": self.snoozes[reminder.kind] = Date().addingTimeInterval(15 * 60); self.snoozedRevisions[id] = Date().timeIntervalSince1970 + 15 * 60
            case "CF_MUTE": self.muted.insert(snapshot.scopeKey + ":" + reminder.kind)
            case "CF_DISMISS", UNNotificationDismissActionIdentifier: self.completed.insert(id)
            default: self.completed.insert(id); self.emit("open", reason: reminder.kind, reminderId: id)
            }
            self.persistActions()
            self.center.removePendingNotificationRequests(withIdentifiers: [id])
            self.center.removeDeliveredNotifications(withIdentifiers: [id])
            if response.actionIdentifier == "CF_SNOOZE", let due = self.snoozedRevisions[id] { await self.scheduleSnooze(reminder, snapshot: snapshot, due: due) }
        }
    }

    private func notificationContent(_ reminder: Reminder, snapshot: Snapshot) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = "CarryForward departure check"
        // Include bounded equipment labels only; the native grant has no
        // customer identity, address, gate code or contact fields. Admins must
        // keep these checklist labels about equipment, never access secrets.
        let items = (reminder.items ?? []).prefix(3).map { String($0.prefix(45)) }.joined(separator: "; ")
        let packing = items.isEmpty ? "Your departure brief needs review." : "Before you leave: " + items + "."
        if reminder.reason == "day_review_required" {
            content.body = "Your day plan needs review. Open when safely stopped."
        } else if reminder.reason == "next_stop_preparation" {
            content.body = "Check required equipment for your next stop. Open when safely stopped."
        } else {
            content.body = reminder.kind == "shop" ? packing + " Open when safely stopped." : (reminder.reason == "confirmed_unsent" ? "Your confirmed report is waiting to send. Open when safely stopped." : "Your visit report needs attention. Open when safely stopped.")
        }
        content.sound = .default; content.categoryIdentifier = "CF_DEPARTURE"; content.threadIdentifier = "cf-departure"
        content.userInfo = ["scopeKey": snapshot.scopeKey, "reminderId": reminder.id, "kind": reminder.kind, "briefRevision": snapshot.briefRevision, "reportRevision": snapshot.reportRevision]
        return content
    }
    private func scheduleSnooze(_ reminder: Reminder, snapshot: Snapshot, due: Double) async {
        guard !muted.contains(snapshot.scopeKey + ":" + reminder.kind) else { return }
        // Never outlive the authenticated lease. A new 15-minute lease is
        // fetched just before this action; reserve one second for clock work.
        let boundedDue = min(due, snapshot.expiresAt / 1000 - 1)
        guard boundedDue > Date().timeIntervalSince1970 + 1 else { return }
        let delay = boundedDue - Date().timeIntervalSince1970
        let token = generation
        do {
            try await center.add(UNNotificationRequest(identifier: reminder.id, content: notificationContent(reminder, snapshot: snapshot), trigger: UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)))
            guard token == generation else {
                center.removePendingNotificationRequests(withIdentifiers: [reminder.id]); return
            }
            scheduled.insert(reminder.id); recordDiagnostic("snoozed", reason: reminder.kind)
        }
        catch { emit("manual", reason: "Snooze unavailable; use the manual departure check.") }
    }
    private func recordDiagnostic(_ status: String, reason: String) {
        #if DEBUG && targetEnvironment(simulator)
        diagnostics.append(["at": ISO8601DateFormatter().string(from: Date()), "status": status, "reason": reason, "scopeKey": snapshot?.scopeKey ?? "none", "scheduledIds": Array(scheduled).sorted()])
        diagnostics = Array(diagnostics.suffix(60))
        if let data = try? JSONSerialization.data(withJSONObject: diagnostics, options: [.prettyPrinted, .sortedKeys]), let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try? data.write(to: url.appendingPathComponent("reminder-simulator-diagnostics.json"), options: .atomic)
        }
        #endif
    }
    private func persistActions() {
        // Only opaque revision IDs and scoped mute choices, not coordinates or
        // a travel history. Bound old IDs so this local ledger cannot grow.
        completed = Set(completed.sorted().suffix(200))
        muted = Set(muted.sorted().suffix(100))
        UserDefaults.standard.set(Array(completed), forKey: "cf.departure.completed")
        UserDefaults.standard.set(Array(muted), forKey: "cf.departure.muted")
        snoozedRevisions = Dictionary(uniqueKeysWithValues: snoozedRevisions.filter { $0.value > Date().timeIntervalSince1970 }.sorted { $0.value > $1.value }.prefix(100).map { ($0.key, $0.value) })
        UserDefaults.standard.set(snoozedRevisions, forKey: "cf.departure.snoozed")
    }
    private func removeAll() {
        let notificationCenter = center
        Task {
            let requests = await notificationCenter.pendingNotificationRequests()
            notificationCenter.removePendingNotificationRequests(withIdentifiers: requests.filter { $0.identifier.hasPrefix("cf-reminder-") }.map(\.identifier))
            let delivered = await notificationCenter.deliveredNotifications()
            notificationCenter.removeDeliveredNotifications(withIdentifiers: delivered.filter { $0.request.identifier.hasPrefix("cf-reminder-") }.map { $0.request.identifier })
        }
        scheduled = []
    }
    private func cancel(reason: String) {
        generation += 1
        fixTask?.cancel(); expiryTask?.cancel(); requestingFix = false
        manager.stopUpdatingLocation(); removeAll(); snapshot = nil; fetchedAt = nil; insideSince = [:]
        emit("manual", reason: reason)
    }
    private func emit(_ status: String, reason: String, reminderId: String? = nil) {
        recordDiagnostic(status, reason: reason)
        guard let webView, let url = webView.url, policy?.allows(url) == true else { return }
        var value: [String: String] = ["status": status, "reason": reason]
        if let reminderId { value["reminderId"] = reminderId }
        guard let data = try? JSONSerialization.data(withJSONObject: value), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('carryforward-reminders',{detail:\(json)}))", completionHandler: nil)
    }
}

private extension WKHTTPCookieStore {
    func allCookies() async -> [HTTPCookie] { await withCheckedContinuation { continuation in getAllCookies { continuation.resume(returning: $0) } } }
}
