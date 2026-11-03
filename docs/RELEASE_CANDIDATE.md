# Reviewable local source candidate

## November 3 candidate

The current tested code candidate is `4a07fcf9db6e7d176c5525ed98162ff56b1851a8`. Its tracked-source-only archive contains 175 files and is 3,508,206 bytes. SHA-256: `4995f1d0b7cdf68f5f3fa8c60b7cec79e88e8900f974bef0827ee79d48ef0282`. The ignored manifest and archive are under `.local/releases/contest-20261103/`.

A clean extraction installed the locked dependency from the local npm cache with lifecycle scripts disabled, then passed all **186 Node checks**. No live inference was required. A bounded scan of 53 reachable commits and 641 blobs found no matches for the checked credential signatures or sensitive generated paths; no blobs were skipped. This is a bounded check, not a security guarantee. Private app backups, credentials, company-manual context, databases, recordings and runtime receipts are excluded from the archive.

Native build 18 and the updated web shell have a bounded physical conversation pass plus the same visit’s owner-confirmed API closeout, original-audio readback and separate simulator acceptance with two Operations follow-ups. Camera capture passed separately. Android remains deferred; production integration and a hosted release remain unbuilt.

The proposed MIT license and dependency notice are reviewable ignored files beside the archive. They are proposals only: no project license has been added. GitHub was checked as private with no detected license. Source publication, license choice and final submission remain owner decisions. Metadata-only release notes after this candidate do not change the demonstrated app; refresh the archive/manifest for the final approved publication commit.

Next is the identified continuous contest recording and [submission preparation](CONTEST_FINISH_2026-11-03.md), including voice-output publication rights. No public push, visibility change, deployment, upload or contest submission occurred in preparing this candidate.

## Historical candidate — October 30


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
