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
import { isGithubAppConfigured } from "@/lib/server/git/github-app";
import { isGitlabConfigured } from "@/lib/server/git/gitlab-app";
import { getOrCreateAgentSandbox } from "@/lib/server/agent/sandbox";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("unexpected network call"))));
});

describe("intégrations absentes", () => {
  it("ne contacte ni Vercel Domains, ni Resend, ni PostHog", async () => {
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

  it("refuse les configurations partielles avant tout appel réseau", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("INVITATION_EMAIL_FROM", "invites@example.test");
    vi.stubEnv("POSTHOG_API_KEY", "server-key");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://analytics.example.test");

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

  it("n'ouvre aucun transport push et masque les forges", async () => {
    expect(configureWebPush()).toBe(false);
    expect(await sendApnsNotification("apns:device", { title: "T", body: "B", url: "/", tag: "test" }))
      .toEqual({ status: 0, reason: "NotConfigured" });
    expect(isGithubAppConfigured()).toBe(false);
    expect(isGitlabConfigured()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuse Vercel Sandbox avant d'appeler le SDK", async () => {
    await expect(
      getOrCreateAgentSandbox({ name: "test", onCreate: async () => {} }),
    ).rejects.toThrow(/AGENT_EXECUTION_BACKEND=vercel/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
