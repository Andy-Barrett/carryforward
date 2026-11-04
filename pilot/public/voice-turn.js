/** A released, already-persisted clip is the only path to network transcription. */
export function createPilotVoiceTurn({
  request,
  ensure,
  saveTrace,
  applyAnswer,
  showHeard,
  showAnswer,
  speak,
  onUnavailable = () => {},
  stopSpeech = () => {},
  createTiming,
  resolveCommand = async () => null,
}) {
  let generation = 0,
    active = null;
  const valid = (id) => {
    ensure();
    if (id !== generation) throw Error("This voice turn was superseded.");
  };
  function cancel() {
    generation++;
    stopSpeech();
    const previous = active;
    active = null;
    if (previous?.ticket) {
      try {
        ensure();
        Promise.resolve(
          request("voice/cancel", { ticket: previous.ticket }),
        ).catch(() => {});
      } catch {
        /* Scope is closed; no request may use a later account. */
      }
    }
  }
  async function complete(clip, { release, timing: providedTiming } = {}) {
    cancel();
    const id = generation,
      timing = providedTiming || createTiming({ release });
    if (!providedTiming) timing.mark("localSaved");
    const trace = {
      clipId: clip.id,
      rawTranscript: null,
      reviewed: false,
      submission: "hold_release",
      timing: null,
      status: "starting",
    };
    const persist = async () => {
      valid(id);
      trace.timing = timing.snapshot();
      await saveTrace(structuredClone(trace));
      valid(id);
    };
    try {
      valid(id);
      timing.mark("voiceSetupStarted");
      const start = await request("voice/start", {});
      timing.mark("voiceSetupReady");
      valid(id);
      if (!start.enabled) {
        trace.status = "local_only";
        await persist();
        onUnavailable(start.reason);
        return { enabled: false };
      }
      active = { ticket: start.ticket };
      timing.mark("asrStarted");
      const asr = await request("voice/transcribe", {
        ticket: start.ticket,
        clip,
        submission: "hold_release",
        savedLocally: true,
      });
      valid(id);
      timing.mark("asrReady");
      trace.rawTranscript = asr.transcript;
      trace.provenance = asr.provenance;
      trace.transcriptionServerTiming = asr.serverTiming || null;
      showHeard(asr.transcript);
      await persist();
      timing.mark("classificationStarted");
      const command = await resolveCommand(asr.transcript,{fromVoice:true});
      valid(id);
      const answer = command?.handled ? {reply:command.reply,intent:'question',reportSaved:false,citations:[],provenance:{kind:'work_order_file_navigation'}} : await request("voice/answer", {
        ticket: start.ticket,
        text: asr.transcript,
        ...(command?.photoIds?{photoIds:command.photoIds,requestKind:'photo_question'}:{}),
        ...(command?.selectedDocument?{selectedDocument:command.selectedDocument,requestKind:'document_question'}:{}),
      });
      valid(id);
      timing.mark("classificationReady");
      timing.mark("validatedAnswer");
      if (answer.reportSaved) timing.mark("combinedReviewReady");
      await applyAnswer(answer);
      valid(id);
      trace.status = "answered";
      trace.answer = answer;
      await showAnswer(answer);
      valid(id);
      await persist();
      await speak(answer.reply, {
        speech: answer.speech,
        config: start,
        onTiming: (name) => {
          if (id !== generation) return;
          try {
            valid(id);
            timing.mark(name);
            void persist().catch(() => {});
          } catch {}
        },
        onOutput: (output) => {
          timing.output = output;
        },
      });
      valid(id);
      await persist();
      return answer;
    } catch (error) {
      if (id === generation) {
        try {
          ensure();
          trace.status = "failed";
          trace.error = error.message;
          await persist();
        } catch {}
      }
      throw error;
    }
  }
  return { complete, cancel, dispose: cancel };
}
