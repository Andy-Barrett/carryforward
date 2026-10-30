# Build plan

The first release needs to handle one service visit well: prepare the technician, capture the outcome, identify missing evidence, and produce a useful handoff.

## Working foundation

- [x] Work-order briefing and source history.
- [x] Validated JSON work-order import.
- [x] Field report with separate checks for work, production, monitoring, and warranty.
- [x] Browser-local drafts and explicit technician confirmation.
- [x] Closeout export that preserves unresolved items.
- [x] Focused tests for partial completion, missing evidence, exceptions, and invalid imports.

## Next: capture the visit on a phone

- [ ] Photo capture with attachments associated with the right work order and observation.
- [ ] Voice recording with a text-entry fallback.
- [ ] Durable local attachment storage and clear save/sync state.
- [ ] Installable web app shell.
- [ ] Actual iPhone and Android testing, including interrupted connectivity.

Success means a technician can leave the page, return to the same draft, and tell what has been saved locally. A desktop browser resized to phone dimensions is not sufficient device testing.

## Then: review the evidence

- [ ] Meta model adapter, with usage accounting and bounded requests.
- [ ] Compare raw assignment text with field notes and attachments.
- [ ] Link findings to the passages or media that support them.
- [ ] Ask a focused question when an observation is missing or contradictory.
- [ ] Update the review after the technician supplies another answer.
- [ ] Preserve unsupported outcomes as unverified.

Live inference remains disabled until hackathon credits are confirmed. Mock or deterministic results must remain visibly distinct from actual model output.

## Prove the difference

Prepare a small set of synthetic service cases before tuning the prompts. Include completed work, partial completion, stale monitoring, conflicting observations, and unsupported closure.

Compare the evidence-review workflow with a simple visit-summary prompt using the same model. Report missed obligations, unsupported completion claims, unnecessary questions, citation validity, latency, and cost. Publish measured results, not target numbers presented as results.

## Submission

- [ ] Reliable hosted demo with fictional data.
- [ ] Three-minute video showing a missing observation caught and resolved.
- [ ] Accurate disclosure of hackathon work and model use.
- [ ] Repository reviewed before changing visibility to public.
- [ ] Submission links tested before the November 4 deadline.

## After the core workflow works

Add authenticated work-order and closeout APIs, external ID mapping, duplicate-request handling, and delivery notifications. Operations acceptance stays separate from technician confirmation. Live Perihelion integration requires its own contract and access review.
