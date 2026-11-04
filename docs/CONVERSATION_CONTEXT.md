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

## November 3 — approved company context and job references

The owner directed loading the October 1 company safety manual and pointed this task to “Update safety manual date.” The retained verified source revision matches its approval receipt. It records owner acceptance and owner-reported Safety Officer approval on November 3; it does not establish completed site planning, training or job authorization. Thirty-five substantive policy/operating-annex sections were extracted verbatim with heading links into ignored private storage. Forms and the external-reference list are excluded. The private original, approval receipt and extracted body are not committed or served as public assets.

`CARRYFORWARD_COMPANY_CONTEXT` selects a bounded, validated local bundle. Explicit bad configuration fails startup. `CARRYFORWARD_COMPANY_CONTEXT_META_APPROVED=1` is separately required to include it in Meta requests; the owner explicitly approved relevant manual excerpts for technician answers and three fictional checks on November 3. Without that flag, private sections stay out of model context. The source file itself returns 404 from the web server. No live Drive synchronization or general upload UI is implemented.

For each question, retrieval supplies the responsibilities and daily-planning sections plus up to four relevant sections, with a 24,000-character bound. Each carries section ID, exact source revision, heading URL, approval basis and confirmation date. Answers save the selected IDs and cited metadata in provenance. The broader company platform remains [proposed](COMPANY_CONTEXT_CONTRACT.md); this configuration is process-wide and is not multi-company isolation.

The demo SE7600H-US now has short reviewed summaries and links for two official SolarEdge family guides: LCD `MAN-01-00306-1.1` (July 2018) and SetApp `MAN-01-00541-1.4` (August 2020). Both are candidate references, not an exact-unit procedure match. The assignment lacks full part number/configuration. The catalog is explicitly limited to the fictional demonstration system, including cloned visits; it is not general manufacturer-document ingestion. PDFs are not redistributed. Manual selection/operating authority cannot be granted by importing a matching model name.

Dated work-order customer history is now also supplied as individually citable, job/system-scoped sources, preserving its dates and reported status. This remains the fictional assignment's history; no actual customer collection or Perihelion integration occurred. Current testimony, historical reports, model replies and measured outcomes remain separate.

Three actual guarded Spark HTTP checks returned: the cited Safety Officer role with the company section citation; neither LCD nor SetApp guide confirmed without the nameplate/variant; and warranty/replacement shipment unconfirmed with Operations retaining the update. An initial attempted check was refused because the guard was serving the owner's phone turn; it made no additional model request and did not retry automatically. The three checks were run deliberately after the phone test ended. This is a bounded development check, not a general accuracy benchmark.

157 Node checks pass, including source collision/wrong-equipment boundaries, dated history/provenance, private-file exclusion and default-off manual transmission. The aggregate guard remains $10; after these checks it held 184 requests and $7.714877 reserved, not a final charge. No reset or new provider was used.

Official source links: [LCD family guide](https://knowledge-center.solaredge.com/sites/kc/files/se_hd_wave_inverter_installation_guide_na.pdf), [SetApp family guide](https://knowledge-center.solaredge.com/sites/kc/files/se_hd_wave_inverter_with_SetApp_installation_guide_na.pdf).
