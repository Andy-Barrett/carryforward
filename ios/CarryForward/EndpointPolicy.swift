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

    private func matchesOrigin(_ url: URL) -> Bool {
        return url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port && url.user == nil && url.password == nil
    }

    enum ConfigurationError: LocalizedError {
        case invalidOrigin
        var errorDescription: String? { "Configure one private HTTPS origin. Simulator builds may use http://127.0.0.1 with an explicit port. No public host or fallback route is enabled." }
    }
}
