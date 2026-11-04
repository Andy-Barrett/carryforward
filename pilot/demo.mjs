// Explicit local fictional setup through the same HTTP API used by the app.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { demoOrder } from "../public/engine.js";
import {
  SETAPP_MANUAL,
  MATCHED_EQUIPMENT,
  manufacturerFixtureUpload,
} from "./manual-fixture.mjs";
export function client(origin) {
  const cookies = new Map();
  return {
    async request(path, { method = "GET", body, headers = {} } = {}) {
      const r = await fetch(origin + path, {
        method,
        headers: {
          Origin: origin,
          "X-CarryForward-Intent": "pilot",
          ...(cookies.size
            ? { Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; ") }
            : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      for (const raw of r.headers.getSetCookie()) {
        const [k, v] = raw.split(";")[0].split("=");
        if (v) cookies.set(k, v);
        else cookies.delete(k);
      }
      const value = await r.json();
      return { status: r.status, value };
    },
    async ok(path, options = {}) {
      const r = await this.request(path, options);
      if (r.status >= 400)
        throw Error(`${r.status} ${path}: ${JSON.stringify(r.value)}`);
      return r.value;
    },
  };
}
export async function seedFictionalPilot({
  origin = "http://127.0.0.1:4430",
  output,
  manualPath,
} = {}) {
  const fixtures = [];
  for (const [suffix, name] of [
    ["north", "Northstar Solar (fictional)"],
    ["cedar", "Cedar Field Services (fictional)"],
  ]) {
    const stamp = randomBytes(4).toString("hex"),
      owner = {
        name: name + " Admin",
        email: `admin-${suffix}-${stamp}@example.test`,
        password: randomBytes(22).toString("base64url"),
      },
      tech = {
        name: name + " Technician",
        email: `tech-${suffix}-${stamp}@example.test`,
        password: randomBytes(22).toString("base64url"),
      };
    const admin = client(origin),
      worker = client(origin);
    await admin.ok("/api/auth/sign-up/email", { method: "POST", body: owner });
    const workspace = await admin.ok("/pilot/api/account/companies", {
      method: "POST",
      body: { name },
    });
    const invitation = await admin.ok("/pilot/api/account/invitations", {
      method: "POST",
      body: { email: tech.email, role: "technician" },
    });
    const signed = await worker.ok("/api/auth/sign-up/email", {
      method: "POST",
      body: tech,
    });
    await worker.ok("/pilot/api/account/invitations/accept", {
      method: "POST",
      body: { token: new URL(invitation.url).hash.slice(8) },
    });
    const account = await worker.ok("/pilot/api/account");
    let document;
    if (suffix === "north" && manualPath) {
      const input = await manufacturerFixtureUpload(manualPath);
      document = await admin.ok("/pilot/api/documents", {
        method: "POST",
        body: {
          ...input,
          bytes: undefined,
          dataBase64: input.bytes.toString("base64"),
        },
      });
    } else
      document = await admin.ok("/pilot/api/documents", {
        method: "POST",
        body: {
          title: "Cedar field closeout manual (fictional)",
          issuer: name,
          revision: "DEMO-1",
          mime: "text/plain",
          applicability: { kind: "company_policy", requiredIdentityFields: [] },
          dataBase64: Buffer.from(
            "CEDAR FIELD CLOSEOUT MANUAL\nSection1 Preparation\nBring the assigned diagnostic kit. Contact the dispatcher if equipment identity is missing.\nSection2 Reporting\nKeep production, monitoring and paperwork separate. Unverified production and the warranty update stay open with Operations. A technician report is not independent verification.",
          ).toString("base64"),
        },
      });
    document = await admin.ok(
      "/pilot/api/documents/" + document.versionId + "/approve",
      { method: "POST", body: {} },
    );
    const integration = await admin.ok("/pilot/api/integrations", {
      method: "POST",
      body: { name: "Fictional dispatch source" },
    });
    const input = {
      version: "carryforward.assignment.v2",
      externalId: "WO-100",
      sourceRevision: "1",
      assigneeUserIds: [account.principal.userId],
      customerRef: suffix + "-customer",
      siteRef: suffix + "-site",
      systemRef: suffix + "-system",
      equipment: suffix === "north" ? [MATCHED_EQUIPMENT] : [],
      contextRefs: [
        {
          documentId: document.documentId,
          versionId: document.versionId,
          purpose:
            suffix === "north" ? "equipment_reference" : "company_policy",
          equipmentRef:
            suffix === "north" ? MATCHED_EQUIPMENT.equipmentRef : undefined,
          required: true,
          priority: "before_work",
        },
      ],
      departureChecklist: [
        {
          id: "diagnostic-kit",
          label: "Diagnostic kit",
          requirement: "required",
          source: "Explicit fictional dispatcher assignment",
        },
        {
          id: "spare-labels",
          label: "Spare labels",
          requirement: "suggested",
          source: "Explicit fictional dispatcher assignment",
        },
      ],
      onsiteOnly: ["Record timing and source of any production reading"],
      locations: {
        shop: { latitude: 37.3349, longitude: -122.009, radius: 150 },
        site: { latitude: 37.3318, longitude: -122.0312, radius: 150 },
      },
      order: {
        ...demoOrder,
        customerContact: undefined,
        systemId: suffix + "-system",
        customer:
          suffix === "north"
            ? "Avery Stone (fictional)"
            : "Jordan Reed (fictional)",
        property: "Fictional Simulator test site",
        history: [],
        briefing: {},
        reportedIssue:
          "Review monitoring status; document production separately. Warranty update remains with Operations.",
      },
    };
    const assignment = await admin.ok("/pilot/api/jobs", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + integration.token,
        "Idempotency-Key": randomUUID(),
      },
      body: input,
    });
    fixtures.push({
      name,
      owner,
      tech,
      companyId: account.principal.companyId,
      technicianId: account.principal.userId,
      assignmentId: assignment.id,
      documentVersionId: document.versionId,
      integration,
      origin,
    });
  }
  if (output) {
    await mkdir(resolve(output, ".."), { recursive: true, mode: 0o700 });
    await writeFile(
      output,
      JSON.stringify(
        {
          kind: "fictional-private-pilot-credentials",
          at: new Date().toISOString(),
          fixtures,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
  }
  return fixtures;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output =
    process.argv[2] || ".local/company-pilot/demo-users.private.json";
  const fixtures = await seedFictionalPilot({
    output,
    manualPath: process.argv[3] || ".local/pilot-manuals/MAN-01-00541-1.4.pdf",
  });
  console.log(
    JSON.stringify({
      companies: fixtures.map((x) => x.name),
      credentialsFile: output,
      realProviderCalls: 0,
    }),
  );
}
