# Reviewable local source candidate

Candidate source commit: `d38f94fb4021c000d7e275f6812e4715b9247ef9`.

A tracked-source-only archive was prepared at `.local/releases/d38f94f/carryforward-d38f94f-source.zip`. It contains 70 tracked files under one `carryforward/` directory, totals 150,970 bytes, and has SHA-256 `3442e90f0af277a125ff0bc88eb587604727f782836f2572e41c3ad2683d7720`. It excludes Git internals, ignored local data, uploads, databases, credentials files, dependencies and generated trial records.

The archive was extracted to a fresh temporary directory. All 67 tests passed there using Node 24, including isolated local HTTP integration and guard tests. No dependency installation or real model request was required. This checks source completeness; it does not establish deployment or phone behavior.

A bounded scan of the candidate's 19 reachable commits and 174 reachable file blobs found no flagged local-data/credential paths or matches for the checked private-key, AWS access-ID, GitHub-token and long `sk-` token signatures. No blobs were skipped by the scan's size bound. A scan is not a guarantee that all kinds of secrets or security defects have been detected. The archive and scan manifests stay ignored under `.local/releases/d38f94f/`.

## Remaining release decisions and evidence

- Actual iPhone/Android camera, microphone, installation and interruption checks remain pending. No physical device is represented as tested.
- `adb` and `idevice_id` were not found on the current command path. Xcode exposed `simctl`, but its runtime inventory did not complete; the inventory command was terminated without installing runtimes or restarting services. No simulator validation is claimed.
- A technician usability kit is prepared but unrun. Follow `evaluation/usability/README.md`; do not report its blank scorecards as measurements.
- No license has been chosen. The owner retains the decision about licensing, GitHub push/visibility, hosted access and contest release.
- No repository push, visibility change, deployment, public upload or contest submission occurred in preparing this candidate.

The current prototype remains separate from Perihelion and PRISM. A later source change requires a new archive/hash and focused verification. See `READINESS_REVIEW.md` for the local feature evidence and remaining acceptance work.
