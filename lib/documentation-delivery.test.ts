import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { documentationLocales, documentationPath } from "./documentation-core.mjs";
import { documentationMarkdownPath, prefersDocumentationMarkdown, resolveDocumentationDelivery } from "./documentation-delivery";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => { throw new Error("Documentation must not read a session"); },
}));

const { proxy } = await import("@/proxy");

describe("documentation representations", () => {
  it.each(documentationLocales)("resolves explicit %s text paths and advertises them from HTML", async locale => {
    const root = documentationPath(null, locale);
    for (const path of [`${root}.md`, `${root}/index.md`, `${root}/llms.txt`, `${root}/issues.md`]) {
      expect(resolveDocumentationDelivery(path)?.locale).toBe(locale);
      const response = await proxy(new NextRequest(`https://www.minddy.app${path}`, {
        headers: { host: "www.minddy.app", "x-minddy-locale": "invalid" },
      }));
      expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/md/documentation");
      expect(response.headers.get("x-middleware-request-x-minddy-locale")).toBeNull();
    }
    const response = await proxy(new NextRequest(`https://www.minddy.app${root}/issues`, { headers: { host: "www.minddy.app" } }));
    expect(response.headers.get("Link")).toContain(`<${documentationMarkdownPath("issues", locale)}>; rel="alternate"; type="text/markdown"`);
    expect(response.headers.get("Link")).toContain(`<${root}/llms.txt>; rel="describedby"`);
    expect(response.headers.get("Vary")).toContain("Accept");
  });

  it.each(["*/*", "text/html,*/*", "text/markdown;q=0", "text/markdownish", "text/markdown;q=0.5,text/html;q=1", "text/markdown;q=invalid"])("keeps HTML for %s", accept => {
    expect(prefersDocumentationMarkdown(accept)).toBe(false);
  });

  it.each(["text/markdown", "text/markdown; charset=utf-8", "text/html;q=0.5,text/markdown;q=0.9"])("negotiates explicit %s without auth or a locale redirect", async accept => {
    expect(prefersDocumentationMarkdown(accept)).toBe(true);
    const response = await proxy(new NextRequest("https://www.minddy.app/docs?q=plan", {
      headers: { host: "www.minddy.app", accept, "accept-language": "fr" },
    }));
    expect(response.headers.get("location")).toBeNull();
    const rewrite = new URL(response.headers.get("x-middleware-rewrite")!);
    expect(rewrite.pathname).toBe("/md/documentation");
    expect(rewrite.search).toBe("?q=plan");
  });

  it.each(["/p/secret.md", "/share/secret.md", "/docs/a/b.md", "/docs/a%2fb.md", "/docs/../audit.md", "/docs-private.md"])("rejects non-documentation input %s", path => {
    expect(resolveDocumentationDelivery(path)).toBeNull();
  });
});
