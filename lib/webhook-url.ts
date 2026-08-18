/**
 * The address of a webhook, as entered.
 *
 * Pure module, without dependencies: this is what makes it testable and usable on both sides — the field that collects it and, one day, what receives it.
 */

/**
 * "example.com/hooks/minddy" is a URL for the reader, not for
 * `new URL()` — and that's how you copy it from a doc or an address bar. We therefore complete the missing schema rather than refusing the
 * entry.
 *
 * In `https`, never `http`: this address will receive signed payloads,
 * and a default in plain text would be a choice made in the user's place. A
 * schema already written is respected as is — `http://localhost:3000` remains
 * what it is.
 */
export function normalizeWebhookUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

/** Is the address callable as is? (server rechecks) */
export function isDeliverableWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
