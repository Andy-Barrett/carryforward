# Pilot response timing and optional providers

November 4, 2026. Provider connections are disabled by default in the company pilot. The current candidate's local source lookup, typed reports, corrections and office handoff do not depend on a live model. This increment made no Meta or ElevenLabs call and changed neither shared allowance. Actual phone microphone/Sarah acceptance remains separate.

## What the existing phone observations show

The November 3 [field-trial record](FIELD_TRIAL_2026-11-03.md) contains these two different report turns:

| Saved turn | ASR | Combined model work | First playable | Playback complete |
| --- | ---: | ---: | ---: | ---: |
| Deferral | 3.29 s | 8.60 s | 13.60 s | 21.55 s |
| Correction | 4.32 s | 14.11 s | 20.25 s | 26.57 s |

These are not matched before/after inputs. They cannot establish a speedup, accuracy rate or latency percentile. Model processing accounts for about 63–70% of time to playable output in these examples, and ASR about 21–24%. A faster local page search alone cannot remove those multi-second waits. The guard's token preflight is part of the existing spend protection; this work does not remove or bypass it.

Keep one combined classification/review request for report turns, concise replies, bounded relevant context and streaming PCM only after source/state validation. A status acknowledgement is not a meaningful answer. Increasing Sarah's playback rate does not shorten model latency. No speculative safety steps or unvalidated report changes should be spoken to disguise dead time.

## Reproducible local profiling

`pilot/benchmark.mjs` runs the same ten factual inputs and five report/correction inputs in two explicit local conditions:

1. A new SQLite connection per turn and a separate classification/review fixture.
2. A reused SQLite connection and a combined classification/review fixture.

This is a reference microbenchmark, not a recording of the prior phone implementation. It uses actual source retrieval and the existing investigation reducer to preserve original testimony, the 4.2 → 2.4 kW amendment, reported monitoring/no replacement and two Operations-owned deferred obligations. ASR and model results are scripted fixtures. Audio is a synthetic tone through application callbacks, not generated speech or an acoustic measurement. There is no network/live-provider mode in this runner.

Every trace reuses `public/turn-timing.js` and records release → local WAV save → fixture transcript → retrieval → classification/review → validated state → first PCM callback → completion. A separate high-resolution trace preserves sub-millisecond local durations that the phone hook rounds to whole milliseconds. `firstMeaningfulAudioMs` remains null. No filler acknowledgement is counted as meaningful speech.

Run with the separately obtained pinned original:

```sh
/opt/homebrew/opt/node@24/bin/node pilot/benchmark.mjs \
  .local/pilot-benchmark/new-run.private.json \
  .local/pilot-manuals/MAN-01-00541-1.4.pdf
```

Without a manual argument it uses a clearly fictional plain-text search fixture. Receipts are written with `wx` to a new private path; rerunning never replaces an earlier measurement. The actual-manual receipt `actual-manual-profile-v2.private.json` recorded 30 successful local runs, identical paired input hashes, all correction/owner checks and zero real provider calls:

| Local fixture condition | Factual median (10 inputs) | Report median (5 inputs) |
| --- | ---: | ---: |
| Reopened database / serial fixture | 1.286 ms | 1.415 ms |
| Reused database / combined fixture | 0.771 ms | 1.001 ms |

These describe only this local run. OS cache, scheduling and fixture overhead are uncontrolled, and tiny local timings are not production speech percentiles. The current server already keeps its document library open; the new source selection also limits answers to one relevant section and carries a complete applicable warning instead of serially extracting a PDF during each turn. There is no cross-company or persistent answer cache. The bounded immutable page store is keyed by company/version, with approval/applicability checked on every retrieval.

The proposed short-answer median ≤5 s/p90 ≤8 s and report median ≤12 s/p90 ≤20 s targets are **not evaluated** by this fixture run. The 2–3 second routine-answer stretch target is also unverified. Controlled live tests must retain the same inputs, source/report versions, cold/warm conditions, provider/model, counts, failures and every stage. Actual first sound requires a phone/acoustic measurement in addition to application callbacks. Do not infer production tail latency from a few successful turns.

## Optional provider boundary

`createPilotProviders({config, revalidate, validateLocalReply?, fetchImpl?, speechImpl?})` in `pilot/providers.mjs` is an optional server adapter. It is disabled unless explicitly configured. It does not load ambient environment credentials, create subscriptions or initialize a fresh spend ledger.

Enabling requires a per-company approval ID, expiry, `fictionalInferenceApproved:true` and explicit allowed provider operations (`metaAsr`, `metaAnswers`, `elevenSpeech`). This candidate only permits synthetic data; real company documents and retained recordings are not authorized by this setup. Configuration is server-owned and separate from client membership or future billing entitlement.

The Meta guard token file and the **existing** shared ledger must both be absolute paths. The adapter rejects a missing/invalid/exhausted $10 ledger and calls only the existing loopback guard routes. It reuses `transcribeWithMeta` for identified, hash-checked WAV clips, with caller cancellation propagated to its transport. A clip must already be saved locally and submitted by hold release. No always-on listening or pre-release transmission is added. A cancellation may leave an upstream reservation spent; the adapter does not refund, retry or reset accounting.

For speech, the ElevenLabs key file and **existing** 6,000-character/60-request ledger must be explicitly provided. The existing `ElevenSpeech`/`SpeechLedger` and Sarah/v4 Turbo 24 kHz PCM lifecycle retain their plan/no-overage verification, conservative reservations, complete sample framing and bounded streaming. No fresh ledger fallback, model experiment, account upgrade or additional allowance is introduced. The pilot wrapper suppresses stale chunks and leaves native audio-session/playback-rate behavior to the existing client.

### Server integration contract

`beginTurn(scope)` creates an opaque turn. Scope includes authenticated `companyId`, `userId`, `sessionId`, canonical `jobId`, `assignmentRevision`, `synthetic:true` and exact `retrievalVersions:[{versionId,sha256}]`. A new turn invalidates the prior turn for that company/user/session, including a different job.

- `transcribe({ticket,scope,audio,signal})` accepts a saved `hold_release` audio record and returns guarded ASR provenance. It permits only one dispatch per turn.
- `answer({ticket,scope,packet,signal})` accepts the exact retrieved excerpts/citations plus a bounded question. An optional `validatedReport` contains its immutable revision, correction links and owned follow-ups. The route cannot write report state. It uses one bounded 32 KB request, a 900-token output ceiling, no tools, no server-side history and no streaming speculative answer.
- `grantSpeech({ticket,scope,reply,validatedStateRevision,localValidation?})` binds a one-use short-lived grant to the exact validated reply hash and state/source revision. A generated answer must match the adapter's stored validated result. A deterministic local answer additionally requires the distinct `validateLocalReply` callback to verify a server-stored answer digest/revision; a generic membership check is insufficient.
- `streamSpeech({grant,scope,signal,onStart,onChunk})` revalidates the current company/session/assignment/source/report state before dispatch, at startup, before each PCM chunk and after completion. Changing scope, revoking access/configuration, cancellation or starting another job prevents late audio from the old turn.
- `cancelTurn(ticket)` and `revokeSession({companyId,userId,sessionId})` invalidate pending answers/grants and abort streams. Client playback must also stop immediately on explicit interruption, backgrounding or account/job changes; server suppression cannot erase bytes already buffered on a device.

`revalidate(scope,{action,validatedStateRevision?})` must consult current authenticated membership/session, assignment, document approval/withdrawal and report revision. No client-supplied company ID, role, local-validation digest or dropdown authenticates that access. Provider responses may cite only the exact allowed citations and must preserve the exact validated report revision. Imported instructions remain untrusted reference data and cannot become commands or authorizations.

## Verification and remaining acceptance

Eleven focused checks cover disabled defaults, forged company/user/session/job/revision/source scopes, missing/exhausted shared accounting, blocked procedure sources, report revision/correction/owner preservation, saved hold-release ASR, cancellation/late results, one-use speech, job/account changes, mid-stream revocation, ordered complete mock PCM, local-answer validation and the complete 30-run benchmark. All use injected transports or scripted results. None establishes current provider entitlement, live response latency, meaningful audio or physical playback.

Before enabling a company for a real guarded test, verify the retained shared allowance receipts and exact company/source authorization. Then use matched inputs within the existing caps and record failure/rejection counts. Remaining owner-run checks include actual microphone input, consecutive complete Sarah replies, explicit interruption, acoustic first sound, native foreground/background/lock behavior and no late prior-job audio. The company pilot remains a local candidate until those and the other release requirements pass.

## Authenticated HTTP voice and combined reports

`createPilotVoiceRoutes({auth,store,library,config,providerFactory?})` in `pilot/provider-routes.mjs` connects the optional adapter without changing the contest server. The integration owner mounts `.handle(req,res,{principal,job,action,json,body})` before the generic job body parser. It handles these POST actions and returns false for unrelated actions:

| Job-relative action | Input | Result |
| --- | --- | --- |
| `voice/start` | `{}` | Opaque current turn; disabled explanation when no configuration exists |
| `voice/transcribe` | `{ticket,clip,submission:"hold_release",savedLocally:true}` | Hash-bound transcript and ASR provenance after original/WAV admission |
| `voice/answer` | `{ticket,text}` | Validated question/report/clarification, current events/revision and optional one-use speech grant |
| `voice/speech` | `{turnId,token,requestId}` | Uncacheable 24 kHz PCM with existing reply-speaker headers and 1.4× playback rate |
| `voice/cancel` | `{ticket}` or `{turnId}` | Turn cancellation; no report confirmation or transmission |

`clip` contains the saved original's ID, MIME, name, base64 bytes and SHA-256 plus the transcription WAV/base64 and hash. The route checks the WAV independently, admits both through `OperationsStore`, then sends only the admitted WAV bytes to ASR. The original remains preserved if transcription, classification or validation fails. The returned transcript is automatically recognized and explicitly submitted by hold release; it is not labeled human-reviewed. Altering it in this route without a new supported review action is rejected.

Company/user/session/role, assignment revision, document manifest and current event state are derived from the authenticated request and canonical server data. Client selectors or forged manifests are rejected. Every provider boundary and PCM chunk rechecks the original signed session cookie, active membership, technician assignment, exact revision and currently approved documents. Logout/revocation, reassignment, changed report events, source withdrawal and new-turn cancellation stop subsequent output. A partial stream error terminates the response so the client does not mistake truncated PCM for a complete utterance.

When Meta conversation is explicitly configured and an admitted ASR clip exists, **one** guarded response classifies question/report/clarify and supplies any report proposal. The server constructs the canonical order, current event history, pending transcript/audio provenance, bounded retrieved context and `spokenReviewContext`. It does not import the old hard-coded Perihelion field references. `prepareSpokenReview` and `acceptSpokenReview` validate the provisional state, actual source IDs, narrow correction targets, superseded observations, absence of unprovided image claims and exact quoted owner decisions. Source pages remain untrusted reference data.

A question or clarification cannot commit testimony, proposals, decisions or a pending-source citation. A report's spoken acknowledgement is derived from its **validated** state, rather than accepting a model's promise that an owner was saved. The full next event sequence is validated before one `OperationsStore.syncEvents` commit, with a current-state/access check immediately before it. Responses expose server-verified events and `reportSaved:true`, while `confirmed:false` and `delivered:false` preserve the separate final-review and office boundaries. Combined requests have a 100 KB input and 3,000-token output ceiling; they use the same unchanged guard and no automatic retry.

### Server timing and the phone clock

Successful `voice/transcribe` and `voice/answer` responses include `serverTiming`, version `carryforward.server-timing.v1`. Its `points` are milliseconds from that individual route handler's entry, measured with Node's monotonic `performance.now()`. The metadata explicitly says `clock:"server_monotonic"`, `clientClockComparable:false` and `acousticMeasured:false`. Transcription and answer are separate request origins. Store them beside the client's release-based trace; do not merge their offsets, subtract them from the phone clock, or interpret server entry as hold release.

Answer points bound approved-source retrieval; canonical saved-audio/report-context preparation; the model adapter call; candidate classification and proposal validation when present; fresh authority/source/state checks; the actual report event commit; and a validated one-use speech grant. The combined model interval includes guard/accounting preflight, transport, parsing, the separately measured validation callback and the adapter's final authority checks. `classificationReady` means a parsed candidate reached validation, **not** that its proposal is accepted. `proposalValidated` means the source/correction/quoted-owner checks passed; `stateCommitted` comes only after persistence and matching saved revision. A typed factual answer validates inside its adapter and does not claim separately measured classification or proposal stages.

Transcription points bound verified original/WAV admission before ASR, the guarded ASR adapter call and final access/turn validation. This admission is server storage, distinct from the client's earlier local save. `responseReady` precedes JSON serialization and network delivery. A speech grant does not measure ElevenLabs generation, a PCM callback, native playback or first audible sound. No release, client local-save, first-playable, completion or acoustic timestamp is invented here.

Each `stages` entry names its kind, start/end points and measured duration, or is explicitly `skipped` without duration or manufactured points. Local lookup has no model interval; questions have no report commit; a company with speech disabled has no grant interval. The timing instrumentation does not add model requests or retries and does not change approval, cancellation, saved-state or speech gates. Real HTTP checks verify those distinctions and that an injected model-transport wait falls within the model interval. These checks use mocked provider transport and establish instrumentation behavior only; live latency and physical sound remain unmeasured.

Eight real local HTTP checks use genuine Better Auth signup, signed sessions, distinct companies and assigned technicians. Only provider transports/results are mocked. They cover original admission before ASR; one combined model dispatch; a question adding no events; complete one-use PCM; foreign companies/grants; bad hashes; source withdrawal and actual membership revocation; a 4.2 → 2.4 kW correction retaining monitoring/no replacement and two Operations owners; invalid source/owner proposals preserving originals without committing events; and revocation during PCM suppressing the next chunk. This establishes the local configured route and validation behavior, not live model quality, live allowance availability, speech timing or physical sound.
## Client admission and release timing integration

The pilot now constructs one immutable original/WAV identity before local storage. Original bytes, SHA-256, transcription WAV and WAV hash remain identical during transcription admission and any later Sync saved work request. Previously, serial original admission omitted the WAV metadata and the transcription route supplied it under the same clip ID, which could fail the identity contract. The configured voice route now admits the original before ASR without that redundant preliminary upload; local-only mode can still admit the same clip after the provider-disabled response.

The client timing origin is the actual hold release reported by the recorder, before cleanup/PCM finalization. `localSaved` is recorded after the encrypted local write, then the same timing object continues through voice setup, ASR, validated answer and playback callbacks. Server ASR/retrieval/validation timings use their own monotonic origin and stay separate; they are not subtracted from client timestamps. Neither clock measures acoustic speaker output.

`pilot/client-voice-integration.test.mjs` runs the actual client clip/controller and reply-speaker flow through genuine signed HTTP, original admission, mocked ASR, actual scoped source retrieval, one-use mocked PCM speech, later original sync and exact media/report confirmation. It also cancels during mocked ASR and verifies that the admitted original remains while late answer/speech dispatch is suppressed. Test teardown drains best-effort cancellation before closing authentication storage. Provider transports and the PCM sink are explicitly mocked; no live allowance is spent and this is not a live or acoustic latency benchmark.
