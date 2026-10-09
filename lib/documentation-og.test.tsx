import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { locales, type Locale } from "@/i18n/config";
import { documentationOgImageUrl } from "@/lib/seo";
import * as documentation from "@/lib/server/documentation";
import { GET } from "@/app/og/documentation/route";
import { generateMetadata } from "@/app/(documentation)/docs/[...slug]/page";

const state = vi.hoisted(() => ({ locale: "en" as Locale, limited: false }));
vi.mock("next-intl/server", () => ({ getLocale: async () => state.locale }));
vi.mock("@/components/documentation/documentation-article", () => ({ DocumentationArticleView: () => null }));
vi.mock("@/components/documentation/documentation-legacy-location", () => ({ DocumentationLegacyLocation: () => null }));
vi.mock("@/lib/server/session-rate-limit", () => ({
  rateLimitRefusal: vi.fn(() => state.limited ? new Response("Too many requests", { status: 429 }) : null),
}));
// Keep these tests focused on routing and metadata; HTTP validation renders the PNGs.
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: React.ReactNode, options: ResponseInit) {
      super(renderToStaticMarkup(element), options);
    }
  },
}));

function request(query: string) {
  return new NextRequest(`https://minddy.example/og/documentation?${query}`);
}

describe("documentation sharing images", () => {
  beforeEach(() => {
    state.locale = "en";
    state.limited = false;
    vi.restoreAllMocks();
  });

  it.each(locales)("links every published %s article to its own large sharing card", async locale => {
    state.locale = locale;
    for (const article of documentation.getPublishedDocumentation(locale)) {
      const metadata = await generateMetadata({ params: Promise.resolve({ slug: [article.id] }) });
      const image = documentationOgImageUrl(article.id, locale);
      expect(metadata.openGraph).toMatchObject({ title: article.title,
        images: [{ url: image, width: 1200, height: 630, alt: article.title }] });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: [image] });
    }
  });

  it("renders the corpus title in each supported language without accepting title overrides", async () => {
    for (const locale of locales) {
      const article = documentation.getPublishedDocumentation(locale).find(item => item.id === "issues")!;
      const response = await GET(request(`article=issues&locale=${locale}`));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(renderToStaticMarkup(<>{article.title}</>));
      expect(response.headers.get("Cache-Control")).toContain("s-maxage=86400");
    }
    const response = await GET(request("article=issues&locale=en&title=Injected"));
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("https://minddy.example/og/documentation?article=issues&locale=en");
  });

  it("canonicalizes legacy links and uses the same image in legacy page metadata", async () => {
    const response = await GET(request("article=create-an-issue&locale=en"));
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toContain("article=issues&locale=en");
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: ["create-an-issue"] }) });
    expect(metadata.twitter).toMatchObject({ images: [documentationOgImageUrl("issues", "en")] });
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it("normalizes unsupported locales and duplicate or reordered parameters before rendering", async () => {
    for (const query of ["article=issues&locale=unknown", "locale=en&article=issues", "article=issues&locale=en&locale=fr"]) {
      const response = await GET(request(query));
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toContain("article=issues&locale=en");
    }
  });

  it("does not expose missing or unpublished articles", async () => {
    for (const id of ["missing", "../AGENTS", "issues/nested", ""]) {
      expect((await GET(request(`article=${encodeURIComponent(id)}&locale=en`))).status).toBe(404);
    }
    vi.spyOn(documentation, "getVisibleDocumentation").mockReturnValueOnce([]);
    expect((await GET(request("article=issues&locale=en"))).status).toBe(404);
  });

  it("keeps preview images out of public caches and respects rendering limits", async () => {
    vi.spyOn(documentation, "isDocumentationPreview").mockReturnValue(true);
    const response = await GET(request("article=issues&locale=en"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    state.limited = true;
    expect((await GET(request("article=issues&locale=en"))).status).toBe(429);
  });
});
