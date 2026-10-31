# Offline app shell

CarryForward now ships a standalone web-app manifest and a versioned service worker. This prepares an installable web experience; actual iPhone/Android installation is not yet verified. The existing server stays loopback-only. A phone-accessible secure deployment is a separate release step.

The worker caches only the explicit HTML, JavaScript, CSS, manifest and icon list in `public/sw.js`. It does not intercept API requests, evidence paths, external origins, non-GET requests or query-bearing URLs. Job data and media stay in their existing IndexedDB/localStorage stores. An offline cache is not a backup of those records.

Installation succeeds only after the complete shell is fetched. Partial installs are discarded. On a first successful load, reopen once to use the cached shell. Updated workers wait until old app windows close; no forced activation mixes application module versions. After any shell-file edit, run `node scripts/refresh-shell-version.mjs`. The offline test checks the content hash.

A cached shell can outlive the local server session. Startup refreshes the session through uncached `/api/config`; offline startup tolerates that request failing. The connection message checks actual service reachability. AI review/transcription is disabled when interview configuration cannot be fetched. Operations requests remain online actions and are never silently queued or marked delivered.

## Verified on the desktop browser

- Complete shell installation and activation.
- Stopped the actual local backend, then reloaded the browser successfully from cached files.
- Restored the existing job, correction history, voice record and conversational preference.
- Saved a new fictional interview answer while the server was stopped; reloaded again and observed the saved answer.
- Observed service-unavailable wording and disabled AI configuration.
- Restarted the backend; reloaded the cached shell and successfully read the authenticated Operations inbox with a refreshed session.
- Checked 390-pixel and 1100-pixel widths without horizontal overflow.

These checks do not simulate complete radio disconnection, OS process termination, browser eviction, microphone permissions or phone installation. Follow `docs/PHONE_VALIDATION.md` on actual iPhone and Android devices before claiming those behaviors.
