import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTranslator } from "next-intl";
import { loadMessages } from "@/i18n/messages";
import { locales, type Locale } from "@/i18n/config";
import { PUBLIC_ROUTES, publicPathForLocale } from "@/lib/public-routes";
import { publicMarkdownPath } from "@/lib/public-markdown-delivery";
import { SITE_URL } from "@/lib/site";
import MarkdownIt from "markdown-it";
import { createElement } from "react";
import { CookieTable } from "@/components/legal/prose";
import { legalProseMarkdown } from "@/lib/server/legal-markdown";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: Locale; namespace: string }) =>
    createTranslator({ locale, messages: await loadMessages(locale), namespace,
      onError: error => { throw error; } }),
  getLocale: () => { throw new Error("Text exports must use an explicit locale"); },
}));
const { GET } = await import("@/app/md/route");
afterEach(() => vi.unstubAllEnvs());

describe("public site Markdown content", () => {
  it.each(locales)("renders every %s page with the requested content and canonical language", async locale => {
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("MINDDY_CHANGELOG_URL", "");
    for (const route of PUBLIC_ROUTES.filter(item => item.key !== "documentation")) {
      const path = publicPathForLocale(route, locale);
      const response = await GET(new NextRequest(`${SITE_URL}${publicMarkdownPath(path)}?route=home&locale=fr`));
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
      expect(response.headers.get("Content-Language")).toBe(locale);
      expect(response.headers.get("Link")).toContain(`<${SITE_URL}${path}>; rel="canonical"`);
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, follow");
      const body = await response.text();
      expect(body.startsWith("# ")).toBe(true);
      expect(body.length, route.key).toBeGreaterThan(400);
      expect(body, route.key).toContain("## ");
    }
  });

  it("preserves complete legal bodies, links, definitions and cookie tables", async () => {
    const terms = await (await GET(new NextRequest(`${SITE_URL}/terms.md`))).text();
    const privacy = await (await GET(new NextRequest(`${SITE_URL}/privacy.md`))).text();
    const cookies = await (await GET(new NextRequest(`${SITE_URL}/cookies.md`))).text();
    const messages = await loadMessages("en");
    const termsCopy = messages.Terms as Record<string, string>;
    const text = new MarkdownIt().parse(terms, {}).flatMap(token => token.children ?? [])
      .map(token => token.content).join("\n");
    for (const [key, value] of Object.entries(termsCopy)) {
      if (/P\d$|I\d$|Title$/.test(key) && key !== "metaTitle") {
        expect(text).toContain(value);
      }
    }
    expect(terms).toContain("mailto:");
    expect(privacy).toContain("https://www.cnil.fr");
    expect(privacy).toContain("- Account data:");
    const tokens = new MarkdownIt().parse(cookies, {});
    expect(tokens.filter(token => token.type === "table_open")).toHaveLength(3);
    expect(tokens.filter(token => token.type === "td_open")).toHaveLength(27);
  });

  it("gives the installer its own choices and released procedures", async () => {
    const body = await (await GET(new NextRequest(`${SITE_URL}/self-hosting/install.md`))).text();
    expect(body).toContain("/docs/install-locally.md");
    expect(body).toContain("/docs/install-a-server.md");
    expect(body).toContain("/docs/workspace-encryption.md");
    expect(body).toContain("version-specific");
    expect(body).not.toContain("MINDDY_RELEASE_TAG");
  });

  it("preserves literal punctuation and column boundaries in legal tables", async () => {
    const body = await legalProseMarkdown(createElement(CookieTable, {
      caption: "Storage", description: "Literal values",
      headers: { name: "Name | key", purpose: "Purpose", duration: "Duration" },
      rows: [{ name: String.raw`path\|name`, purpose: "[required] *literal*", duration: "line\nbreak" }],
    }));
    const tokens = new MarkdownIt().parse(body, {});
    expect(tokens.filter(token => token.type === "th_open")).toHaveLength(3);
    expect(tokens.filter(token => token.type === "td_open")).toHaveLength(3);
    const cells = tokens.filter(token => token.type === "inline").slice(-6)
      .map(token => token.children?.map(child => child.content).join(""));
    expect(cells).toEqual(["Name | key", "Purpose", "Duration", String.raw`path\|name`, "[required] *literal*", "line break"]);
  });

  it("preserves direct legacy /md query access, including the documentation index", async () => {
    const query = await GET(new NextRequest(`${SITE_URL}/md?route=privacy&locale=de`));
    expect(await query.text()).toBe(await (await GET(new NextRequest(`${SITE_URL}/de/datenschutz.md`))).text());
    const index = await GET(new NextRequest(`${SITE_URL}/md?route=documentation&locale=fr`));
    expect(index.headers.get("Content-Language")).toBe("fr");
    expect(await index.text()).toContain("/fr/documentation/issues.md");
  });
});
