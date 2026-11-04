# My day and departure preparation

November 4, 2026. Implemented in the local company pilot. Hosted release remains deferred under Andrew's “Keep it local for now” decision.

## Technician workflow

1. On Work orders, check **Include in my day** for the assigned jobs you intend to visit.
2. Use **Earlier / Later** to arrange the stops. Each change saves to your signed-in company/user's day plan. **Suggest nearby order** presents a proposal; **Use this order** is the explicit action that changes your plan.
3. Open **Before you leave** at the top of My day. It activates preparation for the first selected stop and shows required, suggested and unknown packing items across the selected assignments, with each work-order source retained. Review the departure checks and acknowledge the actual equipment. Optional location/notification permissions remain a separate choice.
4. Tap **Open first visit** to enter the conversation for your first planned stop, or **Open visit** on any assigned work order. Selecting a job for My day only plans the order; it does not open the visit. **More → Finish visit** keeps its onsite observations/report state visible and identifies the next planned stop. A changed plan never silently opens another job or sends a report.

The list supports up to 20 assigned stops and 60 combined preparation items. Only work assigned to the signed-in person can enter their plan, including when an owner/dispatcher can see additional company jobs. Other users' plans are separate. Changes persist on the local server across reload and restart; a connection is required to edit. One active daily plan is retained per company/user. The date uses the supplied IANA time zone, and yesterday's order is not silently reused today. Future-date scheduling and an appointment calendar are not implemented.

## Distance advice

Distances use the work orders' supplied shop/site coordinates and a local great-circle calculation. They are **straight-line estimates**, not road mileage, traffic, ETAs, appointment feasibility or a globally optimal route. No map service, geocoder, device GPS request, paid inference or external location transfer is used.

When all stops have the same valid shop, the nearby-stop proposal starts there. Otherwise it preserves the technician's first stop and suggests subsequent nearby stops. Missing, ambiguous or invalid coordinates leave manual ordering available without inventing distances. Suggestions are shown in My day; this increment does not add a live multi-job voice-planning model. Existing questions/reports remain job-scoped.

## Reminder behavior

The active visit stays independently scoped. When it is in today's plan, shop preparation includes all selected jobs' dispatcher-supplied checklist items, with separate job-bound IDs and sources. Reviewing this checklist does not assert that every equipment manual or job briefing was read. The first-stop **Before you leave** action establishes that active preparation context; selecting jobs does not infer that a prior visit has ended.

Site departure retains the current report reminder. After its report is sent/received/accepted, required unacknowledged equipment for the next planned stop can still produce a distinct **next-stop preparation** reminder. That does not reopen the sent report or mark physical work complete. Explicit equipment acknowledgment clears that packing reminder. The last stop has no next-stop packing requirement.

The brief fingerprint includes selected order, assignment revisions and preparation context. Changes reset preparation acknowledgments. Old-revision acknowledgments are ignored; an open sheet refreshes rather than displaying them as accepted. Reassigned/unavailable stops are excluded and raise a day-review warning until the technician reviews and resaves. Requirements that grow beyond the preparation limit also require review rather than silently declaring the day ready. The API rechecks day context after asynchronous authentication before saving/returning a reminder grant.

Native grants contain bounded reminder text/equipment labels, not the day's customer list, next customer's identity, address or access details. The new site preview says “Check required equipment for your next stop”; changed plans use a generic review message. Existing opt-in, precise-location, dwell/exit rules, lease expiry and snooze/mute remain in force. A refresh cannot promise immediate cancellation while iOS is suspended or disconnected. Actual physical delivery/timing for these new reasons is unverified.

## Storage and API

`GET /pilot/api/day-plan?date=YYYY-MM-DD&timeZone=America/Chicago` returns the signed-in user's current local-date plan and presently authorized assignments. `POST /pilot/api/day-plan` accepts only `{date,timeZone,revision,jobIds}`. The last observed revision is required, including `null` initially; stale writes return 409. No request can choose another company/user. Integration credentials cannot edit the plan. Duplicate/unassigned/cross-company IDs, unsupported dates/time zones, oversized requests and excessive counts fail closed.

The additive `day_plans` table is inside the local pilot's existing private `platform.sqlite`. Report packets, media and historical authors are not changed. A clean stopped-service runtime snapshot and verified backup were retained before restarting the primary pilot. Exact comparison after the update preserved all eight prior assignments/Operations job rows, original media rows, archived reports/authors and auth secret. Three new fictional Northstar assignments, WO-DAY-101 through WO-DAY-103, are available for trying the list. The contest checkout, physical phone, inference ledgers and Perihelion services were not modified.

## Verification

- Real HTTP/SQLite tests cover company and unassigned-job denials, distinct user plans, duplicate/forged fields, stale saves, restart persistence, whole-day packing, current/next-stop context, separate sent-report state, changed-order IDs/acknowledgments, reassignment warnings and next-day expiry.
- Numerical checks cover known distance, zero coordinates, missing/ambiguous/out-of-range coordinates, mixed shops, stable ordering and local-date differences. These are not travel-time benchmarks.
- Reducer tests exercise a simulated exit intent for next-stop packing after a sent report, acknowledgment clearing it, day-review warnings and invalid item references. Actual-source dialog tests reject stale-account/aborted responses before constructing UI.
- Actual browser interaction selected three jobs, inspected/accepted a suggestion, manually reordered, reloaded, opened all-job preparation and inspected the correct next stop. Desktop and Chrome's actual 390×787 responsive view were inspected, including scrolling to readable checklist sources and actions. Responsive mode was restored. The final console showed no page errors/warnings; earlier messages were a missing favicon (fixed) and unrelated Chrome extensions.
- Simulator build 22 compiles and was installed/launched only in the dedicated company-pilot Simulator. Its new notification messages have not received an interactive native delivery test. The physical iPhone was not updated. Earlier build-21 observations remain historical results.

Private logs, screenshots, backup and retention receipts stay under `.local/`. No Meta/ElevenLabs calls, routing-provider requests, new services, repository pushes, paid work or outbound customer communication occurred.
