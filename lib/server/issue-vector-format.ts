/**
 * Compact storage format of issue vectors (follow-up of MIN-717/MIN-718).
 *
 * A vector used to be stored as a JSON array of floats: about 21 KB for 1,536
 * dimensions, 28.6 KB once encrypted. Search reads every vector of a project
 * per query, so transfer from PostgREST — not decryption, not ranking — was
 * what bounded latency. Vectors are now stored as int8 with one scale per
 * vector, base64-encoded: 2 KB of payload for 1,536 dimensions.
 *
 * Symmetric per-vector quantization keeps each coordinate within
 * `scale / 254` of its value. The embedding space is unchanged (same model,
 * same dimensions), so quantized and legacy rows of one index version stay
 * comparable; legacy rows are still read, and rewritten compactly by the
 * hourly index walk. Pure: shared by the repository, its tests and the
 * evaluation harness.
 */

export interface CompactVector {
  /** Format tag: int8 values, one scale per vector. */
  f: "i8";
  /** Largest absolute coordinate; a stored value v means v * s / 127. */
  s: number;
  /** The int8 values, base64. */
  d: string;
}

export function quantizeVector(vector: readonly number[]): CompactVector {
  let scale = 0;
  for (const value of vector) scale = Math.max(scale, Math.abs(value));
  const bytes = new Int8Array(vector.length);
  if (scale > 0) {
    for (let i = 0; i < vector.length; i++) bytes[i] = Math.round((vector[i] / scale) * 127);
  }
  return { f: "i8", s: scale, d: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64") };
}

export function isCompactVector(value: unknown): value is CompactVector {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return v.f === "i8" && typeof v.s === "number" && Number.isFinite(v.s) && v.s >= 0 && typeof v.d === "string";
}

export function dequantizeVector(value: CompactVector): number[] {
  const buffer = Buffer.from(value.d, "base64");
  const bytes = new Int8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const factor = value.s / 127;
  return Array.from(bytes, (b) => b * factor);
}
