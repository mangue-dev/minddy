/**
 * The instance variables an administrator may override from the admin
 * dashboard (MIN-847). Shared by the server (what may be read and written,
 * how a value is checked) and the screen (themes, labels, controls): no
 * server-only import here.
 *
 * The list is an ALLOWLIST. Everything absent from it stays in the
 * environment file only, and `NEVER_OVERRIDABLE` names the variables that
 * must never appear in it even by mistake: database access, encryption and
 * signing keys, the edition, the app origin, build-time values, Minddy Cloud
 * operations and the switch of this very layer. A value from the database
 * can therefore never lock an administrator out of the page that edits it.
 *
 * `applies` says when a change takes effect: `live` within a minute (the app
 * reads its variables when it needs them), `restart` after the app restarts
 * (a client built once per process, or a value read into a module constant,
 * like the site name of `lib/site.ts`).
 */

export type InstanceVariableTheme = "ai" | "administrators" | "email" | "forges" | "analytics" | "site";

export const INSTANCE_VARIABLE_THEMES: InstanceVariableTheme[] = [
  "ai",
  "administrators",
  "email",
  "forges",
  "analytics",
  "site",
];

export type InstanceVariableKind =
  | "secret"
  | "text"
  | "url"
  | "email"
  | "emailList"
  | "choice"
  | "boolean";

export interface InstanceVariable {
  key: string;
  theme: InstanceVariableTheme;
  kind: InstanceVariableKind;
  applies: "live" | "restart";
  /** Allowed values of a `choice`; the empty value is always allowed. */
  choices?: readonly string[];
  /** Multi-line secret (a PEM private key). */
  multiline?: true;
  /** Writing it needs a second factor presented within the last minutes. */
  sensitive?: true;
}

export const INSTANCE_VARIABLES: InstanceVariable[] = [
  { key: "OPENROUTER_API_KEY", theme: "ai", kind: "secret", applies: "live", sensitive: true },
  { key: "ADMIN_EMAILS", theme: "administrators", kind: "emailList", applies: "live", sensitive: true },
  { key: "EMAIL_PROVIDER", theme: "email", kind: "choice", choices: ["resend", "console"], applies: "live" },
  { key: "RESEND_API_KEY", theme: "email", kind: "secret", applies: "live", sensitive: true },
  { key: "INVITATION_EMAIL_FROM", theme: "email", kind: "text", applies: "live" },
  { key: "FEEDBACK_EMAIL_FROM", theme: "email", kind: "text", applies: "live" },
  { key: "GITHUB_APP_ID", theme: "forges", kind: "text", applies: "restart" },
  { key: "GITHUB_APP_SLUG", theme: "forges", kind: "text", applies: "restart" },
  { key: "GITHUB_APP_CLIENT_ID", theme: "forges", kind: "text", applies: "live" },
  { key: "GITHUB_APP_CLIENT_SECRET", theme: "forges", kind: "secret", applies: "live", sensitive: true },
  { key: "GITHUB_APP_PRIVATE_KEY", theme: "forges", kind: "secret", multiline: true, applies: "live", sensitive: true },
  { key: "GITHUB_WEBHOOK_SECRET", theme: "forges", kind: "secret", applies: "live", sensitive: true },
  { key: "GITLAB_OAUTH_CLIENT_ID", theme: "forges", kind: "text", applies: "live" },
  { key: "GITLAB_OAUTH_CLIENT_SECRET", theme: "forges", kind: "secret", applies: "live", sensitive: true },
  { key: "GITLAB_WEBHOOK_SECRET", theme: "forges", kind: "secret", applies: "live", sensitive: true },
  { key: "MINDDY_FORGE_RELAY", theme: "forges", kind: "choice", choices: ["0"], applies: "live" },
  { key: "POSTHOG_API_KEY", theme: "analytics", kind: "secret", applies: "restart", sensitive: true },
  { key: "POSTHOG_HOST", theme: "analytics", kind: "url", applies: "restart" },
  { key: "MINDDY_PUBLIC_POSTHOG_KEY", theme: "analytics", kind: "text", applies: "restart" },
  { key: "MINDDY_PUBLIC_POSTHOG_HOST", theme: "analytics", kind: "url", applies: "restart" },
  { key: "MINDDY_PUBLIC_SITE_NAME", theme: "site", kind: "text", applies: "restart" },
  { key: "MINDDY_PUBLIC_CONTACT_EMAIL", theme: "site", kind: "email", applies: "restart" },
  { key: "MINDDY_PUBLISH_MODEL_CONFIG", theme: "site", kind: "boolean", applies: "live" },
];

/** The switch of this layer: set in the environment file only. */
export const CONFIG_OVERRIDES_SWITCH = "MINDDY_CONFIG_OVERRIDES";

/**
 * Never read from, nor written to, the database — checked on both sides, so
 * a registry mistake or a hand-written row cannot reach them.
 */
const NEVER_OVERRIDABLE = [
  /^NEXT_PUBLIC_/,
  /^VERCEL/,
  /^NODE_ENV$/,
  /^MINDDY_PUBLIC_SUPABASE_/,
  /^SUPABASE_/,
  /^MINDDY_DATA_ROOT_KEY$/,
  /^MINDDY_CONTENT_ENCRYPTION/,
  /SECRET$/,
  /^MINDDY_EDITION$/,
  /^MINDDY_PUBLIC_APP_URL$/,
  /^OAUTH_ISSUER$/,
  /^MINDDY_MANAGED_/,
  /^STRIPE_/,
  new RegExp(`^${CONFIG_OVERRIDES_SWITCH}$`),
];

/** Secrets of the forges and providers are allowed; key material never is. */
const ALLOWED_SECRETS = new Set(
  INSTANCE_VARIABLES.filter((variable) => variable.kind === "secret").map((variable) => variable.key),
);

const INFRASTRUCTURE_SECRETS = new Set([
  "CRON_SECRET",
  "GIT_STATE_SECRET",
  "GIT_TOKEN_ENCRYPTION_SECRET",
  "GITLAB_TOKEN_ENCRYPTION_SECRET",
  "MINDDY_FORGE_RELAY_SECRET",
  "MINDDY_FORGE_RELAY_WEBHOOK_SECRET",
]);

export function getInstanceVariable(key: string): InstanceVariable | undefined {
  return INSTANCE_VARIABLES.find((variable) => variable.key === key);
}

/** Whether the database may carry a value for this key. */
export function isOverridableKey(key: string): boolean {
  if (!getInstanceVariable(key)) return false;
  if (INFRASTRUCTURE_SECRETS.has(key)) return false;
  return !NEVER_OVERRIDABLE.some((pattern) => pattern.test(key) && !ALLOWED_SECRETS.has(key));
}

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const MAX_LENGTH = 10_000;

export type InstanceVariableCheck = { ok: true; value: string } | { ok: false; reason: string };

/**
 * Checks and normalises a value. The empty value is not a value: removing an
 * override goes through its own action, so an override can never blank a
 * variable the file sets.
 */
export function checkInstanceVariable(key: string, raw: unknown): InstanceVariableCheck {
  const variable = getInstanceVariable(key);
  if (!variable || !isOverridableKey(key)) return { ok: false, reason: "not_overridable" };
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const value = variable.multiline ? raw.replace(/\r\n/g, "\n").trim() : raw.trim();
  if (!value) return { ok: false, reason: "empty" };
  if (value.length > MAX_LENGTH || (!variable.multiline && /[\r\n]/.test(value))) {
    return { ok: false, reason: "invalid" };
  }
  switch (variable.kind) {
    case "email":
      return EMAIL.test(value) ? { ok: true, value } : { ok: false, reason: "invalid_email" };
    case "emailList": {
      const emails = value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
      if (emails.length === 0 || emails.some((email) => !EMAIL.test(email))) {
        return { ok: false, reason: "invalid_email" };
      }
      return { ok: true, value: [...new Set(emails)].join(",") };
    }
    case "url":
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:"
          ? { ok: true, value: url.toString().replace(/\/$/, "") }
          : { ok: false, reason: "invalid_url" };
      } catch {
        return { ok: false, reason: "invalid_url" };
      }
    case "choice":
      return variable.choices?.includes(value) ? { ok: true, value } : { ok: false, reason: "invalid_choice" };
    case "boolean":
      return value === "1" || value === "0" ? { ok: true, value } : { ok: false, reason: "invalid_choice" };
    default:
      return { ok: true, value };
  }
}

/**
 * Whether an `ADMIN_EMAILS` list still names this address — the check that
 * keeps an administrator from locking themselves out, on the screen before
 * saving and on the server for every write.
 */
export function adminListIncludes(list: string | null | undefined, email: string | null | undefined): boolean {
  if (!email) return false;
  const target = email.trim().toLowerCase();
  return (list ?? "").split(",").some((entry) => entry.trim().toLowerCase() === target);
}

/** What a screen may show of a secret: its last characters, never the rest. */
export function secretHint(value: string): string {
  return value.length <= 8 ? "••••" : `••••${value.slice(-4)}`;
}
