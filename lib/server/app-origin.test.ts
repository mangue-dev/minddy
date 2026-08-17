import { describe, expect, it } from "vitest";

import { resolveCanonicalAppOrigin } from "@/lib/server/app-origin";

describe("resolveCanonicalAppOrigin", () => {
  const siteUrl = "https://tickets.example.test";

  it("utilise l'origine configurée en production auto-hébergée", () => {
    expect(
      resolveCanonicalAppOrigin({ NODE_ENV: "production" }, siteUrl),
    ).toBe(siteUrl);
  });

  it("garde un preview Vercel sur son propre déploiement", () => {
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

  it("utilise localhost sur un poste de développement", () => {
    expect(
      resolveCanonicalAppOrigin({ NODE_ENV: "development", PORT: "4321" }, siteUrl),
    ).toBe("http://localhost:4321");
  });
});
