# Smaller review copies

A technician can explicitly prepare a smaller JPEG from a saved original in the interview's photo preview. The original remains unchanged. The copy is a separate photo evidence item with its own ID/hash and a `derivedFrom` original ID, `sourceSha256`, dimensions, quality and method `browser-review-copy.v1`.

The browser checks the original hash before decoding. Conversion preserves aspect ratio, uses a maximum edge of 1600 pixels, and tries bounded size/quality steps until a JPEG is at most 300,000 bytes. It refuses images over 40 million decoded pixels or unsuccessful conversion. Transparent pixels receive a white background. This is a lossy review aid, not an independent observation. Small detail can be lost; the technician must inspect the copy and explicitly select it before sending. Preparation alone does not select or transmit it.

Three copies fit under the existing 1,000,000-byte review cap. Originals and copies share the ten-photo job limit and existing bundle/admission limits; copies are not hidden outside the evidence inventory. A review-copy source must refer to an admitted, unexcluded original from the same job with matching hash. Copies of copies are refused. Excluding the original invalidates supporting branches and prevents using its copy for new support. Explicitly excluded copies remain excluded if the original is restored.

The model input identifies the exact sent image hash and original relationship, and warns about lost detail and unknown capture timing. Model findings cite the copy ID. Handoffs retain photo-source metadata; portable media exports include both original and copy bytes, and the local Operations simulator admits and serves each by ID. This records application provenance, not independent certification that a client-supplied image is authentic.

## Verified synthetic exercise

- Saved a 2560×1440 fictional display image: 1,248,896 bytes.
- Oversized-original selection was refused before inference.
- Explicit preparation produced a 1600×900 JPEG: 253,286 bytes, quality 0.7.
- One actual guarded Muse Spark review of only the selected copy read the synthetic 2.4 kW display, cited the copy ID and left production deferred and warranty pending with Operations. API time was 10,040 ms; this single development example does not establish field accuracy.
- Confirmed, queued, received and separately accepted the exact local handoff with follow-ups open. Revision: `a47a8be6a970a97660e21b6787167dd05f0fff91153dff564c18914d42af64fa`.
- Verified original export bytes match the uploaded fixture exactly. Verified both export hashes and the original relationship. Read the original and copy from the local Operations database and downloaded the copy through its source API; hashes match the export.

One native iPhone camera-to-copy conversion passed on November 1: a 2,672,636-byte JPEG became a 273,031-byte 1200×1600 copy. An actual guarded review read the fictional 2.4 kW display, and source API readback matched the original, copy and their relationship. See [phone validation](PHONE_VALIDATION.md) for the assisted workflow and limits. HEIC, real field-photo legibility and OS memory pressure remain unverified. HEIC is not an admitted format. This work adds no background library access or production integration.
