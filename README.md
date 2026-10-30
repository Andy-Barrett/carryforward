# CarryForward — field operations

From work order to a clear handoff. A separate product from PRISM and Perihelion Operations.

## Run locally

Node 24; no installation required.

```sh
node server.mjs
node --test
```

Open http://127.0.0.1:4310. The server binds only to loopback.

## Workflow

1. Read a synthetic work-order briefing or import a bounded JSON work order using the downloadable sample format.
2. Record work performed, observations, observation times, evidence references, new promises and a follow-up owner.
3. Review missing evidence against each assigned check. Repair, production, monitoring and warranty remain separate obligations.
4. Confirm the technician's report and download the work order and closeout together as JSON. Confirmation does not close open items or mark Operations acceptance.

Drafts persist in browser-local storage. Confirmation is kept in memory until export; reload requires re-review and confirmation. Replacing an imported work order resets its draft after a browser confirmation. This demo supports text evidence references, not photo/audio upload or source-content verification. Browser storage failure is shown to the user.

## Current boundaries

Synthetic data only. Deterministic completeness checks, not AI reasoning or technical safety verification. No live Operations reads/writes, provider calls, API keys, paid inference, PRISM changes or deployment. Meta calls remain disabled until hackathon credits are confirmed under the owner's instruction.

The import/export formats are prototype-owned and are not yet an accepted Perihelion Operations API contract. No production schema changes are required for this milestone.

## Next milestones

- Meta-backed, cited comparison of raw work-order scope against technician notes, photos and voice transcripts.
- Ask focused follow-up questions while the technician is onsite; distinguish field testimony from independently checked evidence.
- Add evidence uploads with explicit custody and retention rules.
- Evaluate on withheld synthetic work orders, including partial completion, stale monitoring and unsupported closure.
- Map an approved Operations export to this contract; add authenticated integration only after reviewing the existing Operations boundary.

## Hackathon disclosure

Created October 30, 2026. Initial business-transition prototype was pivoted to field operations following owner direction. Fictional cases were informed by operational lessons; no Perihelion customer records or application source were copied. Document actual model use and results before submission. The repository remains private until an authorized public-release review.
