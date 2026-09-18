import { describe, expect, it } from "vitest";

import {
  resolveCanonicalAppOrigin,
  resolveOauthAppOrigin,
} from "@/lib/server/app-origin";

describe("resolveCanonicalAppOrigin", () => {
  const siteUrl = "https://tickets.example.test";

  it("uses the configured origin on self-hosted production", () => {
    expect(
      resolveCanonicalAppOrigin({ NODE_ENV: "production" }, siteUrl),
    ).toBe(siteUrl);
  });

  it("keeps a Vercel preview on its own deployment", () => {
    expect(
      resolveCanonicalAppOrigin(
        {
          NODE_ENV: "production",
          VERCEL_ENV: "preview",
          VERCEL_URL: "preview.example.vercel.app",
        },
        siteUrl,
      ),
    ).toBe("https://preview.example.vercel.app");
  });

  it("uses localhost on a development station", () => {
    expect(
      resolveCanonicalAppOrigin({ NODE_ENV: "development", PORT: "4321" }, siteUrl),
    ).toBe("http://localhost:4321");
  });
});

describe("resolveOauthAppOrigin", () => {
  const siteUrl = "https://tickets.example.test";

  it("anchors production OAuth to the canonical domain", () => {
    expect(
      resolveOauthAppOrigin(
        { NODE_ENV: "production", VERCEL_ENV: "production" },
        siteUrl,
      ),
    ).toBe(siteUrl);
  });

  it("anchors the main preview to its fixed alias, not the deployment URL", () => {
    // OAuth registrations (DCR redirect_uris, provider apps, the issuer)
    // survive a deployment only if the origin does. The alias is the one the
    // desktop preview channel already loads.
    expect(
      resolveOauthAppOrigin(
        {
          NODE_ENV: "production",
          VERCEL_ENV: "preview",
          VERCEL_URL: "minddy-git-main-team.vercel.app",
          VERCEL_GIT_COMMIT_REF: "main",
        },
        siteUrl,
      ),
    ).toBe("https://preview.minddy.app");
  });

  it("keeps a PR preview on its own deployment", () => {
    expect(
      resolveOauthAppOrigin(
        {
          NODE_ENV: "production",
          VERCEL_ENV: "preview",
          VERCEL_URL: "minddy-git-fix-team.vercel.app",
          VERCEL_GIT_COMMIT_REF: "fix/oauth-origin",
        },
        siteUrl,
      ),
    ).toBe("https://minddy-git-fix-team.vercel.app");
  });

  it("uses localhost on a development station", () => {
    expect(
      resolveOauthAppOrigin(
        { NODE_ENV: "development", PORT: "4321", VERCEL_GIT_COMMIT_REF: "main" },
        siteUrl,
      ),
    ).toBe("http://localhost:4321");
  });
});
