import Foundation
import AVFAudio

// PCM from the authenticated page only. The player owns one utterance; a new
// identity discards every queued buffer and every late completion callback.
@MainActor
final class PCMReplyQueue {
    struct Identity: Equatable { let id: String; let jobId: String; let turnId: String }
    var onState: ((Identity, String) -> Void)?
    var mayDeactivate: (() -> Bool)?
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let tempo = AVAudioUnitTimePitch()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!
    private var identity: Identity?
    private var generation = 0
    private var sequence = 0
    private var pending = 0
    private var totalBytes = 0
    private var ended = false
    private var started = false
    private var deadline: Task<Void, Never>?
    private let manualRendering: Bool

    init(manualRendering: Bool = false) throws {
        self.manualRendering = manualRendering
        engine.attach(player); engine.attach(tempo)
        engine.connect(player, to: tempo, format: format)
        engine.connect(tempo, to: engine.mainMixerNode, format: format)
        if manualRendering { try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096) }
        #if os(iOS)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        #endif
    }
    deinit { NotificationCenter.default.removeObserver(self) }

    func begin(_ value: Identity, playbackRate: Float = 1) throws {
        guard playbackRate == 1 || playbackRate == 1.15 || playbackRate == 1.4 else { throw QueueError.invalidChunk }
        stop(); tempo.rate = playbackRate
        identity = value; sequence = 0; pending = 0; totalBytes = 0; ended = false; started = false
        do {
            #if os(iOS)
            if !manualRendering {
                let audio = AVAudioSession.sharedInstance()
                try audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                try audio.setActive(true)
            }
            #endif
            engine.prepare(); try engine.start()
            let currentGeneration = generation
            deadline = Task { [weak self] in
                try? await Task.sleep(for: .seconds(95))
                guard !Task.isCancelled, let self, self.generation == currentGeneration else { return }
                self.finishState("error")
            }
        } catch { finishState("error"); throw error }
    }
    func append(_ value: Identity, sequence number: Int, bytes: Data) throws {
        guard identity == value else { return } // A cancelled turn may still be in transit.
        guard !ended, number == sequence, !bytes.isEmpty, bytes.count % 2 == 0, bytes.count <= 16384, totalBytes + bytes.count <= 4_320_000,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(bytes.count / 2)), let samples = buffer.floatChannelData?[0] else {
            finishState("error"); throw QueueError.invalidChunk
        }
        buffer.frameLength = buffer.frameCapacity
        bytes.withUnsafeBytes { raw in
            for i in 0..<Int(buffer.frameLength) { samples[i] = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: i * 2, as: Int16.self))) / 32768 }
        }
        sequence += 1; totalBytes += bytes.count; pending += 1
        let currentGeneration = generation
        // Offline rendering has no output device. Device completion waits for
        // playback; quiet validation completes when the software renderer consumes it.
        player.scheduleBuffer(buffer, completionCallbackType: manualRendering ? .dataConsumed : .dataPlayedBack) { [weak self] _ in
            Task { @MainActor [weak self] in self?.bufferFinished(currentGeneration) }
        }
        if !started { started = true; player.play(); onState?(value, "playing") }
    }
    func end(_ value: Identity) {
        guard identity == value else { return }
        guard totalBytes > 0 else { finishState("error"); return }
        ended = true
        if pending == 0 { finishState("ready") }
    }
    private func bufferFinished(_ expected: Int) {
        guard expected == generation, identity != nil else { return }
        pending = max(0, pending - 1)
        if ended && pending == 0 { finishState("ready") }
    }
    func stop(_ value: Identity) { if identity == value { finishState(nil) } }
    func stop() { finishState(nil) }
    private func finishState(_ state: String?) {
        let prior = identity
        identity = nil; generation += 1; deadline?.cancel(); deadline = nil
        player.stop(); engine.stop(); pending = 0
        #if os(iOS)
        if prior != nil && !manualRendering && mayDeactivate?() != false {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        #endif
        if let prior, let state { onState?(prior, state) }
    }
    // Software-only rendering used by the quiet validation executable. It never
    // enables the system output device and cannot be selected by page messages.
    func renderOffline(_ frames: AVAudioFrameCount) throws -> AVAudioPCMBuffer {
        guard manualRendering, frames <= 4096,
              let result = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: frames) else { throw QueueError.invalidChunk }
        let status = try engine.renderOffline(frames, to: result)
        guard status == .success else { throw QueueError.renderUnavailable }
        return result
    }
    #if os(iOS)
    @objc private nonisolated func interrupted(_ notification: Notification) {
        guard notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.began.rawValue else { return }
        Task { @MainActor [weak self] in self?.finishState("error") }
    }
    @objc private nonisolated func routeChanged(_ notification: Notification) {
        guard notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }
        Task { @MainActor [weak self] in self?.finishState("error") }
    }
    #endif
    enum QueueError: Error { case invalidChunk, renderUnavailable }
}
