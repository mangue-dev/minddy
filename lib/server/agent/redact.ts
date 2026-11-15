/**
 * Redaction of known credentials in Numo tool results (MIN-239): a tool that
 * holds a secret registers it, and every string of the result is substituted
 * before it reaches the model or the persisted thread.
 */

/** Which replaces a secret. Recognizable, and readable by a human debugger. */
export const REDACTED_MARK = "[redacted]";

/**
 * Length floor. A three-character "secret" would substitute chunks of words
 * all over the output. No forge token is short: `ghs_…` is around forty
 * characters, a GitLab access token around sixty.
 */
const MIN_SECRET_LENGTH = 12;

/** The secret register of one conversation turn; tools add to it as they run. */
export class SecretRedactor {
  private readonly secrets = new Set<string>();

  /** Stores a raw value. Ignored if too short to be a secret. */
  add(value: string | null | undefined): void {
    if (value && value.length >= MIN_SECRET_LENGTH) this.secrets.add(value);
  }

  /**
   * The text, secrets substituted. `split`/`join` rather than a regex: a
   * token is a literal string, and a regex built from it would need escaping
   * that can silently fail.
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
 * Applies the substitution to every string of a value, at any depth: tool
 * results are nested objects and a secret can sit anywhere (MIN-328).
 */
export function redactDeep(value: unknown, redact: RedactText): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, redact));
  // Only plain objects are walked; a Date or a Buffer is kept as is.
  if (value === null || typeof value !== "object") return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = redactDeep(item, redact);
  }
  return out;
}
