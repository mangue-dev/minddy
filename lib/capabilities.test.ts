import { describe, expect, it } from "vitest";

import { resolveCapabilities } from "@/lib/capabilities";

const core = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

describe("resolveCapabilities", () => {
  it("ne garde que Supabase et Storage dans la configuration minimale", () => {
    const capabilities = resolveCapabilities(core);

    expect(capabilities.supabase.state).toBe("ready");
    expect(capabilities.storage.state).toBe("ready");
    for (const [id, value] of Object.entries(capabilities)) {
      if (id === "supabase" || id === "storage") continue;
      expect(value.configured, `${id}: ${value.diagnostic}`).toBe(false);
    }
  });

  it("ne déduit pas les services managés de secrets présents", () => {
    const capabilities = resolveCapabilities({
      ...core,
      OPENROUTER_API_KEY: "operator-key",
      STRIPE_SECRET_KEY: "stripe-key",
    });
    expect(capabilities.managedAi.state).toBe("disabled");
    expect(capabilities.managedBilling.state).toBe("disabled");
  });

  it("diagnostique chaque configuration partielle avec les variables manquantes", () => {
    const capabilities = resolveCapabilities({
      ...core,
      MINDDY_MANAGED_AI: "1",
      MINDDY_MANAGED_BILLING: "1",
      AGENT_EXECUTION_BACKEND: "vercel",
      EMAIL_PROVIDER: "resend",
      GITHUB_APP_ID: "1",
      GITLAB_OAUTH_CLIENT_ID: "1",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public",
      APNS_TEAM_ID: "team",
    });

    for (const id of [
      "managedAi",
      "managedBilling",
      "vercelSandbox",
      "transactionalEmail",
    ] as const) {
      expect(capabilities[id].state).toBe("incomplete");
      expect(capabilities[id].missing.length).toBeGreaterThan(0);
    }
    for (const id of ["github", "gitlab", "webPush", "apns"] as const) {
      expect(capabilities[id].configured).toBe(false);
      expect(capabilities[id].missing.length).toBeGreaterThan(0);
    }
  });

  it("exige un choix explicite avant toute exécution Vercel Sandbox ou Resend", () => {
    const capabilities = resolveCapabilities({
      ...core,
      VERCEL: "1",
      RESEND_API_KEY: "resend-key",
      FEEDBACK_EMAIL_FROM: "feedback@example.test",
      INVITATION_EMAIL_FROM: "invites@example.test",
    });
    expect(capabilities.vercelSandbox.configured).toBe(false);
    expect(capabilities.transactionalEmail.configured).toBe(false);
  });

  it("n'assemble pas une configuration PostHog avec deux paires partielles", () => {
    const capabilities = resolveCapabilities({
      ...core,
      POSTHOG_API_KEY: "server-key",
      NEXT_PUBLIC_POSTHOG_HOST: "https://analytics.example.test",
    });

    expect(capabilities.analytics.state).toBe("disabled");
    expect(capabilities.analytics.configured).toBe(false);
  });

  it("exige l'origine de l'instance pour Vercel Sandbox hors Vercel", () => {
    const capabilities = resolveCapabilities({
      ...core,
      AGENT_EXECUTION_BACKEND: "vercel",
      VERCEL_TOKEN: "token",
      VERCEL_TEAM_ID: "team",
      VERCEL_PROJECT_ID: "project",
    });

    expect(capabilities.vercelSandbox.state).toBe("incomplete");
    expect(capabilities.vercelSandbox.missing).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("classe les remplacements opérables hors Vercel et hors Resend", () => {
    const capabilities = resolveCapabilities(core);
    expect(capabilities.vercelSandbox.requirement).toBe("replaceable");
    expect(capabilities.scheduler.requirement).toBe("replaceable");
    expect(capabilities.transactionalEmail.requirement).toBe("replaceable");
    expect(capabilities.managedAi.requirement).toBe("replaceable");
  });
});
