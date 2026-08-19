import "server-only";

import { resolveCapabilities } from "@/lib/capabilities";
import type { PublicRuntimeConfig } from "@/lib/public-runtime-config";

export type RuntimeConfigEnvironment = Record<string, string | undefined>;

export interface RuntimeConfig {
  public: PublicRuntimeConfig;
}

function required(env: RuntimeConfigEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required runtime configuration: ${name}`);
  return value;
}

function origin(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}: expected an absolute http(s) origin`);
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`Invalid ${name}: expected an absolute http(s) origin without path, query or credentials`);
  }
  return parsed.origin;
}

function optionalUrl(value: string | undefined, name: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new Error(`Invalid ${name}: expected an absolute http(s) URL without credentials`);
  }
}

/**
 * Validates operator-controlled settings at process start and exposes only the
 * browser-safe projection. No server secret is copied into this object.
 */
export function resolveRuntimeConfig(env: RuntimeConfigEnvironment): RuntimeConfig {
  const appUrl = origin(required(env, "MINDDY_PUBLIC_APP_URL"), "MINDDY_PUBLIC_APP_URL");
  const supabaseUrl = origin(
    required(env, "MINDDY_PUBLIC_SUPABASE_URL"),
    "MINDDY_PUBLIC_SUPABASE_URL",
  );
  const supabaseAnonKey = required(env, "MINDDY_PUBLIC_SUPABASE_ANON_KEY");
  const siteName = env.MINDDY_PUBLIC_SITE_NAME?.trim() || "minddy";
  const contactEmail = env.MINDDY_PUBLIC_CONTACT_EMAIL?.trim() || `contact@${new URL(appUrl).hostname}`;
  const capabilities = resolveCapabilities(env);

  return {
    public: {
      appUrl,
      supabaseUrl,
      supabaseAnonKey,
      siteName,
      contactEmail,
      productFeedbackUrl: optionalUrl(
        env.MINDDY_PUBLIC_PRODUCT_FEEDBACK_URL,
        "MINDDY_PUBLIC_PRODUCT_FEEDBACK_URL",
      ),
      posthog: {
        key: env.MINDDY_PUBLIC_POSTHOG_KEY?.trim() || null,
        host: env.MINDDY_PUBLIC_POSTHOG_HOST?.trim() || null,
        allowLocalhost: env.MINDDY_PUBLIC_POSTHOG_ALLOW_LOCALHOST === "1",
      },
      vapidPublicKey: env.MINDDY_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null,
      capabilities: Object.fromEntries(
        Object.entries(capabilities).map(([id, capability]) => [id, {
          state: capability.state,
          configured: capability.configured,
        }]),
      ),
    },
  };
}

export function getRuntimeConfig(): RuntimeConfig {
  return resolveRuntimeConfig(process.env);
}

/** Throws during instrumentation, before a request can observe a broken instance. */
export function assertRuntimeConfig(): void {
  getRuntimeConfig();
}
