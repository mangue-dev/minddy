/** Optional encrypted persistence is evidence, never an authentication or UI gate. */
export function executableCacheMetadata(raw, owner) {
  if (raw === null) return { present: false, envelopePresent: false, state: "absent" };
  try {
    const value = JSON.parse(raw);
    const envelopePresent = value?.format === "minddy-local-v1" && typeof value.ciphertext === "string";
    const ownerMatches = value?.owner === owner;
    return { present: envelopePresent && ownerMatches, envelopePresent, ownerMatches,
      state: envelopePresent ? ownerMatches ? "recognized-owner-envelope" : "different-owner-envelope" : "unsupported-envelope",
      serializedCharacters: raw.length };
  } catch { return { present: false, envelopePresent: false, state: "malformed-envelope", serializedCharacters: raw.length }; }
}
