# Pilot document library

November 4, 2026. This is the isolated local company-pilot implementation. The contest phone and its retained database are unchanged. No provider request is needed to run the document checks.

The library stores immutable originals and extracted pages per company. An upload records a SHA-256 hash, issuer, declared revision, applicability, author and extraction result. Approval and withdrawal are separate audited actions. Approving a new version supersedes the old version for fresh retrieval; old original bytes and citations remain intact. Existing confirmed reports are never rewritten by library updates. A dispatcher must deliberately refresh a pinned assignment reference.

Only company owner/admin principals may mutate this library. The server must authenticate each principal, derive company identity from its session, check current membership, and restrict technicians to the exact references of their assigned job. The library additionally scopes every lookup by company and checks mutation roles. A company dropdown or this library's actor argument is not authentication. Integration credentials cannot approve documents.

## Storage and parser

`createDocumentLibrary({databasePath, storageDir})` uses a separate SQLite database and protected original files. Original filenames are generated IDs under a SHA-256 company directory. User filenames, source URLs and document text never become filesystem paths, shell commands or network requests. Original downloads recompute the source hash before returning bytes. SQL uses bound parameters. The server serves originals through authenticated routes, not a static directory.

Supported uploads are UTF-8 plain text and text-based PDF. Form-feed characters separate plain-text pages. `pdfjs-dist` 6.5.438 is the maintained Mozilla PDF.js parser, pinned as an Apache-2.0 dependency. It runs in a subprocess with a 256 MiB JavaScript heap, a 15-second deadline and at most two simultaneous parsers. Input is capped at 8 MiB, 120 pages, 3 million extracted characters and 40,000 characters per page. These are bounded pilot limits, not an OS-level hostile-file sandbox or production malware scanning.

PDF evaluation and XFA are disabled. PDF text and pages are reference data; JavaScript, instructions, embedded prompts and URLs inside a source are not executed. Invalid, encrypted, empty/image-only or resource-limit failures retain their original and expose an actionable processing status. An extraction failure cannot be approved. OCR is not implemented.

## Module contract

Import `createDocumentLibrary` from `pilot/documents.mjs`. Methods:

- `upload(companyId, actor, {bytes, mime, title, issuer, revision, applicability, sourceUrl?, documentId?})` asynchronously creates a new immutable version. Supplying the same company's `documentId` adds a revision. Upload does not approve it.
- `approve(companyId, actor, versionId)` and `withdraw(companyId, actor, versionId, reason)` record lifecycle decisions. A withdrawn or superseded version cannot be reapproved; upload a new version instead.
- `list(companyId)`, `read(companyId, versionId)`, `getPages(companyId, versionId, {pageIndices?})` and `audit(companyId, versionId)` support protected inspection.
- `original(companyId, versionId)` asynchronously returns verified bytes, MIME and hash. It does not return a filesystem path.
- `retrieve(companyId, {references, equipment, query, previousCitation?, maxChars?})` searches only the exact attached approved versions. It returns `found` or an explicit blocked result, original excerpts, citations and a document-navigation intent. It never modifies findings or confirms work.
- `close()` closes only a database owned by this instance.

Metadata has camelCase identifiers (`companyId`, `documentId`, `versionId`, `versionNumber`, `sourceUrl`) plus retained SQL-style fields. `processing.status` is `ready`, `failed` or `needs_ocr`; approval `status` is `uploaded`, `approved`, `superseded` or `withdrawn`. `DocumentError` carries `code`, `status` and `statusCode` for HTTP handling.

Manufacturer applicability is explicit, for example:

```json
{
  "kind": "manufacturer",
  "manufacturer": "SolarEdge",
  "models": ["SE7600H-US"],
  "fullPartNumbers": ["SE7600H-US000BNU4"],
  "variant": "SetApp",
  "region": "North America",
  "requiredIdentityFields": ["manufacturer", "model", "fullPartNumber", "variant", "region"]
}
```

A model-family label alone does not pass this match. Company policies and general job references use their own declared source kind. Each manufacturer reference can name an `equipmentRef`; only that equipment is considered for its applicability check.

## Actual manufacturer fixture

The original [SolarEdge SetApp North America guide](https://knowledge-center.solaredge.com/sites/kc/files/se_hd_wave_inverter_with_SetApp_installation_guide_na.pdf) was downloaded through Chrome's ordinary PDF download control on November 4. Revision `MAN-01-00541-1.4`, August 2020, has 82 PDF pages and SHA-256:

`6b88da3b09cba263b89bf7921b7f3e889385fe3a4a303ce0563c23ff45ab82b2`

The matched fixture explicitly specifies a fictional SolarEdge SE7600H-US000BNU4 unit, SetApp configuration, North America. The manufacturer's [part-number equivalency list](https://knowledge-center.solaredge.com/sites/kc/files/SetApp-enabled-PN-EquivalencyList-NA.pdf) identifies that part as the SetApp counterpart. This does not resolve applicability for the older SE7600H-US demo record, which still lacks its exact part/configuration.

The extraction preserves zero-based `pageIndex`, one-based `pdfPage`, and the separately extracted `printedLabel`. Labels come from PDF page labels when available, otherwise an unambiguous numeric page-margin item; unavailable labels remain null. The status and warning pages were visually inspected against the original:

| Topic | pageIndex | PDF page | Printed label |
| --- | ---: | ---: | ---: |
| Important safety instructions | 7 | 8 | 7 |
| Removing the inverter cover | 51 | 52 | 51 |
| Verifying the connection | 60 | 61 | 60 |

The read-only fixture question is “Where is S_OK shown under Server Comm in Status?” The engine locates actual extracted text in the connection-verification section and retains its revision/hash. “Show that page again” recalls the same permitted page. A cover-warning request returns the complete relevant safety-page text, with operating instructions blocked pending the complete applicable procedure and company task authorization. Missing identity, a wrong variant/equipment, an unsupported setting, a withdrawn source or a missing warning remain explicit failures. Source navigation never establishes that an equipment condition currently exists.

The literal follow-up “where is that setting?” recalls only the supplied prior citation's exact approved, company-scoped and equipment-applicable version/page. Its document ID, hash, revision, PDF page, printed label and source-contained section must match; it does not search for a guessed setting. Without a prior citation it asks for the setting name. Foreign, withdrawn or altered citations stay blocked. “Set/change that setting” does not enter this read-only recall path.

Warning **reading** is distinct from requesting removal steps. A matched, approved warning question now returns a useful cited warning in the conversational reply as well as the complete retrieved safety page. On the bilingual fixture it reads every complete English WARNING block, including the switch/wait/risk, grounding and qualified-personnel context; it retains the entire bilingual page for inspection. It never truncates a warning block to fit the 1,600-character speech limit. An oversized readback remains a source reference without an incomplete spoken projection. `procedureBlocked` stays true, and explicit procedure requests do not receive operating steps or model synthesis. Both local question and optional configured voice routes use the same deterministic source readback.

`pilot/manual-fixture.mjs` contains metadata, source URLs and synthetic equipment only. The full copyrighted PDF and extracted text stay under ignored `.local/pilot-manuals/`; they are not licensed by the project's MIT license and must not enter public source archives.

Run against a deliberately downloaded original:

```sh
/opt/homebrew/opt/node@24/bin/node pilot/manual-fixture.mjs \
  .local/pilot-manuals/MAN-01-00541-1.4.pdf \
  .local/pilot-manuals/new-check-destination
```

The helper checks the pinned hash and source pages, then registers the document in a new synthetic company library and writes a private receipt. It makes no provider call. HTTP company authentication, member/assignment revocation, protected page opening and account switching are additional integration checks owned by the pilot server.

## Verification and limits

`node --test pilot/documents.test.mjs` exercises nine meaningful checks: original/hash/version persistence after reopening; company/role separation; extracted text and exact citations; same-page/warning recall; applicability and unsupported/missing evidence; MIME/size/UTF-8 failures; genuine PDF text extraction, encrypted and empty-text outcomes; original tamper detection and untrusted prompt data; and the actual pinned manufacturer source when locally present. The manufacturer test intentionally skips when its separately obtained original is absent, with a reason; synthetic PDF tests still run. Set `CF_MANUFACTURER_FIXTURE` to an inspected original path to run it elsewhere.

`pilot/document-conversation.test.mjs` adds three genuine signed HTTP checks. The actual manual's warning reply retains all three English warning blocks and exact revision/hash/PDF8/printed7, while removal steps, mismatched equipment and a missing warning stay blocked. The configured voice path issues an exact validated one-use Sarah grant and complete mocked PCM with no model dispatch; this proves local routing, not live speech or acoustic playback. A separate synthetic check confirms a report, approves a same-document replacement, observes the old source blocked without rewriting that packet, explicitly refreshes the assignment with `If-Match` and a new source revision, then gets an answer from the new pinned version. The earlier confirmed packet remains unchanged in protected report history, and the old original bytes remain available to the authorized office. The third check asks the actual Server Comm question followed by “where is that setting?”, preserving the same section/hash/PDF61/printed60. Missing, foreign, altered hash/page/section, wrong-equipment and withdrawn context cannot supply an answer, and apply/change requests cannot alter report events. This recall check leaves all providers disabled.

The current retrieval is bounded lexical source lookup, not general semantic RAG or live model reasoning. It can identify an applicable passage and show its provenance; a weak/no text match stays unsupported. It does not certify a procedure, a technician's qualification, de-energization or real-world safety. Full production uploads still need operational scanning/quarantine, stronger process isolation, quotas/retention and resource-load testing.
