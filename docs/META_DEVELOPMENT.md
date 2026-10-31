# Guarded Meta review

Meta review is disabled by default. The local development server can enable it with `CARRYFORWARD_META_ENABLED=1` and `CARRYFORWARD_GUARD_TOKEN_FILE` pointing to the existing loopback guard's credential file. The application only calls `http://127.0.0.1:4421/v1/responses`; it never accepts a provider URL or provider key from the browser. The separate guard must already be running with its original persistent ledger. Do not replace or reset that ledger to obtain a fresh budget.

The October 30 owner approval is $10 aggregate across Muse development and product calls, not $10 per app launch. The current session guard reserves uncached input plus a 10,000-token margin and maximum output cost before dispatch, with no refunds for failures. An unavailable guard fails closed. Five attempts per job per app process are an additional convenience bound, not a durable financial cap; the aggregate guard is the authority.

`POST /api/review` requires the same loopback origin, an HTTP-only local session cookie, a custom intent header and JSON. It replays bounded job events, verifies selected image ownership/content hashes and calls standard `muse-spark-1.3` with storage disabled. At most three images and 1 MB of encoded image bytes are supported per review (1.9 MB HTTP request cap). Original attachments remain unchanged. These local controls are not production authentication or tenant isolation.

Output is parsed as JSON, validated against the current job/input revision and admitted source IDs, and rejected if malformed, stale or referencing an image not actually sent. The browser rechecks its saved event revision before applying a returned result. Model findings remain interpretations; technician confirmation and Operations acceptance stay separate.

The UI asks for confirmation that selected content is fictional demonstration data. Only those examples are within current source authority. No customer evidence or recordings are authorized for this route. No retries run automatically. Failures preserve locally saved evidence.

Official request references checked during implementation:
- https://dev.meta.ai/docs/protocols/responses
- https://dev.meta.ai/docs/image-understanding

Raw development responses remain outside Git. Tests use explicit fixtures and never call a provider. Live examples and their shortcomings are recorded in the development log rather than presented as benchmark accuracy.
