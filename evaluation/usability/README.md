# Technician usability pilot

This trial checks whether a person can finish the evidence loop with acceptable effort. It does not establish an accuracy advantage over ChatGPT, a causal benefit from personality, or physical-phone support before those are observed.

Prepare a fresh fictional kit from Node 24:

```sh
node scripts/prepare-usability.mjs --name=pilot-01
```

The generator refuses an existing run name and writes only under ignored `.local/usability/`. It creates two importable assignments, matching synthetic display images, technician cards, an observer-only rubric and a blank CSV. No provider request, app import or test success is triggered by preparation. Keep participant aliases and results local; do not collect customer evidence or identifying personal recordings.

Use the approved guarded route for any synthetic model calls, within the existing shared $10 cap. For a text-only pilot, type fictional testimony. Actual phone recording requires the device-access and permission checks in `docs/PHONE_VALIDATION.md`; a text pilot cannot establish voice usability.

## Procedure

1. Record source commit, participant alias, device/browser and whether capture is text or synthetic voice. Give the participant only the technician card and case assets. The observer sees the rubric; do not add it to model context.
2. Allow one untimed practice with an unrelated fictional job. Explain where the briefing, interview, photos and final review are; do not coach answers during the timed run. Count later assistance.
3. Run the paired cases in direct and conversational modes. Alternate which style goes first across participants; swap style-to-case pairing on the next participant. This mitigates practice effects but does not eliminate them in a small pilot.
4. Start elapsed timing when the participant opens the assignment. Separately tally active speaking, typing, reading and reviewing time. Record provider wait separately using visible review timings; do not call total elapsed time “human effort.” Record interruptions and assistance rather than deleting inconvenient trials.
5. Ask the participant to finish an accurate handoff, including explicit unresolved work. Stop timing at technician confirmation. Check source receipt and acceptance separately; do not mix office simulation time into technician effort.
6. Save the exported report/media and an exact revision reference in the local run directory. Mark the CSV complete, failed or abandoned. Leave unmeasured values blank, not zero.
7. Ask for a 1–5 enjoyment rating and the most annoying moment. Observe quality first: missed obligations, unsupported completion, invalid sources and unnecessary questions remain separate from speed and enjoyment.

The observer may inspect the final source-linked handoff and retained conversation. Claimed support is not independent verification of physical work. A declared inability to verify is a valid outcome, not a failed technician.

## Reporting

Report individual trial results before aggregates, sample size, missing values, assistance and practice order. Supported outcomes per active human minute is exploratory and must be accompanied by the quality failures. Do not average an abandoned trial into a successful score.

The existing same-model summary comparison measures output quality on fixed supplied inputs. It does not provide a comparable user interface or capture workflow, so this pilot must not claim a time advantage over that summary baseline. A single pilot can identify friction; it cannot prove that style increases accuracy or that technicians generally enjoy the app.

## Reverse trial: the human plays CarryForward

Andy also requested role reversal. Fresh kits now include a separate `reverse/` case: human-interviewer instructions, an AI-technician role card, an observer key, an empty turn log and blank annotation templates. Keep the AI and observer cards hidden from the human interviewer during the exercise. Run it after the normal trial; do not combine its effort scores with ordinary technician use.

See `docs/TRAINING_MODE.md` for the optional Teach CarryForward concept and capture requirements. This is a prepared trial protocol; no in-app training mode, runtime capture or automatic model learning is claimed.
