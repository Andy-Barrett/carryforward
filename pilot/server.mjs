import http from "node:http";
import { readFile, mkdir, writeFile, chmod, unlink } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPilotAuth } from "./auth.mjs";
import { createDocumentLibrary } from "./documents.mjs";
import { PilotStore, PilotError, requireThat, hash } from "./store.mjs";
import { answerPilotQuestion } from "./conversation.mjs";
import { createPilotVoiceRoutes } from "./provider-routes.mjs";
import {
  createReminderState,
  applyReminderEvent,
  reminderView,
  nativeReminderSnapshot,
} from "./reminders.mjs";
import {
  createInvestigation,
  reduceInvestigation,
  interviewHandoff,
} from "../public/investigation.js";
import { reportRevision, evidenceRevision } from "../public/evidence.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
const offices = ["owner", "admin", "dispatcher"];
const admins = ["owner", "admin"];
export async function createPilotServer({
  directory = join(root, ".local/company-pilot"),
  port = 4430,
  listenHost = "127.0.0.1",
  baseURL = `http://127.0.0.1:${port}`,
  secret,
  authOptions = {},
  providerConfig = {},
  providerFactory,
  cacheLeaseMs = 900000,
  readiness,
  maxDocumentUploads = 2,
} = {}) {
  requireThat(["127.0.0.1", "0.0.0.0"].includes(listenHost), "Unsupported listen host");
  requireThat(Number.isInteger(maxDocumentUploads) && maxDocumentUploads >= 1 && maxDocumentUploads <= 2, "Use one or two concurrent document uploads");
  // Server-owned only. A shorter isolated QA instance can exercise rendered
  // expiry without extending the normal fifteen-minute access boundary.
  requireThat(
    Number.isInteger(cacheLeaseMs) && cacheLeaseMs > 0 && cacheLeaseMs <= 900000,
    "cacheLeaseMs must be a positive integer no greater than 900000",
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const runtimePath = join(directory, "runtime.pid");
  const runtimeNonce = randomBytes(16).toString("hex");
  await writeFile(
    runtimePath,
    JSON.stringify({ pid: process.pid, kind: "server", nonce: runtimeNonce }),
    { flag: "wx", mode: 0o600 },
  );
  const releaseRuntime = async () => {
    const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
    if (runtime.nonce === runtimeNonce) await unlink(runtimePath);
  };
  let auth, store, library;
  try {
    if (!secret) {
      const path = join(directory, "auth-secret");
      try {
        secret = (await readFile(path, "utf8")).trim();
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        secret = randomBytes(48).toString("base64url");
        await writeFile(path, secret, { mode: 0o600, flag: "wx" });
      }
    }
    auth = await createPilotAuth({
      databasePath: join(directory, "auth.sqlite"),
      baseURL,
      secret,
      localDeliveryPath: join(directory, "recovery-outbox"),
      ...authOptions,
    });
    store = new PilotStore({ directory: join(directory, "data") });
    library = await createDocumentLibrary({
      databasePath: join(directory, "documents.sqlite"),
      storageDir: join(directory, "originals"),
    });
  } catch (error) {
    await library?.close?.();
    store?.close();
    await auth?.close();
    await releaseRuntime();
    throw error;
  }
  let uploadsInFlight = 0;
  const voice = createPilotVoiceRoutes({
    auth,
    store,
    library,
    config: providerConfig,
    ...(providerFactory ? { providerFactory } : {}),
  });
  const json = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  async function body(req, max = 36_000_000) {
    requireThat(
      req.headers["content-type"]?.split(";")[0] === "application/json",
      "Expected application/json",
      415,
    );
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      requireThat(size <= max, "Request exceeds bounded upload limit", 413);
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks));
    } catch {
      throw new PilotError(400, "Invalid JSON");
    }
  }
  function refs(p, input) {
    for (const ref of input.contextRefs || []) {
      const d = library.read(p.companyId, ref.versionId);
      requireThat(
        d &&
          d.status === "approved" &&
          d.processing?.status === "ready" &&
          (!ref.documentId || d.documentId === ref.documentId),
        "Unavailable document reference",
        404,
      );
    }
  }
  async function reminderSnapshot(p, j, prior, localDraftPresent) {
    localDraftPresent =
      typeof localDraftPresent === "boolean"
        ? localDraftPresent
        : Boolean(
            prior?.localDraftPresent &&
              prior.expiresAt > Date.now() &&
              prior.scope?.jobId === j.id,
          );
    const ops = store.operations(p.companyId),
      status = ops.status(j.op_job),
      saved = ops.job(j.op_job),
      reportStatus = status.accepted
        ? status.decision
        : status.received
          ? "received"
          : status.queued
            ? "sent"
            : status.technicianConfirmed
              ? "confirmed_unsent"
              : saved.candidate
                ? "unconfirmed"
                : saved.events.length || localDraftPresent
                  ? "draft"
                  : "no_report";
    const documents = [];
    for (const ref of j.input.contextRefs) {
      try {
        const d = await library.read(p.companyId, ref.versionId);
        documents.push([d.versionId, d.status, d.sha256]);
      } catch {
        documents.push([ref.versionId, "unavailable"]);
      }
    }
    const plan = store.currentDayPlan(p);
    const index = plan?.jobIds.indexOf(j.id) ?? -1;
    const planned = index >= 0 ? plan.jobs : [];
    const packingJobs = planned.length ? planned : [{ ...j.input, id:j.id, revision:j.revision }];
    const packing = packingJobs.flatMap(job => (job.departureChecklist || []).map(item => ({
      ...item, id:hash([job.id,item.id]).slice(0,32),
      source: planned.length ? `${job.externalId}: ${item.source}`.slice(0,500) : item.source,
    })));
    const overflow = packing.length > 60;
    const following = index >= 0 ? plan.jobs[index+1] : null;
    const day = planned.length ? {
      date:plan.date, revision:plan.revision,
      stops:plan.jobs.map(job => ({id:job.id,externalId:job.externalId,customer:job.order.customer})),
      nextStop: following ? { id:following.id,externalId:following.externalId,customer:following.order.customer,property:following.order.property,
        itemIds:(following.departureChecklist||[]).map(item=>hash([following.id,item.id]).slice(0,32)) } : null,
      warning: overflow ? "The day's requirements changed and exceed the preparation limit. Review each work order with dispatch." : plan.unavailableCount ? "An unavailable stop was removed from this day's reminder context. Review My day." : null,
    } : null;
    const checklist = overflow ? (j.input.departureChecklist || []) : packing;
    const next = createReminderState(
      {
        companyId: p.companyId,
        userId: p.userId,
        jobId: j.id,
        visitId: j.id + "-visit",
        assignmentRevision: j.revision,
        briefRevision: hash([j.revision, documents, day, planned.map(job=>[job.id,job.revision])]),
        reportRevision: status.closeoutRevision || "none",
        reportStatus,
        expiresAt: Date.now() + 900000,
        checklist,
        nextStopItemIds: overflow ? [] : day?.nextStop?.itemIds || [],
        preparationWarning:day?.warning,
        onsiteOnly: j.input.onsiteOnly || [],
        shop: j.input.locations?.shop,
        site: j.input.locations?.site,
      },
      prior,
    );
    next.localDraftPresent = localDraftPresent;
    next.day = day;
    next.dayContextRevision = hash([plan?.revision || null,plan?.jobs.map(job=>[job.id,job.revision]) || []]);
    return next;
  }
  function revalidateDay(p,state) {
    const plan=store.currentDayPlan(p);
    requireThat(state.dayContextRevision===hash([plan?.revision || null,plan?.jobs.map(job=>[job.id,job.revision]) || []]),"Your day plan changed; reopen the departure check",409);
  }
  const handler = async (req, res) => {
    try {
      requireThat(
        req.headers.host === new URL(baseURL).host,
        "Use configured candidate address",
        421,
      );
      const url = new URL(req.url, baseURL),
        path = url.pathname;
      requireThat(url.origin === new URL(baseURL).origin, "Use the configured candidate origin", 421);
      res.setHeader("Referrer-Policy", "no-referrer");
      if (path === "/readyz" && readiness) {
        requireThat(req.method === "GET", "Method not allowed", 405);
        try {
          auth.checkStorage();
          store.db.prepare("SELECT id FROM assignments LIMIT 1").get();
          library.list("__readiness__");
          requireThat(await readiness(), "Unavailable", 503);
          return json(res, 200, { status: "ready" });
        } catch {
          return json(res, 503, { status: "unavailable" });
        }
      }
      if (path === "/healthz")
        return json(res, 200, {
          status: "ok",
          service: "isolated-company-pilot",
          providers: voice.status().mode,
        });
      if (
        path.startsWith("/api/auth/") ||
        path.startsWith("/pilot/api/account")
      ) {
        if (await auth.handler(req, res)) return;
      }
      if (path.startsWith("/pilot/api/")) {
        const bearer = /^Bearer (cfp_[\w-]+)$/.exec(
          req.headers.authorization || "",
        );
        let p = bearer
          ? store.integration(bearer[1])
          : await auth.principal(req);
        requireThat(p, "Sign in required", 401);
        if (!["GET", "HEAD"].includes(req.method) && !bearer)
          requireThat(
            req.headers.origin === baseURL &&
              req.headers["x-carryforward-intent"] === "pilot",
            "Use the authenticated candidate application",
            403,
          );
        const identity = {
          companyId: p.companyId,
          userId: p.userId,
          sessionId: p.sessionId,
          integrationId: p.integrationId,
        };
        let requiredRoles = null;
        const role = (roles) => {
          requiredRoles = roles;
          requireThat(roles.includes(p.role), "Permission denied", 403);
        };
        const refreshPrincipal = async () => {
          const current = bearer
            ? store.integration(bearer[1])
            : await auth.principal(req);
          requireThat(
            current &&
              current.companyId === identity.companyId &&
              (bearer
                ? current.integrationId === identity.integrationId
                : current.userId === identity.userId &&
                  current.sessionId === identity.sessionId),
            "Session or integration access changed; sign in again",
            401,
          );
          p = current;
          if (requiredRoles) role(requiredRoles);
          return p;
        };
        let currentJob = null;
        const readBody = async (request, max) => {
          const input = await body(request, max);
          await refreshPrincipal();
          if (currentJob) currentJob = store.job(p, currentJob.id);
          return input;
        };
        const m = path.match(/^\/pilot\/api\/jobs\/([\w-]+)(?:\/(.*))?$/);
        if (path === "/pilot/api/provider-status") {
          requireThat(p.role !== "integration", "Member required", 403);
          return json(res, 200, voice.status());
        }
        if (path === "/pilot/api/cache-lease") {
          requireThat(p.role !== "integration", "Member required", 403);
          return json(res, 200, {
            scope: { companyId: p.companyId, userId: p.userId },
            key: store.cacheKey(p),
            expiresAt: Date.now() + cacheLeaseMs,
            offlinePolicy:
              "Only the currently unlocked application may use this bounded lease offline until expiresAt. Cold start and account switching require online authentication. Ciphertext is retained on logout; no remote wipe is claimed.",
          });
        }
        if (path === "/pilot/api/integrations") {
          role(admins);
          if (req.method === "GET")
            return json(res, 200, { items: store.integrations(p) });
          if (req.method === "POST") {
            const input = await readBody(req, 3000);
            return json(res, 201, store.issueIntegration(p, input.name));
          }
        }
        if (
          /^\/pilot\/api\/integrations\/[\w-]+\/revoke$/.test(path) &&
          req.method === "POST"
        )
          return json(res, 200, store.revokeIntegration(p, path.split("/")[4]));
        if (path === "/pilot/api/documents") {
          if (req.method === "GET") {
            role(offices);
            return json(res, 200, { items: library.list(p.companyId) });
          }
          if (req.method === "POST") {
            role(admins);
            const input = await readBody(req, 12_000_000);
            requireThat(
              typeof input.dataBase64 === "string" &&
                /^[A-Za-z0-9+/]*={0,2}$/.test(input.dataBase64),
              "Invalid document encoding",
            );
            requireThat(
              uploadsInFlight < maxDocumentUploads,
              "Document processing is busy; retry this upload later",
              429,
            );
            uploadsInFlight++;
            try {
              const result = await library.upload(p.companyId, p, {
                ...input,
                bytes: Buffer.from(input.dataBase64, "base64"),
              });
              await refreshPrincipal();
              role(admins);
              store.audit(p, "document.uploaded", result.versionId);
              return json(res, 201, result);
            } finally {
              uploadsInFlight--;
            }
          }
        }
        const d = path.match(
          /^\/pilot\/api\/documents\/([\w-]+)(?:\/(approve|withdraw|original|pages))?$/,
        );
        if (d) {
          if (["approve", "withdraw"].includes(d[2])) {
            role(admins);
            requireThat(req.method === "POST", "Method not allowed", 405);
            const input = await readBody(req, 3000);
            return json(
              res,
              200,
              await library[d[2]](p.companyId, p, d[1], input.reason),
            );
          }
          role(offices);
          if (d[2] === "original") {
            const original = await library.original(p.companyId, d[1]);
            await refreshPrincipal();
            role(offices);
            const current = library.read(p.companyId, d[1]);
            requireThat(
              current.sha256 === original.sha256,
              "Document original changed",
              409,
            );
            res.writeHead(200, {
              "Content-Type": original.mime || "application/pdf",
              "Cache-Control": "no-store",
              "Content-Disposition": "inline",
              "X-Content-Type-Options": "nosniff",
            });
            return res.end(original.bytes);
          }
          return json(
            res,
            200,
            d[2] === "pages"
              ? library.getPages(p.companyId, d[1], {})
              : library.read(p.companyId, d[1]),
          );
        }
        if (path === "/pilot/api/day-plan") {
          role(["technician", ...offices]);
          if (req.method === "GET") return json(res,200,store.dayPlan(p,url.searchParams.get("date"),url.searchParams.get("timeZone")));
          requireThat(req.method === "POST", "Method not allowed",405);
          const input = await readBody(req,10000);
          await refreshPrincipal();
          return json(res,200,store.saveDayPlan(p,input));
        }
        if (path === "/pilot/api/jobs") {
          if (req.method === "GET")
            return json(res, 200, { items: store.list(p) });
          if (req.method === "POST") {
            const input = await readBody(req, 120000);
            refs(p, input);
            const members = auth.listMembers(p.companyId);
            const allowed = new Set(
              members
                .filter(
                  (x) =>
                    x.status === "active" &&
                    ["technician", "owner", "admin", "dispatcher"].includes(
                      x.role,
                    ),
                )
                .map((x) => x.userId || x.user_id || x.user?.id),
            );
            return json(
              res,
              201,
              store.assign(p, input, {
                key: req.headers["idempotency-key"],
                expectedRevision: req.headers["if-match"],
                memberCheck: (company, id) => allowed.has(id),
              }),
            );
          }
        }
        if (path === "/pilot/api/inbox") {
          role(offices);
          return json(res, 200, {
            items: store.list(p).filter((j) => j.status.queued),
          });
        }
        if (path === "/pilot/api/reminders/native-state") {
          role(["technician", ...offices]);
          const r = store.getReminder(p);
          if (!r) return json(res, 200, { active: null });
          const j = store.job(p, r.scope.jobId, { technicianOnly: true });
          if (r.scope.assignmentRevision !== j.revision)
            return json(res, 200, { active: null });
          const next = await reminderSnapshot(p, j, r);
          await refreshPrincipal();
          const fresh = store.job(p, j.id, { technicianOnly: true });
          requireThat(
            fresh.revision === next.scope.assignmentRevision,
            "Assignment changed; reopen this work order",
            409,
          );
          revalidateDay(p,next);
          store.saveReminder(p, next);
          return json(res, 200, { active: nativeReminderSnapshot(next) });
        }
        if (m) {
          currentJob = store.job(p, m[1]);
          let j = currentJob;
          const ops = store.operations(p.companyId),
            action = m[2] || "";
          requireThat(
            p.role !== "integration" || (!action && req.method === "GET"),
            "Integration scope does not include field evidence or conversation",
            403,
          );
          if (
            action.startsWith("voice/") &&
            (await voice.handle(req, res, {
              principal: p,
              job: j,
              action,
              json,
              body: readBody,
            }))
          )
            return;
          if (!action && req.method === "GET")
            return json(res, 200, store.present(p, j));
          if (action === "brief" && req.method === "GET") {
            const context = [];
            for (const ref of j.input.contextRefs) {
              try {
                const d = library.read(p.companyId, ref.versionId);
                context.push(d);
              } catch {
                context.push({
                  versionId: ref.versionId,
                  status: "unavailable",
                });
              }
            }
            return json(res, 200, {
              job: store.present(p, j),
              context,
              checklist: j.input.departureChecklist || [],
              scope: "Preparation is not field evidence",
              complete: context.every(
                (d) =>
                  d.status === "approved" || d.approvalStatus === "approved",
              ),
            });
          }
          if (action === "question" && req.method === "POST") {
            requireThat(p.role !== "integration", "Member required", 403);
            const input = await readBody(req, 8000);
            j = currentJob;
            requireThat(input.expectedRevision===undefined||input.expectedRevision===j.revision,'The displayed assignment changed; reopen this work order.',409);
            const answer = await answerPilotQuestion({
              principal: p,
              job: j,
              text: input.text,
              previousCitation: input.previousCitation,
              selectedDocument: input.selectedDocument,
              library,
            });
            await refreshPrincipal();
            const fresh = store.job(p, j.id);
            requireThat(
              fresh.revision === j.revision,
              "Assignment changed; reopen this work order",
              409,
            );
            if (answer.retrieval?.status === "found") refs(p, fresh.input);
            return json(res, 200, answer);
          }
          const docAction = action.match(
            /^references\/([\w-]+)\/(original|pages)$/,
          );
          if (docAction) {
            requireThat(
              j.input.contextRefs.some((r) => r.versionId === docAction[1]),
              "Unavailable",
              404,
            );
            const d = library.read(p.companyId, docAction[1]);
            requireThat(
              d.status === "approved" && d.processing?.status === "ready",
              "Source is not currently approved; refresh context",
              409,
            );
            if (docAction[2] === "pages")
              return json(
                res,
                200,
                library.getPages(p.companyId, docAction[1], {}),
              );
            const original = await library.original(p.companyId, docAction[1]);
            await refreshPrincipal();
            j = store.job(p, j.id);
            requireThat(
              j.input.contextRefs.some((r) => r.versionId === docAction[1]),
              "Unavailable",
              404,
            );
            const current = library.read(p.companyId, docAction[1]);
            requireThat(
              current.status === "approved" &&
                current.processing.status === "ready" &&
                current.sha256 === original.sha256,
              "Source is not currently approved; refresh context",
              409,
            );
            res.writeHead(200, {
              "Content-Type": original.mime || "application/pdf",
              "Cache-Control": "no-store",
              "Content-Disposition": "inline",
              "X-Content-Type-Options": "nosniff",
            });
            return res.end(original.bytes);
          }
          if (action === "history" && req.method === "GET")
            return json(res, 200, { items: store.reportHistory(p, j.id) });
          if (action === "events" && req.method === "GET")
            return json(res, 200, { events: ops.job(j.op_job).events });
          if (action === "closeout" && req.method === "GET")
            return json(res, 200, store.closeout(p, j.id));
          const media = action.match(/^(evidence|audio)\/([\w-]+)$/);
          if (media && req.method === "GET") {
            const record = ops[media[1]](j.op_job, media[2]);
            res.writeHead(200, {
              "Content-Type": record.mime,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            });
            return res.end(Buffer.from(record.bytes));
          }
          requireThat(req.method === "POST", "Method not allowed", 405);
          requireThat(
            p.role !== "integration",
            "Integration grants assignment operations only",
            403,
          );
          const input = await readBody(req);
          j = currentJob;
          if (["receipts", "acceptances"].includes(action)) {
            role(offices);
            const packet = ops.closeout(j.op_job);
            requireThat(
              input.revision === packet.revision,
              "Stale revision",
              409,
            );
            const result =
              action === "receipts"
                ? ops.receipt(j.op_job, input.revision)
                : ops.accept(j.op_job, input.revision);
            store.audit(p, action, j.id, input.revision);
            return json(res, 200, result);
          }
          store.job(p, j.id, { technicianOnly: true });
          let result;
          if (action === "events")
            result = ops.syncEvents(j.op_job, input.events);
          else if (action === "evidence")
            result = ops.admitEvidence(j.op_job, input.photos);
          else if (action === "audio")
            result = ops.admitAudio(j.op_job, input.clips);
          else if (action === "closeout") {
            requireThat(
              input.report?.technician === p.user.name,
              "Technician name must match signed-in identity",
            );
            result = store.prepareCloseout(
              p,
              j.id,
              input.report,
              input.eventRevision,
            );
            store.db
              .prepare("INSERT OR IGNORE INTO report_actors VALUES(?,?,?,?)")
              .run(p.companyId, j.id, result.revision, p.userId);
          } else if (action === "confirmations") {
            requireThat(
              input.name === p.user.name,
              "Technician name must match signed-in identity",
            );
            requireThat(
              store.db
                .prepare(
                  "SELECT user_id FROM report_actors WHERE company=? AND job_id=? AND revision=?",
                )
                .get(p.companyId, j.id, input.revision)?.user_id === p.userId,
              "Only the report author can confirm this revision",
              403,
            );
            result = ops.confirm(j.op_job, input);
            store.archive(p, j.id);
          } else if (action === "deliveries")
            result = ops.queue(j.op_job, input.revision);
          else if (action === "reminders") {
            let state = await reminderSnapshot(
              p,
              j,
              store.getReminder(p),
              typeof input.localDraftPresent === "boolean"
                ? input.localDraftPresent
                : undefined,
            );
            if (input.event) state = applyReminderEvent(state, input.event);
            await refreshPrincipal();
            j = store.job(p, j.id, { technicianOnly: true });
            requireThat(
              j.revision === state.scope.assignmentRevision,
              "Assignment changed; reopen this work order",
              409,
            );
            revalidateDay(p,state);
            store.saveReminder(p, state);
            result = { state, view: reminderView(state) };
          } else throw new PilotError(404, "Unavailable");
          store.audit(p, action, j.id, result?.revision || null);
          return json(res, 200, result);
        }
        throw new PilotError(404, "Unavailable");
      }
      requireThat(req.method === "GET", "Method not allowed", 405);
      const staticPath =
        path === "/" || path === "/pilot" || path === "/pilot/"
          ? "/pilot/index.html"
          : path;
      const vendor=staticPath.match(/^\/pilot\/vendor\/(pdf\.mjs|pdf\.worker\.mjs|wasm\/(?:openjpeg_nowasm_fallback|jbig2_nowasm_fallback)\.js|(?:standard_fonts|cmaps)\/[a-zA-Z0-9_-]+\.(?:ttf|pfb|bcmap))$/);
      const pilotAsset = staticPath.match(
          /^\/pilot\/([a-z.-]+\.(?:html|js|css))$/,
        ),
        publicAsset = staticPath.match(
          /^\/([a-z0-9.-]+\.(?:js|css|png|svg|webmanifest))$/,
        );
      requireThat(pilotAsset || publicAsset || vendor, "Unavailable", 404);
      const file = vendor ? join(root,'node_modules/pdfjs-dist',vendor[1].endsWith('.mjs')?'legacy/build':'',vendor[1]) : pilotAsset
        ? join(root, "pilot/public", pilotAsset[1])
        : join(root, "public", publicAsset[1]);
      const content = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; worker-src 'self'; font-src 'self' blob:; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      res.end(content);
    } catch (error) {
      if (!res.headersSent) {
        const code = typeof error?.code === "string" ? error.code : "";
        const validStatus =
          Number.isInteger(error?.status) &&
          error.status >= 400 &&
          error.status <= 599;
        const internal =
          error instanceof TypeError ||
          code.startsWith("ERR_SQLITE") ||
          ["EACCES", "EPERM", "EIO", "ENOSPC"].includes(code);
        // Auth libraries can use symbolic status names. Only numeric HTTP error
        // statuses may reach writeHead; unknown failures must not expose details.
        const status = internal
          ? 500
          : validStatus
            ? error.status
            : error?.status === undefined && code === "ENOENT"
              ? 404
              : 500;
        json(
          res,
          status,
          {
            error: status >= 500
              ? "Storage or processing failed. Saved data was not discarded."
              : code === "ENOENT"
                ? "Unavailable"
                : typeof error?.message === "string"
                  ? error.message
                  : "Request failed.",
          },
        );
      } else res.end();
    }
  };
  const active = new Set();
  let closing;
  const server = http.createServer((req, res) => {
    if (closing) return json(res, 503, { error: "Service restarting. Saved work remains retained." });
    const request = handler(req, res);
    active.add(request);
    request.finally(() => active.delete(request)).catch(() => {});
  });
  return {
    server,
    auth,
    store,
    library,
    voice,
    baseURL,
    async listen() {
      await new Promise((r, reject) => {
        server.once("error", reject);
        server.listen(port, listenHost, () => {
          server.removeListener("error", reject);
          r();
        });
      });
      return server.address();
    },
    close({ forceAfterMs } = {}) {
      if (closing) return closing;
      closing = (async () => {
        const timer = forceAfterMs === undefined ? null : setTimeout(() => server.closeAllConnections(), forceAfterMs);
        try {
          await new Promise((r, reject) => server.close(error => error && error.code !== "ERR_SERVER_NOT_RUNNING" ? reject(error) : r()));
          await Promise.allSettled([...active]);
          store.close();
          await library.close?.();
          await auth.close();
          await releaseRuntime();
        } finally {
          if (timer) clearTimeout(timer);
        }
      })();
      return closing;
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.CARRYFORWARD_PILOT_PORT || 4430);
  requireThat(
    Number.isInteger(port) && port >= 1024 && port <= 65535,
    "Invalid pilot port",
  );
  const providerConfig = process.env.CARRYFORWARD_PILOT_PROVIDER_CONFIG
    ? JSON.parse(
        await readFile(
          resolve(process.env.CARRYFORWARD_PILOT_PROVIDER_CONFIG),
          "utf8",
        ),
      )
    : {};
  const app = await createPilotServer({ port, providerConfig });
  await app.listen();
  console.log(`Isolated CarryForward company pilot: ${app.baseURL}/pilot/`);
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
