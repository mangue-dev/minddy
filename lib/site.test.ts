import { describe, expect, it } from "vitest";

import { resolvePublicSite } from "@/lib/site";

describe("resolvePublicSite", () => {
  it("n'envoie pas une instance non configurée vers l'infrastructure minddy", () => {
    expect(resolvePublicSite({})).toMatchObject({
      url: "http://localhost:3000",
      name: "minddy",
    });
  });

  it("rend l'origine et les valeurs de marque configurables", () => {
    expect(
      resolvePublicSite({
        appUrl: "https://tickets.example.com/",
        siteName: "Acme Tickets",
        contactEmail: "support@example.com",
      }),
    ).toEqual({
      url: "https://tickets.example.com",
      name: "Acme Tickets",
      contactEmail: "support@example.com",
    });
  });

  it("refuse une URL publique ambiguë", () => {
    expect(() => resolvePublicSite({ appUrl: "https://example.com/app" })).toThrow(
      /NEXT_PUBLIC_APP_URL/,
    );
  });
});
