import { mountCloud } from "/cloud-view.js";
import { createInvestigation, reduceInvestigation } from "/investigation.js";
import { demoOrder } from "/engine.js";
import { reportRevision, evidenceRevision } from "/evidence.js";
import { bindHoldToSpeak, startHeldVoice } from "/held-voice.js";
import { createReplySpeaker } from "/reply-speech.js";
import { createTurnTiming } from "/turn-timing.js";
import { openScopedCache } from "./cache.js";
import { createPilotVoiceTurn } from "./voice-turn.js";
import { prepareVoiceClip } from "./voice-clip.js";
import { classifyHistory } from "./history-merge.js";
import { dayAt, dayLegs, suggestNearbyOrder } from "./day-plan.js";
import { bindNativeReminderEvents } from "./native-reminder-events.js";
import { createWorkOrderFiles } from "./work-order-files.js";
import { bindVisitSwipes } from "/visit-navigation.js";
import { spokenPilotBrief } from "/visit-brief.js";
import { createBriefingVoice } from "./briefing-voice.js";
import { loadAdmittedPhotos } from "./photo-import.js";
const $ = (s) => document.querySelector(s),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let account = null,
  selfRegistration = false,
  cache = null,
  current = null,
  cleanup = null,
  speaker = null,
  epoch = 0;
let sessionRenewal = null;
const app = $("#app");
const logoutKey = "carryforward-pilot-logout-pending";
let logoutPending = false;
try {
  logoutPending = localStorage.getItem(logoutKey) === "1";
} catch {
  logoutPending = true;
}
function logoutIntent(value) {
  logoutPending = value;
  try {
    if (value) localStorage.setItem(logoutKey, "1");
    else localStorage.removeItem(logoutKey);
  } catch {
    /* Keep the current view locked when browser storage is unavailable. */
  }
}
function native(op) {
  window.webkit?.messageHandlers?.carryForwardReminders?.postMessage({ op });
}
function message(text) {
  $("#status").textContent = text || "";
}
function checkpoint() {
  try {
    const pending = cleanup?.checkpoint?.();
    pending?.catch(() => {});
  } catch {
    /* A locked old scope must never write into the new account. */
  }
}
function lock({ clearNative = true } = {}) {
  checkpoint();
  epoch++;
  cleanup?.();
  cleanup = null;
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
    d.remove();
  }
  speaker?.dispose();
  speaker = null;
  cache?.lock();
  cache = null;
  current = null;
  account = null;
  controls();
  app.replaceChildren();
  if (clearNative) native("logout");
  document.body.classList.remove("field", "cloud-workspace", "voice-first");
}
function scopedApi() {
  const at = epoch,
    scope = account?.principal?.companyId + ":" + account?.principal?.userId;
  return (path, options) => {
    if (
      at !== epoch ||
      scope !== account?.principal?.companyId + ":" + account?.principal?.userId
    )
      throw Error("This account view has closed.");
    return api(path, options);
  };
}
async function api(path, { method = "GET", body, headers = {}, signal } = {}) {
  const requestEpoch = epoch;
  const r = await fetch(
    path.startsWith("/api/") ? path : "/pilot/api/" + path,
    {
      method,
      signal,
      headers: {
        "X-CarryForward-Intent": "pilot",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const v = await r.json();
  if (requestEpoch !== epoch)
    throw Error("Session context changed; the earlier request was discarded.");
  if (!r.ok) {
    if (r.status === 401) {
      lock();
      app.innerHTML =
        '<section class="card"><h1>Sign in again</h1><p>Saved work remains encrypted for your account.</p><button id="reauth">Sign in</button></section>';
      $("#reauth").onclick = () => location.reload();
    }
    if (r.status === 403) void revalidateVisible();
    const error=Error(v.error?.message || v.message || v.error || "Request failed");error.status=r.status;throw error;
  }
  return v;
}
function run(fn, isActive = () => true) {
  return async (e) => {
    if (!isActive()) return;
    const scope = () => JSON.stringify([
      account?.user?.id,
      account?.principal?.companyId,
      account?.principal?.userId,
      account?.principal?.sessionId,
    ]);
    const startingScope = scope();
    e?.preventDefault();
    message("");
    try {
      await fn(e);
    } catch (err) {
      if (isActive() && scope() === startingScope) message(err.message);
    }
  };
}
function controls() {
  const p = account?.principal;
  $("#logout").hidden = !account?.authenticated;
  $("#account-button").hidden = !p;
  $("#company-label").textContent = p?.company?.name || "";
  $("#nav").hidden = !p;
  if (p) {
    $("#nav").innerHTML =
      '<button data-page="jobs">Work orders</button>' +
      (["owner", "admin", "dispatcher"].includes(p.role)
        ? '<button data-page="documents">Library</button>' +
          (["owner", "admin"].includes(p.role)
            ? '<button data-page="people">People</button><button data-page="integrations">Integrations</button>'
            : "") +
          '<button data-page="inbox">Office inbox</button>'
        : "");
    for (const b of $("#nav").querySelectorAll("button"))
      b.onclick = run(() => page(b.dataset.page));
  }
}
async function refresh() {
  lock({ clearNative: false });
  try {
    logoutPending = localStorage.getItem(logoutKey) === "1";
  } catch {
    logoutPending = true;
  }
  if (logoutPending) {
    try {
      await api("/api/auth/sign-out", { method: "POST", body: {} });
      logoutIntent(false);
    } catch {}
    authScreen();
    message(
      logoutPending
        ? "Sign-out is waiting for a connection. Saved work stays locked."
        : "Signed out.",
    );
    return;
  }
  const refreshEpoch = epoch;
  account = await api("account");
  if (epoch !== refreshEpoch) return;
  selfRegistration = account.selfRegistration !== false;
  controls();
  if (new URLSearchParams(location.hash.slice(1)).has("recovery"))
    return recoveryScreen();
  if (!account.authenticated) return authScreen();
  if (!account.principal) {
    const invite = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (invite) {
      await api("account/invitations/accept", {
        method: "POST",
        body: { token: invite },
      });
      history.replaceState(null, "", "/pilot/");
      return refresh();
    }
    return setup();
  }
  const lease = await api("cache-lease"),
    expectedScope =
      account.principal.companyId + ":" + account.principal.userId;
  const nextCache = await openScopedCache(lease);
  if (
    epoch !== refreshEpoch ||
    !account?.principal ||
    expectedScope !==
      account.principal.companyId + ":" + account.principal.userId ||
    nextCache.scope !== expectedScope
  ) {
    nextCache.lock();
    return;
  }
  cache = nextCache;
  native("sync");
  const activeCache = cache;
  setTimeout(
    () => {
      if (cache === activeCache && Date.now() >= lease.expiresAt) {
        void resumeSession();
      }
    },
    Math.max(0, lease.expiresAt - Date.now()),
  );
  await page("jobs");
}
function authScreen() {
  app.innerHTML =
    '<section class="card auth"><h1>Welcome to CarryForward</h1><p class="muted">Sign into your company workspace.</p><form id="login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required minlength="12"></label><label id="name-label" hidden>Your name<input name="name" autocomplete="name"></label><button class="primary" id="submit-auth">Sign in</button><button type="button" id="new-account">Create an account</button></form><details><summary>Use a company invitation</summary><form id="accept-invite"><label>Invitation token<input name="token" required></label><button>Accept invitation after sign-in</button></form></details><button type="button" id="forgot-password">Forgot password?</button><p class="muted">CarryForward pilot.</p></section>';
  $("#new-account").hidden = !selfRegistration;
  $("#forgot-password").onclick = recoveryRequest;
  let signup = false;
  $("#new-account").onclick = () => {
    signup = !signup;
    $("#name-label").hidden = !signup;
    $("#submit-auth").textContent = signup ? "Create account" : "Sign in";
    $("#new-account").textContent = signup
      ? "Use existing account"
      : "Create an account";
  };
  $("#login").onsubmit = run(async () => {
    const f = new FormData($("#login"));
    await api("/api/auth/" + (signup ? "sign-up/email" : "sign-in/email"), {
      method: "POST",
      body: {
        email: f.get("email"),
        password: f.get("password"),
        ...(signup ? { name: f.get("name") } : {}),
      },
    });
    logoutIntent(false);
    accountSignal.postMessage({ kind: "signed-in" });
    await refresh();
  });
  $("#accept-invite").onsubmit = run(async () => {
    await api("account/invitations/accept", {
      method: "POST",
      body: { token: new FormData($("#accept-invite")).get("token") },
    });
    await refresh();
  });
}
function setup() {
  if (account.membership?.status === "revoked") {
    app.innerHTML =
      '<section class="card"><h1>Company access revoked</h1><p>Contact your company administrator. Saved work remains encrypted; this account stays bound to its original company.</p></section>';
    return;
  }
  app.innerHTML =
    '<section class="card auth"><h1>Set up your company</h1><p>Each user belongs to one company. Join with an invitation or create your own workspace.</p><form id="company-form"><label>Company name<input name="name" required maxlength="120"></label><button class="primary">Create workspace</button></form><form id="invite-form"><label>Invitation token<input name="token" required></label><button>Join your company</button></form></section>';
  $("#company-form").onsubmit = run(async () => {
    await api("account/companies", {
      method: "POST",
      body: { name: new FormData($("#company-form")).get("name") },
    });
    await refresh();
  });
  $("#invite-form").onsubmit = run(async () => {
    await api("account/invitations/accept", {
      method: "POST",
      body: { token: new FormData($("#invite-form")).get("token") },
    });
    await refresh();
  });
}
async function page(name) {
  checkpoint();
  epoch++;
  cleanup?.();
  cleanup = null;
  speaker?.dispose();
  speaker = null;
  document.body.classList.remove("field", "cloud-workspace", "voice-first");
  controls();
  if (name === "jobs") return jobs();
  if (name === "people") return people();
  if (name === "documents") return documents();
  if (name === "integrations") return integrations();
  if (name === "inbox") return inbox();
}
async function jobs() {
  const at = epoch, request = scopedApi(), principal = structuredClone(account.principal);
  const valid = () => epoch === at && account?.principal?.companyId === principal.companyId && account?.principal?.userId === principal.userId;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, date = dayAt(timeZone);
  const list = (await request("jobs")).items;
  if (!valid()) return;
  let day = await request(`day-plan?date=${date}&timeZone=${encodeURIComponent(timeZone)}`);
  if (!valid()) return;
  let busy = false, proposal = null, advice = "";
  const own = list.filter(j => j.assigneeUserIds.includes(principal.userId));
  async function save(ids) {
    if (busy || !valid()) return;
    busy = true; render();
    try {
      const next = await request("day-plan", { method:"POST", body:{date,timeZone,revision:day.revision,jobIds:ids} });
      if (!valid()) return;
      day=next; proposal=null; advice="";
      native("sync");
      message("My day saved.");
    } finally { if (valid()) { busy=false; render(); } }
  }
  function render() {
    if (!valid()) return;
    const selected = day.jobIds.map(id=>own.find(j=>j.id===id)).filter(Boolean), legs=dayLegs(selected);
    const disabled = busy ? "disabled" : "";
    app.innerHTML = `<div class="row"><h1>Work orders</h1>${["owner","admin","dispatcher"].includes(principal.role)?'<button id="create-job" class="primary">Create work order</button>':''}</div>
      <section class="card my-day" aria-labelledby="my-day-title"><div class="row"><h2 id="my-day-title">My day</h2><span class="muted">${esc(new Intl.DateTimeFormat(undefined,{weekday:'long',month:'short',day:'numeric'}).format(new Date()))} · ${selected.length} ${selected.length===1?'stop':'stops'}</span></div>
      ${day.unavailableCount?'<p class="danger">An assigned stop is no longer available. Review and save your day again before leaving.</p>':''}
      ${selected.length?`<div class="row"><button data-job="${esc(selected[0].id)}" class="primary" ${disabled}>Open first visit</button><button id="day-preparation" ${disabled}>Before you leave</button><button id="suggest-order" ${selected.length<2?'disabled':disabled}>Suggest nearby order</button></div>`:''}
      ${selected.length?`<ol class="day-stops">${selected.map((job,i)=>`<li><div class="day-stop"><button data-job="${esc(job.id)}" class="day-open"><small>${esc(job.externalId)}</small><strong>${esc(job.order.customer)}</strong><span>${esc(job.order.property)}</span><span class="job-open-label">Open visit <span aria-hidden="true">→</span></span></button><small>${legs[i].km===null?'Distance unavailable':`${(legs[i].km*0.621371).toFixed(1)} mi ${i?'from previous stop':'from assigned shop'}`}</small><div class="row stop-actions"><button data-up="${i}" aria-label="Move ${esc(job.externalId)} earlier" ${i===0?'disabled':disabled}>↑ Earlier</button><button data-down="${i}" aria-label="Move ${esc(job.externalId)} later" ${i===selected.length-1?'disabled':disabled}>↓ Later</button><button data-remove="${esc(job.id)}" ${disabled}>Remove</button></div></div></li>`).join('')}</ol>`:'<p>Open a work order below to talk to CarryForward. Select “Include in my day” to plan your visit order.</p>'}
      ${selected.length?'<p class="muted">Distances are straight-line estimates. Check appointment times and travel conditions.</p>':''}
      ${advice?`<p role="status">${esc(advice)}</p>`:''}${proposal?`<div class="day-suggestion"><strong>Suggested visit order</strong><ol>${proposal.jobIds.map(id=>`<li>${esc(own.find(j=>j.id===id)?.order.customer)}</li>`).join('')}</ol><button id="use-day-suggestion" ${disabled}>Use this order</button><button id="keep-day-order" ${disabled}>Keep my order</button></div>`:''}</section>
      <h2>Assigned work</h2><ul class="jobs">${list.map(job=>`<li><button class="job" data-job="${esc(job.id)}"><small>${esc(job.externalId)}</small><strong>${esc(job.order.customer)}</strong><span>${esc(job.order.reportedIssue)}</span><small>${esc(job.order.property)}</small><span class="job-open-label">Open visit <span aria-hidden="true">→</span></span></button>${own.some(j=>j.id===job.id)?`<label class="inline day-select"><input type="checkbox" data-select-day="${esc(job.id)}" ${day.jobIds.includes(job.id)?'checked':''} ${disabled}>Include in my day</label>`:''}</li>`).join('')}</ul>${!list.length?'<p class="muted">No assigned work yet.</p>':''}`;
    const bind = (selector, fn) => { for (const button of app.querySelectorAll(selector)) button.onclick=run(()=>fn(button),valid); };
    bind('[data-job]',button=>openAssignedVisit(button.dataset.job));
    bind('[data-remove]',button=>save(day.jobIds.filter(id=>id!==button.dataset.remove)));
    function move(from,to) { const ids=[...day.jobIds]; [ids[from],ids[to]]=[ids[to],ids[from]]; return save(ids); }
    bind('[data-up]',button=>move(Number(button.dataset.up),Number(button.dataset.up)-1));
    bind('[data-down]',button=>move(Number(button.dataset.down),Number(button.dataset.down)+1));
    for (const checkbox of app.querySelectorAll('[data-select-day]')) checkbox.onchange=run(()=>save(checkbox.checked?[...day.jobIds,checkbox.dataset.selectDay]:day.jobIds.filter(id=>id!==checkbox.dataset.selectDay)),valid);
    if ($('#create-job')) $('#create-job').onclick=run(createJob,valid);
    if ($('#day-preparation')) $('#day-preparation').onclick=run(()=>departure(selected[0],false),valid);
    if ($('#suggest-order')) $('#suggest-order').onclick=()=>{
      const suggested=suggestNearbyOrder(selected);
      proposal=suggested.available?suggested:null;
      advice=suggested.available?`Starting from ${suggested.start}, visit nearby stops together. This suggestion does not check appointments or traffic.`:suggested.reason;
      render();
    };
    if ($('#use-day-suggestion')) $('#use-day-suggestion').onclick=run(()=>save(proposal.jobIds),valid);
    if ($('#keep-day-order')) $('#keep-day-order').onclick=()=>{proposal=null;advice='Your visit order is unchanged.';render();};
  }
  render();
}
// Opening a visit advances the view epoch. Restore a current list on failure
// rather than leaving an inert list whose old run() guard hides the error.
async function openAssignedVisit(id) {
  const from=epoch,principal=structuredClone(account.principal);
  const sameAccount=()=>account?.principal?.companyId===principal.companyId&&account?.principal?.userId===principal.userId&&account?.principal?.sessionId===principal.sessionId;
  try { await field(id); }
  catch(error) {
    if(!sameAccount()||![from,from+1].includes(epoch))return;
    const recoveryEpoch=epoch+1;
    try { await page('jobs'); } catch { /* The connection error remains actionable below. */ }
    if(sameAccount()&&epoch===recoveryEpoch)message('Could not open this visit. '+error.message+' Tap Work orders to retry.');
  }
}
async function createJobAdvanced() {
  const members = (await api("account/members")).members,
    docs = (await api("documents")).items;
  const template = {
    version: "carryforward.assignment.v2",
    externalId: "WO-100",
    sourceRevision: "1",
    customerRef: "fictional-customer-1",
    siteRef: "fictional-site-1",
    systemRef: "fictional-system-1",
    equipment: [],
    contextRefs: [],
    departureChecklist: [
      {
        id: "tools",
        label: "Diagnostic kit",
        requirement: "required",
        source: "Dispatcher instruction for this assignment",
      },
    ],
    onsiteOnly: ["Record observations before leaving"],
    order: {
      ...demoOrder,
      customerContact: undefined,
      systemId: "fictional-system-1",
      customer: "Fictional customer",
      property: "Fictional test site",
      history: [],
      reportedIssue: "Review the reported production concern.",
      briefing: {},
    },
  };
  app.innerHTML =
    '<h1>Create a work order</h1><form id="job-form"><section class="card"><label>Assign technician<select name="assignee" required>' +
    members
      .filter((m) => m.status === "active")
      .map(
        (m) =>
          `<option value="${m.userId}">${esc(m.name)} · ${esc(m.role)}</option>`,
      )
      .join("") +
    '</select></label><label>Assignment JSON<textarea name="payload" rows="18" required>' +
    esc(JSON.stringify(template, null, 2)) +
    "</textarea></label><details><summary>Approved library reference IDs</summary>" +
    docs
      .filter((d) => d.status === "approved")
      .map((d) => `<p>${esc(d.title)}: ${esc(d.versionId)}</p>`)
      .join("") +
    '</details><button class="primary">Save and assign</button></section></form>';
  $("#job-form").onsubmit = run(async () => {
    const f = new FormData($("#job-form")),
      payload = JSON.parse(f.get("payload"));
    payload.assigneeUserIds = [f.get("assignee")];
    await api("jobs", {
      method: "POST",
      body: payload,
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    await jobs();
  });
}
async function people() {
  const { members } = await api("account/members");
  app.innerHTML =
    '<h1>People</h1><section class="card">' +
    members
      .map(
        (m) =>
          `<p><strong>${esc(m.name)}</strong> · ${esc(m.email)} · ${esc(m.role)} · ${esc(m.status)} ${m.role !== "owner" ? `<button data-revoke="${m.id}">Revoke access</button>` : ""}</p>`,
      )
      .join("") +
    '</section><section class="card"><h2>Invite a teammate</h2><p class="muted">Local copyable invitation; no email will be sent.</p><form id="invite"><label>Email<input name="email" type="email" required></label><label>Role<select name="role"><option value="technician">Technician</option><option value="dispatcher">Dispatcher / reviewer</option><option value="admin">Administrator</option></select></label><button class="primary">Create invitation</button></form><p id="invite-result" class="secret"></p></section>';
  $("#invite").onsubmit = run(async () => {
    const f = new FormData($("#invite")),
      v = await api("account/invitations", {
        method: "POST",
        body: { email: f.get("email"), role: f.get("role") },
      });
    $("#invite-result").textContent = JSON.stringify(v);
  });
  for (const b of app.querySelectorAll("[data-revoke]"))
    b.onclick = run(async () => {
      await api("account/members/" + b.dataset.revoke + "/revoke", {
        method: "POST",
        body: {},
      });
      await people();
    });
}
async function documents() {
  const docApi = scopedApi(),
    admin = ["owner", "admin"].includes(account.principal.role),
    { items } = await docApi("documents");
  app.innerHTML =
    '<h1>Company library</h1><div class="grid">' +
    (admin
      ? `<section class="card"><h2>Upload a source</h2><form id="upload"><label>Title<input name="title" required></label><label>Issuer<input name="issuer" required></label><label>Revision<input name="revision" required></label><label>Original file<input type="file" name="file" accept=".txt,.pdf" required></label><p class="muted">TXT or text PDF, up to 8 MB. Scanned pages need OCR before approval.</p><label>Source type<select name="kind"><option value="company_policy">Company policy</option><option value="manufacturer">Manufacturer reference</option><option value="job_reference">Job reference</option></select></label><details><summary>Equipment applicability</summary>${[
          ["manufacturer", "Manufacturer"],
          ["models", "Models (one per line)"],
          ["fullPartNumbers", "Full part numbers (one per line)"],
          ["variant", "Variant / configuration"],
          ["region", "Region"],
          ["scopeNote", "Applicability note"],
        ]
          .map(
            ([key, label]) =>
              `<label>${label}<textarea name="${key}" rows="1"></textarea></label>`,
          )
          .join(
            "",
          )}<p>Manufacturer procedures require an exact applicable device identity.</p></details><label>New version of<select name="documentId"><option value="">New document</option>${[...new Map(items.map((d) => [d.documentId, d])).values()].map((d) => `<option value="${d.documentId}">${esc(d.title)}</option>`).join("")}</select></label><label>Source URL (optional)<input name="sourceUrl" type="url"></label><button class="primary">Upload for review</button></form></section>`
      : "") +
    "<section>" +
    items
      .map(
        (d) =>
          `<article class="card"><h2>${esc(d.title)}</h2><p>${esc(d.issuer)} · ${esc(d.revision)} · ${esc(d.status)}</p><p>${esc(d.processing?.message || d.processing?.status)}</p><details><summary>File integrity</summary><small>SHA-256 ${esc(d.sha256)}</small></details><div class="row"><button data-inspect="${d.versionId}">Inspect extracted text</button><a href="/pilot/api/documents/${d.versionId}/original" target="_blank" rel="noopener">Original</a>${admin && d.status === "uploaded" && d.processing?.status === "ready" ? `<button data-approve="${d.versionId}">Approve version</button>` : ""}${admin && d.status !== "withdrawn" ? `<button data-withdraw="${d.versionId}">Withdraw</button>` : ""}</div></article>`,
      )
      .join("") +
    "</section></div>";
  if (admin)
    $("#upload").onsubmit = run(async () => {
      const f = new FormData($("#upload")),
        file = f.get("file");
      if (!file.size || file.size > 8_000_000)
        throw Error("Choose a TXT or text PDF up to 8 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer()),
        kind = f.get("kind"),
        list = (k) =>
          String(f.get(k) || "")
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
        applicability = {
          kind,
          requiredIdentityFields:
            kind === "manufacturer"
              ? ["manufacturer", "model", "fullPartNumber", "variant", "region"]
              : [],
        };
      for (const key of ["manufacturer", "variant", "region", "scopeNote"])
        if (f.get(key)) applicability[key] = f.get(key);
      applicability.models = list("models");
      applicability.fullPartNumbers = list("fullPartNumbers");
      await docApi("documents", {
        method: "POST",
        body: {
          title: f.get("title"),
          issuer: f.get("issuer"),
          revision: f.get("revision"),
          mime: file.name.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : "text/plain",
          dataBase64: base64(bytes),
          applicability,
          sourceUrl: f.get("sourceUrl") || null,
          ...(f.get("documentId") ? { documentId: f.get("documentId") } : {}),
        },
      });
      await documents();
    });
  for (const b of app.querySelectorAll("[data-inspect]"))
    b.onclick = run(async () => {
      const pages = await docApi("documents/" + b.dataset.inspect + "/pages");
      showText(
        "Extracted source text",
        pages
          .map(
            (p) =>
              `PDF page ${p.pdfPage}${p.printedLabel ? " · printed " + p.printedLabel : ""}\n\n${p.text}`,
          )
          .join("\n\n────────\n\n"),
      );
    });
  for (const action of ["approve", "withdraw"])
    for (const b of app.querySelectorAll("[data-" + action + "]"))
      b.onclick = run(async () => {
        await docApi("documents/" + b.dataset[action] + "/" + action, {
          method: "POST",
          body: { reason: "Administrator withdrawal" },
        });
        await documents();
      });
}
async function integrations() {
  const { items } = await api("integrations");
  app.innerHTML =
    '<h1>Work-order integrations</h1><section class="card"><form id="integration"><label>Integration name<input name="name" required></label><button class="primary">Create integration credential</button></form><pre id="credential"></pre><p class="muted">Keep credentials in your source system. Company and permissions are derived from the credential.</p>' +
    items
      .map(
        (i) =>
          `<p>${esc(i.name)} · ${i.revoked ? "revoked" : `<button data-integration="${esc(i.id)}">Revoke</button>`}</p>`,
      )
      .join("") +
    "</section>";
  $("#integration").onsubmit = run(async () => {
    $("#credential").textContent = JSON.stringify(
      await api("integrations", {
        method: "POST",
        body: { name: new FormData($("#integration")).get("name") },
      }),
      null,
      2,
    );
  });
  for (const b of app.querySelectorAll("[data-integration]"))
    b.onclick = run(async () => {
      await api("integrations/" + b.dataset.integration + "/revoke", {
        method: "POST",
        body: {},
      });
      await integrations();
    });
}
async function inbox() {
  const { items } = await api("inbox");
  app.innerHTML =
    "<h1>Office inbox</h1>" +
    items
      .map(
        (j) =>
          `<section class="card"><h2>${esc(j.externalId)} · ${esc(j.order.customer)}</h2><p>${j.status.accepted ? esc(j.status.decision) : j.status.received ? "Received; review pending" : "Waiting for office receipt"}</p><button data-view="${j.id}">Review exact report</button>${!j.status.received ? `<button data-receipt="${j.id}" data-revision="${j.status.closeoutRevision}">Record receipt</button>` : !j.status.accepted ? `<button data-accept="${j.id}" data-revision="${j.status.closeoutRevision}">Accept with open follow-ups</button>` : ""}</section>`,
      )
      .join("");
  for (const b of app.querySelectorAll("[data-view]"))
    b.onclick = run(async () =>
      showReport(await api("jobs/" + b.dataset.view + "/closeout")),
    );
  for (const [attr, route] of [
    ["receipt", "receipts"],
    ["accept", "acceptances"],
  ])
    for (const b of app.querySelectorAll("[data-" + attr + "]"))
      b.onclick = run(async () => {
        await api("jobs/" + b.dataset[attr] + "/" + route, {
          method: "POST",
          body: { revision: b.dataset.revision },
        });
        await inbox();
      });
}
function showText(title, text) {
  const d = document.createElement("dialog"),
    h = document.createElement("h2"),
    p = document.createElement("pre"),
    b = document.createElement("button");
  h.textContent = title;
  p.textContent = text;
  b.textContent = "Close";
  b.onclick = () => d.close();
  d.append(h, p, b);
  document.body.append(d);
  d.onclose = () => d.remove();
  d.showModal();
}
function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function field(id) {
  checkpoint();
  cleanup?.();
  cleanup = null;
  speaker = null;
  const fieldCache = cache,
    fieldPrincipal = structuredClone(account.principal);
  if (
    !fieldCache ||
    fieldCache.scope !== fieldPrincipal.companyId + ":" + fieldPrincipal.userId
  )
    throw Error("Unlock this company account online before opening work.");
  const identity = ++epoch,
    inFlight = new Set();
  const scopeCheck = () => {
    if (
      identity !== epoch ||
      cache !== fieldCache ||
      Date.now() >= fieldCache.expiresAt ||
      account?.principal?.userId !== fieldPrincipal.userId ||
      account?.principal?.companyId !== fieldPrincipal.companyId
    )
      throw Error("This account or visit has closed.");
  };
  const fieldApi = async (path, options = {}) => {
    scopeCheck();
    const controller = new AbortController();
    inFlight.add(controller);
    try {
      return await api(path, { ...options, signal: controller.signal });
    } finally {
      inFlight.delete(controller);
    }
  };
  const job = await fieldApi("jobs/" + id);
  if (identity !== epoch) return;
  current = job;
  let local = (await fieldCache.get("job:" + id)) || {
    events: [],
    photos: [],
    audio: [],
    draft: "",
    conversation: [],
  };
  if (identity !== epoch || cache !== fieldCache) return;
  const serverEvents = (await fieldApi("jobs/" + id + "/events")).events;
  if (identity !== epoch || cache !== fieldCache) return;
  const exportWork = () => {
    scopeCheck();
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            ...local,
            companyId: fieldPrincipal.companyId,
            userId: fieldPrincipal.userId,
            jobId: id,
          }),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "carryforward-my-work.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  let history;
  try {
    history = classifyHistory(local.events, serverEvents);
  } catch {
    history = { classification: "conflict" };
  }
  if (history.classification === "conflict") {
    // Neither history wins automatically. In particular a longer server log
    // must never replace an unsynced correction from this account's cache.
    document.body.classList.remove("field", "cloud-workspace", "voice-first");
    $("#nav").hidden = false;
    app.innerHTML = `<h1>Saved work needs reconciliation</h1><section class="card"><h2>${esc(job.externalId)} · ${esc(job.order.customer)}</h2><p>This device and the server contain different visit histories. Your local work is retained encrypted. Reporting and automatic sync are paused for this visit.</p><p>Export your saved work before asking your company administrator to reconcile the histories. Opening this page does not replace either history.</p><button id="export-conflict">Export my unsynced work</button><button id="conflict-back">Work orders</button></section>`;
    $("#export-conflict").onclick = run(exportWork);
    $("#conflict-back").onclick = run(jobs);
    cleanup = () => {
      for (const controller of inFlight) controller.abort();
    };
    return;
  }
  if (history.classification === "server_extends") local.events = serverEvents;
  if (local.assignmentRevision && local.assignmentRevision !== job.revision) {
    await fieldCache.put(
      "previous-revision:" + id + ":" + local.assignmentRevision,
      local,
    );
    if (identity !== epoch || cache !== fieldCache) return;
    message(
      "Assignment changed. Earlier unsynced work is retained separately. Review the new brief before reporting.",
    );
    local = { ...local, assignmentRevision: job.revision };
  }
  local.assignmentRevision = job.revision;
  local.orderSnapshot = job.order;
  let state = createInvestigation(job.order);
  for (const e of local.events) state = reduceInvestigation(state, e);
  let photoSync=Promise.resolve();
  let view, fileDesk, filesSwipes,
    previousCitation = null;
  const photoUrls = [];
  const valid = () =>
    identity === epoch &&
    cache === fieldCache &&
    Date.now() < fieldCache.expiresAt &&
    account?.principal?.companyId === job.companyId &&
    account?.principal?.userId === fieldPrincipal.userId;
  const ensure = () => {
    if (!valid()) throw Error("This account or visit has closed.");
  };
  const save = () => {
    ensure();
    return fieldCache.put("job:" + id, local);
  };
  let photoImport=null;
  function receiveSuppliedPhotos(){
    if(photoImport)return photoImport;
    photoImport=(async()=>{
      const controller=new AbortController();inFlight.add(controller);
      try{
        const additions=await loadAdmittedPhotos({jobId:id,sources:state.sources,photos:local.photos,ensure,digest,encode:base64,fetchOriginal:path=>{ensure();return fetch(path,{signal:controller.signal});}});ensure();
        const current=additions.filter(p=>state.sources[p.id]?.sha256===p.sha256&&!state.sources[p.id]?.excluded&&!local.photos.some(x=>x.id===p.id));
        if(current.length){const before=local.photos;local.photos=[...local.photos,...current];try{await save();}catch(error){local.photos=before;throw error;}}
      }finally{inFlight.delete(controller);photoImport=null;}
    })();return photoImport;
  }
  const sync = async () => {
    await fieldApi("jobs/" + id + "/events", {
      method: "POST",
      body: { events: local.events },
    });
  };
  const dispatch = async (type, payload, { syncNow = true } = {}) => {
    ensure();
    const event = {
      id: crypto.randomUUID(),
      jobId: id,
      seq: state.seq + 1,
      type,
      at: new Date().toISOString(),
      payload,
    };
    state = reduceInvestigation(state, event);
    local.events.push(event);
    await save();
    try {
      if (syncNow) await sync();
    } catch (e) {
      if (valid())
        message(
          "Saved encrypted on this device; waiting to reconnect. " + e.message,
        );
    }
    return event;
  };
  ensure();
  document.body.classList.add("field", "cloud-workspace");
  $("#nav").hidden = true;
  let voiceConfig = { speech: { enabled: false } };
  const fieldSpeaker = createReplySpeaker({
    jobId: id,
    fallbackToLocal: false,
    getConfig: () => voiceConfig,
    fetchImpl: (path, options) => {
      ensure();
      return fetch("/pilot/api/jobs/" + id + "/voice/speech", {
        ...options,
        headers: { ...options.headers, "X-CarryForward-Intent": "pilot" },
      });
    },
  });
  speaker = fieldSpeaker;
  const speak = (text, options = {}) => {
    ensure();
    if (options.config) voiceConfig = options.config;
    return fieldSpeaker.speak(text, {
      ...options,
      onState: (s) => {
        if (valid()) view?.setActivity(s);
      },
      onError: (e) => {
        if (valid()) message(e.message);
      },
      onOutput: output => {
        options.onOutput?.(output);
      },
    });
  };
  const briefSpoken=spokenPilotBrief(job.order);
  const briefingVoice=createBriefingVoice({jobId:id,text:briefSpoken,ensure,speak,stopSpeech:()=>fieldSpeaker.stop(),
    request:(action,body)=>fieldApi('jobs/'+id+'/'+action,{method:'POST',body:{...body,expectedRevision:job.revision}}),
  });
  const voiceTurn = createPilotVoiceTurn({
    createTiming: createTurnTiming,
    ensure,
    request: async (action, body) => {
      if(action==='voice/answer'&&body.photoIds){await photoSync;ensure();}
      return fieldApi("jobs/" + id + "/" + action, { method: "POST", body:{...body,expectedRevision:job.revision} });
    },
    saveTrace: async (trace) => {
      local.voiceTurns ??= [];
      const at = local.voiceTurns.findIndex((t) => t.clipId === trace.clipId);
      if (at < 0) local.voiceTurns.push(trace);
      else local.voiceTurns[at] = trace;
      await save();
    },
    applyAnswer: async (answer) => {
      ensure();
      if (answer.events) {
        const next = createInvestigation(job.order);
        let checked = next;
        for (const event of answer.events)
          checked = reduceInvestigation(checked, event);
        state = checked;
        local.events = answer.events;
      }
      local.conversation.push({ text: answer.reply, answer, kind: "voice" });
      await save();
      ensure();
      view.refresh();
    },
    resolveCommand: (text) => fileDesk.route(text),
    showHeard: (text) => view.setHeard(text),
    showAnswer: async (answer) => {
      view.setResponse(answer.reply, {
        origin: answer.reportSaved
          ? "Saved report; review before confirming"
          : answer.interpretationOnly?'Photo interpretation; review against the original':"Company sources",
        sourceIds:answer.sourceIds||[],detail:answer.photos?.map(p=>`${p.name} · ${p.sha256}`).join(' · '),
      });
      // A cited answer is still a conversation. Open/select a source only when
      // the technician explicitly requests it through Files or a show command.
      previousCitation = answer.citations?.[0] || previousCitation;
      fileDesk.rememberCitation(answer.citations?.[0]);
    },
    speak,
    onUnavailable: (reason) => {
      if (valid())
        message(
          reason ||
            "Voice note saved. Live voice is not configured; type your words under More.",
        );
    },
    stopSpeech: () => briefingVoice.cancel(),
  });
  view = mountCloud(app, {
    order: job.order,
    voiceOnly: true,
    startWithBrief: true,
    spokenBrief: briefSpoken,
    onGetState: () => state,
    onRefresh: () => photoQuestion(),
    onGetFiles: async () => {await receiveSuppliedPhotos();ensure();return fileDesk.list();},
    onSelectFile: (item,options) => fileDesk.open(item,options),
    onSourcePage:(item,page,options)=>fileDesk.open(item,{...options,page}),
    onFocusSource: item => fileDesk.focus(item),
    onReviewPhoto: item => {fileDesk.focus(item);return photoQuestion();},
    onStopSpeaking: () => voiceTurn.cancel(),
    onSpeak: (text,options) => {
      if(text===briefSpoken){voiceTurn.cancel();return briefingVoice.play(options);}
      briefingVoice.cancel();return speak(text,options);
    },
    onNavigate: async (step) => {
      if (step === "jobs") return page("jobs");
      if (step === "review") return report(job, local, state);
      if (step === "sources") return showAssignmentSources(job);
    },
    onDraftChange: async (value) => {
      local.draft = typeof value === "string" ? value : value?.text || "";
      await save();
    },
    onSaveAnswer: async (text) => {
      voiceTurn.cancel();
      await dispatch("turn.recorded", { id: crypto.randomUUID(), text });
      return {
        response:
          "Got it. Your report is saved. Unverified work and office commitments remain open.",
        speak: true,
        origin: "Technician testimony; no AI interpretation",
      };
    },
    onCommand: async (text) => {
      const sourceCommand=await fileDesk.route(text);ensure();
      if(sourceCommand?.handled)return {handled:true,response:sourceCommand.reply,origin:'Work-order files'};
      if(sourceCommand?.photoIds)return {handled:true,...await photoQuestion(text,sourceCommand)};
      if (
        !/\?|^(what|where|how|can|show|open|pull up|bring up|tell|read|is|does|do|when|who|why)\b/i.test(
          text,
        )
      )
        return false;
      voiceTurn.cancel();
      const timing = createTurnTiming();
      timing.mark("localSaved");
      const answer = await fieldApi("jobs/" + id + "/question", {
        method: "POST",
        body: { text, previousCitation,expectedRevision:job.revision,...(sourceCommand?.selectedDocument?{selectedDocument:sourceCommand.selectedDocument}:{}) },
      });
      timing.mark("validatedAnswer");
      if (!valid()) return { handled: true };
      previousCitation = answer.citations[0] || previousCitation;
      fileDesk.rememberCitation(answer.citations[0]);
      local.conversation.push({ text, answer, timing: timing.snapshot() });
      await save();
      if (!valid()) return { handled: true };
      return {
        handled: true,
        response: answer.reply,
        origin: answer.provenance.kind,
      };
    },
    onPhotoFiles: async (files) => {
      ensure();
      for (const file of [...files]) {
        if (!valid()) return;
        if (
          local.photos.length >= 10 ||
          file.size > 5_000_000 ||
          !["image/png", "image/jpeg", "image/webp"].includes(file.type)
        )
          throw Error("Use up to ten JPEG/PNG/WebP photos, 5 MB each.");
        const bytes = new Uint8Array(await file.arrayBuffer()),
          photo = {
            id: crypto.randomUUID(),
            jobId: id,
            mime: file.type,
            name: file.name,
            sha256: await digest(bytes),
            dataBase64: base64(bytes),
            status: "included",
            syncStatus: "local",
          };
        ensure();
        const before={photos:[...local.photos],events:[...local.events],state};
        local.photos.push(photo);
        try{
          await dispatch("source.added",{id:photo.id,kind:"photo",sha256:photo.sha256},{syncNow:false});
        }catch(error){
          local.photos=before.photos;local.events=before.events;state=before.state;
          throw error;
        }
        drawPhotos();
        // Capture is complete after the durable local save. A slow upload must
        // not keep the camera/Files controls locked. Scope is checked per step.
        photoSync=photoSync.then(async()=>{
          ensure();
          await fieldApi("jobs/" + id + "/evidence", {method:"POST",body:{photos:[photo]}});
          ensure();await sync();ensure();photo.syncStatus='synced';await save();
        }).catch(error=>{if(valid())message("Photo saved encrypted locally; waiting for sync. "+error.message);});
      }
      drawPhotos();
    },
    onHold: () => {
      ensure();
      voiceTurn.cancel();
      return startHeldVoice({
        onState: (s) => {
          if (valid()) view.setActivity(s);
        },
        onComplete: async ({ wav, cancelled, error, diagnostic }) => {
          const release = Number.isFinite(diagnostic?.releasedAt)
            ? diagnostic.releasedAt
            : performance.now();
          const timing = createTurnTiming({ release });
          if (!valid()) return;
          view.setActivity("ready");
          if (cancelled || error) {
            if (error) message(error);
            return;
          }
          const clip = await prepareVoiceClip(id, wav, {
            name: "Voice note " + new Date().toLocaleTimeString(),
          });
          ensure();
          local.audio.push(clip);
          await save();
          if (!valid()) return;
          timing.mark("localSaved");
          view.setActivity("reviewing");
          try {
            const result = await voiceTurn.complete(clip, { release, timing });
            // The configured transcription route admits originals before ASR.
            // Local-only recording still syncs the same original/hash metadata.
            if (result.enabled === false)
              await fieldApi("jobs/" + id + "/audio", {
                method: "POST",
                body: { clips: [clip] },
              });
          } catch (error) {
            if (valid()) message("Voice note retained. " + error.message);
          } finally {
            if (valid()) view.setActivity("ready");
          }
        },
      });
    },
  });
  fileDesk=createWorkOrderFiles({job,getPhotos:()=>local.photos,getBrief:()=>fieldApi('jobs/'+id+'/brief'),getPages:version=>fieldApi(`jobs/${id}/references/${version}/pages`),
    fetchOriginal:async(path,{signal})=>{ensure();const response=await fetch(path,{signal,headers:{'X-CarryForward-Intent':'pilot'}});if(!response.ok)throw Error('Original unavailable; reconnect or ask dispatch to refresh.');const bytes=await response.arrayBuffer();ensure();return bytes;},ensure,
    show:(item,{preview=false}={})=>preview?view.openSource(item):view.showEvidence(item),choose:notice=>view.openFiles({notice,fromTurn:true}),queryDocument:(text,previousCitation)=>fieldApi('jobs/'+id+'/question',{method:'POST',body:{text,previousCitation,expectedRevision:job.revision}})});
  async function photoQuestion(text='What do you see in this picture?',selected=null){
    ensure();voiceTurn.cancel();const command=selected||await fileDesk.route(text);ensure();
    if(command?.handled)return {response:command.reply,origin:'Work-order files'};
    if(!command?.photoIds)return {response:'Open Files and select a job photo to review.',origin:'Photo selection required'};
    await photoSync;ensure();
    const start=await fieldApi('jobs/'+id+'/voice/start',{method:'POST',body:{expectedRevision:job.revision}});ensure();
    if(!start.enabled)return {response:'Photo review is unavailable right now. Your original remains saved.',origin:'Photo review unavailable'};
    const answer=await fieldApi('jobs/'+id+'/voice/answer',{method:'POST',body:{ticket:start.ticket,inputKind:'typed_question',text,photoIds:command.photoIds,requestKind:'photo_question',expectedRevision:job.revision}});ensure();
    local.conversation.push({text,answer,kind:'photo_question'});await save();ensure();
    await speak(answer.reply,{speech:answer.speech,config:start});ensure();
    return {response:answer.reply,origin:'Photo interpretation; not proof of current conditions',sourceIds:answer.sourceIds,detail:answer.photos.map(p=>`${p.name} · ${p.sha256}`).join(' · ')};
  }
  filesSwipes=bindVisitSwipes(app,{getStep:()=> 'companion',canNavigate:()=>valid()&&view.canNavigate(),navigate:step=>{if(step==='jobs')void page('jobs');},openFiles:()=>void view.openFiles()});
  const reminderEvents = bindNativeReminderEvents({
    windowTarget: window,
    revalidate: async () => {
      ensure();
      const fresh = await fieldApi("account");
      if (
        fresh.principal?.userId !== fieldPrincipal.userId ||
        fresh.principal?.companyId !== fieldPrincipal.companyId
      )
        throw Error("Sign in again before opening this reminder.");
      const latest = await fieldApi("jobs/" + id);
      ensure();
      if (latest.revision !== job.revision)
        throw Error("Assignment changed. Reopen this work order.");
      return latest;
    },
    open: (latest, { finish, signal }) => {
      ensure();
      return departure(latest, finish, Boolean(local.draft?.trim()), {
        signal,
        ensureActive: ensure,
      });
    },
    onError: (error) => {
      if (valid()) message(error.message);
    },
  });
  const dispose = () => {
    for (const d of document.querySelectorAll("dialog")) {
      d.close();
      d.remove();
    }
    reminderEvents.dispose();
    filesSwipes?.();fileDesk.dispose();
    voiceTurn.dispose();
    fieldSpeaker.dispose();
    for (const controller of inFlight) controller.abort();
    for (const url of photoUrls) URL.revokeObjectURL(url);
    view();
  };
  dispose.checkpoint = () => {
    if (!valid()) return;
    local.draft = view.draftSnapshot().text;
    return fieldCache.put("job:" + id, local);
  };
  cleanup = dispose;
  view.setConnection({ ready: true, liveEnabled: true });
  view.setDraft(local.draft || "", { focus: false });
  function drawPhotos() {
    if (!valid()) return;
    for (const url of photoUrls) URL.revokeObjectURL(url);
    photoUrls.length = 0;
    view.setPhotos(
      local.photos.map((p) => {
        const bytes = Uint8Array.from(atob(p.dataBase64), (c) =>
            c.charCodeAt(0),
          ),
          url = URL.createObjectURL(new Blob([bytes], { type: p.mime }));
        photoUrls.push(url);
        return {
          id: p.id,
          jobId: id,
          kind: "image",
          title: p.name,
          imageUrl: url,
          origin: "Original retained locally",
          availability: "Technician photo; not independently verified",
        };
      }),
    );
  }
  drawPhotos();
  const prep = document.createElement("button");
  prep.textContent = "Ready to leave";
  prep.onclick = run(() => departure(job, false, Boolean(local.draft?.trim())), valid);
  const finish = document.createElement("button");
  finish.textContent = "Finish visit";
  finish.onclick = run(
    () => departure(job, true, Boolean(local.draft?.trim())), valid,
  );
  const reconnect = document.createElement("button");
  reconnect.textContent = "Sync saved work";
  reconnect.onclick = run(async () => {
    await photoSync;ensure();
    for (const p of local.photos)
      await fieldApi("jobs/" + id + "/evidence", {
        method: "POST",
        body: { photos: [p] },
      });
    for (const c of local.audio)
      await fieldApi("jobs/" + id + "/audio", {
        method: "POST",
        body: { clips: [c] },
      });
    await sync();
    if (valid()) message("Saved evidence and reports synced.");
  }, valid);
  const exporter = document.createElement("button");
  exporter.textContent = "Export my unsynced work";
  exporter.onclick = run(exportWork, valid);
  view.extraTools.prepend(prep, finish, reconnect, exporter);
  if (local.events.length > serverEvents.length)
    message(
      "Encrypted unsynced work recovered. Use Sync saved work when connected.",
    );
}
async function departure(
  job,
  finish = false,
  localDraftPresent = false,
  { signal, ensureActive = () => {} } = {},
) {
  const prepEpoch = epoch;
  const prepApi = scopedApi();
  const v = await prepApi("jobs/" + job.id + "/reminders", {
    method: "POST",
    body: {
      localDraftPresent,
      event: finish ? { type: "finish_visit" } : undefined,
    },
  });
  ensureActive();
  if (signal?.aborted || prepEpoch !== epoch) return;
  const d = document.createElement("dialog");
  d.className = "departure-check";
  d.innerHTML = `<h2>${finish ? "Before leaving the site" : "Ready to leave"}</h2><p>${esc(job.order.customer)} · ${esc(job.order.property)}</p><p>${esc(job.order.requestedWork.join(" "))}</p>${(v.state.checklist || []).map((i) => `<label class="inline"><input type="checkbox" data-item="${esc(i.id)}" ${v.state.acknowledged.includes(i.id) ? "checked" : ""}>${esc(i.label)} · ${esc(i.requirement)}<small>${esc(i.source)}</small></label>`).join("")}<p>${finish ? "Check onsite-only observations and report status before moving." : "Packing is your acknowledgement; location never marks equipment packed."}</p>${finish ? "<ul>" + (v.state.onsiteOnly || []).map((item) => "<li>" + esc(item) + "</li>").join("") + "</ul>" : ""}<p>${esc(v.state.reportStatus === "no_report" ? "No visit report yet." : v.state.reportStatus === "confirmed_unsent" ? "Report confirmed, waiting to send." : ["sent", "received", "accepted", "accepted_with_followups"].includes(v.state.reportStatus) ? "Reporting is complete; office handling and open physical work remain separate." : "Your report still needs review and confirmation.")}</p><div class="row"><button id="review-brief">I reviewed the brief</button><button id="enable-reminders">Enable departure reminders</button><button id="mute-reminders">Mute reminders</button><button id="close-prep">Close</button></div><p class="muted">Optional location and notification permissions provide a backup exit reminder. Stop safely before opening a notification. Manual checks work without permission.</p>`;
  if (v.state.day) {
    const context = document.createElement("section");
    context.className="day-context";
    context.innerHTML=`<h3>${finish?'Next stop':'Today’s preparation'}</h3>${v.state.day.warning?`<p class="danger">${esc(v.state.day.warning)}</p>`:''}${finish?(v.state.day.nextStop?`<p><strong>${esc(v.state.day.nextStop.customer)}</strong> · ${esc(v.state.day.nextStop.externalId)}</p><p>${esc(v.state.day.nextStop.property)}</p>`:'<p>This is your last planned stop.</p>'):`<ol>${v.state.day.stops.map(stop=>`<li>${esc(stop.externalId)} · ${esc(stop.customer)}</li>`).join('')}</ol><p>The checklist covers your selected stops. Each requirement keeps its work-order source.</p>`}`;
    d.querySelector("h2").after(context);
    d.querySelector("#review-brief").textContent="I reviewed the departure checks";
  }
  document.body.append(d);
  d.showModal();
  d.onclose = () => d.remove();
  d.querySelector("#close-prep").onclick = () => d.close();
  const event = async (event) => {
    const result = await prepApi("jobs/" + job.id + "/reminders", {
      method: "POST",
      body: { event },
    });
    if (prepEpoch !== epoch || !d.isConnected || signal?.aborted) return false;
    if (result.state.briefRevision !== v.state.briefRevision) {
      d.close();
      const fresh = await prepApi("jobs/" + job.id);
      if (prepEpoch !== epoch || signal?.aborted) return false;
      await departure(fresh, finish, localDraftPresent, {signal,ensureActive});
      if (prepEpoch === epoch) message("Departure checks changed. Review the current requirements.");
      return false;
    }
    native("sync");
    return true;
  };
  d.querySelector("#review-brief").onclick = run(async () => {
    if (!await event({ type: "review_brief", briefRevision: v.state.briefRevision })) return;
    d.querySelector("#review-brief").textContent = "Brief reviewed";
    d.querySelector("#review-brief").disabled = true;
  });
  for (const b of d.querySelectorAll("[data-item]"))
    b.onchange = run(() =>
      event({
        type: "ack_item",
        itemId: b.dataset.item,
        briefRevision: v.state.briefRevision,
        acknowledged: b.checked,
      }),
    );
  d.querySelector("#enable-reminders").onclick = run(async () => {
    await event({ type: "opt_in", enabled: true });
    native("enable");
  });
  d.querySelector("#mute-reminders").onclick = run(async () => {
    await event({ type: "mute", kind: "shop", muted: true });
    await event({ type: "mute", kind: "site", muted: true });
    native("disable");
  });
}
async function report(job, local, state) {
  checkpoint();
  epoch++;
  const reportEpoch = epoch,
    reportCache = cache,
    reportPrincipal = structuredClone(account.principal);
  const ensureReport = () => {
    if (
      epoch !== reportEpoch ||
      cache !== reportCache ||
      Date.now() >= reportCache.expiresAt ||
      account?.principal?.userId !== reportPrincipal.userId ||
      account?.principal?.companyId !== reportPrincipal.companyId
    )
      throw Error("This report view has closed.");
  };
  const reportApi = (path, options) => {
    ensureReport();
    return api(path, options);
  };
  cleanup?.();
  cleanup = null;
  document.body.classList.remove("field", "cloud-workspace", "voice-first");
  const turns = Object.values(state.sources).filter(
    (s) => s.kind === "testimony" && !s.supersededBy,
  );
  app.innerHTML = `<h1>Review your visit report</h1><section class="card"><h2>Recorded testimony</h2>${turns.map((t) => `<p>${esc(t.text)}</p><button data-correct="${esc(t.id)}">Correct this report</button>`).join("")}</section><form id="report-form" class="card"><label>Findings and work performed<textarea name="summary" required>${esc(turns.map((t) => t.text).join("\n"))}</textarea></label><p>Technician: ${esc(account.principal.user.name)}</p><label>Follow-up owner<input name="owner" required value="Operations"></label><label>Customer commitments<textarea name="promises"></textarea></label>${job.order.checks.map((c) => `<fieldset><legend>${esc(c.label)}</legend><label>Status<select name="status-${esc(c.id)}"><option value="pending">Unverified / follow-up</option><option value="observed">Technician observed</option></select></label><label>Observation or remaining work<textarea name="note-${esc(c.id)}"></textarea></label><label>Evidence reference (for an observation)<input name="ref-${esc(c.id)}"></label><label>Observation time with UTC offset<input name="time-${esc(c.id)}" placeholder="2026-11-04T10:00:00-06:00"></label></fieldset>`).join("")}<button class="primary">Prepare exact report revision</button><button type="button" id="back-field">Back to conversation</button></form>`;
  $("#back-field").onclick = run(() => field(job.id));
  for (const b of app.querySelectorAll("[data-correct]"))
    b.onclick = () => {
      const d = document.createElement("dialog");
      d.innerHTML =
        '<form><label>Corrected testimony<textarea name="text" required></textarea></label><button>Save correction</button><button type="button">Cancel</button></form>';
      document.body.append(d);
      d.showModal();
      d.querySelector("textarea").value = state.sources[b.dataset.correct].text;
      d.querySelector("[type=button]").onclick = () => d.close();
      d.onclose = () => d.remove();
      d.querySelector("form").onsubmit = run(async (e) => {
        ensureReport();
        const text = new FormData(e.target).get("text"),
          event = {
            id: crypto.randomUUID(),
            jobId: job.id,
            seq: state.seq + 1,
            type: "turn.recorded",
            at: new Date().toISOString(),
            payload: {
              id: crypto.randomUUID(),
              text,
              supersedes: b.dataset.correct,
            },
          };
        state = reduceInvestigation(state, event);
        local.events.push(event);
        await reportCache.put("job:" + job.id, local);
        await reportApi("jobs/" + job.id + "/events", {
          method: "POST",
          body: { events: local.events },
        });
        d.close();
        await report(job, local, state);
      });
    };
  const reportForm = $("#report-form");
  const savedDraft = Object.keys(local.reportDraft || {}).length > 0;
  let draftNeedsReview =
    savedDraft && local.reportDraftEventRevision !== state.seq;
  if (draftNeedsReview) {
    const warning = document.createElement("section");
    warning.className = "card";
    warning.innerHTML =
      '<p>Your saved report draft predates this visit history, or its original revision is unknown. Compare it with the recorded testimony above before preparing a new revision. The existing confirmed report is unchanged.</p><label class="inline"><input id="review-saved-draft" type="checkbox">I reviewed this saved draft against the current visit history.</label>';
    reportForm.prepend(warning);
    reportForm.querySelector('[type="submit"], button.primary').disabled = true;
    warning.querySelector("input").onchange = run(async (event) => {
      ensureReport();
      draftNeedsReview = !event.target.checked;
      if (!draftNeedsReview) local.reportDraftEventRevision = state.seq;
      else delete local.reportDraftEventRevision;
      reportForm.querySelector('[type="submit"], button.primary').disabled =
        draftNeedsReview;
      await reportCache.put("job:" + job.id, local);
    });
  }
  for (const [name, value] of Object.entries(local.reportDraft || {})) {
    const control = reportForm.elements.namedItem(name);
    if (control) control.value = value;
  }
  reportForm.oninput = () => {
    try {
      ensureReport();
      local.reportDraft = Object.fromEntries(new FormData(reportForm));
      if (!draftNeedsReview) local.reportDraftEventRevision = state.seq;
      void reportCache
        .put("job:" + job.id, local)
        .catch((error) => {
          try {
            ensureReport();
            message(error.message);
          } catch {}
        });
    } catch {}
  };
  $("#report-form").onsubmit = run(async () => {
    ensureReport();
    if (draftNeedsReview)
      throw Error(
        "Review the saved draft against this visit's current history first.",
      );
    const f = new FormData($("#report-form")),
      entries = {};
    for (const c of job.order.checks)
      entries[c.id] = {
        status: f.get("status-" + c.id),
        note: f.get("note-" + c.id) || "Unverified; follow-up required",
        reference: f.get("ref-" + c.id),
        observedAt: f.get("time-" + c.id),
      };
    const value = {
      technician: account.principal.user.name,
      summary: f.get("summary"),
      recordedAt: new Date().toISOString(),
      followupOwner: f.get("owner"),
      promises: f.get("promises"),
      interviewRevision: state.seq,
      evidenceRevision: evidenceRevision(local.photos, local.audio),
      entries,
    };
    const packet = await reportApi("jobs/" + job.id + "/closeout", {
      method: "POST",
      body: { report: value, eventRevision: state.seq },
    });
    app.innerHTML = `<h1>Confirm this revision</h1><section class="card"><p>${esc(packet.closeout.summary)}</p><p>${packet.closeout.openCount} follow-ups remain open.</p>${packet.closeout.findings.map((f) => `<section><h2>${esc(f.label)}</h2><p>${esc(f.note)}</p><p>${esc(f.outcome)}${f.followupOwner ? " · Owner: " + esc(f.followupOwner) : ""}</p>${f.reference ? "<small>" + esc(f.reference) + " · " + esc(f.observedAt) + "</small>" : ""}</section>`).join("")}<p>Revision ${esc(packet.revision)}</p><button id="confirm-report" class="primary">Confirm as ${esc(account.principal.user.name)}</button></section>`;
    $("#confirm-report").onclick = run(async () => {
      await reportApi("jobs/" + job.id + "/confirmations", {
        method: "POST",
        body: {
          revision: packet.revision,
          reportRevision: packet.reportRevision,
          name: account.principal.user.name,
          confirmedAt: new Date().toISOString(),
        },
      });
      app.innerHTML =
        '<h1>Report confirmed</h1><p>It has not been sent to the office.</p><button id="send-report" class="primary">Send confirmed report</button>';
      native("sync");
      $("#send-report").onclick = run(async () => {
        await reportApi("jobs/" + job.id + "/deliveries", {
          method: "POST",
          body: { revision: packet.revision },
        });
        native("sync");
        app.innerHTML =
          '<h1>Sent to your company</h1><p>Office receipt and acceptance are separate. Open follow-ups remain open.</p><button id="return-list">Work orders</button>';
        $("#return-list").onclick = run(jobs);
      });
    });
  });
}
const accountSignal = new BroadcastChannel("carryforward-pilot-account");
accountSignal.onmessage = () => {
  lock();
  account = null;
  controls();
  authScreen();
  message(
    "Account session changed in another window. Sign in to unlock your own saved work.",
  );
};
$("#logout").onclick = run(async () => {
  logoutIntent(true);
  accountSignal.postMessage({ kind: "logout" });
  lock();
  authScreen();
  message("Signing out…");
  await api("/api/auth/sign-out", { method: "POST", body: {} });
  logoutIntent(false);
  account = null;
  controls();
  authScreen();
  message("Signed out.");
});
$("#brand").onclick = run(() =>
  account?.principal ? page("jobs") : refresh(),
);
$("#account-button").onclick = () =>
  showText(
    "Your company account",
    `${account.principal.user.name}\n${account.principal.user.email}\n${account.principal.company.name}\n${account.principal.role}\nOne company per account.`,
  );
window.addEventListener("pagehide", () => {
  speaker?.stop();
});
refresh().catch((err) => {
  lock();
  message(err.message);
  authScreen();
});

if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("/pilot/sw.js", { scope: "/pilot/" })
    .catch(() =>
      message(
        "Offline app shell is unavailable; saved work remains encrypted.",
      ),
    );
async function createJob() {
  const members = (await api("account/members")).members,
    docs = (await api("documents")).items.filter(
      (d) => d.status === "approved" && d.processing?.status === "ready",
    );
  app.innerHTML = `<h1>Create a work order</h1><form id="simple-job"><div class="grid"><section class="card"><label>Work-order number<input name="externalId" required maxlength="100" placeholder="WO-1043"></label><label>Customer or account<input name="customer" required></label><label>Site address / description<input name="property" required></label><label>Contact phone (optional)<input name="phone" type="tel"></label><label>Reported problem<textarea name="issue" required></textarea></label><label>Assigned scope (one item per line)<textarea name="scope" required>Inspect the reported issue within the authorized scope.
Record findings and separate production, monitoring and office follow-ups.</textarea></label><label>Assign technician<select name="assignee" required>${members
    .filter((m) => m.status === "active")
    .map(
      (m) =>
        `<option value="${m.userId}">${esc(m.name)} · ${esc(m.role)}</option>`,
    )
    .join(
      "",
    )}</select></label><label>Customer / site history<textarea name="history" placeholder="Dated source notes; leave blank when unknown"></textarea></label></section><section class="card"><h2>Equipment and sources</h2><p class="muted">Unknown fields stay unknown. A model family alone does not establish the variant.</p>${[
    ["manufacturer", "Manufacturer"],
    ["model", "Model"],
    ["fullPartNumber", "Full part number"],
    ["variant", "Variant / configuration"],
    ["region", "Region"],
  ]
    .map(([key, title]) => `<label>${title}<input name="${key}"></label>`)
    .join(
      "",
    )}<fieldset><legend>Approved reference versions</legend>${docs.map((d) => `<label class="inline"><input name="source" type="checkbox" value="${d.versionId}">${esc(d.title)} · ${esc(d.revision)}</label>`).join("") || '<p class="muted">No approved sources yet.</p>'}</fieldset><label>Required bring-along items (one per line)<textarea name="required" placeholder="Dispatcher requirements for this visit"></textarea></label><label>Access and parking notes<textarea name="access" placeholder="Only current dispatcher-supplied access information"></textarea></label><details><summary>Optional departure-reminder locations</summary><p>Enter verified shop/site coordinates. Missing coordinates leave the manual checks available.</p>${["shop", "site"].map((kind) => `<fieldset><legend>${kind === "shop" ? "Shop" : "Site"}</legend><label>Latitude<input type="number" step="any" name="${kind}Latitude" min="-90" max="90"></label><label>Longitude<input type="number" step="any" name="${kind}Longitude" min="-180" max="180"></label><label>Radius in meters<input type="number" name="${kind}Radius" min="100" max="1000" value="150"></label></fieldset>`).join("")}</details><button class="primary">Create and assign</button></section></div></form><details><summary>Integration import</summary><p>Use the versioned API or inspect/import the assignment JSON.</p><button id="advanced-create">Open JSON import</button></details>`;
  $("#advanced-create").onclick = run(createJobAdvanced);
  $("#simple-job").onsubmit = run(async () => {
    const f = new FormData($("#simple-job")),
      id = crypto.randomUUID(),
      equipmentRef = "equipment-" + id,
      systemRef = "system-" + id,
      equipment = Object.fromEntries(
        ["manufacturer", "model", "fullPartNumber", "variant", "region"].map(
          (k) => [k, String(f.get(k) || "").trim() || null],
        ),
      );
    const input = {
      version: "carryforward.assignment.v2",
      externalId: f.get("externalId"),
      sourceRevision: "1",
      assigneeUserIds: [f.get("assignee")],
      customerRef: "customer-" + crypto.randomUUID(),
      siteRef: "site-" + crypto.randomUUID(),
      systemRef,
      equipment: Object.values(equipment).some(Boolean)
        ? [
            {
              equipmentRef,
              ...equipment,
              identityBasis:
                "Dispatcher-supplied inventory; verify equipment on site",
            },
          ]
        : [],
      contextRefs: f.getAll("source").map((versionId) => ({
        documentId: docs.find((d) => d.versionId === versionId).documentId,
        versionId,
        purpose: "job_reference",
        required: true,
        equipmentRef,
        priority: "before_work",
      })),
      departureChecklist: String(f.get("required"))
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((label, i) => ({
          id: "dispatch-" + i,
          label,
          requirement: "required",
          source: "Explicit dispatcher instruction on this work order",
        })),
      order: {
        ...demoOrder,
        customerContact: {
          address: f.get("property"),
          ...(f.get("phone") ? { phone: f.get("phone") } : {}),
          source: {
            id: "dispatch-contact-" + id,
            title: "Dispatcher-supplied contact",
            revision: "1",
          },
        },
        systemId: systemRef,
        customer: f.get("customer"),
        property: f.get("property"),
        reportedIssue: f.get("issue"),
        requestedWork: String(f.get("scope"))
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        history: [],
        briefing: {},
      },
    };
    for (const kind of ["shop", "site"]) {
      const latitude = f.get(kind + "Latitude"),
        longitude = f.get(kind + "Longitude");
      if (latitude || longitude) {
        if (!latitude || !longitude)
          throw Error("Supply both coordinates or leave the location blank.");
        input.locations ??= {};
        input.locations[kind] = {
          latitude: Number(latitude),
          longitude: Number(longitude),
          radius: Number(f.get(kind + "Radius")),
        };
      }
    }
    const source = {
      id: "dispatch-brief-" + id,
      title: "Dispatcher assignment",
      revision: "1",
    };
    if (equipment.model || equipment.fullPartNumber)
      input.order.briefing.system = [
        {
          id: "equipment-" + id,
          kind: "context",
          text:
            Object.entries(equipment)
              .filter(([, v]) => v)
              .map(([k, v]) => k + ": " + v)
              .join("; ") + ". Dispatcher-supplied identity; verify on site.",
          source,
        },
      ];
    if (f.get("access"))
      input.order.briefing.access = [
        { id: "access-" + id, kind: "reported", text: f.get("access"), source },
      ];
    if (f.get("history"))
      input.order.history = [
        {
          id: "dispatch-history-" + id,
          date: new Date().toISOString().slice(0, 10),
          text:
            "Dispatcher entered this note today; underlying business-event dates must be supplied in the text: " +
            f.get("history"),
        },
      ];
    await api("jobs", {
      method: "POST",
      body: input,
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    await jobs();
  });
}

function resumeSession() {
  if (sessionRenewal) return sessionRenewal;
  const scope = cache?.scope, visitId = current?.id;
  // Expiring the offline cache is not the same as expiring the HttpOnly login.
  // refresh locks the old key first, then asks the server to authenticate again.
  const pending = (async () => {
    try {
      await refresh();
    } catch (error) {
      lock(); authScreen();
      message('Reconnect to unlock saved work. ' + error.message);
      return;
    }
    if (visitId && cache?.scope === scope) {
      try { await field(visitId); }
      catch (error) {
        if (cache?.scope === scope) {
          await page('jobs');
          message('Your visit could not be reopened. ' + error.message);
        }
      }
    }
  })();
  sessionRenewal = pending;
  void pending.finally(() => { if (sessionRenewal === pending) sessionRenewal = null; });
  return pending;
}
async function revalidateVisible() {
  try {
    logoutPending = localStorage.getItem(logoutKey) === "1";
  } catch {
    logoutPending = true;
  }
  if (logoutPending) {
    if (document.visibilityState !== "hidden") await refresh();
    return;
  }
  if (!cache || document.visibilityState === "hidden") return;
  if (Date.now() >= cache.expiresAt) {
    return resumeSession();
  }
  const active = cache;
  try {
    const next = await api("account");
    if (cache !== active) return;
    const scope = next.principal
      ? next.principal.companyId + ":" + next.principal.userId
      : null;
    if (scope !== active.scope) {
      lock();
      message("Company access changed. Saved work remains encrypted.");
      authScreen();
      return;
    }
    if (
      next.principal.role !== account.principal.role ||
      JSON.stringify(next.principal.permissions) !==
        JSON.stringify(account.principal.permissions)
    ) {
      await refresh();
      message("Your company permissions changed; this view was refreshed.");
      return;
    }
    account = next;
    controls();
    if (current) {
      const jobs = (await api("jobs")).items;
      if (!jobs.some((j) => j.id === current.id)) {
        lock();
        message("Assignment access changed. Saved work remains encrypted.");
        await refresh();
      }
    }
  } catch {
    if (cache === active && Date.now() >= active.expiresAt) {
      await resumeSession();
    }
  }
}
window.addEventListener("online", revalidateVisible);
window.addEventListener("pageshow", revalidateVisible);
document.addEventListener("visibilitychange", revalidateVisible);
async function showAssignmentSources(job) {
  const sourcesApi = scopedApi();
  const { context } = await sourcesApi("jobs/" + job.id + "/brief");
  const d = document.createElement("dialog");
  d.innerHTML =
    "<h2>Sources for this visit</h2>" +
    context
      .map(
        (source) =>
          '<section class="card"><h3>' +
          esc(source.title || "Unavailable source") +
          "</h3><p>" +
          esc(source.issuer || "") +
          " · " +
          esc(source.revision || "") +
          " · " +
          esc(source.status || "unavailable") +
          "</p>" +
          (source.status === "approved"
            ? '<a target="_blank" rel="noopener" href="/pilot/api/jobs/' +
              job.id +
              "/references/" +
              source.versionId +
              '/original">Open original document</a>'
            : "<p>Ask your dispatcher to refresh this source.</p>") +
          "</section>",
      )
      .join("") +
    "<button>Back to the conversation</button>";
  d.querySelector("button").onclick = () => d.close();
  document.body.append(d);
  d.showModal();
  d.onclose = () => d.remove();
}

function recoveryRequest() {
  lock();
  app.innerHTML =
    '<section class="card auth"><h1>Recover your account</h1><form id="recover"><label>Email<input name="email" type="email" required autocomplete="username"></label><button class="primary">Request recovery link</button><button type="button" id="back-login">Back to sign in</button></form><p class="muted">Local pilot: the server writes a private recovery link for the operator. No email is sent.</p></section>';
  $("#back-login").onclick = authScreen;
  $("#recover").onsubmit = run(async () => {
    await api("/api/auth/request-password-reset", {
      method: "POST",
      body: {
        email: new FormData($("#recover")).get("email"),
        redirectTo: location.origin + "/pilot/",
      },
    });
    message(
      "If the account exists, a private local recovery link is available to the operator. It expires in 30 minutes.",
    );
  });
}
function recoveryScreen() {
  const token = new URLSearchParams(location.hash.slice(1)).get("recovery");
  app.innerHTML =
    '<section class="card auth"><h1>Choose a new password</h1><form id="reset"><label>New password<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button class="primary">Reset password and revoke older sessions</button></form></section>';
  $("#reset").onsubmit = run(async () => {
    await api("/api/auth/reset-password", {
      method: "POST",
      body: { token, newPassword: new FormData($("#reset")).get("password") },
    });
    history.replaceState(null, "", "/pilot/");
    logoutIntent(true);
    await refresh();
    message("Password updated. Sign in with your new password.");
  });
}

function showReport(packet) {
  const r = packet.closeout;
  showText(
    "Confirmed visit report",
    `${r.technician}\n${r.recordedAt}\n\n${r.summary}\n\n${r.findings.map((f) => f.label + " — " + f.outcome + "\n" + f.note + (f.followupOwner ? "\nFollow-up owner: " + f.followupOwner : "") + (f.reference ? "\nSource: " + f.reference + " · " + f.observedAt : "")).join("\n\n")}\n\nCustomer commitments: ${r.promises || "None recorded"}\n${r.openCount} follow-ups remain open.\n\nExact revision: ${packet.revision}\nOriginal evidence: ${packet.evidence?.length || 0} photos, ${packet.audio?.length || 0} voice clips.\nTechnician confirmation, office receipt and acceptance are separate records.`,
  );
}
