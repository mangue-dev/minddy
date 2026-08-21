import "server-only";

/**
 * Parses one signed relay request body. Returns null on malformed JSON or a
 * non-object payload — routes answer a clean 400 instead of leaking a 500 to
 * an authenticated instance whose body is broken.
 */
export function parseRelayJsonObject(
  rawBody: string,
): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawBody || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
