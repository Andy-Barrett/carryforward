# Muse Code starting task

## Read first

Read AGENTS.md, README.md, docs/CONTEST_SCOPE.md, docs/ARCHITECTURE.md, and docs/BUILD_PLAN.md. Run `npm test` and inspect `git status --short`. Preserve unrelated edits. The existing form is a prototype; the agreed target is a natural interview and branching evidence-review loop.

October 30 owner session approval permits up to $10 aggregate inference across coding and product testing. Meta billing shows $150 free credits; the owner approved the associated product-improvement notice for CarryForward code and synthetic examples only. Use the supplied guarded API route; do not call a provider directly, read credentials, reset the budget, buy subscriptions, push, or deploy. Use the standard non-contributor model ID, while recognizing free-credit terms may still permit product improvement. Keep default sandbox/approval protections enabled.

## First task: a durable job session with photos

Build the local capture foundation needed by the interview. Do not implement model inference or replace the product with a larger form.

1. Add a small storage module using IndexedDB for job sessions, ordered events, and actual photo blobs. Use stable session/evidence IDs and job associations. Explicitly distinguish capture time from file modification time and upload time; do not invent EXIF metadata or treat file time as observation time.
2. Add phone-friendly capture to the existing job using a camera-hinted file input and ordinary upload fallback. Show thumbnails, names, and sizes. Support JPEG/PNG/WebP initially with bounded file count/size and decodability checks. Explain unsupported formats without losing the draft. Treat files as untrusted.
3. Persist an event when evidence is added, linked, or explicitly excluded. The UI should show photos as locally saved only after the storage transaction commits. Revoke unused object URLs. Preserve work-order identity on reload and when switching/importing jobs; never mingle evidence across jobs.
4. Associate evidence IDs with the existing field observations while preserving old text references. Record original assignments and field observations separately. Persist technician confirmation against a report revision and invalidate that confirmation visibly after material changes.
5. Provide a usable media-inclusive export. Prefer one bounded, versioned JSON bundle with a manifest and base64 photo data for this small demo rather than a ZIP dependency. Keep the existing lightweight report export. Warn about bundle size, preserve MIME type/hash, and never silently drop blobs.
6. Test real failure modes: unavailable/quota-limited storage, interrupted writes, wrong-job references, duplicate additions, reload recovery, and report changes after confirmation. Add only dependencies justified by a concrete testing need.

The initial import/export limits need explicit constants. Propose conservative limits, document them, and keep browser-memory usage bounded. Do not add service-worker caching, audio capture, semantic photo search, server persistence, or authentication in this first slice.

## Acceptance walkthrough

- Open the fictional work order and attach two synthetic photos.
- Reload; photos and their job association remain intact.
- Add an observation that refers to one admitted local attachment ID.
- Switch to another job and verify that the original job/photos remain recoverable and are not displayed as the new job's evidence.
- Export, inspect the manifest, and verify actual photo bytes are included with correct hashes.
- Confirm a report, modify a material observation, and verify the old confirmation no longer applies to the new revision.
- Simulate a failed storage operation: show an actionable error, do not claim success, and preserve already saved evidence.

Run the focused tests, inspect phone and desktop layouts, and report physical-device checks separately. No live model calls, Git pushes, publication, or other repositories. End with changed files, validation evidence, limitations, and next steps.

## Next slices, not this task

Build the deterministic investigation reducer and model-output validator; then audio/text interview capture and question policy; then bounded Meta integration when authorized; then the authenticated local Operations simulator. See the build plan for acceptance criteria.
