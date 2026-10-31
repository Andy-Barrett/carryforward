# Pre-visit briefing

The cloud opens a new assignment with its pre-visit brief before asking for field testimony. It covers the system/equipment, reported problem, troubleshooting context, customer preferences, gate/access arrangements, safety references and ladder/elevated-access context. The original requested scope and dated history remain available in a disclosure. “The brief” and “repeat the brief” return to the same job’s briefing.

## Data and source contract

`carryforward.work-order.v1` accepts an optional `briefing` object with section keys `system`, `problem`, `troubleshooting`, `customer`, `access`, `safety`, and `ladder`. Each section accepts up to four notes, with twenty total. A note is `{id,text,kind,source:{id,title,revision,page?}}`; kind is reported, context, hypothesis or reference. Notes have bounded text and unique IDs, and every supplied note needs source metadata. Missing fields remain explicitly not supplied; absence does not mean no gate, no battery, no restrictions or no hazard.

Troubleshooting ideas retain their source and hypothesis label; they do not establish a cause. Safety and ladder imports are unapproved reference notes only. The visible brief calls out missing approved/applicable guidance, keeps the raw references in a clearly labeled disclosure, and does not read their text aloud as operating rules. Importing a document cannot grant approval or equipment applicability. Unknown/approval fields are rejected. The existing exact-system/revision/action warning gate remains separate; no new source-approval workflow is provided.

Briefing context travels with the validated assignment, saved job and exports/Operations packet. It never becomes admitted field evidence. The Meta review prompt distinguishes this context from observations, and existing source validation rejects a model’s attempt to close work using briefing-only IDs.

## Opening and persistence

Continue to the visit records only local viewed state against the full assignment hash. It is not a safety acknowledgment, an authorization or a report confirmation. Reopening the same assignment can resume capture, while a new/revised brief is shown again. The brief button preserves unsent narration. Spoken readout is an explicit action through the existing local-browser voice; unavailable local speech leaves the brief readable. No microphone activates automatically.

The new sample is DEMO-WO-1043 / DEMO-SYS-017. It intentionally does not change retained DEMO-WO-1042 assignments: Operations rejects changed content under a reused external ID. Legacy imports remain valid and visibly lack the new optional context. The fictional three-page DEMO-BRIEF-1043 / DEMO-1 packet exactly matches its source-tagged notes. It is supplied reference content, not an approved safety document or evidence of actual site conditions.

## Verification and remaining work

95 Node 24 tests pass, including optional-contract/roundtrip, bounds, old assignment preservation, unapproved reference handling, recall and model evidence-boundary checks. Desktop and 390×844 phone emulation checked the seven sections, Continue, recall and layout. Desktop also checked draft preservation and actual PDF preview. Speech and microphone were not activated, and no actual model call occurred in this increment. Physical device checks remain separate. Approved site/equipment procedures and applicable company ladder rules must come from authorized sources; this sample intentionally shows them as missing.
