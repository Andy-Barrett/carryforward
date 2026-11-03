import Foundation
import AVFAudio

struct RenderedSpeech: Sendable {
    let wav: Data
    let frames: Int
    let sampleRate: Double
    let peak: Float
    var duration: Double { Double(frames) / sampleRate }
}

// The synthesizer's callback owns no UI or audio session. Copy each PCM buffer
// under one lock; one terminal callback yields one bounded, mono WAV in memory.
// No files, network calls or automatic retry are involved.
final class SpeechPCMCollector: @unchecked Sendable {
    enum Failure: Error { case invalidBuffer, tooLong, empty }
    private let lock = NSLock()
    private var samples = Data(), rate: Double?, frames = 0, peak: Float = 0
    private var ended = false
    func cancel() { lock.lock(); defer { lock.unlock() }; ended = true; samples.removeAll() }
    func consume(_ buffer: AVAudioBuffer) -> Result<RenderedSpeech, Error>? {
        lock.lock(); defer { lock.unlock() }
        guard !ended else { return nil }
        guard let pcm = buffer as? AVAudioPCMBuffer else { return fail(.invalidBuffer) }
        if pcm.frameLength == 0 {
            ended = true
            guard let rate, frames > 0, peak > 0.0001 else { samples.removeAll(); return .failure(Failure.empty) }
            var wav = Data("RIFF".utf8)
            append(UInt32(36 + samples.count), to: &wav); wav.append(Data("WAVEfmt ".utf8))
            append(UInt32(16), to: &wav); append(UInt16(1), to: &wav); append(UInt16(1), to: &wav)
            append(UInt32(rate), to: &wav); append(UInt32(rate * 2), to: &wav)
            append(UInt16(2), to: &wav); append(UInt16(16), to: &wav); wav.append(Data("data".utf8))
            append(UInt32(samples.count), to: &wav); wav.append(samples); samples.removeAll()
            return .success(RenderedSpeech(wav: wav, frames: frames, sampleRate: rate, peak: peak))
        }
        let sampleRate = pcm.format.sampleRate, channels = Int(pcm.format.channelCount), count = Int(pcm.frameLength)
        guard (16000...48000).contains(sampleRate), sampleRate.rounded() == sampleRate,
              channels == 1, let input = pcm.floatChannelData?[0], rate == nil || rate == sampleRate else { return fail(.invalidBuffer) }
        guard count <= 262144, Double(frames + count) / sampleRate <= 180,
              samples.count + count * 2 <= 17_280_000 else { return fail(.tooLong) }
        var chunk = Data(count: count * 2)
        chunk.withUnsafeMutableBytes { raw in
            let output = raw.bindMemory(to: Int16.self)
            for index in 0..<count {
                let value = input[index].isFinite ? max(-1, min(1, input[index])) : 0
                peak = max(peak, abs(value)); output[index] = Int16((value * 32767).rounded()).littleEndian
            }
        }
        rate = sampleRate; frames += count; samples.append(chunk); return nil
    }
    private func fail(_ error: Failure) -> Result<RenderedSpeech, Error> { ended = true; samples.removeAll(); return .failure(error) }
    private func append<T: FixedWidthInteger>(_ value: T, to data: inout Data) {
        var little = value.littleEndian; withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
    }
}
