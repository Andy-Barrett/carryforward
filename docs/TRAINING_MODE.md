# Teach CarryForward — role-reversal concept

Andy requested a reverse trial in addition to the normal workflow: the human plays CarryForward and the AI plays a fictional technician. A future optional **Teach CarryForward** mode could make this a practice interview and a way to collect reviewed examples of useful questions. This document specifies that concept and its trial capture. It is not an implemented in-app mode or a model fine-tuning system.

## The exercise

The human sees the work order and asks the questions they believe CarryForward should ask. The AI receives a fixed technician role card with case facts, responds naturally, and never invents work to satisfy a leading question. A joke or “it's alive” is not evidence. The human can request a photo, accept inability to verify, assign an owner and finish the handoff.

Keep the normal technician trial first. Run role reversal afterward as a separate training exercise, using the fresh reverse case. This avoids coaching the normal trial with the answer key. Reversing style order remains a separate counterbalancing step; it is not role reversal.

Use a five-minute or eight-AI-reply ceiling for the first pilot. The observer may stop earlier. Any eventual model calls must use the existing shared budget guard and record usage; preparation makes no calls. The role-playing model cannot certify the quality of its own behavior. Case facts and human review govern scoring. If it violates its role card, retain that turn and mark a simulation-fidelity error.

## What we capture

- Session mode, explicit human/AI roles, simulation label, case/photo hash, source commit, model and prompt version.
- Exact ordered questions and answers, speaker, timestamps, evidence references and corrections. Preserve the original wording.
- Active human effort and provider wait separately; actual usage and latency when available.
- Post-run labels: question purpose, necessary/too early/repeated/annoying, missed obligations, unsupported completion, source errors and role-card violations.
- Suggested wording, a brief optional explanation and reviewer approval. Label after timing so annotation work does not distort the interview measurement.
- The final handoff and its unresolved items. An AI technician's fictional answers are never real technician testimony or operational evidence.

Each future `turns.jsonl` record should carry `turnId`, `sequence`, `speaker`, `at`, `text`, `evidenceIds`, `supersedes`, and model/usage/latency when applicable. Save the final human-written handoff separately after the trial; do not prefill a successful handoff.

The generated `reverse/session.json`, empty `turns.jsonl` and blank `labels.csv` are capture templates, not populated results. A runtime recorder for these files and an in-app training interface remain future work.

## How the examples could improve the product

A reviewed human question can suggest better wording or question order. Case-specific facts must stay with the case. A communication preference becomes an explicit, editable suggestion; it does not silently change evidence rules, infer personality or become cross-job memory.

Keep training sessions out of the normal job history and Operations handoff. Preserve source/provenance and approval on any example promoted into a prompt or evaluation. Updating a prompt or explicit setting is different from retraining model weights. No automatic learning, provider training submission or fine-tuning is implemented or authorized by creating this protocol.
