// Pure, job-local navigation over sources explicitly admitted by the caller.
// Resource text is untrusted display data. This module never fetches a URL,
// treats source text as a command, or infers an equipment procedure.
const LIMITS = { resources: 64, text: 12000, warning: 4000, command: 1000 };
const KINDS = new Set(['document', 'image', 'video']);
const owns = (object, key) => Object.hasOwn(object, key);

function text(value, label, maximum = 300, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`${label} must be nonempty text (maximum ${maximum} characters).`);
  }
  return value.trim();
}

function localUrl(value, label) {
  if (value === undefined) return undefined;
  const url = text(value, label, 2048);
  if (/[\s\\\u0000-\u001f\u007f]/u.test(url)) throw new Error(`${label} must be an admitted local URL.`);
  // Local paths must remain inside this explicit namespace even after decoding.
  // Reject encoded separators/traversal rather than relying on browser cleanup.
  if (url.startsWith('/job-assets/')) {
    if (/[?#]/u.test(url)) throw new Error(`${label} must be an admitted local URL.`);
    let decoded;
    try { decoded = decodeURIComponent(url); } catch { throw new Error(`${label} has invalid encoding.`); }
    if (!decoded.startsWith('/job-assets/') || /[\\\s%?#\u0000-\u001f\u007f]/u.test(decoded) ||
        decoded.split('/').some((segment, index) => index > 0 && (!segment || segment === '.' || segment === '..'))) {
      throw new Error(`${label} must stay within /job-assets/.`);
    }
    return url;
  }
  // Object URLs are supplied by the caller, not constructed from remote URLs.
  if (/^blob:(?:https?:\/\/[^/\s?#]+|null)\/[a-z\d-]+$/iu.test(url)) return url;
  throw new Error(`${label} must be an admitted /job-assets/ path or blob URL.`);
}

function admitResource(input, jobId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Resource must be an object.');
  const resource = {
    id: text(input.id, 'Resource ID', 300),
    jobId: text(input.jobId, 'Resource job ID', 300),
    kind: input.kind,
    title: text(input.title, 'Resource title', 300),
  };
  if (resource.jobId !== jobId) throw new Error('Resource belongs to another job.');
  if (!KINDS.has(resource.kind)) throw new Error('Unsupported job resource kind.');
  for (const key of ['systemId', 'revision']) {
    if (input[key] !== undefined) resource[key] = text(input[key], `Resource ${key}`, 300);
  }
  if (input.page !== undefined) {
    if (!(Number.isSafeInteger(input.page) && input.page >= 1 && input.page <= 100000)) throw new Error('Resource page must be a positive page number.');
    resource.page = input.page;
  }
  if (input.text !== undefined) resource.text = text(input.text, 'Resource text', LIMITS.text);
  for (const key of ['url', 'posterUrl', 'imageUrl']) {
    const url = localUrl(input[key], `Resource ${key}`);
    if (url !== undefined) resource[key] = url;
  }
  if (input.warning !== undefined) {
    const warning = input.warning;
    if (!warning || typeof warning !== 'object' || Array.isArray(warning) || typeof warning.approvedForGuidance !== 'boolean') {
      throw new Error('Warning requires explicit source approval metadata.');
    }
    resource.warning = {
      text: text(warning.text, 'Warning text', LIMITS.warning),
      approvedForGuidance: warning.approvedForGuidance,
      systemId: text(warning.systemId, 'Warning system ID', 300),
      revision: text(warning.revision, 'Warning source revision', 300),
      ...(warning.beforeAction !== undefined ? {beforeAction: text(warning.beforeAction, 'Warning action', 300)} : {}),
    };
  }
  return resource;
}

function orderSummary(order) {
  const details = {};
  for (const key of ['customer', 'property', 'reportedIssue']) {
    if (order[key] !== undefined) details[key] = text(order[key], key, key === 'reportedIssue' ? 4000 : 300);
  }
  if (order.requestedWork !== undefined) {
    if (!Array.isArray(order.requestedWork) || order.requestedWork.length > 20) throw new Error('Briefing supports at most 20 work items.');
    details.requestedWork = order.requestedWork.map(item => text(item, 'Requested work', 4000));
  }
  return details;
}

export function createJobContext(order, resources = []) {
  if (!order || typeof order !== 'object') throw new Error('A current job is required.');
  const jobId = text(order.id, 'Job ID', 300);
  const systemId = text(order.systemId, 'System ID', 300);
  if (!Array.isArray(resources) || resources.length > LIMITS.resources) throw new Error(`Admit at most ${LIMITS.resources} job resources.`);
  const admitted = resources.map(resource => admitResource(resource, jobId));
  if (new Set(admitted.map(resource => resource.id)).size !== admitted.length) throw new Error('Resource IDs must be unique within the job.');
  return { jobId, systemId, resources: admitted, briefing: orderSummary(order),
    lastResourceId: null, lastDocumentId: null, lastWarningId: null };
}

function applicableWarning(resource, context) {
  const warning = resource.warning;
  return warning?.approvedForGuidance === true && resource.systemId === context.systemId &&
    warning.systemId === context.systemId && !!resource.revision && warning.revision === resource.revision;
}

function checkedContext(input) {
  if (!input || typeof input !== 'object') throw new Error('A current job context is required.');
  const context = createJobContext({ ...input.briefing, id: input.jobId, systemId: input.systemId }, input.resources);
  for (const key of ['lastResourceId', 'lastDocumentId', 'lastWarningId']) {
    const resource = context.resources.find(item => item.id === input[key]);
    if (resource && (key !== 'lastDocumentId' || resource.kind === 'document') &&
        (key !== 'lastWarningId' || applicableWarning(resource, context))) context[key] = resource.id;
  }
  return context;
}

function citation(resource) {
  const ref = { resourceId: resource.id, title: resource.title };
  for (const key of ['revision', 'page']) if (owns(resource, key)) ref[key] = resource[key];
  return ref;
}

function result(kind, message, context, extra = {}) { return { kind, message, ...extra, context }; }

function present(resource, context, message = `Showing ${resource.title}.`) {
  const next = { ...context, lastResourceId: resource.id };
  if (resource.kind === 'document') next.lastDocumentId = resource.id;
  if (applicableWarning(resource, context)) next.lastWarningId = resource.id;
  return result('present', message, next, { resource, citation: citation(resource) });
}

function briefing(context) {
  const details = context.briefing;
  const lines = [`Job ${context.jobId}; system ${context.systemId}.`];
  if (details.customer) lines.push(`Customer: ${details.customer}.`);
  if (details.property) lines.push(`Site: ${details.property}.`);
  if (details.reportedIssue) lines.push(`Reported issue: ${details.reportedIssue}`);
  if (details.requestedWork?.length) lines.push(`Assigned work: ${details.requestedWork.join(' ')}`);
  lines.push(context.resources.length ? `${context.resources.length} attached job source(s) available.` : 'No attached job sources are available.');
  return result('briefing', lines.join('\n'), context);
}

export function prepareBriefing(order, resources = []) { return briefing(createJobContext(order, resources)); }

const isPdf = resource => resource.kind === 'document' && [resource.url, resource.title].some(value => typeof value === 'string' && /\.pdf(?:$|[?#])/iu.test(value));
const normalize = value => value.toLowerCase().replace(/[“”"'?!.,:;]/gu, '').replace(/\s+/gu, ' ').trim();

function choose(resources, query, context, label) {
  if (!resources.length) return result('unavailable', `No ${label} is attached to this job.`, context);
  if (query) {
    const byId = resources.find(resource => normalize(resource.id) === query);
    if (byId) return present(byId, context);
    const exact = resources.filter(resource => normalize(resource.title) === query || normalize(resource.id) === query);
    if (exact.length === 1) return present(exact[0], context);
    const matches = exact.length ? exact : resources.filter(resource => normalize(resource.title).includes(query));
    if (matches.length === 1) return present(matches[0], context);
    if (!matches.length) return result('unavailable', `No attached ${label} matches that request in this job.`, context);
    return result('unavailable', `More than one attached ${label} matches. Choose a source by title or ID.`, context);
  }
  if (resources.length !== 1) return result('unavailable', `More than one ${label} is attached. Choose a source by title or ID.`, context);
  return present(resources[0], context);
}

export function routeJobCommand(input, currentContext) {
  const context = checkedContext(currentContext);
  if (typeof input !== 'string' || input.length > LIMITS.command) return result('not_command', '', context);
  const command = normalize(input).replace(/^(?:wait|hold on) /u, '')
    .replace(/^(?:please )?(?:(?:can|could|would) you )?(?:please )?/u, '').replace(/ please$/u, '');
  if (/^(?:(?:show|give|read) (?:me )?(?:the |my |this jobs? )?)?(?:job )?briefing$/u.test(command) || command === 'brief me') return briefing(context);

  const warningRequest = command.match(/^(?:what (?:was|is) |repeat |show (?:me )?)(?:that |the )?(?:last )?warning(?: before (.+))?$/u);
  if (warningRequest) {
    const action = warningRequest[1];
    const warnings = context.resources.filter(resource => applicableWarning(resource, context) &&
      (!action || (resource.warning.beforeAction && normalize(resource.warning.beforeAction) === action)));
    const previous = warnings.find(resource => resource.id === context.lastWarningId);
    if (!warnings.length) return result('unavailable', 'No applicable approved warning source is available for this job and system. No equipment procedure can be supplied from these attachments.', context);
    if (!previous && warnings.length !== 1) return result('unavailable', 'More than one approved warning source is attached. Choose the applicable document and revision before using a warning.', context);
    const resource = previous || warnings[0];
    return present(resource, context, `Attached approved warning — ${resource.title}, revision ${resource.revision}:\n“${resource.warning.text}”`);
  }

  const zoom = command.match(/^zoom(?: (?:it|that|this))? (in|out)(?: on (?:(?:this|that|the) )?(?:image|photo|picture|document|page)| on (?:this|that))?$/u);
  if (zoom) {
    const resource = context.resources.find(item => item.id === context.lastResourceId);
    if (!resource || !['document', 'image'].includes(resource.kind)) return result('unavailable', 'No current job document or image is open to zoom.', context);
    return result('navigate', `Zoom ${zoom[1]} on ${resource.title}.`, context,
      { action: zoom[1] === 'in' ? 'zoom_in' : 'zoom_out', resource, citation: citation(resource) });
  }

  const show = command.match(/^(?:show|open|display|play|pull up|bring up)(?: me)? (.+)$/u);
  if (!show) return result('not_command', '', context);
  const request = show[1].replace(/^(?:that |the |my |this jobs? )/u, '');
  const last = request.match(/^last (pdf|document|manual|image|photo|picture|video|clip)$/u);
  if (last) {
    const type = last[1];
    const document = ['pdf', 'document', 'manual'].includes(type);
    const resource = context.resources.find(item => item.id === (document ? context.lastDocumentId : context.lastResourceId));
    const appropriate = resource && (type === 'pdf' ? isPdf(resource) : document ? resource.kind === 'document' :
      ['image', 'photo', 'picture'].includes(type) ? resource.kind === 'image' : resource.kind === 'video');
    return appropriate ? present(resource, context) : result('unavailable', `No last ${type} has been presented in this job. Choose an attached source first.`, context);
  }

  const latest = request.match(/^(?:latest|most recent) (document|pdf|manual|image|photo|picture|video|clip)$/u);
  if (latest) {
    const type = latest[1];
    const resources = context.resources.filter(resource => type === 'pdf' ? isPdf(resource) :
      ['document', 'manual'].includes(type) ? resource.kind === 'document' :
      ['image', 'photo', 'picture'].includes(type) ? resource.kind === 'image' : resource.kind === 'video');
    return resources.length ? present(resources.at(-1), context, `Showing the most recently attached ${type}: ${resources.at(-1).title}.`) :
      result('unavailable', `No ${type} is attached to this job.`, context);
  }

  const typed = request.match(/^(pdf|document|manual|image|photo|picture|video|clip)(?: (?:called |named )?(.+))?$/u);
  if (typed) {
    const type = typed[1];
    const resources = context.resources.filter(resource => type === 'pdf' ? isPdf(resource) :
      ['document', 'manual'].includes(type) ? resource.kind === 'document' :
      ['image', 'photo', 'picture'].includes(type) ? resource.kind === 'image' : resource.kind === 'video');
    return choose(resources, typed[2], context, type);
  }
  // Only treat an otherwise unnamed show request as navigation when it names
  // an admitted source. Normal technician narration keeps its existing path.
  const named = context.resources.filter(resource => normalize(resource.title) === request || normalize(resource.id) === request || normalize(resource.title).includes(request));
  if (named.length) return choose(named, request, context, 'source');
  return result('not_command', '', context);
}
