import { DatabaseSync } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { OperationsStore } from "../lib/operations.mjs";
import { validateOrder, reviewReport } from "../public/engine.js";
import { dayAt } from "./public/day-plan.js";
import {
  createInvestigation,
  reduceInvestigation,
  interviewHandoff,
} from "../public/investigation.js";
export const hash = (v) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
export class PilotError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const requireThat = (ok, message = "Unavailable", status = 400) => {
  if (!ok) throw new PilotError(status, message);
};
const office = (p) => ["owner", "admin", "dispatcher"].includes(p?.role);
const admin = (p) => ["owner", "admin"].includes(p?.role);
const parse = (row) =>
  row
    ? {
        ...row,
        assignees: JSON.parse(row.assignees),
        input: JSON.parse(row.input),
      }
    : null;
export class PilotStore {
  constructor({ directory }) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    this.directory = directory;
    this.stores = new Map();
    this.db = new DatabaseSync(join(directory, "platform.sqlite"));
    this.db.exec(
      `PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS integrations(id TEXT PRIMARY KEY,company TEXT NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,revoked INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL); CREATE TABLE IF NOT EXISTS assignments(id TEXT PRIMARY KEY,company TEXT NOT NULL,integration TEXT NOT NULL,external_id TEXT NOT NULL,source_revision TEXT NOT NULL,revision TEXT NOT NULL,op_job TEXT NOT NULL,assignees TEXT NOT NULL,input TEXT NOT NULL,UNIQUE(company,integration,external_id)); CREATE TABLE IF NOT EXISTS retries(company TEXT,integration TEXT,operation TEXT,key TEXT,payload_hash TEXT,job_id TEXT,PRIMARY KEY(company,integration,operation,key)); CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,company TEXT,actor TEXT,action TEXT,subject TEXT,revision TEXT,at TEXT); CREATE TABLE IF NOT EXISTS report_history(company TEXT,job_id TEXT,revision TEXT,packet TEXT,PRIMARY KEY(company,job_id,revision)); CREATE TABLE IF NOT EXISTS reminders(company TEXT,user_id TEXT,state TEXT,PRIMARY KEY(company,user_id)); CREATE TABLE IF NOT EXISTS report_actors(company TEXT,job_id TEXT,revision TEXT,user_id TEXT,PRIMARY KEY(company,job_id,revision)); CREATE TABLE IF NOT EXISTS cache_keys(company TEXT,user_id TEXT,key TEXT,PRIMARY KEY(company,user_id));`,
    );
    chmodSync(join(directory, "platform.sqlite"), 0o600);
    this.db.exec(`CREATE TABLE IF NOT EXISTS day_plans (
      company TEXT NOT NULL, user_id TEXT NOT NULL, date TEXT NOT NULL,
      time_zone TEXT NOT NULL, revision TEXT NOT NULL, job_ids TEXT NOT NULL,
      PRIMARY KEY(company,user_id));`);
  }
  close() {
    for (const s of this.stores.values()) s.close();
    this.db.close();
  }
  operations(company) {
    requireThat(/^[A-Za-z0-9_-]{1,100}$/.test(company), "Invalid company");
    if (!this.stores.has(company)) {
      const d = join(this.directory, "companies", company);
      mkdirSync(d, { recursive: true, mode: 0o700 });
      this.stores.set(
        company,
        new OperationsStore(join(d, "operations.sqlite")),
      );
    }
    return this.stores.get(company);
  }
  audit(p, action, subject, revision = null) {
    this.db
      .prepare(
        "INSERT INTO audit(company,actor,action,subject,revision,at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        p.companyId,
        p.userId || p.integrationId,
        action,
        subject,
        revision,
        new Date().toISOString(),
      );
  }
  issueIntegration(p, name) {
    requireThat(admin(p), "Administrator required", 403);
    requireThat(
      typeof name === "string" && name.trim() && name.length < 100,
      "Name required",
    );
    const id = randomUUID(),
      token = "cfp_" + randomBytes(32).toString("base64url");
    this.db
      .prepare(
        "INSERT INTO integrations(id,company,name,token_hash,created_by) VALUES(?,?,?,?,?)",
      )
      .run(id, p.companyId, name, hash(token), p.userId);
    this.audit(p, "integration.created", id);
    return {
      id,
      name,
      token,
      scopes: ["assignments:write", "assignments:read"],
    };
  }
  integration(token) {
    if (typeof token !== "string" || !/^cfp_[\w-]{43}$/.test(token))
      return null;
    const r = this.db
      .prepare("SELECT * FROM integrations WHERE token_hash=? AND revoked=0")
      .get(hash(token));
    return r
      ? {
          companyId: r.company,
          integrationId: r.id,
          role: "integration",
          scopes: ["assignments:write", "assignments:read"],
        }
      : null;
  }
  integrations(p) {
    requireThat(admin(p), "Administrator required", 403);
    return this.db
      .prepare("SELECT id,name,revoked FROM integrations WHERE company=?")
      .all(p.companyId);
  }
  revokeIntegration(p, id) {
    requireThat(admin(p), "Administrator required", 403);
    const r = this.db
      .prepare("UPDATE integrations SET revoked=1 WHERE id=? AND company=?")
      .run(id, p.companyId);
    requireThat(r.changes, "Unavailable", 404);
    this.audit(p, "integration.revoked", id);
    return { revoked: true };
  }
  list(p) {
    requireThat(p?.companyId, "Sign in required", 401);
    return this.db
      .prepare("SELECT * FROM assignments WHERE company=?")
      .all(p.companyId)
      .map(parse)
      .filter((j) =>
        p.role === "integration"
          ? j.integration === p.integrationId
          : office(p) || j.assignees.includes(p.userId),
      )
      .map((j) => this.present(p, j));
  }
  dayPlan(p, date, timeZone, now = Date.now()) {
    requireThat(p.userId && p.role !== "integration", "Signed-in technician required", 403);
    requireThat(typeof timeZone === "string" && timeZone.length <= 80, "Choose a valid time zone");
    let today;
    try { today = dayAt(timeZone, now); } catch { throw new PilotError(400, "Choose a valid time zone"); }
    requireThat(date === today, "Plan today's work using your local date");
    const row = this.db.prepare("SELECT * FROM day_plans WHERE company=? AND user_id=?").get(p.companyId,p.userId);
    const ids = row?.date === date && row.time_zone === timeZone ? JSON.parse(row.job_ids) : [];
    const assigned = this.list(p).filter(j => j.assigneeUserIds.includes(p.userId));
    const jobs = ids.map(id => assigned.find(j => j.id === id)).filter(Boolean);
    return { date, timeZone, revision: row?.revision || null, jobIds: jobs.map(j => j.id), jobs,
      unavailableCount: ids.length-jobs.length };
  }
  saveDayPlan(p, input, now = Date.now()) {
    requireThat(input && Object.keys(input).every(k => ["date","timeZone","revision","jobIds"].includes(k)), "Use only the day-plan fields");
    const current = this.dayPlan(p,input.date,input.timeZone,now);
    requireThat(input.revision === current.revision, "Your day plan changed. Reload before saving a new order.",409);
    requireThat(Array.isArray(input.jobIds) && input.jobIds.length <= 20 && new Set(input.jobIds).size === input.jobIds.length && input.jobIds.every(id => typeof id === "string"), "Choose up to 20 distinct assigned work orders");
    const jobs = input.jobIds.map(id => this.job(p,id,{technicianOnly:true}));
    requireThat(jobs.reduce((n,j) => n+(j.input.departureChecklist?.length||0),0) <= 60, "This day's preparation exceeds 60 checklist items. Ask dispatch to consolidate the requirements.");
    const revision=hash([p.companyId,p.userId,input.date,input.timeZone,input.jobIds]);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO day_plans VALUES (?,?,?,?,?,?) ON CONFLICT(company,user_id) DO UPDATE SET date=excluded.date,time_zone=excluded.time_zone,revision=excluded.revision,job_ids=excluded.job_ids")
        .run(p.companyId,p.userId,input.date,input.timeZone,revision,JSON.stringify(input.jobIds));
      this.audit(p,"day_plan.saved",input.date,revision);
      this.db.exec("COMMIT");
    } catch(error) { this.db.exec("ROLLBACK"); throw error; }
    return this.dayPlan(p,input.date,input.timeZone,now);
  }
  currentDayPlan(p, now = Date.now()) {
    const row=this.db.prepare("SELECT date,time_zone FROM day_plans WHERE company=? AND user_id=?").get(p.companyId,p.userId);
    if (!row || row.date !== dayAt(row.time_zone,now)) return null;
    return this.dayPlan(p,row.date,row.time_zone,now);
  }
  job(p, id, { officeOnly = false, technicianOnly = false } = {}) {
    const j = parse(
      this.db
        .prepare("SELECT * FROM assignments WHERE id=? AND company=?")
        .get(id, p.companyId),
    );
    requireThat(j, "Unavailable", 404);
    if (p.role === "integration")
      requireThat(
        j.integration === p.integrationId && !officeOnly && !technicianOnly,
        "Unavailable",
        404,
      );
    else {
      requireThat(
        office(p) || j.assignees.includes(p.userId),
        "Unavailable",
        404,
      );
      if (officeOnly) requireThat(office(p), "Office review required", 403);
      if (technicianOnly)
        requireThat(
          j.assignees.includes(p.userId),
          "Assigned technician required",
          403,
        );
    }
    return j;
  }
  present(p, j) {
    return {
      ...j.input,
      id: j.id,
      externalId: j.external_id,
      sourceRevision: j.source_revision,
      revision: j.revision,
      assigneeUserIds: j.assignees,
      companyId: p.companyId,
      status: this.operations(p.companyId).status(j.op_job),
    };
  }
  assign(
    p,
    input,
    { key, expectedRevision, memberCheck, validateReferences } = {},
  ) {
    requireThat(
      office(p) || p.role === "integration",
      "Dispatcher required",
      403,
    );
    requireThat(
      input?.version === "carryforward.assignment.v2",
      "Expected carryforward.assignment.v2",
    );
    requireThat(
      !Object.hasOwn(input, "companyId") &&
        !Object.hasOwn(input, "role") &&
        !Object.hasOwn(input, "integrationId"),
      "Identity is derived from authentication",
    );
    const allowed = new Set([
      "version",
      "externalId",
      "sourceRevision",
      "assigneeUserIds",
      "customerRef",
      "siteRef",
      "systemRef",
      "equipment",
      "contextRefs",
      "historyRefs",
      "order",
      "departureChecklist",
      "onsiteOnly",
      "locations",
    ]);
    requireThat(
      Object.keys(input).every((k) => allowed.has(k)),
      "Unsupported assignment field; canonical identity is server-owned",
    );
    requireThat(
      typeof input.externalId === "string" &&
        input.externalId.trim() &&
        input.externalId.length <= 100 &&
        typeof input.sourceRevision === "string" &&
        input.sourceRevision.trim() &&
        input.sourceRevision.length <= 100,
      "Bounded externalId/sourceRevision required",
    );
    requireThat(
      typeof key === "string" && /^[\w.-]{1,120}$/.test(key),
      "Idempotency-Key required",
    );
    requireThat(
      Array.isArray(input.assigneeUserIds) &&
        input.assigneeUserIds.length > 0 &&
        input.assigneeUserIds.length <= 10 &&
        new Set(input.assigneeUserIds).size === input.assigneeUserIds.length &&
        input.assigneeUserIds.every((id) => memberCheck?.(p.companyId, id)),
      "Assign active company technicians only",
    );
    requireThat(
      ["customerRef", "siteRef", "systemRef"].every(
        (k) =>
          typeof input[k] === "string" &&
          input[k].length > 0 &&
          input[k].length <= 200,
      ),
      "Distinct customer, site and system references required",
    );
    const items = input.departureChecklist || [];
    requireThat(
      Array.isArray(items) &&
        items.length <= 60 &&
        new Set(items.map((x) => x.id)).size === items.length &&
        items.every(
          (x) =>
            x &&
            typeof x.id === "string" &&
            x.id.length <= 100 &&
            typeof x.label === "string" &&
            x.label.trim() &&
            x.label.length <= 160 &&
            ["required", "suggested", "unknown"].includes(x.requirement) &&
            typeof x.source === "string" &&
            x.source.trim() &&
            x.source.length <= 500,
        ),
      "Invalid bounded departure checklist",
    );
    requireThat(
      Array.isArray(input.equipment) &&
        input.equipment.length <= 10 &&
        Array.isArray(input.contextRefs) &&
        input.contextRefs.length <= 12,
      "Bounded equipment and context references required",
    );
    validateReferences?.(p, input);
    requireThat(
      !input.historyRefs ||
        input.historyRefs.every(
          (r) =>
            r.customerRef === input.customerRef &&
            r.siteRef === input.siteRef &&
            r.systemRef === input.systemRef,
        ),
      "History identity differs from assignment",
    );
    const normalized = (value) => {
      const copy = structuredClone(value);
      if (copy.order) {
        copy.order = validateOrder({
          ...copy.order,
          id: "canonical-payload",
          systemId: copy.systemRef,
        });
        delete copy.order.id;
      }
      return copy;
    };
    const integration = p.integrationId || "dispatcher",
      payloadHash = hash(normalized(input)),
      retry = this.db
        .prepare(
          "SELECT * FROM retries WHERE company=? AND integration=? AND operation=? AND key=?",
        )
        .get(p.companyId, integration, "assign", key);
    if (retry) {
      requireThat(
        retry.payload_hash === payloadHash,
        "Idempotency key conflicts with another payload",
        409,
      );
      return this.present(p, this.job(p, retry.job_id));
    }
    let prior = parse(
      this.db
        .prepare(
          "SELECT * FROM assignments WHERE company=? AND integration=? AND external_id=?",
        )
        .get(p.companyId, integration, input.externalId),
    );
    if (prior && hash(normalized(prior.input)) === payloadHash) {
      this.db
        .prepare("INSERT INTO retries VALUES(?,?,?,?,?,?)")
        .run(p.companyId, integration, "assign", key, payloadHash, prior.id);
      return this.present(p, prior);
    }
    if (prior) {
      requireThat(
        prior.revision === expectedRevision,
        "If-Match must name current assignment revision",
        409,
      );
      requireThat(
        prior.source_revision !== input.sourceRevision,
        "Use a new sourceRevision",
        409,
      );
    }
    const id = prior?.id || randomUUID(),
      order = validateOrder({ ...input.order, id, systemId: input.systemRef });
    const ops = this.operations(p.companyId);
    let opJob;
    if (prior) {
      opJob = prior.op_job;
      const old = ops.job(opJob);
      requireThat(
        JSON.stringify(old.order.checks.map((x) => x.id)) ===
          JSON.stringify(order.checks.map((x) => x.id)),
        "Check identities changed; create a new assignment",
        409,
      );
      if (old.candidate)
        this.db
          .prepare("INSERT OR IGNORE INTO report_history VALUES(?,?,?,?)")
          .run(
            p.companyId,
            id,
            old.revision,
            JSON.stringify(ops.closeout(opJob)),
          );
      ops.db
        .prepare(
          "UPDATE jobs SET assignment=?,assignment_hash=?,candidate=NULL,revision=NULL,confirmation=NULL,queued_revision=NULL,received_revision=NULL,accepted_revision=NULL,decision=NULL WHERE id=?",
        )
        .run(JSON.stringify(order), hash(order), opJob);
    } else opJob = ops.assign(order).jobId;
    const stored = { ...input, order },
      revision = hash(stored);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO assignments VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_revision=excluded.source_revision,revision=excluded.revision,assignees=excluded.assignees,input=excluded.input",
        )
        .run(
          id,
          p.companyId,
          integration,
          input.externalId,
          input.sourceRevision,
          revision,
          opJob,
          JSON.stringify(input.assigneeUserIds),
          JSON.stringify(stored),
        );
      this.db
        .prepare("INSERT INTO retries VALUES(?,?,?,?,?,?)")
        .run(p.companyId, integration, "assign", key, payloadHash, id);
      this.audit(
        p,
        prior ? "assignment.revised" : "assignment.created",
        id,
        revision,
      );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return this.present(p, this.job(p, id));
  }
  prepareCloseout(p, id, report, expectedEventRevision) {
    const j = this.job(p, id, { technicianOnly: true }),
      ops = this.operations(p.companyId),
      saved = ops.job(j.op_job);
    requireThat(
      saved.events.length === expectedEventRevision,
      "Stale event revision",
      409,
    );
    let state = createInvestigation(j.input.order);
    for (const event of saved.events) state = reduceInvestigation(state, event);
    requireThat(
      (report?.interviewRevision ?? 0) === state.seq,
      "Report does not match saved interview revision",
      409,
    );
    const preview = reviewReport(
        j.input.order,
        report,
        interviewHandoff(state),
      ),
      owner = preview.followupOwner;
    const branchIds = preview.findings
      .filter(
        (f) =>
          f.outcome === "open" &&
          state.branches[f.id]?.state !== "supported" &&
          !state.branches[f.id]?.owner,
      )
      .map((f) => f.id);
    // This owner comes from the explicitly submitted human report. The change is
    // append-only and committed with its candidate; a failed candidate rolls back.
    ops.db.exec("BEGIN IMMEDIATE");
    try {
      if (owner && branchIds.length) {
        const event = {
          id: randomUUID(),
          jobId: id,
          seq: state.seq + 1,
          type: "branches.owner-assigned",
          at: new Date().toISOString(),
          payload: { branchIds, owner },
        };
        state = reduceInvestigation(state, event);
        ops.syncEvents(j.op_job, state.events);
      }
      const packet = ops.candidate(
        j.op_job,
        { ...report, interviewRevision: state.seq },
        state.seq,
      );
      ops.db.exec("COMMIT");
      return packet;
    } catch (error) {
      ops.db.exec("ROLLBACK");
      throw error;
    }
  }
  closeout(p, id) {
    const j = this.job(p, id),
      packet = this.operations(p.companyId).closeout(j.op_job);
    return this.#projectAuthorship(p.companyId, id, packet);
  }
  #projectAuthorship(companyId, id, packet) {
    const author = this.db
      .prepare(
        "SELECT user_id FROM report_actors WHERE company=? AND job_id=? AND revision=?",
      )
      .get(companyId, id, packet.revision);
    return {
      ...packet,
      authenticatedAuthorship: {
        companyId,
        authorUserId: author?.user_id || null,
        packetRevision: packet.revision,
        technicianConfirmed: !!packet.confirmation,
        note: "Server-authorized pilot authorship sidecar; legacy packet digest is unchanged. Not a claim of a regulated electronic signature.",
      },
    };
  }
  archive(p, id) {
    const j = this.job(p, id),
      packet = this.closeout(p, id);
    this.db
      .prepare("INSERT OR IGNORE INTO report_history VALUES(?,?,?,?)")
      .run(p.companyId, id, packet.revision, JSON.stringify(packet));
    return packet;
  }
  reportHistory(p, id) {
    this.job(p, id);
    return this.db
      .prepare(
        "SELECT revision,packet FROM report_history WHERE company=? AND job_id=?",
      )
      .all(p.companyId, id)
      .map((r) => ({
        ...r,
        // Old archives can contain the unmodified legacy packet. Project the
        // retained scoped actor without rewriting that packet or its digest.
        packet: this.#projectAuthorship(p.companyId, id, JSON.parse(r.packet)),
      }));
  }
  cacheKey(p) {
    let r = this.db
      .prepare("SELECT key FROM cache_keys WHERE company=? AND user_id=?")
      .get(p.companyId, p.userId);
    if (!r) {
      r = { key: randomBytes(32).toString("base64url") };
      this.db
        .prepare("INSERT INTO cache_keys VALUES(?,?,?)")
        .run(p.companyId, p.userId, r.key);
    }
    return r.key;
  }
  getReminder(p) {
    const r = this.db
      .prepare("SELECT state FROM reminders WHERE company=? AND user_id=?")
      .get(p.companyId, p.userId);
    return r ? JSON.parse(r.state) : null;
  }
  saveReminder(p, state) {
    requireThat(
      state.scope.companyId === p.companyId && state.scope.userId === p.userId,
      "Reminder scope differs",
    );
    this.job(p, state.scope.jobId, { technicianOnly: true });
    this.db
      .prepare(
        "INSERT INTO reminders VALUES(?,?,?) ON CONFLICT(company,user_id) DO UPDATE SET state=excluded.state",
      )
      .run(p.companyId, p.userId, JSON.stringify(state));
    return state;
  }
}
