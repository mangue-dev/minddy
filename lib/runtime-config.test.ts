import { describe, expect, it } from "vitest";

import { resolveRuntimeConfig } from "@/lib/runtime-config";

const baseEnvironment = {
  MINDDY_PUBLIC_APP_URL: "https://tickets.example.test",
  MINDDY_PUBLIC_SUPABASE_URL: "https://database.example.test",
  MINDDY_PUBLIC_SUPABASE_ANON_KEY: "anon-key-a",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-that-must-not-reach-the-browser",
  OPENROUTER_API_KEY: "provider-secret-that-must-not-reach-the-browser",
  MINDDY_PUBLIC_SITE_NAME: "Acme Tickets",
  MINDDY_PUBLIC_CONTACT_EMAIL: "support@example.test",
  MINDDY_PUBLIC_PRODUCT_FEEDBACK_URL: "https://feedback.example.test/board",
  MINDDY_PUBLIC_POSTHOG_KEY: "posthog-public-key",
  MINDDY_PUBLIC_POSTHOG_HOST: "https://analytics.example.test",
  MINDDY_PUBLIC_VAPID_PUBLIC_KEY: "vapid-public-key",
} as const;

describe("resolveRuntimeConfig", () => {
  it("resolves distinct runtime fixtures from one build-time-independent contract", () => {
    const first = resolveRuntimeConfig(baseEnvironment).public;
    const second = resolveRuntimeConfig({
      ...baseEnvironment,
      MINDDY_PUBLIC_APP_URL: "https://other.example.test",
      MINDDY_PUBLIC_SUPABASE_URL: "https://other-database.example.test",
      MINDDY_PUBLIC_SUPABASE_ANON_KEY: "anon-key-b",
      MINDDY_PUBLIC_SITE_NAME: "Other Tickets",
    }).public;

    expect(first).toMatchObject({
      appUrl: "https://tickets.example.test",
      supabaseUrl: "https://database.example.test",
      supabaseAnonKey: "anon-key-a",
      siteName: "Acme Tickets",
      contactEmail: "support@example.test",
    });
    expect(second).toMatchObject({
      appUrl: "https://other.example.test",
      supabaseUrl: "https://other-database.example.test",
      supabaseAnonKey: "anon-key-b",
      siteName: "Other Tickets",
    });
  });

  it("rejects required runtime settings before handling a request", () => {
    expect(() => resolveRuntimeConfig({
      MINDDY_PUBLIC_APP_URL: baseEnvironment.MINDDY_PUBLIC_APP_URL,
      MINDDY_PUBLIC_SUPABASE_URL: baseEnvironment.MINDDY_PUBLIC_SUPABASE_URL,
    })).toThrow("Missing required runtime configuration: MINDDY_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("serializes only public values for the browser bootstrap", () => {
    const serialized = JSON.stringify(resolveRuntimeConfig(baseEnvironment).public);

    expect(serialized).toContain("anon-key-a");
    expect(serialized).not.toContain(baseEnvironment.SUPABASE_SERVICE_ROLE_KEY);
    expect(serialized).not.toContain(baseEnvironment.OPENROUTER_API_KEY);
  });
});
