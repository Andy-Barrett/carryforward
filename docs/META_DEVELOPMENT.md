# Guarded Meta review

Meta review is disabled by default. The local development server can enable it with `CARRYFORWARD_META_ENABLED=1` and `CARRYFORWARD_GUARD_TOKEN_FILE` pointing to the existing loopback guard's credential file. The application only calls the loopback guard at `/v1/responses` and `/v1/asr/transcribe`; it never accepts a provider URL or provider key from the browser. The separate guard must already be running with its original persistent ledger. Do not replace or reset that ledger to obtain a fresh budget.

The October 30 owner approval is $10 aggregate across Muse development and product calls, not $10 per app launch. The current session guard reserves uncached input plus a 10,000-token margin and maximum output cost before dispatch, with no refunds for failures. An unavailable guard fails closed. Five review attempts and five transcription attempts per job per app process are an additional convenience bound, not a durable financial cap; the aggregate guard is the authority.

`POST /api/review` requires the same loopback origin, an HTTP-only local session cookie, a custom intent header and JSON. It replays bounded job events, verifies selected image ownership/content hashes and calls standard `muse-spark-1.3` with storage disabled. At most three images and 1 MB of encoded image bytes are supported per review (1.9 MB HTTP request cap). Original attachments remain unchanged. These local controls are not production authentication or tenant isolation.

Output is parsed as JSON, validated against the current job/input revision and admitted source IDs, and rejected if malformed, stale or referencing an image not actually sent. The browser rechecks its saved event revision before applying a returned result. Model findings remain interpretations; technician confirmation and Operations acceptance stay separate.

The UI asks for confirmation that selected content is fictional demonstration data. Only those examples are within current source authority. No existing customer evidence or retained call recordings are authorized for these routes. Live voice checks used newly generated fictional speech only. Microphone audio stays local unless its user explicitly requests transcription of a synthetic demonstration clip. No retries run automatically. Failures preserve locally saved evidence.

Official request references checked during implementation:
- https://dev.meta.ai/docs/protocols/responses
- https://dev.meta.ai/docs/image-understanding

Raw development responses remain outside Git. Tests use explicit fixtures and never call a provider. Live examples and their shortcomings are recorded in the development log rather than presented as benchmark accuracy.

## Duration-priced transcription

Meta's dedicated `muse-voice-transcribe-1.0` is used for short WAV transcription. Spark 1.3 audio understanding is documented as degraded, so voice bytes are not sent to the reasoning model. The ASR endpoint takes WAV multipart input and returns a raw transcript plus audio duration. The UI requires review before it creates a technician answer. This is recorded push-to-talk, not a realtime full-duplex conversation.

`scripts/meta-budget-guard.mjs` is the reviewed guard source. It requires explicit `CF_GUARD_KEY_FILE`, `CF_GUARD_LEDGER_FILE`, `CF_GUARD_TOKEN_FILE` and `CF_GUARD_LOCK_FILE` paths outside Git. It refuses to create/reset a missing ledger; reuse the existing approved aggregate ledger. `CF_GUARD_PORT` defaults to 4421 (isolated tests use an ephemeral port). Never launch two guards against one budget. Stop an idle existing guard and verify its termination before replacing its runtime lock.

For ASR, the guard parses WAV structure/duration itself: mono 16-bit PCM, 16/24 kHz, up to 30 seconds. It reserves the greater of $0.01 or the duration-priced maximum including a one-second margin, using Meta's published $0.18/hour whole-second rate. Reservations are not refunded on failure. Existing coding/review reservations stay in the same ledger. A real isolated guard test verifies budget exhaustion refuses transcription before dispatch.

ASR has no `store:false` parameter documented here; do not infer retention guarantees from the Responses configuration. Existing account/data-use approvals remain limited to fictional development examples.

References checked: https://dev.meta.ai/docs/speech-to-text and https://dev.meta.ai/docs/pricing-rate-limits .
