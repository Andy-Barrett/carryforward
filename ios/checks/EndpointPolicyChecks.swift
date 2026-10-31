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
        for value in ["http://127.0.0.1:4350/", "http://192.168.1.153:4316/", "https://example.com:4316/", "https://192.168.01.153:4316/", "https://192.168.1.153:4316/?key=secret", "https://user:secret@192.168.1.153:4316/", "https://192.168.1.153:4316/other", "https://192.168.1.153:4316/#token", "https://192.168.1.153:80/"] {
            do { _ = try EndpointPolicy(value, allowLoopbackHTTP: false); fatalError("Unexpected origin accepted: \(value)") } catch {}
        }
        print("Endpoint policy checks passed: exact origin, same-origin blob export, private HTTPS, no public or insecure phone fallback.")
    }
}
