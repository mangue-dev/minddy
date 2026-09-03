import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendInvitationEmail } from "@/lib/server/invitation-email";
import { sendOtpEmail } from "@/lib/server/feedback/otp-email";
import {
  addDomainToVercel,
  getVercelDomainState,
  removeDomainFromVercel,
} from "@/lib/server/vercel-domains";
import { getServerPostHog } from "@/lib/server/posthog";
import { configureWebPush } from "@/lib/server/push/vapid";
import { sendApnsNotification } from "@/lib/server/push/apns";
import {
  getInstallationToken,
  isGithubAppConfigured,
} from "@/lib/server/git/github-app";
import { exchangeGithubUserCode } from "@/lib/server/git/github-user-auth";
import {
  exchangeGitlabCode,
  isGitlabConfigured,
} from "@/lib/server/git/gitlab-app";
import { getOrCreateAgentSandbox } from "@/lib/server/agent/sandbox";
import { createStripeCustomer } from "@/lib/server/stripe";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("unexpected network call"))));
});

describe("missing integrations", () => {
  it("uses Resend only with an explicit provider and senders", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MINDDY_PUBLIC_APP_URL", "https://www.minddy.app");
    vi.stubEnv("MINDDY_EDITION", "cloud");
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("FEEDBACK_EMAIL_FROM", "feedback@example.test");
    vi.stubEnv("INVITATION_EMAIL_FROM", "invites@example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));

    expect(await sendOtpEmail({ to: "a@example.test", code: "123456", locale: "fr" }))
      .toBe(true);
    expect(
      await sendInvitationEmail({
        to: "b@example.test",
        inviterName: "A",
        projectName: "P",
        projectId: "project",
        token: "token",
        locale: "fr",
        origin: "https://www.minddy.app",
      }),
    ).toBe(true);

    const bodies = vi.mocked(fetch).mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)) as { from: string },
    );
    expect(bodies.map(({ from }) => from)).toEqual([
      "feedback@example.test",
      "invites@example.test",
    ]);
  });

  it("does not contact Vercel Domains, Resend, or PostHog", async () => {
    const fetchMock = vi.mocked(fetch);

    expect(await addDomainToVercel("example.test")).toEqual({ ok: false, code: "api_error" });
    expect(await removeDomainFromVercel("example.test")).toEqual({ ok: false });
    expect((await getVercelDomainState("example.test")).attached).toBe(false);
    expect(await sendOtpEmail({ to: "a@example.test", code: "123456", locale: "fr" })).toBe(false);
    expect(
      await sendInvitationEmail({
        to: "a@example.test",
        inviterName: "A",
        projectName: "P",
        projectId: "project",
        token: "token",
        locale: "fr",
        origin: "https://example.test",
      }),
    ).toBe(false);
    expect(getServerPostHog()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never enables the fake domain provider in self-hosted production", async () => {
    vi.stubEnv("MDY_FAKE_VERCEL_DOMAINS", "1");

    expect(await addDomainToVercel("example.test")).toEqual({
      ok: false,
      code: "api_error",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects partial configurations before any network call", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("INVITATION_EMAIL_FROM", "invites@example.test");
    vi.stubEnv("POSTHOG_API_KEY", "server-key");
    vi.stubEnv("MINDDY_PUBLIC_POSTHOG_HOST", "https://analytics.example.test");

    expect(
      await sendInvitationEmail({
        to: "a@example.test",
        inviterName: "A",
        projectName: "P",
        projectId: "project",
        token: "token",
        locale: "fr",
        origin: "https://example.test",
      }),
    ).toBe(false);
    expect(getServerPostHog()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens no push transport and hides forges", async () => {
    expect(configureWebPush()).toBe(false);
    expect(await sendApnsNotification("apns:device", {
      title: "T",
      body: "B",
      lang: "en-GB",
      url: "/",
      tag: "test",
    }))
      .toEqual({ status: 0, reason: "NotConfigured" });
    expect(isGithubAppConfigured()).toBe(false);
    expect(isGitlabConfigured()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects Vercel Sandbox before calling the SDK", async () => {
    await expect(
      getOrCreateAgentSandbox({ name: "test", onCreate: async () => {} }),
    ).rejects.toThrow(/AGENT_EXECUTION_BACKEND=vercel/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses neither Stripe nor forges from partial secrets", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_operator");

    await expect(createStripeCustomer({ userId: "user-1" })).rejects.toThrow(
      /MINDDY_MANAGED_BILLING/,
    );
    // The relay-first default still refuses a half-configured forge stack:
    // the instance-side secrets are required before any local adapter runs.
    await expect(getInstallationToken(1)).rejects.toThrow(/GIT_STATE_SECRET/);
    await expect(
      exchangeGitlabCode({
        code: "code",
        redirectUri: "https://example.test/callback",
      }),
    ).rejects.toThrow(/GIT_STATE_SECRET/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps forge adapters inert when the state secret is missing", async () => {
    vi.stubEnv("GITHUB_APP_ID", "1");
    vi.stubEnv("GITHUB_APP_SLUG", "example-app");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITLAB_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GITLAB_OAUTH_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "x".repeat(32));

    await expect(getInstallationToken(1)).rejects.toThrow(/GIT_STATE_SECRET/);
    await expect(
      exchangeGithubUserCode({
        code: "code",
        redirectUri: "https://example.test/callback",
      }),
    ).rejects.toThrow(/GIT_STATE_SECRET/);
    await expect(
      exchangeGitlabCode({
        code: "code",
        redirectUri: "https://example.test/callback",
      }),
    ).rejects.toThrow(/GIT_STATE_SECRET/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
