import Foundation
import AVFAudio

@main struct SpeechRenderChecks {
    @MainActor static func main() async throws {
        let format = AVAudioFormat(standardFormatWithSampleRate: 22050, channels: 1)!
        let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 22050)!
        pcm.frameLength = 22050
        for i in 0..<22050 { pcm.floatChannelData![0][i] = Float(sin(Double(i) * 0.1) * 0.4) }
        let end = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1)!
        end.frameLength = 0
        let collector = SpeechPCMCollector()
        precondition(collector.consume(pcm) == nil)
        let clip = try collector.consume(end)!.get()
        precondition(clip.frames == 22050 && clip.duration == 1 && clip.peak > 0.39)
        precondition(clip.wav.prefix(4) == Data("RIFF".utf8) && clip.wav.count == 44144)
        precondition(collector.consume(end) == nil) // terminal callback is single-use
        let cancelled = SpeechPCMCollector()
        precondition(cancelled.consume(pcm) == nil); cancelled.cancel()
        precondition(cancelled.consume(end) == nil) // stale completion after stop
        let empty = SpeechPCMCollector()
        if case .failure? = empty.consume(end) {} else { preconditionFailure("Empty audio admitted") }
        let long = SpeechPCMCollector()
        for _ in 0..<180 { precondition(long.consume(pcm) == nil) }
        if case .failure? = long.consume(pcm) {} else { preconditionFailure("Duration bound missing") }
        let renderer = CheckRenderer()
        for text in ["Demo first reply. The visit stays open.", "Demo second reply. Monitoring is separate from production."] {
            let result = try await renderer.render(text)
            precondition(result.frames > 1000 && result.peak > 0.001 && result.duration < 30)
            let player = try AVAudioPlayer(data: result.wav, fileTypeHint: "wav")
            precondition(player.duration > 0 && abs(player.duration - result.duration) < 0.1)
            print("Rendered local reply: \(result.frames) frames, \(result.duration) seconds; WAV decodes. No playback.")
        }
        print("Speech render bounds, cancellation, two actual Apple renders and WAV decoding passed. Hardware playback not tested.")
    }
}
@MainActor private final class CheckRenderer {
    var synth: AVSpeechSynthesizer?
    func render(_ text: String) async throws -> RenderedSpeech {
        let synth = AVSpeechSynthesizer(), collector = SpeechPCMCollector()
        #if os(iOS)
        synth.usesApplicationAudioSession = false
        #endif
        self.synth = synth
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US"); utterance.rate = 0.60
        let rendered: RenderedSpeech = try await withCheckedThrowingContinuation { continuation in
            synth.write(utterance) { buffer in
                if let result = collector.consume(buffer) { continuation.resume(with: result) }
            }
        }
        self.synth = nil; return rendered
    }
}
