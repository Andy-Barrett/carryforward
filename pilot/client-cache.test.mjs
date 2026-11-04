import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { seal, unseal } from "./public/cache.js";
test("encrypted pending work cannot be opened with a different company, user, job or key", async () => {
  const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    ),
    other = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  const record = await seal(
    {
      draft: "Fictional pending correction 2.4 kW",
      original: [1, 2, 3],
      owners: ["Operations"],
    },
    key,
    "company-a:user-a:job-a",
  );
  assert.equal(JSON.stringify(record).includes("2.4"), false);
  const back = await unseal(record, key, "company-a:user-a:job-a");
  assert.deepEqual(back.owners, ["Operations"]);
  for (const scope of [
    "company-b:user-a:job-a",
    "company-a:user-b:job-a",
    "company-a:user-a:job-b",
  ])
    await assert.rejects(unseal(record, key, scope));
  await assert.rejects(unseal(record, other, "company-a:user-a:job-a"));
  record.ciphertext[0] ^= 1;
  await assert.rejects(unseal(record, key, "company-a:user-a:job-a"));
});
test("pilot offline shell is versioned static code only; no API, original document or evidence path", async () => {
  const sw = await readFile(new URL("./public/sw.js", import.meta.url), "utf8"),
    assets = JSON.parse(sw.match(/ASSETS=(\[[^;]+?\]),allowed=/)[1]);
  assert.equal(
    assets.some(
      (a) =>
        a.includes("/api/") ||
        a.includes("originals") ||
        a.includes("documents"),
    ),
    false,
  );
  const hash = createHash("sha256");
  for (const a of assets) {
    const path =
      a === "/pilot/"
        ? "./public/index.html"
        : a.startsWith("/pilot/")
          ? "./public/" + a.slice(7)
          : "../public" + a;
    hash.update(await readFile(new URL(path, import.meta.url)));
  }
  assert.ok(
    sw.includes("carryforward-pilot-shell-" + hash.digest("hex").slice(0, 16)),
    "Refresh pilot static shell after changing app assets",
  );
  assert.match(sw, /u\.search\|\|!allowed\.has/);
});
