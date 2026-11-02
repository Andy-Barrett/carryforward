import Foundation

struct EndpointPolicy {
    let origin: URL

    init(_ value: String, allowLoopbackHTTP: Bool) throws {
        guard let parts = URLComponents(string: value), let host = parts.host,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/", let port = parts.port, (1024...65535).contains(port),
              let url = parts.url else { throw ConfigurationError.invalidOrigin }
        let octets = host.split(separator: ".").compactMap { UInt8($0) }
        let canonical = octets.count == 4 && octets.map(String.init).joined(separator: ".") == host
        let privateIP = canonical && (octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && (16...31).contains(octets[1])))
        guard (parts.scheme == "http" && host == "127.0.0.1" && allowLoopbackHTTP) || (parts.scheme == "https" && privateIP) else { throw ConfigurationError.invalidOrigin }
        origin = url
    }

    func allows(_ url: URL) -> Bool {
        guard url.absoluteString.count <= 4096 else { return false }
        if url.scheme == "blob" {
            guard let inner = URL(string: String(url.absoluteString.dropFirst(5))), inner.scheme != "blob" else { return false }
            return matchesOrigin(inner)
        }
        return matchesOrigin(url)
    }

    // Only explicitly tapped customer links may leave the visit. This does not
    // admit those destinations as app origins, downloads or credential recipients.
    func allowsContactAction(_ url: URL) -> Bool {
        guard url.absoluteString.count <= 2048, url.user == nil, url.password == nil,
              url.fragment == nil, url.port == nil else { return false }
        if url.scheme == "tel" || url.scheme == "sms" {
            guard url.host == nil, url.query == nil else { return false }
            let number = url.path
            return number.range(of: "^\\+?[0-9]{7,15}$", options: .regularExpression) != nil
        }
        guard url.scheme == "https", url.host == "maps.apple.com", url.path == "/",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              items.count == 1, items[0].name == "q", let address = items[0].value,
              !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, address.count <= 300 else { return false }
        return true
    }

    private func matchesOrigin(_ url: URL) -> Bool {
        return url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port && url.user == nil && url.password == nil
    }

    enum ConfigurationError: LocalizedError {
        case invalidOrigin
        var errorDescription: String? { "Configure one private HTTPS origin. Simulator builds may use http://127.0.0.1 with an explicit port. No public host or fallback route is enabled." }
    }
}
