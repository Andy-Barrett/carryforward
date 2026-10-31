export const demoOrder = {
  version: "carryforward.work-order.v1",
  id: "DEMO-WO-1042",
  customer: "Elena Brooks",
  property: "7 Meadow Court · fictional site",
  systemId: "DEMO-SYS-017",
  reportedIssue:
    "Customer reports intermittent production after an inverter fault.",
  requestedWork: [
    "Investigate the reported production fault.",
    "Record any repair and a dated post-work production measurement.",
    "Verify monitoring separately from measured production.",
    "Document warranty paperwork and customer follow-up.",
  ],
  history: [
    {
      id: "H1",
      date: "2026-10-21",
      text: "Customer reported an inverter fault. Current cause is not established.",
    },
    {
      id: "H2",
      date: "2026-10-24",
      text: "Office promised a warranty registration update after the visit.",
    },
  ],
  checks: [
    {
      id: "repair",
      label: "Investigation and work performed",
      question: "What did you find and what work did you perform?",
    },
    {
      id: "production",
      label: "Post-work production",
      question:
        "What production did you measure, when, and using which instrument or source?",
    },
    {
      id: "monitoring",
      label: "Monitoring communication",
      question:
        "Was monitoring communicating after the work? Record the observation time.",
    },
    {
      id: "warranty",
      label: "Warranty handoff",
      question:
        "Was registration delivered, or who owns the remaining paperwork?",
    },
  ],
};
const statuses = ["observed", "pending", "unverified", "not_applicable"];
const clean = (v, label, max = 4000) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new Error(
      `${label} must be nonempty text (maximum ${max} characters).`,
    );
  return v.trim();
};
export function validateOrder(input) {
  if (!input || input.version !== "carryforward.work-order.v1")
    throw new Error("Expected carryforward.work-order.v1 JSON.");
  const order = { version: input.version };
  for (const key of ["id", "customer", "property", "systemId", "reportedIssue"])
    order[key] = clean(input[key], key, key === "reportedIssue" ? 4000 : 300);
  if (
    !Array.isArray(input.requestedWork) ||
    !input.requestedWork.length ||
    input.requestedWork.length > 20
  )
    throw new Error("Include 1–20 requested-work items.");
  order.requestedWork = input.requestedWork.map((x) =>
    clean(x, "Requested work"),
  );
  if (!Array.isArray(input.history) || input.history.length > 30)
    throw new Error("History must contain at most 30 records.");
  order.history = input.history.map((h) => ({
    id: clean(h.id, "History ID", 100),
    date: clean(h.date, "History date", 100),
    text: clean(h.text, "History text"),
  }));
  if (
    !Array.isArray(input.checks) ||
    !input.checks.length ||
    input.checks.length > 20
  )
    throw new Error("Include 1–20 closeout checks.");
  order.checks = input.checks.map((c) => ({
    id: clean(c.id, "Check ID", 100),
    label: clean(c.label, "Check label", 300),
    question: clean(c.question, "Check question"),
  }));
  if (
    new Set(order.checks.map((c) => c.id)).size !== order.checks.length ||
    new Set(order.history.map((h) => h.id)).size !== order.history.length
  )
    throw new Error("Check IDs and history IDs must be unique.");
  return order;
}
export function reviewReport(order, report, interview = null) {
  const checked = validateOrder(order);
  const technician = clean(report.technician, "Technician", 200);
  const summary = clean(report.summary, "Visit summary");
  const recordedAt = clean(report.recordedAt, "Recorded time", 100);
  if (!Number.isFinite(Date.parse(recordedAt)))
    throw new Error("Recorded time must be a valid timestamp.");
  let findings = checked.checks.map((check) => {
    const entry = report.entries?.[check.id] || {};
    const status = statuses.includes(entry.status)
      ? entry.status
      : "unverified";
    const note =
      typeof entry.note === "string" ? entry.note.trim().slice(0, 4000) : "";
    const reference =
      typeof entry.reference === "string"
        ? entry.reference.trim().slice(0, 500)
        : "";
    const observedAt =
      typeof entry.observedAt === "string" ? entry.observedAt.trim() : "";
    const validTime = Number.isFinite(Date.parse(observedAt));
    const hasEvidence =
      status === "observed" && !!note && !!reference && validTime;
    const documentedNA = status === "not_applicable" && !!note;
    const outcome = hasEvidence
      ? "documented"
      : documentedNA
        ? "exception"
        : "open";
    return {
      ...check,
      status,
      note,
      reference,
      observedAt,
      outcome,
      question: hasEvidence
        ? "Technician-reported evidence recorded; contents have not been independently verified."
        : documentedNA
          ? "Not-applicable explanation requires Operations review."
          : check.question,
      reason:
        status === "observed" && !hasEvidence
          ? "An observed result needs a note, evidence reference, and valid observation time."
          : status === "pending"
            ? "Work remains pending."
            : status === "not_applicable" && !note
              ? "Explain why this check does not apply."
              : !hasEvidence && !documentedNA
                ? "No supported observation recorded."
                : "",
    };
  });
  if (interview) {
    if (interview.jobId !== checked.id || !Array.isArray(interview.branches)) throw new Error("Interview belongs to another job or is malformed.");
    findings = findings.map(finding => {
      const branch = interview.branches.find(b => b.id === finding.id);
      if (!branch || (!branch.sourceIds?.length && branch.state === "open")) return finding;
      const sources = Array.isArray(branch.sourceIds) ? [...branch.sourceIds] : [];
      if (branch.state === "supported" && sources.length) {
        return { ...finding,
          outcome: finding.outcome === "documented" ? "documented" : "reported",
          note: finding.note || branch.reason,
          reference: finding.reference || sources.join(", "),
          sourceIds: sources,
          reason: "Source-linked technician claim recorded through the interview; not independent verification.",
          question: "Technician reviews this reported claim in the final handoff.",
        };
      }
      if (["needs_verification", "contradicted", "deferred"].includes(branch.state)) {
        return { ...finding, outcome: "open", note: finding.note || branch.reason,
          sourceIds: sources, followupOwner: branch.owner || null,
          reason: branch.reason, question: finding.question };
      }
      return finding;
    });
  }
  const promises =
    typeof report.promises === "string"
      ? report.promises.trim().slice(0, 4000)
      : "";
  const followupOwner =
    typeof report.followupOwner === "string"
      ? report.followupOwner.trim().slice(0, 200)
      : "";
  return {
    version: "carryforward.closeout.v1",
    workOrderId: checked.id,
    systemId: checked.systemId,
    technician,
    summary,
    recordedAt,
    promises,
    followupOwner,
    findings,
    ...(interview ? {interview} : {}),
    reportedCount: findings.filter(f => f.outcome === "reported").length,
    openCount: findings.filter((f) => f.outcome === "open").length,
    needsOwner:
      (findings.some((f) => f.outcome === "open") || !!promises) &&
      !followupOwner,
    reviewMode: interview?.interpretations?.length
      ? "Deterministic completeness review with source-linked Meta interpretations attached; technician review required"
      : "Deterministic evidence-completeness review; no AI inference",
    operationsStatus: "Awaiting Operations acceptance",
  };
}
export function confirmReport(review, name, now = new Date().toISOString()) {
  return {
    ...review,
    confirmation: {
      name: clean(name, "Confirming technician", 200),
      confirmedAt: now,
      statement:
        "Technician confirmed this report; Operations acceptance remains pending.",
    },
  };
}
export function exportCloseout(order, review) {
  return JSON.stringify(
    { workOrder: validateOrder(order), closeout: review },
    null,
    2,
  );
}
