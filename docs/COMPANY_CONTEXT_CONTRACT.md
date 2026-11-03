# Company context and work-order references

November 3, 2026. The company platform described here is the next product milestone, not current hosted behavior. The current prototype has one development principal, a process-wide company-context configuration, globally unique source external IDs, and origin/job-scoped browser storage. It does not yet provide company accounts, membership, uploads, tenant isolation, purchase or billing.

## Context delivered with an assignment

Keep three sources of knowledge distinct:

- Company background and policy: the company profile, escalation roles, approved company rules and closeout expectations.
- Job context: customer/site/system identity, equipment, assigned scope, dated customer history, access arrangements, current commitments and exact document-version references.
- Visit evidence: technician reports, original media, corrections and interpretations. Preparation and document retrieval cannot establish completed work.

The minimum useful document set is the applicable manufacturer guide, company safety manual, job hazard/emergency plan, relevant as-built or single-line diagram, dated prior service reports and open customer commitments. Warranty/RMA records, parts requirements and closeout checklists belong in the packet when relevant. A missing document stays visible; do not quietly imply a complete packet.

Upload a source once to the company's library; resolve only authorized, relevant passages for each work order and question. Preserve original hash, source/version, section/page and retrieval date. Uploading is not approval, and a family/model name is not proof that a procedure applies to the exact unit. A newer manual creates a version; it does not overwrite historical citations. Withdrawal or revoked access still applies to a pinned version.

## Proposed versioned input

The following is a proposed `carryforward.assignment.v2` contract. No endpoint currently accepts it. Company/integration identity must come from authentication, never from a body selector.

```json
{
  "version": "carryforward.assignment.v2",
  "externalId": "WO-1043",
  "sourceRevision": "3",
  "assigneeUserIds": ["fictional-tech-01"],
  "customerRef": "fictional-customer-17",
  "siteRef": "fictional-site-21",
  "systemRef": "fictional-system-04",
  "equipment": [{
    "equipmentRef": "fictional-inverter-01",
    "manufacturer": "Example",
    "model": "INV-6",
    "fullPartNumber": null,
    "configuration": null,
    "identityBasis": "source_inventory"
  }],
  "contextRefs": [{
    "documentId": "fictional-manual-01",
    "versionId": "fictional-version-02",
    "purpose": "equipment_reference",
    "equipmentRef": "fictional-inverter-01",
    "required": true,
    "priority": "before_work"
  }],
  "historyRefs": [{
    "recordId": "fictional-service-01",
    "customerRef": "fictional-customer-17",
    "siteRef": "fictional-site-21",
    "systemRef": "fictional-system-04"
  }]
}
```

The server returns a bounded resolved-context manifest: canonical job/revision; permitted source IDs, immutable versions and hashes; exact section/page locations; source kind and authority; applicability and unresolved identity gaps; and access/withdrawal state. Approval comes from an authorized review record, not a work-order import flag. An exact equipment procedure additionally requires its applicability and the worker/task authorization. A general policy does not replace the job plan.

Customer account, person, property and system remain different identities. History keeps business-event date, source/author, reported versus observed status, correction links, separate incidents and unresolved commitments. An import timestamp is not the work date. A technician's “all good” cannot erase an open office promise. Current telemetry and historical testimony remain distinct.

## Accounts and API boundary

A company workspace has company-specific owner/admin, dispatcher/reviewer and technician memberships. Admins manage membership and library policy; technicians access assigned jobs and their permitted references. A separate revocable integration principal submits assignments with scoped permissions. Billing entitlement is separate from data access.

Scope external identities and idempotency by company + integration + operation. The same external work-order number can coexist in two companies. Reject a changed payload under an existing idempotency key; revisions use concurrency checks. Every reference, search result, media download and closeout must independently pass company/member/job authorization. Errors must not reveal another company's source existence.

Offline storage needs an explicit user/company boundary and expiry/revalidation policy. A disconnected device cannot promise immediate remote revocation. Account switching must hide the prior user's data without destroying unsent evidence; source withdrawal must be checked again on reconnect. A company selector alone supplies none of these protections.

Existing technician confirmation, exact-revision receipt and separate originating-system acceptance remain the output contract.

## Next bounded local acceptance

Use two fictional companies and isolated test data, retaining current demonstration compatibility:

1. Two integrations can use the same external work-order number without collision; repeated identical requests are idempotent and changed retries are rejected.
2. Admin and technician permissions differ; the authenticated principal determines the company. Wrong-company jobs, documents, history, search results and downloads are denied without information leakage.
3. An assignment resolves its exact permitted source version/hash/pages. Missing, unprocessed, withdrawn or incompatible required context prevents a complete-brief claim.
4. A source update preserves historical answer citations; a later withdrawal or revoked membership blocks fresh use. Test reassignment, logout/account switch and offline cache/reconnect behavior explicitly.
5. Evidence and unresolved work survive revision-specific closeout, receipt and acceptance. Preparation/packed acknowledgments are separate from completed-work evidence.

No destructive migration, real customer import, production authentication, invitations, deployment or billing action is included in this local milestone.

## Staged briefing direction

Owner direction relayed from Hackathon Oversight, decisions D26–D27, November 3:

1. **Before leaving the shop:** brief sourced bring-along needs, customer/contact and arrival/access arrangements, staffing/equipment requirements and unresolved blockers. Never postpone departure-critical safety or equipment needs. A packed acknowledgment is not assumed inventory.
2. **Optional travel briefing:** interesting system/problem/history context, short voluntary clarification and reviewed relevant lessons. Pause, skip and stop must be easy; no nagging, competency scoring or invented personal mistake profile. No required response or touch/screen interaction while driving; no automatic microphone activation. Current hold-to-speak has not been accepted as travel support.
3. **Parked/on arrival:** inspect manual pages, review photos, ask deeper questions and make consequential confirmations.

Future manifests should carry purpose, priority/urgency and exact lesson references. Lessons require dated, reviewed, applicable company knowledge or permitted documented individual experience, with attribution and corrections retained. Keep this staged experience on the roadmap while completing the current phone visit.

## Planned departure, near-arrival and return reminders

Owner direction relayed from Hackathon Oversight decision D28, November 3; location/notifications are not implemented or activated here.

A shop-exit reminder is a backup for an unreviewed departure brief or a source-backed unresolved departure item; essential preparation still happens before moving. A near-arrival check-in uses a fresh route ETA of approximately ten minutes, not a fixed-distance geofence. Leaving the active site may offer a short optional results/open-work/owner follow-up. It never confirms or closes the visit, and onsite-only evidence must be checked before departure.

Scope state to company/user/job/trip/brief revision. Deduplicate boundary jitter, re-entry and repeated ETA crossings; cancel stale job/destination reminders. Respect acknowledged or dismissed notices and reopen only for material changes. Require opt-in location/notifications, with manual fallback and honest stale/offline/background states. Offer snooze/mute and brief optional audio; require no driving response or touch, and never start the microphone, contact a customer or deliver a report automatically. Continuous fleet tracking is outside this direction. Platform reliability requires later physical acceptance.
