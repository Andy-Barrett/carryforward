# One visit through the cloud

The October 31 increment joins the brief-first workspace to actual evidence review and a prepared handoff. The detailed interview and report remain available for corrections and richer editing; the primary path no longer redirects a review button into the older interview screen or asks for a blank report after narration.

## Current path

1. Read the original source-tagged pre-visit brief and continue into the visit.
2. Save typed narration or a reviewed voice draft and add job photos. Source navigation stays separate from testimony.
3. Open Review latest evidence in the cloud. Inspect and explicitly select fictional photos; no images are selected by default. A local smaller-copy action keeps the original bytes and provenance. Over-limit selections stay in the sheet with an error before dispatch.
4. Explicitly request a guarded Meta review. The cloud and detailed interview now share `evidence-review.js`: selection, source synchronization, byte/hash verification, bounded request and stale event/photo rejection. No automatic retries or review loops are added.
5. Read the model's next question in place. Can't verify and Follow up later require a named follow-up owner. Already answered points to retained testimony and remains unverified. Responses apply only to the displayed question/input revision.
6. Handoff opens a draft preparation sheet with saved current testimony as initial notes when the report is empty. Existing report edits are preserved for review. The technician supplies their name, commitments and owner, then explicitly proceeds to the completeness review. Preparing the report is not confirmation. Unsent narration is visibly excluded and remains recoverable after cancel/navigation.
7. Confirm the current report, deliver it through the local API, record source receipt and separately accept the exact revision with follow-ups retained.

The handoff notes are an editable concatenation of current testimony, not an AI-generated summary. Detailed corrections retain superseded originals; existing notes still require human review after a correction. Briefing references remain planning context and cannot close field evidence checks. None of this is general document ingestion, a deployed service, full-duplex speech or evidence of real equipment status.

## Observed synthetic exercise

On a fresh loopback origin with an isolated simulator, the browser opened fictional DEMO-WO-1043 and saved testimony about an inverter replacement, a display reading, reported monitoring and an unfinished warranty certificate. It admitted a 1,248,896-byte synthetic display photo and created a separate 253,286-byte JPEG review copy. Both original/copy hashes matched the admitted simulator bytes.

One actual `muse-spark-1.3` call through the existing shared guard took 13,294 ms and reported 3,991 input / 2,310 output tokens. It read 2.4 kW and asked, “Was the 2.4 kW display photo taken after the inverter replacement?” The technician's simulated Can't verify response deferred production to Operations. Repair stayed narrowly reported; monitoring remained unverified for missing post-work timing, and warranty delivery remained owed to Operations.

Technician confirmation, API delivery, source receipt and acceptance completed. Packet `2ea25e81d19f85c852dc0d0dfc80f0a6f1ed5284531665824eaabbefa3b00147` was `accepted_with_followups` with three open checks. The readback receipt, packet and source events are retained under ignored `.local/cloud-loop-20261031/`. This developer exercise is not a technician usability participant or a measured efficiency result.

The guard had no running process/listener after the prior session; its abandoned empty lock was archived before restart after checking both. Its budget ledger was preserved byte-for-byte. The call raised conservative aggregate reservations from $5.352951 to $5.387732 against the unchanged $10 cap. Reservations are not actual charges.

## Checks and limits

99 Node 24 tests pass, including the shared runner's rejection of corrupt/cross-job photos, a correction during provider wait and a photo exclusion during provider wait. Browser checks covered actual review, owned deferral, draft preparation, confirmation/delivery/receipt/acceptance, reload persistence, an oversized selection refused without another provider call, and an unsent draft excluded/preserved on cancellation. Desktop and 390×844 emulation checked the sheets, visible close controls and no horizontal sheet overflow. The browser console had no warnings/errors in the exercise.

No real microphone, speech, camera, customer content or human usability ratings were collected. Physical iPhone/Android acceptance and the prepared technician trial remain pending. The separate private-phone trial stays inference-disabled until a separately appropriate synthetic capture/transcription pass. No push, public deployment or contest submission occurred.

## November 1 physical iPhone extension

The owner captured a labeled fictional display with the iPhone camera. An original-preserving smaller copy went through one actual Meta image review. The phone then prepared and confirmed a report, delivered it to the separate local API, recorded receipt and accepted it with four follow-ups still open. An explicit owner-correction control resolved the inconsistent individual owner found during review. Authenticated downloads matched both photo files and the original voice WAV exactly. The requested phone Can’t verify action was not established: Already answered was recorded instead. See [phone validation](PHONE_VALIDATION.md) for exact bytes, revision, source-contract distinction and remaining checks. This is assisted developer evidence, not a usability result.
