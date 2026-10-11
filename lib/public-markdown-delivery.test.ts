import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUBLIC_ROUTES, publicRouteVariants } from "@/lib/public-routes";
import { publicMarkdownPath, resolvePublicMarkdownDelivery } from "@/lib/public-markdown-delivery";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => { throw new Error("Markdown must not read a session"); },
}));
const { proxy } = await import("@/proxy");
const request = (path: string, accept?: string) => new NextRequest(`https://www.minddy.app${path}`, {
  headers: { host: "www.minddy.app", ...(accept ? { accept } : {}),
    "accept-language": "fr", "x-minddy-route": "home", "x-minddy-locale": "fr" },
});
afterEach(() => vi.unstubAllEnvs());

describe("public site Markdown delivery", () => {
  it("serves every registered site URL and locale without authentication", async () => {
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://unavailable.example.test");
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY", "anon");
    for (const route of PUBLIC_ROUTES.filter(item => item.key !== "documentation")) {
      for (const { path, locale } of publicRouteVariants(route)) {
        const markdown = publicMarkdownPath(path);
        expect(resolvePublicMarkdownDelivery(markdown)).toMatchObject({ route, locale, pathname: path });
        for (const input of [request(markdown + "?route=home&locale=fr", "text/html"), request(path, "text/markdown")]) {
          const response = await proxy(input);
          expect(response.headers.get("location")).toBeNull();
          expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/md");
          expect(response.headers.get("x-middleware-request-x-minddy-route")).toBe(route.key);
          expect(response.headers.get("x-middleware-request-x-minddy-locale")).toBe(locale);
          expect(response.headers.get("vary")).toContain("Accept");
        }
      }
    }
  });

  it("keeps the root landing language stable and supports appending .md literally", async () => {
    expect(resolvePublicMarkdownDelivery("/.md")?.locale).toBe("en");
    const response = await proxy(request("/index.md"));
    expect(response.headers.get("x-middleware-request-x-minddy-locale")).toBe("en");
  });

  it.each(["text/markdown;q=0", "text/markdown;q=0.4,text/html", "text/markdownish", "*/*"])(
    "serves HTML and advertises its Markdown alternative for %s", async accept => {
      vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "");
      const response = await proxy(request("/fr/tarifs", accept));
      expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/pricing");
      expect(response.headers.get("Link")).toContain('</fr/tarifs.md>; rel="alternate"; type="text/markdown"');
      expect(response.headers.get("Vary")).toContain("Accept");
    },
  );

  it.each(["/home.md", "/api/issues.md", "/p/token.md", "/share/token.md", "/f/token.md", "/pricing/unknown.md", "/fr/pricing.md", "/pricing.md.md"])(
    "does not export unregistered or tokenized URL %s", path => {
      expect(resolvePublicMarkdownDelivery(path)).toBeNull();
    },
  );
});
