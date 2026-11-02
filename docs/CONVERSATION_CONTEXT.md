# Conversation quality checkpoint — November 2

The first phone questions exposed a routing problem: most work-order questions went through a small keyword lookup. Meta transcribed the words, but did not reason about the question. “What is the inverter manufacturer?” received a generic unavailable answer, while “So, what’s going on with this customer?” was incorrectly saved as a field report. The old assignment also lacked a make and model. These are separate problems: missing context and poor routing.

The spoken path now sends the current question, validated complete work order, up to twelve recent exchanges, and up to twenty active technician reports to guarded Muse Spark. It distinguishes a question, a clear report and unclear speech. Questions and clarifications are saved in a separate job-scoped conversation store; they do not become investigation evidence or change a report confirmation. Clear reports continue through the existing evidence review. A mixed report/question can answer the question while retaining the report review. No recording or photo bytes are sent by the answer route.

The context includes a curated public Perihelion profile and general safety references, each with its source URL and review date. Imported content cannot declare itself an approved procedure. There is no open web browsing, private Perihelion connection, live monitoring, or approved equipment manual in this route. Company hours, internal contacts, pricing and warranty coverage remain unknown unless supplied. Public hazard reminders do not authorize electrical procedures or establish compliance.

The new fictional assignment supplies equipment inventory, location, system capacities, appointment, dated customer reports, changed Wi-Fi, access notes, visit scope and warranty ownership. These remain assignment facts, not field observations. Existing saved assignments retain their original contents. Start a new test work order to use the richer fixture.

The main interaction remains hold, speak, release, hear the reply. Details contains the text fallback, source controls, recorded notes and questions/replies. Text fallback uses the same conversational context when Meta is enabled. A text-only conversation-review export supports review without exporting audio or image bytes. Earlier source-lookup replies were not durably saved; exporting raw transcripts cannot reconstruct their exact answers.

Left swipe opens work orders; right swipe opens the current work-order details. Horizontal motion must exceed a threshold and dominate vertical movement; controls and capture/save activity block navigation. Native WebKit history gestures are disabled so they do not compete with these views. Contact links use a trusted main-frame bridge to open the selected system action; no message body or automatic sending is supplied.

## Spoken output

The owner reported that spoken replies started and then cut out. The previous synthesizer used the same application audio session as playback and WebKit capture, and treated shared-session interruptions as a stop. Build 10 gives speech a system-managed session, removes that shared-session interruption observer, reports unexpected synthesis cancellation as a failure, and avoids calling Web Speech cancellation for native speech. It uses a faster native rate of 0.60 (the API's rate scale), with browser fallback rate 1.3. The startup deadline is twelve seconds. These address plausible interruption/cancellation causes; physical repeated-response acceptance is tracked separately, not assumed from a successful compile.

## Verification and limits

Eight actual guarded Spark cases exercised customer summary, equipment manufacturer, short model follow-up, company services, safety/procedure limits, missing serial number, garbled speech and a field report. The first report reply was too long despite passing its intent check; a revised prompt returned a short acknowledgement in a ninth call. This small development check is not an accuracy benchmark or proof against all prompt injection. A separate in-app manufacturer question returned the supplied make/model and left zero report answers. No retained owner recordings were uploaded for this evaluation.

The answer route keeps exact-origin session authorization, fictional-job restrictions, bounded attempts, fixed model/endpoint, response and citation validation, no provider storage, and the existing aggregate $10 guard. All calls share that guard; its ledger is not reset. A report may require both a conversational classification and an evidence-review call.

Reference summaries were reviewed November 2, 2026:

- [Perihelion Solar](https://perihelionsolar.com/) — public company background.
- [OSHA solar electrical hazards](https://www.osha.gov/green-jobs/solar/electrical).
- [OSHA hazardous energy overview](https://www.osha.gov/control-hazardous-energy).
- [OSHA solar fall hazards](https://www.osha.gov/green-jobs/solar/falls).
- [OSHA occupational heat overview](https://www.osha.gov/heat-exposure).
- [Apple system-managed speech sessions](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/usesapplicationaudiosession) and [speech rate](https://developer.apple.com/documentation/avfaudio/avspeechutterance/rate).
