import Foundation

@main
struct EndpointPolicyChecks {
    static func main() throws {
        let simulator = try EndpointPolicy("http://127.0.0.1:4350/", allowLoopbackHTTP: true)
        precondition(simulator.allows(URL(string: "http://127.0.0.1:4350/api/config")!))
        precondition(simulator.allows(URL(string: "blob:http://127.0.0.1:4350/fixture")!))
        for url in ["http://127.0.0.1:4351/", "https://127.0.0.1:4350/", "https://example.com/", "file:///private/tmp/test", "javascript:alert(1)", "blob:https://other.example/file", "blob:blob:http://127.0.0.1:4350/file", "http://user:secret@127.0.0.1:4350/"] { precondition(!simulator.allows(URL(string: url)!)) }
        let phone = try EndpointPolicy("https://192.168.1.153:4316/", allowLoopbackHTTP: false)
        precondition(phone.allows(URL(string: "https://192.168.1.153:4316/pair")!))
        for value in ["http://127.0.0.1:4350/", "http://192.168.1.153:4316/", "https://example.com:4316/", "https://macbook-pro.local.evil.example:4316/", "https://a.b.local:4316/", "https://192.168.01.153:4316/", "https://192.168.1.153:4316/?key=secret", "https://user:secret@192.168.1.153:4316/", "https://192.168.1.153:4316/other", "https://192.168.1.153:4316/#token", "https://192.168.1.153:80/"] {
            do { _ = try EndpointPolicy(value, allowLoopbackHTTP: false); fatalError("Unexpected origin accepted: \(value)") } catch {}
        }
        let localMac = try EndpointPolicy("https://macbook-pro.local:4316/", allowLoopbackHTTP: false)
        precondition(localMac.allows(URL(string: "https://macbook-pro.local:4316/api/config")!))
        precondition(!localMac.allows(URL(string: "https://other-mac.local:4316/api/config")!))
        for value in ["tel:+15015550143", "sms:+15015550143", "https://maps.apple.com/?q=7%20Meadow%20Court"] {
            let url = URL(string: value)!
            precondition(phone.allowsContactAction(url) && !phone.allows(url))
        }
        for value in ["sms:+15015550143?body=automatically-send", "sms://elsewhere/15015550143", "tel:911", "tel:+15015550143,123", "tel:+15015550143?x=1", "tel://elsewhere/15015550143", "https://maps.apple.com.evil.example/?q=7", "http://maps.apple.com/?q=7", "https://user@maps.apple.com/?q=7", "https://maps.apple.com/?q=7&redirect=elsewhere", "https://maps.apple.com/?q=", "https://maps.apple.com/other?q=7"] {
            precondition(!phone.allowsContactAction(URL(string: value)!))
        }
        print("Endpoint policy checks passed: exact origin, same-origin blob export, private HTTPS, no public or insecure phone fallback.")
    }
}
