const MAX_EVENTS = 500;

function invalid(label) {
  return new TypeError(`${label} must be a JSON event history with at most ${MAX_EVENTS} events`);
}

// Cache contents are data. Reject values that JSON would silently drop or
// rewrite, and accessors/toJSON functions that could execute during comparison.
function validateJSON(value, label, ancestors, depth = 0) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || depth > 64) throw invalid(label);
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    (array && prototype !== Array.prototype) ||
    (!array && prototype !== Object.prototype && prototype !== null) ||
    ancestors.has(value) ||
    Object.getOwnPropertySymbols(value).length
  )
    throw invalid(label);
  if (array) {
    for (let index = 0; index < value.length; index++)
      if (!Object.hasOwn(value, index)) throw invalid(label);
  }
  ancestors.add(value);
  try {
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (!Object.hasOwn(descriptor, "value")) throw invalid(label);
      validateJSON(descriptor.value, label, ancestors, depth + 1);
    }
  } finally {
    ancestors.delete(value);
  }
}

function encodedHistory(history, label) {
  if (
    !Array.isArray(history) ||
    Object.getPrototypeOf(history) !== Array.prototype ||
    history.length > MAX_EVENTS
  )
    throw invalid(label);
  const encoded = [];
  for (let index = 0; index < history.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(history, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw invalid(label);
    const event = descriptor.value;
    if (!event || typeof event !== "object" || Array.isArray(event))
      throw invalid(label);
    validateJSON(event, label, new Set());
    encoded.push(JSON.stringify(event));
  }
  return encoded;
}

/**
 * Compare append-only histories without selecting, replacing or mutating either.
 * Event equality deliberately preserves JSON property order, matching the
 * admitted-prefix contract in OperationsStore.syncEvents. Domain validation
 * remains the investigation reducer's responsibility.
 */
export function classifyHistory(localEvents, serverEvents) {
  const local = encodedHistory(localEvents, "Local history");
  const server = encodedHistory(serverEvents, "Server history");
  let commonPrefix = 0;
  while (
    commonPrefix < Math.min(local.length, server.length) &&
    local[commonPrefix] === server[commonPrefix]
  )
    commonPrefix++;
  const classification =
    commonPrefix < Math.min(local.length, server.length)
      ? "conflict"
      : local.length === server.length
        ? "equal"
        : local.length < server.length
          ? "server_extends"
          : "local_extends";
  return { classification, commonPrefix };
}
