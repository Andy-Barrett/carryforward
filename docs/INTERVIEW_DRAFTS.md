# Unsent interview recovery

IndexedDB version 3 adds an `interviewDrafts` store keyed by job ID. It contains composing text, correction target and any reviewed voice-transcript link. It is separate from the event history, model context, report and Operations packet. Only Save answer appends technician testimony.

Typing or choosing a correction starts a local draft write. The UI reports success after that transaction completes. On failure it retains the in-memory text, warns that it is not safely saved and asks the technician to keep the page open. Storage eviction or clearing browser data still removes drafts.

Answer submission waits for preceding draft writes. The event append and deletion of its matching draft ID use one IndexedDB transaction. A failed append cannot independently delete the draft. A different draft ID is not deleted. Existing stale-event checks remain active. Multi-tab draft merging is not implemented; avoid composing the same job in multiple tabs.

Voice draft recovery retains the original audio ID, raw transcript, reviewed flag and transcription provenance. It validates that the audio still belongs to the loaded job and is available. A stale correction target is cleared for review rather than silently correcting a superseded answer.

## Browser evidence

On the existing fictional job, typed an answer without Save, reloaded, and observed the recovered text with an unsent-draft notice. It was absent from saved testimony. Switched to a second fictional job and observed an empty draft; switched back and recovered the original. Saved the answer, reloaded, and observed exactly one saved copy and an empty draft. Repeated recovery with an existing reviewed synthetic voice clip; the committed turn retained its audio ID and original-transcript details.

These are desktop browser checks. Physical-device storage failure, OS termination and same-job multi-tab conflicts remain unverified.
