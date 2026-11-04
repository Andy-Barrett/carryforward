// Keys remain in memory. Logout/expiry hides data; encrypted unsynced evidence
// survives for the SAME authenticated company/user. Cold offline unlock is not supported.
const decoder = new TextDecoder(),
  encoder = new TextEncoder();
export async function seal(value, key, scope) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    bytes = encoder.encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(scope) },
    key,
    bytes,
  );
  return { iv: [...iv], ciphertext: [...new Uint8Array(encrypted)] };
}
export async function unseal(record, key, scope) {
  const data = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(record.iv),
      additionalData: encoder.encode(scope),
    },
    key,
    new Uint8Array(record.ciphertext),
  );
  return JSON.parse(decoder.decode(data));
}
export async function openScopedCache(lease) {
  const scope = lease.scope.companyId + ":" + lease.scope.userId,
    raw = Uint8Array.from(
      atob(lease.key.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
  let key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]),
    closed = false,
    pending = Promise.resolve();
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open("carryforward.companypilot.encrypted.v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("records");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const valid = () => {
    if (closed || Date.now() >= lease.expiresAt) {
      key = null;
      throw Error("Unlock CarryForward online before accessing saved work.");
    }
  };
  const read = (id) =>
    new Promise((resolve, reject) => {
      const t = db.transaction("records"),
        r = t.objectStore("records").get(scope + ":" + id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  return {
    scope,
    expiresAt: lease.expiresAt,
    async get(id) {
      valid();
      const r = await read(id);
      if (!r) return null;
      const v = await unseal(r, key, scope + ":" + id);
      valid();
      return v;
    },
    put(id, value) {
      valid();
      const admittedKey = key,
        snapshot = structuredClone(value);
      const work = pending
        .catch(() => {})
        .then(async () => {
          const r = await seal(snapshot, admittedKey, scope + ":" + id);
          await new Promise((resolve, reject) => {
            const t = db.transaction("records", "readwrite");
            t.objectStore("records").put(r, scope + ":" + id);
            t.oncomplete = resolve;
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error);
          });
        });
      pending = work;
      return work;
    },
    lock() {
      closed = true;
      key = null;
      const drained = pending.finally(() => db.close());
      drained.catch(() => {});
      return drained;
    },
  };
}
