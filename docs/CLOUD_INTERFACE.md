# Cloud conversation surface

Andrew requested a modern field companion that feels like talking to a cloud, bringing a photo, PDF region or clip into view at the useful moment. The first implementation makes the cloud conversation the default view while retaining the existing detailed record, guarded evidence review and exact-revision handoff controls.

## What works in this increment

- A new assignment opens with a pre-visit brief: system, problem, troubleshooting context, customer preferences, gate/access, safety and ladder source gaps. Continue moves into capture; The brief and “repeat the brief” recall it. See [briefing contract](PRE_VISIT_BRIEF.md).
- A quiet cloud presence shows actual ready/recording/reviewing/speaking state, rather than pretending a microphone or model is active.
- Typed commands and reviewed voice drafts share the same command router. Navigation commands do not become technician testimony. Ordinary narration is saved through the existing ordered investigation events.
- Source recall and focus are job-scoped. “Show the PDF,” “show me that last PDF,” “zoom in on this,” and “show the clip” operate on supplied sources. A missing or ambiguous source stays explicit.
- PDF page images and text excerpts retain title, page, source ID, revision and an original-source link. Inspection opens a zoomable source view. Images and actual supplied video files have dedicated viewers.
- Original work-order history and saved photos are available in Sources. The exact fictional sample job also supplies an explicitly labeled two-page reference PDF, rendered page, display illustration and three-second generated video. They are reference fixtures, not measurements or equipment instructions, and are not automatically admitted as field evidence.
- Voice uses the existing short recording/upload, playback and reviewed-transcript flow. A microphone starts only after a user action. Raw ASR is not executed as a command. Reviewed words enter an editable draft until Send. This is not continuous, full-duplex conversation.
- Read aloud uses only an available local browser speech voice after an explicit action. If no local voice is available, text remains usable. No new speech provider or subscription is introduced.
- Cloud drafts have their own per-job storage and do not overwrite an unfinished detailed interview answer. Saves keep source provenance and invalidate the existing report confirmation as appropriate.

## Source and warning boundary

The router performs local navigation, not general semantic RAG. It never fetches arbitrary URLs or treats document text as executable instructions. Source URLs are limited to the admitted local asset namespace and supplied object URLs. Prior source focus is restored only for a matching current-job source revision.

For “wait, what was the warning before I remove the cover,” quote only an explicitly approved source matching the current system, document revision and requested action. If no such source is supplied, say it is unavailable and clear any unrelated source preview. Do not generate a cover-removal procedure. The fictional reference packet deliberately contains no approved equipment warning.

The approval flag in this pure navigation module is caller-supplied trusted application metadata; it must not be granted from an untrusted imported file or model response. This increment provides no approval-granting workflow, broad document ingestion, manufacturer-manual applicability service, PDF parser or external knowledge connector.

## Integration

`cloud-view.js` owns presentation, `cloud-session.js` adapts the existing job/events/voice path, `job-context.js` validates and routes source references, and `cloud-resources.js` builds the current bounded source packet. Server and service-worker allowlists include the new shell modules. Source media are served explicitly and are excluded from the app-shell cache; a cached app shell does not promise offline PDF/video availability.

The default surface has a voice action and an optional type composer. Sources and the job briefing appear on demand. Detailed record editing, synthetic-data confirmation, Meta dispatch, technician confirmation and simulator receipt/acceptance keep their existing explicit controls.

## Verification and limits

The current build passes 95 Node 24 tests, including thirteen job-context tests and briefing contract/presentation/model-boundary cases for source recall, cross-job isolation, ambiguous matches, zoom, unsafe URLs and unsupported warnings. Existing HTTP/guard tests use isolated stores and mocks; no real model calls were made for this increment. Browser verification and final integration receipts are recorded in the development log.

Real microphone permissions and voice capture on iPhone/Android, naturalness and field usability still require the prepared device/pilot checks. General job-document ingestion, video indexing and an actual retrieval pipeline remain separate work. Do not describe the supplied fictional packet as complete RAG coverage.
