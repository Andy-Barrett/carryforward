import Foundation

@main
struct PhoneConnectionChecks {
    static func rejects(_ action: () throws -> Void) {
        do { try action(); fatalError("An invalid connection was accepted") } catch { }
    }
    static func main() throws {
        let policy = try EndpointPolicy("https://192.168.1.10:4316/", allowLoopbackHTTP: false)
        let code = String(repeating: "a", count: 32)
        let request = try PhoneConnection.pairingRequest(policy: policy, code: code)
        precondition(request.url?.absoluteString == "https://192.168.1.10:4316/pair")
        precondition(request.httpMethod == "POST" && request.httpShouldHandleCookies == false)
        precondition(request.value(forHTTPHeaderField: "Origin") == "https://192.168.1.10:4316")
        precondition(request.httpBody == Data("code=\(code)".utf8))
        for bad in ["", String(repeating: "a", count: 31), String(repeating: "a", count: 33), String(repeating: "A", count: 32), String(repeating: "é", count: 32), code + "\n"] {
            rejects { _ = try PhoneConnection.pairingRequest(policy: policy, code: bad) }
        }
        let loopback = try EndpointPolicy("http://127.0.0.1:4350/", allowLoopbackHTTP: true)
        rejects { _ = try PhoneConnection.pairingRequest(policy: loopback, code: code) }
        let value = String(repeating: "b", count: 64)
        let header = "carryforward_session=\(value); HttpOnly; Secure; SameSite=Strict; Path=/"
        func response(_ url: String = "https://192.168.1.10:4316/pair", _ status: Int = 303, _ cookie: String = header, _ location: String = "/") -> HTTPURLResponse {
            HTTPURLResponse(url: URL(string: url)!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Set-Cookie": cookie, "Location": location])!
        }
        let admitted = try PhoneConnection.sessionCookie(response: response(), policy: policy)
        precondition(admitted.value == value)
        for bad in [response("https://192.168.1.11:4316/pair"), response("https://192.168.1.10:4317/pair"), response("https://192.168.1.10:4316/elsewhere"), response("https://192.168.1.10:4316/pair", 200), response("https://192.168.1.10:4316/pair", 303, header, "https://elsewhere.example/"), response("https://192.168.1.10:4316/pair", 303, header.replacingOccurrences(of: "; Secure", with: "")), response("https://192.168.1.10:4316/pair", 303, header.replacingOccurrences(of: "; HttpOnly", with: "")), response("https://192.168.1.10:4316/pair", 303, header.replacingOccurrences(of: value, with: "invalid"))] {
            rejects { _ = try PhoneConnection.sessionCookie(response: bad, policy: policy) }
        }
        // Authentication redirects are inspected, not followed or used to resend credentials.
        let connection = PhoneConnection(policy: policy)
        let session = URLSession(configuration: .ephemeral)
        let task = session.dataTask(with: URL(string: "https://192.168.1.10:4316/pair")!)
        connection.urlSession(session, task: task, willPerformHTTPRedirection: response(), newRequest: URLRequest(url: URL(string: "https://elsewhere.example/")!)) { redirected in
            precondition(redirected == nil)
        }
        task.cancel(); session.invalidateAndCancel()
        print("Phone connection request, cookie and redirect boundary checks passed; no Keychain or network access used.")
    }
}
