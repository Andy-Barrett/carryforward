# First-pass field review evaluation

The first run does not demonstrate an accuracy advantage over a careful same-model summary. Both recognized reported work, missing measurements, corrections, deferrals and pending paperwork. CarryForward's additional value is validated structured state, source history and the review-to-Operations workflow.

## Frozen comparison

Twelve authored fictional cases (eight development, four reserved), one sample per variant, same muse-spark-1.3 model, identical supplied evidence, low reasoning and 4,000 output-token limit. Variant order alternated; no retries or tuning during the run. Expectations were prepared before dispatch and excluded from model inputs.

Source commit: 5a11fc4dcdb49d092e4efa9e812e2d80dc82d4cf
Results SHA-256: fa9b5c2a15b3bbdf55f5c8d8d8a9f2003d774b9dc9b60ee5b464b5fca2baae7f
Raw outputs and sealed manifest remain under `.local/evaluations/first-pass-20261030/` (ignored).

| Variant | Usable responses | Median API time | Estimated token charge |
| --- | --- | --- | --- |
| carryforward | 12/12 | 9.86 s | $0.11590 |
| summary | 12/12 | 7.22 s | $0.06752 |

All 48 CarryForward branch decisions matched the fixed expectations: 21 reported outcomes supported and 27 unresolved outcomes retained. No unsupported positive completion was observed under this rubric. Manual, unblinded review of baseline prose also found all 21 reports and 27 unresolved obligations retained; supporting quote spans are recorded in `evaluation/baseline-review.v1.json`. This is recognition of reports, not independent verification of completed work.

## Question issues retained

- EVAL-03 revisited timing the technician already described as unknown.
- EVAL-04 asked two question sentences in one JSON field.
- EVAL-07 asked for a future onsite check despite current inaccessibility.
- EVAL-10 asked the technician to schedule work already assigned to Operations.

These issues are not captured by perfect branch-state scores. Subsequent development changes instruct the model to avoid unavailable observations and already assigned office work, and reject multiple question marks. They have unit coverage but have not yet had a live retest.

## Limits

Cases and manual review were authored by Codex and are not independent or blinded. Four reserved cases were untouched before this run; now inspected, they are no longer fresh held-out cases for subsequent tuning. Synthetic clean display images do not establish field-photo performance. Human effort, physical-device usability and personality effects were not measured. API time is not human interaction time; token charge estimates are not invoices or guard reservations. No claim of general accuracy, zero hallucinations or personality-driven improvement follows from this run.
