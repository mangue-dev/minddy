import { describe, expect, it } from "vitest";

import { resolvePublicSite } from "@/lib/site";

describe("resolvePublicSite", () => {
  it("n'envoie pas une instance non configurée vers l'infrastructure minddy", () => {
    expect(resolvePublicSite({})).toMatchObject({
      url: "http://localhost:3000",
      name: "minddy",
      contactEmail: "contact@localhost",
      productFeedbackUrl: null,
    });
    expect(resolvePublicSite({ appUrl: "https://tickets.example.com" }).contactEmail)
      .toBe("contact@tickets.example.com");
  });

  it("rend l'origine et les valeurs de marque configurables", () => {
    expect(
      resolvePublicSite({
        appUrl: "https://tickets.example.com/",
        siteName: "Acme Tickets",
        contactEmail: "support@example.com",
        productFeedbackUrl: "https://feedback.example.com/board",
      }),
    ).toEqual({
      url: "https://tickets.example.com",
      name: "Acme Tickets",
      contactEmail: "support@example.com",
      productFeedbackUrl: "https://feedback.example.com/board",
    });
  });

  it("conserve les coordonnées historiques uniquement sur le cloud officiel", () => {
    expect(
      resolvePublicSite({
        appUrl: "https://www.minddy.app",
        vercel: "1",
      }),
    ).toMatchObject({
      contactEmail: "hello@minddy.app",
      productFeedbackUrl: "https://feedback.minddy.app/",
    });
    expect(
      resolvePublicSite({
        appUrl: "https://tickets.example.com",
        vercel: "1",
      }),
    ).toMatchObject({
      contactEmail: "contact@tickets.example.com",
      productFeedbackUrl: null,
    });
    expect(
      resolvePublicSite({
        vercel: "1",
        vercelProjectProductionUrl: "www.minddy.app",
      }),
    ).toMatchObject({ url: "https://www.minddy.app" });
  });

  it("refuse une URL publique ambiguë", () => {
    expect(() => resolvePublicSite({ appUrl: "https://example.com/app" })).toThrow(
      /NEXT_PUBLIC_APP_URL/,
    );
  });

  it("refuse une destination de retours non HTTP ou porteuse d'identifiants", () => {
    expect(() =>
      resolvePublicSite({ productFeedbackUrl: "https://user:secret@example.com" }),
    ).toThrow(/NEXT_PUBLIC_PRODUCT_FEEDBACK_URL/);
  });
});
