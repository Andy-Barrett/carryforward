# Reviewing CarryForward

CarryForward is a local field-visit prototype built for the Meta Global AI Developer Hackathon. Start with the [README](../README.md) for the problem, model roles and local setup. This snapshot branch contains the November 4 company-Pilot application source; its [scope record](CONTEST_DEMO_SNAPSHOT.md) identifies the exact source and the separate earlier Dev trial. A hosted service is not provided.

## What the recorded phone demo shows

The fictional NorthStar / Elena visit includes an assignment readout, an equipment answer that distinguishes the listed inverter from onsite verification, gate-access context and a useful follow-up after vague completion testimony. The later excerpt is visibly labeled. The recording does not show source-page inspection, a saved correction, final confirmation or API acceptance. Current mobile reliability remains under evaluation.

Meta Voice Transcribe handles released speech, and Muse Spark interprets the conversation. The briefing is an assignment-derived readout; it is not Meta-generated reasoning. ElevenLabs Sarah supplies the spoken output. Narrow exact lookups and local source navigation are distinct from model calls.

The November 3 corrected-reading/API-handoff result below is historical evidence from the earlier Dev version. It is not relabeled as a result of the November 4 Pilot recording.

## Follow one service visit

1. An assignment supplies the job, system, requested work, dated history and source context.
2. The technician asks about the job and reports findings through a hold/release conversation, with text available as a fallback.
3. Corrections retain the original testimony. Unsupported outcomes stay open, and explicit deferrals carry an owner.
4. A human reviews and confirms the report. The local source-system simulator records delivery receipt and a separate acceptance of that exact revision.

The default local startup makes no model calls. Use [the guarded development instructions](META_DEVELOPMENT.md) to configure actual Meta services. Product requests and coding assistance are distinct uses of Meta.

## Evidence map

| What to inspect | Evidence |
| --- | --- |
| Real job context and a useful field conversation | [Pre-visit brief](PRE_VISIT_BRIEF.md), [conversation context](CONVERSATION_CONTEXT.md), [voice path](LIVE_VOICE.md) |
| A correction preserves unrelated testimony | [November 3 field trial](FIELD_TRIAL_2026-11-03.md), `spoken-review.test.mjs`, `investigation.test.mjs` |
| Unfinished work survives handoff | [Field trial](FIELD_TRIAL_2026-11-03.md), [Operations API](OPERATIONS_API.md), `operations-api.test.mjs` |
| Original evidence and revision boundaries | [Storage verification](LOCAL_STORAGE_VERIFICATION.md), `evidence.test.mjs`, `operations.test.mjs` |
| Bounded actual Meta evaluation | [First evaluation](EVALUATION_FIRST_PASS.md), [evaluation method](../evaluation/README.md) |
| iPhone observations and remaining limits | [Phone validation](PHONE_VALIDATION.md), [readiness](READINESS_REVIEW.md) |

In the completed owner-run fictional iPhone visit, 4.2 kW was amended to 2.4 kW before work. Reported monitoring and no replacement remained in the record. Production and warranty stayed deferred to Operations. Seven original voice files and eleven investigation events matched local API readback, with source receipt and separate `accepted_with_followups` acceptance of the confirmed revision.

The assignment in that visit was admitted to the simulator at closeout. API-first assignment is implemented and tested separately; a fresh continuous recording should show admission before briefing. Camera capture passed separately and was not part of that continuous visit. Build 19’s newer visual design and subsequent artwork refinements do not establish a new full voice/camera acceptance.

## Read the result precisely

A technician report is testimony. An automatic transcript is unreviewed until human review. A model finding proposes an interpretation. Confirmation, delivery receipt and source-system acceptance are separate events. Acceptance concerns the handoff; it does not certify physical production, electrical safety or warranty completion.

The first comparison against a strong summary using the same model did not demonstrate an accuracy advantage. No independent technician study or measured time-saving result is claimed.

## Source and release

The public main branch is MIT-licensed. [Checks](https://github.com/Andy-Barrett/carryforward/actions/workflows/checks.yml) run Node 24 syntax and automated tests. [The source release record](RELEASE_CANDIDATE.md) separates current publication from historical candidate snapshots. Real customer data, credentials, private company documents and retained recordings are excluded.

This branch includes the company-Pilot source, while public main retains the earlier Dev prototype and its polished presentation. Provider credentials, private account/runtime state, company/manufacturer originals, backups and retained recordings are excluded. A production deployment and contest submission remain separate steps.
