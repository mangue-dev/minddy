import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import {
  checkInstanceVariable,
  CONFIG_OVERRIDES_SWITCH,
  INSTANCE_VARIABLES,
  isOverridableKey,
  secretHint,
} from "@/lib/instance-variables";

/**
 * The allowlist of instance variables the admin dashboard may override
 * (MIN-847): nothing that reaches the database, the keys or the app origin
 * can ever be written from there.
 */
describe("instance variable registry", () => {
  it.each([
    "MINDDY_PUBLIC_SUPABASE_URL",
    "MINDDY_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_INTERNAL_URL",
    "MINDDY_DATA_ROOT_KEY",
    "GIT_TOKEN_ENCRYPTION_SECRET",
    "GITLAB_TOKEN_ENCRYPTION_SECRET",
    "GIT_STATE_SECRET",
    "CRON_SECRET",
    "MINDDY_EDITION",
    "MINDDY_PUBLIC_APP_URL",
    "OAUTH_ISSUER",
    "NODE_ENV",
    "VERCEL_ENV",
    "STRIPE_SECRET_KEY",
    "MINDDY_MANAGED_AI",
    CONFIG_OVERRIDES_SWITCH,
  ])("never overrides %s", (key) => {
    expect(isOverridableKey(key)).toBe(false);
    expect(checkInstanceVariable(key, "value")).toEqual({ ok: false, reason: "not_overridable" });
  });

  it("lists no infrastructure key, even by mistake", () => {
    for (const variable of INSTANCE_VARIABLES) {
      expect(variable.key).not.toMatch(/^(MINDDY_PUBLIC_SUPABASE_|SUPABASE_|NEXT_PUBLIC_|VERCEL|STRIPE_|MINDDY_MANAGED_)/);
      expect(isOverridableKey(variable.key)).toBe(true);
    }
  });

  it("labels and describes every variable", () => {
    const vars = en.Admin.instance.vars as Record<string, { label?: string; desc?: string }>;
    for (const variable of INSTANCE_VARIABLES) {
      expect(vars[variable.key]?.label, variable.key).toBeTruthy();
      expect(vars[variable.key]?.desc, variable.key).toBeTruthy();
    }
  });

  it("normalises an administrator list and refuses a broken address", () => {
    expect(checkInstanceVariable("ADMIN_EMAILS", " Ops@Example.com, lead@example.com ,ops@example.com")).toEqual({
      ok: true,
      value: "ops@example.com,lead@example.com",
    });
    expect(checkInstanceVariable("ADMIN_EMAILS", "ops@example.com, nope")).toEqual({ ok: false, reason: "invalid_email" });
  });

  it("checks addresses, choices and switches", () => {
    expect(checkInstanceVariable("POSTHOG_HOST", "https://eu.i.posthog.com/")).toEqual({ ok: true, value: "https://eu.i.posthog.com" });
    expect(checkInstanceVariable("POSTHOG_HOST", "javascript:alert(1)")).toEqual({ ok: false, reason: "invalid_url" });
    expect(checkInstanceVariable("EMAIL_PROVIDER", "smtp")).toEqual({ ok: false, reason: "invalid_choice" });
    expect(checkInstanceVariable("MINDDY_PUBLISH_MODEL_CONFIG", "yes")).toEqual({ ok: false, reason: "invalid_choice" });
  });

  it("refuses an empty value and a line break outside a key", () => {
    expect(checkInstanceVariable("OPENROUTER_API_KEY", "  ")).toEqual({ ok: false, reason: "empty" });
    expect(checkInstanceVariable("OPENROUTER_API_KEY", "sk-or\nINJECTED=1")).toEqual({ ok: false, reason: "invalid" });
    expect(checkInstanceVariable("GITHUB_APP_PRIVATE_KEY", "-----BEGIN KEY-----\r\nabc\r\n-----END KEY-----").ok).toBe(true);
  });

  it("shows only the last characters of a secret", () => {
    expect(secretHint("sk-or-v1-0123456789abcd")).toBe("••••abcd");
    expect(secretHint("short")).toBe("••••");
  });
});
