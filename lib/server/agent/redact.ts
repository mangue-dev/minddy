/**
 * Redact known credentials before any output leaves the loop (MIN-239).
 * MIN-421 removes reusable forge credentials from sandbox remotes, but this
 * remains defense in depth for trusted-side clone errors, desktop-local Git URLs,
 * and any future secret registered during a turn. The pure module is included in
 * the VM bundle and imports neither database nor environment access.
 */

/** Which replaces a secret. Recognizable, and readable by a human debugger. */
export const REDACTED_MARK = "[redacted]";

/**
 * Length floor. A three-character "secret" would substitute chunks
 * of words all over the output — the cure would be worse than the disease. No forge token
 * is short: `ghs_…` is around forty characters, an access
 * GitLab token is around sixty.
 */
const MIN_SECRET_LENGTH = 12;

/**
 * The secrets carried by a token-authenticated clone URL
 * (`https://x-access-token:<token>@github.com/…`, `https://oauth2:<token>@…`).
 *
 * The password, in BOTH of its forms: as `URL` renders it (percent-encoded,
 * this is what git writes in `.git/config`) and decoded (this is the raw token, that
 * which can also appear alone in a header or an error message). Both
 * are identical for an alphanumeric token — duplication costs nothing and
 * covers the day it is no longer.
 *
 * The user (`x-access-token`, `oauth2`) is never a secret: it is a
 * protocol constant, and overriding it would make URLs unreadable for nothing.
 */
export function authUrlSecrets(authUrl: string | null | undefined): string[] {
  if (!authUrl) return [];
  let password: string;
  try {
    password = new URL(authUrl).password;
  } catch {
    return [];
  }
  if (!password) return [];
  const out = [password];
  try {
    const decoded = decodeURIComponent(password);
    if (decoded !== password) out.push(decoded);
  } catch {
    // Percent-malformed encoding: raw form is sufficient.
  }
  return out;
}

/**
 * The secret register of a run, and it is MUTABLE on purpose.
 *
 * A run can last longer than a forge installation token, so credentials may be
 * registered more than once while trusted infrastructure rotates them.
 */
export class SecretRedactor {
  private readonly secrets = new Set<string>();

  /** Stores a raw value. Ignored if too short to be a secret. */
  add(value: string | null | undefined): void {
    if (value && value.length >= MIN_SECRET_LENGTH) this.secrets.add(value);
  }

  /** Registers the token carried by a clone URL. Never lift. */
  addAuthUrl(authUrl: string | null | undefined): void {
    for (const secret of authUrlSecrets(authUrl)) this.add(secret);
  }

  /** Number of secrets tracked — useful for testing and debugging, nothing else. */
  get size(): number {
    return this.secrets.size;
  }

  /**
 * The text, secrets substituted. `split`/`join` rather than a regex: a token
 * is a literal string, and a regex built on it would require
 * to escape it — a special character missed and the substitution silently fails,
 * which is exactly the failure mode we don't want here.
 */
  redact = (text: string): string => {
    if (!text || this.secrets.size === 0) return text;
    let out = text;
    for (const secret of this.secrets) {
      if (out.includes(secret)) out = out.split(secret).join(REDACTED_MARK);
    }
    return out;
  };
}

/** What the loop receives: something to substitute, without knowing anything about the register. */
export type RedactText = (text: string) => string;

/**
 * The substitution applied to STRINGS of any value, **en
 * depth** — a tool `preview`, a Numo tool result, an event payload
 *: all are nested objects, and it's basically a secret that's
 * cache.
 *
 * “In depth” was FALSE until MIN-328: the comment announced it, the
 * code only went down one level. A substitution that does not go down is
 * worse than no substitution: it gives the appearance of guarantee.
 *
 * Here rather than in the supervisor (MIN-343): Numo needs this too, and a
 * SECOND substitution written next to it would be the original fault started again.
 */
export function redactDeep(value: unknown, redact: RedactText): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, redact));
  // `null` is an object; a Date, a Buffer and others have nothing to gain from
  // be copied field by field — only simple objects are lowered.
  if (value === null || typeof value !== "object") return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = redactDeep(item, redact);
  }
  return out;
}
