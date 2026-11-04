# Contest scope — October 30, 2026

## The product we are building

I run a solar company. My technicians know how to do the work. CarryForward should help them bring back the details the rest of us need, without turning the end of every visit into paperwork.

The experience is a conversation with a field partner that knows the assignment, can review the job's photos, and knows when to ask another question and when to stop.

## One complete visit

Use a fictional inverter service visit with an imported work order. The technician hears or reads a short briefing, speaks naturally about the work, adds photos, and supplies further observations. CarryForward compares the evidence to the assignment, asks a material follow-up, and prepares a reviewable closeout.

A new photo can open a new question. An answer can resolve one question and leave another open. The technician never has to operate an investigation graph.

## Demonstration sequence

1. An Operations simulator submits an assignment with stable job and equipment identifiers.
2. CarryForward briefs the technician on the fault, prior notes, expected observations, and existing warranty commitment.
3. The technician narrates the visit in their own words, including an interruption and a joke. The app responds briefly without losing the job context.
4. The technician refers to “the photo with the inverter door off.” Search only the current job's admitted photos. Show a candidate for confirmation; do not silently choose ambiguous evidence.
5. The model interprets the relevant image and compares it with the report. The app asks whether an output reading was taken after replacement, or requests the missing observation if the supplied image does not establish it.
6. The technician reports that monitoring is now live. Preserve that as technician testimony unless separate telemetry corroborates it.
7. CarryForward keeps warranty paperwork open, assigns a follow-up owner, and stops asking questions that cannot improve the field handoff.
8. The technician reviews and confirms the report while parked. The simulator receives the closeout, including unresolved items. Operations acceptance is a separate event.

Use complete, incomplete, and contradictory evidence variants. Do not hard-code the expected findings into the model prompt or pretend a photo proves an unrelated outcome.

## What must be real in the submitted demo

- Phone-friendly capture and durable job-scoped evidence.
- Actual Meta model calls for substantive interpretation, with model IDs and usage recorded.
- Source-linked findings and a loop that updates after new evidence.
- At least one useful targeted follow-up and an explicit deferred item.
- Working API input and output against a clearly labeled local simulator.
- A closeout whose claims can be traced back to observations or testimony.

The local prototype now exercises the evidence-review and simulator handoff path using actual Meta calls. See `docs/READINESS_REVIEW.md` for evidence and remaining gaps. Native iPhone installation and a basic record/stop/play cycle are now verified; full capture/interruption acceptance and a technician usability run remain pending. This is not a finished field deployment or submitted contest entry.

## Cut before compromising the core

Keep text fallback if spoken output or streaming is unreliable. Keep manual photo selection if semantic photo search is unreliable. A small reliable job-scoped photo collection is enough. Preserve the actual evidence-review loop and clear handoff first.

No full photo-library access, glasses integration, cross-job personal memory, per-user fine-tuning, production Operations synchronization, automatic parts orders, equipment writes, or autonomous safety certification in this contest scope.

## Acceptance evidence

Evaluate about 12 synthetic cases, with expected outcomes prepared before prompt tuning. Reserve cases for final evaluation. Compare with a plain visit-summary prompt using the same model and supplied evidence. Report missed obligations, unsupported completion claims, unnecessary questions, source-reference validity, human interaction time, latency, and cost.

Personality is a hypothesis, not a claimed accuracy improvement. To evaluate it, compare fixed and adaptive styles with the same model, evidence, tools, and task; record user effort and omissions separately from whether people enjoyed it.

The proposed efficiency measure is supported outcomes per human interaction minute. Report quality failures separately so brevity cannot hide missed obligations. Do not present invented evaluation numbers or self-rated confidence as measured accuracy.

## Submission readiness

The participant guide inspected October 30 requires Meta models, a public repository, a three-minute video, and a submission through the CV platform by November 4 at 9 PM Eastern (8 PM Central). Judging weights are impact 30%, Meta tooling 25%, technical execution 20%, demo 25%.

Source: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details

Verify late announcements before submitting. Public-release review, license choice, hosted-demo access, and the actual release remain owner decisions. Document AI development assistance and newly built features accurately.
