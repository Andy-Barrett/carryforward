import Foundation
import AVFAudio

@main
struct PCMReplyQueueChecks {
    @MainActor static func main() async throws {
        let queue = try PCMReplyQueue(manualRendering: true)
        var states: [(String,String)] = []
        queue.onState = { identity, state in states.append((identity.id,state)) }
        let old = PCMReplyQueue.Identity(id:UUID().uuidString,jobId:"DEMO-QUIET-A",turnId:"turn-a")
        let next = PCMReplyQueue.Identity(id:UUID().uuidString,jobId:"DEMO-QUIET-B",turnId:"turn-b")
        var samples = Data()
        for i in 0..<8192 { var value = Int16(sin(Double(i)*0.1)*12000).littleEndian; withUnsafeBytes(of:&value) { samples.append(contentsOf:$0) } }
        try queue.begin(old, playbackRate: 1.4)
        try queue.append(old,sequence:0,bytes:samples.prefix(8192))
        let rendered = try queue.renderOffline(2048)
        precondition(rendered.frameLength > 0)
        precondition((0..<Int(rendered.frameLength)).contains { abs(rendered.floatChannelData![0][$0]) > 0.01 })
        queue.stop()
        try queue.begin(next)
        try queue.append(old,sequence:1,bytes:samples.prefix(4096))
        queue.stop(old) // a late stop must not affect the new identity
        try queue.append(next,sequence:0,bytes:samples.prefix(8192))
        queue.end(next)
        _ = try queue.renderOffline(4096)
        for _ in 0..<3 { if states.contains(where: { $0.0 == next.id && $0.1 == "ready" }) { break }; _ = try queue.renderOffline(4096); try? await Task.sleep(for: .milliseconds(10)) }
        precondition(states.contains { $0.0 == next.id && $0.1 == "ready" })
        precondition(states.filter { $0.1 == "playing" }.map { $0.0 } == [old.id,next.id])
        queue.stop()
        try queue.begin(old)
        do { try queue.append(old,sequence:1,bytes:samples.prefix(4096)); fatalError("Out-of-order PCM accepted") } catch {}
        precondition(states.last?.1 == "error")
        try queue.begin(next);queue.end(next)
        precondition(states.last?.1 == "error")
        queue.stop()
        print("Quiet PCM checks passed: actual software audio rendering, identity replacement, stale chunk/stop rejection, sequence bounds and empty-stream failure. No system output was enabled.")
    }
}
