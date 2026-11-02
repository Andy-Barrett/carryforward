import Foundation
import Security

// This development credential is provisioned once over the existing USB link.
// It belongs only to this app and exact HTTPS origin, never to page JavaScript.
final class PhoneConnection: NSObject, URLSessionTaskDelegate {
    private let policy: EndpointPolicy
    private let service = "com.andybarrett.carryforward.development.connection"
    init(policy: EndpointPolicy) { self.policy = policy }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: policy.origin.absoluteString]
    }
    func credential() throws -> String? {
        guard policy.origin.scheme == "https" else { return nil }
        #if DEBUG
        if let supplied = ProcessInfo.processInfo.environment["CARRYFORWARD_PHONE_CONNECTION"],
           Self.validCredential(supplied) {
            let data = Data(supplied.utf8)
            let attributes: [String: Any] = [kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
            let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
            if updated == errSecItemNotFound {
                var addition = query
                addition.merge(attributes) { _, new in new }
                guard SecItemAdd(addition as CFDictionary, nil) == errSecSuccess else { throw ConnectionError.storage }
            } else if updated != errSecSuccess { throw ConnectionError.storage }
            return supplied
        }
        #endif
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let code = String(data: data, encoding: .utf8), Self.validCredential(code) else { throw ConnectionError.storage }
        return code
    }
    static func validCredential(_ code: String) -> Bool {
        code.utf8.count == 32 && code.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }
    static func pairingRequest(policy: EndpointPolicy, code: String) throws -> URLRequest {
        guard policy.origin.scheme == "https", validCredential(code) else { throw ConnectionError.configuration }
        var request = URLRequest(url: policy.origin.appendingPathComponent("pair"), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("https://\(policy.origin.host!):\(policy.origin.port!)", forHTTPHeaderField: "Origin")
        request.httpBody = Data("code=\(code)".utf8)
        request.httpShouldHandleCookies = false
        return request
    }
    static func sessionCookie(response: HTTPURLResponse, policy: EndpointPolicy) throws -> HTTPCookie {
        guard let url = response.url, policy.allows(url), url.path == "/pair", response.statusCode == 303,
              response.value(forHTTPHeaderField: "Location") == "/",
              let header = response.value(forHTTPHeaderField: "Set-Cookie") else { throw ConnectionError.authentication }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: url)
        guard cookies.count == 1, let cookie = cookies.first, cookie.name == "carryforward_session",
              cookie.domain == policy.origin.host, cookie.path == "/", cookie.isSecure, cookie.isHTTPOnly,
              cookie.value.utf8.count == 64, cookie.value.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else { throw ConnectionError.authentication }
        return cookie
    }
    func signIn(code: String) async throws -> HTTPCookie {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.timeoutIntervalForResource = 6
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (_, response) = try await session.data(for: Self.pairingRequest(policy: policy, code: code))
        guard let response = response as? HTTPURLResponse else { throw ConnectionError.authentication }
        return try Self.sessionCookie(response: response, policy: policy)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil) // Inspect the 303; never forward the credential or follow another host.
    }
    enum ConnectionError: LocalizedError {
        case storage, configuration, authentication
        var errorDescription: String? {
            switch self {
            case .storage: return "Unlock your iPhone, then reconnect. The saved connection could not be opened."
            case .configuration: return "This development connection needs setup on the Mac."
            case .authentication: return "The Mac did not accept this saved connection. Reconnect after checking the development server."
            }
        }
    }
}
