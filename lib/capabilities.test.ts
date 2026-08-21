import { describe, expect, it } from "vitest";

import { resolveCapabilities } from "@/lib/capabilities";

const core = {
  MINDDY_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  MINDDY_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

describe("resolveCapabilities", () => {
  it("keeps only Supabase and Storage in the minimal configuration", () => {
    const capabilities = resolveCapabilities(core);

    expect(capabilities.supabase.state).toBe("ready");
    expect(capabilities.storage.state).toBe("ready");
    for (const [id, value] of Object.entries(capabilities)) {
      if (id === "supabase" || id === "storage") continue;
      expect(value.configured, `${id}: ${value.diagnostic}`).toBe(false);
    }
  });

  it("does not infer managed services from present secrets", () => {
    const capabilities = resolveCapabilities({
      ...core,
      OPENROUTER_API_KEY: "operator-key",
      STRIPE_SECRET_KEY: "stripe-key",
    });
    expect(capabilities.managedAi.state).toBe("disabled");
    expect(capabilities.managedBilling.state).toBe("disabled");
  });

  it("enables public Vercel telemetry only through an explicit opt-in", () => {
    expect(resolveCapabilities(core).vercelWebAnalytics.configured).toBe(false);
    expect(
      resolveCapabilities({
        ...core,
        MINDDY_PUBLIC_VERCEL_ANALYTICS: "1",
      }).vercelWebAnalytics.configured,
    ).toBe(true);
  });

  it("diagnoses each partial configuration with its missing variables", () => {
    const capabilities = resolveCapabilities({
      ...core,
      MINDDY_EDITION: "cloud",
      MINDDY_MANAGED_AI: "1",
      MINDDY_MANAGED_BILLING: "1",
      AGENT_EXECUTION_BACKEND: "vercel",
      EMAIL_PROVIDER: "resend",
      GITHUB_APP_ID: "1",
      GITLAB_OAUTH_CLIENT_ID: "1",
      MINDDY_PUBLIC_VAPID_PUBLIC_KEY: "public",
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

  it("requires an explicit choice before any Vercel Sandbox or Resend execution", () => {
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

  it("enables the built-in self-hosted agent runner without Vercel credentials", () => {
    const capabilities = resolveCapabilities({
      ...core,
      AGENT_EXECUTION_BACKEND: "self-hosted",
      AGENT_RUNNER_URL: "http://agent-runner:6464",
      AGENT_RUNNER_SECRET: "runner-secret",
    });
    expect(capabilities.agentExecution.state).toBe("ready");
    expect(capabilities.vercelSandbox.configured).toBe(false);
  });

  it("does not activate Cloud providers from deceptive host or Vercel metadata", () => {
    const implicit = resolveCapabilities({
      ...core,
      VERCEL: "1",
      MINDDY_PUBLIC_APP_URL: "https://www.minddy.app",
      VERCEL_PROJECT_PRODUCTION_URL: "minddy.app",
      GITHUB_REF_NAME: "production",
      OPENROUTER_API_KEY: "managed-key",
      RESEND_API_KEY: "resend-key",
      STRIPE_SECRET_KEY: "stripe-key",
      STRIPE_WEBHOOK_SECRET: "webhook-key",
      STRIPE_PRICE_ID_GO: "go",
      STRIPE_PRICE_ID_PRO: "pro",
      STRIPE_PRICE_ID_GO_YEARLY: "go-year",
      STRIPE_PRICE_ID_PRO_YEARLY: "pro-year",
      MINDDY_PUBLIC_VAPID_PUBLIC_KEY: "public",
      VAPID_PRIVATE_KEY: "private",
      APNS_TEAM_ID: "team",
      APNS_KEY_ID: "key",
      APNS_PRIVATE_KEY: "private",
      MINDDY_PUBLIC_POSTHOG_KEY: "posthog-key",
    });

    for (const id of [
      "managedBilling",
      "managedAi",
      "vercelSandbox",
      "vercelWebAnalytics",
      "analytics",
      "transactionalEmail",
      "webPush",
      "apns",
    ] as const) {
      expect(implicit[id].configured, `${id}: ${implicit[id].diagnostic}`).toBe(false);
    }
  });

  it("requires the Cloud edition before managed services can start", () => {
    const cloud = resolveCapabilities({
      ...core,
      MINDDY_EDITION: "cloud",
      MINDDY_MANAGED_AI: "1",
      MINDDY_MANAGED_BILLING: "1",
      OPENROUTER_API_KEY: "managed-key",
      STRIPE_SECRET_KEY: "stripe-key",
      STRIPE_WEBHOOK_SECRET: "webhook-key",
      STRIPE_PRICE_ID_GO: "go",
      STRIPE_PRICE_ID_PRO: "pro",
      STRIPE_PRICE_ID_GO_YEARLY: "go-year",
      STRIPE_PRICE_ID_PRO_YEARLY: "pro-year",
    });
    expect(cloud.managedAi.configured).toBe(true);
    expect(cloud.managedBilling.configured).toBe(true);

    const selfHosted = resolveCapabilities({
      ...core,
      MINDDY_EDITION: "self-hosted",
      MINDDY_MANAGED_AI: "1",
      MINDDY_MANAGED_BILLING: "1",
      OPENROUTER_API_KEY: "managed-key",
      STRIPE_SECRET_KEY: "stripe-key",
    });
    expect(selfHosted.managedAi.configured).toBe(false);
    expect(selfHosted.managedBilling.configured).toBe(false);
  });

  it("does not combine two partial PostHog pairs", () => {
    const capabilities = resolveCapabilities({
      ...core,
      POSTHOG_API_KEY: "server-key",
      MINDDY_PUBLIC_POSTHOG_HOST: "https://analytics.example.test",
    });

    expect(capabilities.analytics.state).toBe("disabled");
    expect(capabilities.analytics.configured).toBe(false);
  });

  it("requires the instance origin for Vercel Sandbox outside Vercel", () => {
    const capabilities = resolveCapabilities({
      ...core,
      AGENT_EXECUTION_BACKEND: "vercel",
      VERCEL_TOKEN: "token",
      VERCEL_TEAM_ID: "team",
      VERCEL_PROJECT_ID: "project",
    });

    expect(capabilities.vercelSandbox.state).toBe("incomplete");
    expect(capabilities.vercelSandbox.missing).toContain("MINDDY_PUBLIC_APP_URL");
  });

  it("does not declare Web Push ready with an unusable VAPID subject", () => {
    const capabilities = resolveCapabilities({
      ...core,
      MINDDY_PUBLIC_VAPID_PUBLIC_KEY: "public",
      VAPID_PRIVATE_KEY: "private",
      VAPID_SUBJECT: "push@example.test",
    });

    expect(capabilities.webPush.configured).toBe(false);
    expect(capabilities.webPush.missing).toContain("VAPID_SUBJECT (mailto: or https:)");
  });

  it("classifies workable replacements outside Vercel and Resend", () => {
    const capabilities = resolveCapabilities(core);
    expect(capabilities.vercelSandbox.requirement).toBe("replaceable");
    expect(capabilities.scheduler.requirement).toBe("replaceable");
    expect(capabilities.transactionalEmail.requirement).toBe("replaceable");
    expect(capabilities.managedAi.requirement).toBe("replaceable");
  });

  it("enables scheduler routes with their authentication secret", () => {
    expect(resolveCapabilities(core).scheduler)
      .toMatchObject({ state: "disabled", configured: false, missing: ["CRON_SECRET"] });
    expect(resolveCapabilities({ ...core, CRON_SECRET: "secret" }).scheduler)
      .toMatchObject({ state: "external", configured: true });
  });

  it("serves git providers through the managed forge relay only when fully configured", () => {
    const relay = {
      MINDDY_FORGE_RELAY_URL: "https://forge-relay.minddy.app",
      MINDDY_FORGE_RELAY_INSTANCE_ID: "instance-id",
      MINDDY_FORGE_RELAY_SECRET: "instance-secret",
      GIT_STATE_SECRET: "state-secret",
      // Relayed tokens are stored encrypted instance-side.
      GIT_TOKEN_ENCRYPTION_SECRET: "x".repeat(32),
    };
    const capabilities = resolveCapabilities({ ...core, ...relay });

    for (const id of ["github", "gitlab"] as const) {
      expect(capabilities[id]).toMatchObject({
        requirement: "replaceable",
        state: "ready",
        configured: true,
      });
      expect(capabilities[id].diagnostic).toContain("managed forge relay");
    }

    // Without the token encryption secret the GitLab relay path is
    // INCOMPLETE: brokered tokens could not be stored at handoff.
    const withoutEncryption = resolveCapabilities({
      ...core,
      ...relay,
      GIT_TOKEN_ENCRYPTION_SECRET: undefined,
    });
    expect(withoutEncryption.github).toMatchObject({ state: "ready" });
    expect(withoutEncryption.gitlab).toMatchObject({
      state: "incomplete",
      missing: ["GIT_TOKEN_ENCRYPTION_SECRET"],
    });
  });

  it("keeps the operator-owned app ahead of the relay and provisions automatically by default", () => {
    const relay = {
      MINDDY_FORGE_RELAY_URL: "https://forge-relay.minddy.app",
      MINDDY_FORGE_RELAY_INSTANCE_ID: "instance-id",
      MINDDY_FORGE_RELAY_SECRET: "instance-secret",
      GIT_STATE_SECRET: "state-secret",
      GIT_TOKEN_ENCRYPTION_SECRET: "x".repeat(32),
      GITHUB_APP_ID: "1",
      GITHUB_APP_SLUG: "example-app",
      GITHUB_APP_PRIVATE_KEY: "private-key",
    };
    const local = resolveCapabilities({ ...core, ...relay });
    expect(local.github).toMatchObject({
      requirement: "optional",
      state: "ready",
      diagnostic: expect.stringContaining("operator-owned app"),
    });
    expect(local.gitlab.diagnostic).toContain("managed forge relay");

    // Self-hosted default: no operator-owned app and no relay variables —
    // the relay identity is provisioned automatically on first connect.
    // The instance-side secrets stay required (the installer generates them).
    const automatic = resolveCapabilities({
      ...core,
      GIT_STATE_SECRET: "state-secret",
      GIT_TOKEN_ENCRYPTION_SECRET: "x".repeat(32),
    });
    for (const id of ["github", "gitlab"] as const) {
      expect(automatic[id]).toMatchObject({
        requirement: "replaceable",
        state: "ready",
        configured: true,
      });
      expect(automatic[id].diagnostic).toContain("provisioned automatically");
    }

    // The explicit opt-out (--no-forge-relay) restores the disabled state.
    const optedOut = resolveCapabilities({ ...core, MINDDY_FORGE_RELAY: "0" });
    expect(optedOut.github.state).toBe("disabled");
    expect(optedOut.gitlab.state).toBe("disabled");

    // The cloud edition never self-provisions: it operates the relay instead.
    const cloud = resolveCapabilities({ ...core, MINDDY_EDITION: "cloud" });
    expect(cloud.github.state).toBe("disabled");
    expect(cloud.gitlab.state).toBe("disabled");
  });

  it("falls back to automatic provisioning when relay variables are only partial", () => {
    const capabilities = resolveCapabilities({
      ...core,
      MINDDY_FORGE_RELAY_URL: "https://forge-relay.minddy.app",
      GIT_STATE_SECRET: "state-secret",
    });
    // Partial explicit variables do not select a pinned control plane
    // (all three are required); the instance stays on the automatic default.
    expect(capabilities.github).toMatchObject({ state: "ready", configured: true });

    const missingState = resolveCapabilities({
      ...core,
      MINDDY_FORGE_RELAY_URL: "https://forge-relay.minddy.app",
      MINDDY_FORGE_RELAY_INSTANCE_ID: "instance-id",
      MINDDY_FORGE_RELAY_SECRET: "instance-secret",
    });
    expect(missingState.github).toMatchObject({
      state: "incomplete",
      missing: ["GIT_STATE_SECRET"],
    });
  });
});
