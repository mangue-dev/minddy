import { describe, expect, it } from "vitest";

import { resolvePublicSite } from "@/lib/site";

describe("resolvePublicSite", () => {
  it("does not send an unconfigured instance to Minddy infrastructure", () => {
    expect(resolvePublicSite({})).toMatchObject({
      url: "http://localhost:3000",
      name: "minddy",
      contactEmail: "contact@localhost",
      productFeedbackUrl: null,
    });
    expect(resolvePublicSite({ appUrl: "https://tickets.example.com" }).contactEmail)
      .toBe("contact@tickets.example.com");
  });

  it("makes the origin and brand values configurable", () => {
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

  it("does not infer brand contacts from Vercel or an official-looking hostname", () => {
    expect(
      resolvePublicSite({
        appUrl: "https://www.minddy.app",
      }),
    ).toMatchObject({
      contactEmail: "contact@www.minddy.app",
      productFeedbackUrl: null,
    });
    expect(
      resolvePublicSite({
        appUrl: "https://tickets.example.com",
        contactEmail: "hello@minddy.app",
        productFeedbackUrl: "https://feedback.minddy.app",
      }),
    ).toMatchObject({
      contactEmail: "hello@minddy.app",
      productFeedbackUrl: "https://feedback.minddy.app/",
    });
  });

  it("rejects an ambiguous public URL", () => {
    expect(() => resolvePublicSite({ appUrl: "https://example.com/app" })).toThrow(
      /MINDDY_PUBLIC_APP_URL/,
    );
  });

  it("rejects a feedback URL that is non-HTTP or contains credentials", () => {
    expect(() =>
      resolvePublicSite({ productFeedbackUrl: "https://user:secret@example.com" }),
    ).toThrow(/MINDDY_PUBLIC_PRODUCT_FEEDBACK_URL/);
  });
});
