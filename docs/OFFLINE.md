# Offline app shell

CarryForward now ships a standalone web-app manifest and a versioned service worker. This prepares an installable web experience; actual iPhone/Android installation is not yet verified. The default server stays loopback-only. The owner-authorized paired private HTTPS development trial is separate from a public deployment.

The worker caches only the explicit HTML, JavaScript, CSS, manifest and icon list in `public/sw.js`. It does not intercept API requests, evidence paths, external origins, non-GET requests or query-bearing URLs. Job data and media stay in their existing IndexedDB/localStorage stores. An offline cache is not a backup of those records.

Installation succeeds only after the complete shell is fetched. Partial installs are discarded. On a first successful load, reopen once to use the cached shell. Updated workers wait until old app windows close; no forced activation mixes application module versions. After any shell-file edit, run `node scripts/refresh-shell-version.mjs`. The offline test checks the content hash.

A cached shell can outlive the local server session. In loopback development, startup refreshes the session through uncached `/api/config`; offline startup tolerates that request failing. Private HTTPS still requires pairing after a server-session change. A cached shell does not renew or bypass that gate. The connection message checks actual service reachability. AI review/transcription is disabled when interview configuration cannot be fetched. Operations requests remain online actions and are never silently queued or marked delivered.

## Verified on the desktop browser

- Complete shell installation and activation.
- Stopped the actual local backend, then reloaded the browser successfully from cached files.
- Restored the existing job, correction history, voice record and conversational preference.
- Saved a new fictional interview answer while the server was stopped; reloaded again and observed the saved answer.
- Observed service-unavailable wording and disabled AI configuration.
- Restarted the backend; reloaded the cached shell and successfully read the authenticated Operations inbox with a refreshed session.
- Checked 390-pixel and 1100-pixel widths without horizontal overflow.

These checks do not simulate complete radio disconnection, OS process termination, browser eviction, microphone permissions or phone installation. Follow `docs/PHONE_VALIDATION.md` on actual iPhone and Android devices before claiming those behaviors.


## Native iPhone checkpoint — November 1

Build 3 could not cold-start with the private server stopped. Build 4 restricts WebKit app-bound navigation to the configured host and enables the existing service-worker path. After a successful online run, a server-stopped process relaunch opened the saved fictional visit on the actual iPhone Air/iOS 27.0.1. Existing recordings also survived the build update; the owner confirmed playback after reopening. The owner then confirmed an existing clip and a new fictional local recording both played while the server stayed stopped.

Build 5 compiles with an explicit same-origin Reconnect GET carrying `?reconnect=1`. The worker already excludes query-bearing URLs, allowing this deliberate action to contact the server and reach pairing when needed; normal cold launch remains cacheable. The physical check passed: after restoring the same server/database, build 5 reached pairing, reopened the saved visit and the owner confirmed the new offline clip remained audible. The previously accepted packet and original source files also survived the server restart; the new local clips were not delivered. These results do not establish airplane-mode behavior, cache eviction recovery or guaranteed background saves.
