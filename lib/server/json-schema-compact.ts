/**
 * Tool schemas Numo sends on every round (MIN-1001). Zod writes a `uuid`
 * string as `format: "uuid"` plus a 150-character `pattern` that says the
 * same thing; the pattern is dropped so each id field costs a few tokens
 * instead of forty. Validation does not move: the server still parses every
 * argument with the Zod schema. Pure; returns a copy.
 */
export function withoutUuidPatterns<T>(schema: T): T {
  if (Array.isArray(schema)) return schema.map(withoutUuidPatterns) as T;
  if (!schema || typeof schema !== "object") return schema;
  const node = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "pattern" && node.format === "uuid") continue;
    out[key] = withoutUuidPatterns(value);
  }
  return out as T;
}
