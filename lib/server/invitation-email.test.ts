import { describe, expect, it } from "vitest";
import { renderInvitationEmail } from "./invitation-email";
import { projectOrbGradient } from "@/lib/project-orb-colors";
import { projectOrbImagePath } from "./project-orb-image";
import { SITE_URL } from "@/lib/site";

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const SEED = "22222222-2222-4222-8222-222222222222";

const base = {
  to: "ana@example.test",
  inviterName: "Ana",
  projectName: "Roadmap",
  projectId: PROJECT,
  token: "tok",
  locale: "en" as const,
  origin: "https://preview.example.test",
};

describe("renderInvitationEmail", () => {
  it("shows the app's orb as an image on the public site, never the project id", () => {
    const { html } = renderInvitationEmail(base);
    const src = `${SITE_URL.replace(/\/$/, "")}${projectOrbImagePath(PROJECT)}`;
    expect(html).toContain(`src="${src}"`);
    expect(html).not.toContain(PROJECT);
    expect(html).not.toContain("preview.example.test/og/orb");
  });

  it("keeps the orb's color under the image for clients that block it", () => {
    const { html } = renderInvitationEmail(base);
    expect(html).toContain(`bgcolor="${projectOrbGradient(PROJECT).base}"`);
  });

  it("follows a rerolled seed", () => {
    const { html } = renderInvitationEmail({ ...base, projectOrbSeed: SEED });
    expect(html).toContain(projectOrbImagePath(SEED));
    expect(html).not.toContain(projectOrbImagePath(PROJECT));
  });

  it("uses an imported https icon instead of the orb", () => {
    const { html } = renderInvitationEmail({
      ...base,
      projectIconUrl: "https://cdn.example.test/icon.png",
    });
    expect(html).toContain('src="https://cdn.example.test/icon.png"');
    expect(html).not.toContain("/og/orb");
  });

  it("falls back to the orb for an icon that is not https", () => {
    const { html } = renderInvitationEmail({
      ...base,
      projectIconUrl: "http://cdn.example.test/icon.png",
    });
    expect(html).not.toContain("cdn.example.test");
    expect(html).toContain("/og/orb?o=");
  });

  it("escapes the project and inviter names", () => {
    const { html, subject } = renderInvitationEmail({
      ...base,
      projectName: '<img src=x onerror="a">',
      inviterName: "Bo & <b>",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;img src=x onerror=&quot;a&quot;&gt;");
    expect(subject).toContain("Bo & <b>");
  });

  it("links to sign-up on the deployment and keeps the plain-text part", () => {
    const { html, text } = renderInvitationEmail(base);
    expect(html).toContain('href="https://preview.example.test/signup?invite=tok"');
    expect(text).toContain("Join the project: https://preview.example.test/signup?invite=tok");
  });

  it("titles the email with the project and minddy", () => {
    expect(renderInvitationEmail({ ...base, locale: "fr" }).html).toContain(
      "vous invite à rejoindre Roadmap sur minddy</h1>",
    );
  });

  it("draws the inviter's portrait before their name, like a mention", () => {
    const seed = "33333333-3333-4333-8333-333333333333";
    const { html } = renderInvitationEmail({ ...base, inviterAvatar: seed });
    expect(html).toMatch(
      new RegExp(`<img src="${SITE_URL.replace(/\/$/, "")}/og/avatar\\?s=${seed}"[^>]*/>Ana</span> invited you`),
    );
  });

  it("uses an imported photo's public address", () => {
    const { html } = renderInvitationEmail({
      ...base,
      inviterAvatar: "uploaded:/api/avatars/44444444-4444-4444-8444-444444444444?v=1",
    });
    expect(html).toContain("/api/avatars/44444444-4444-4444-8444-444444444444?v=1");
  });

  it("writes the name alone when the avatar is unknown or not a seed", () => {
    for (const inviterAvatar of [null, "not-a-seed", "https://tracker.example.test/x.png"]) {
      const { html } = renderInvitationEmail({ ...base, inviterAvatar });
      expect(html).not.toContain("/og/avatar");
      expect(html).not.toContain("tracker.example.test");
      expect(html).toContain('<span style="white-space:nowrap;">Ana</span>');
    }
  });
});
