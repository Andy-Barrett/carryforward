// One original WAV and one identical transcription WAV: repeated admission must
// preserve the same identity/hash metadata, including later offline sync.
export async function prepareVoiceClip(
  jobId,
  wav,
  { name = "Voice answer", id = crypto.randomUUID() } = {},
) {
  if (typeof jobId !== "string" || !jobId || !wav)
    throw Error("A job and completed WAV are required.");
  const bytes =
    wav instanceof Uint8Array ? wav.slice() : new Uint8Array(wav).slice();
  if (!bytes.length || bytes.length > 5_000_000)
    throw Error("Voice clip exceeds its bounded size.");
  let binary = "";
  for (let at = 0; at < bytes.length; at += 8192)
    binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  const dataBase64 = btoa(binary),
    sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  return {
    id,
    jobId,
    name,
    mime: "audio/wav",
    dataBase64,
    sha256,
    wavBase64: dataBase64,
    wavSha256: sha256,
  };
}
