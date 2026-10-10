import type { Locale } from "@/i18n/config";
import { documentationPath, documentationRoots, resolveDocumentationPath } from "@/lib/documentation-core.mjs";

export function documentationMarkdownPath(id: string | null, locale: Locale): string {
  return id ? `${documentationPath(id, locale)}.md` : `${documentationPath(null, locale)}/index.md`;
}

/** Only official documentation URLs can select public article content. */
export function resolveDocumentationDelivery(pathname: string): {
  locale: Locale; id: string | null; format: "html" | "markdown" | "index";
} | null {
  for (const locale of Object.keys(documentationRoots) as Locale[]) {
    const root = documentationRoots[locale];
    if (pathname === `${root}/llms.txt`) return { locale, id: null, format: "index" };
    if ([`${root}.md`, `${root}/index.md`].includes(pathname)) return { locale, id: null, format: "markdown" };
  }
  const markdown = pathname.endsWith(".md");
  const route = resolveDocumentationPath(markdown ? pathname.slice(0, -3) : pathname);
  return route ? { ...route, format: markdown ? "markdown" : "html" } : null;
}

/** Require an explicit acceptable Markdown type and respect HTML preference. */
export function prefersDocumentationMarkdown(accept: string | null): boolean {
  let markdown = 0;
  let html = 0;
  for (const part of (accept ?? "").toLowerCase().split(",")) {
    const [type, ...parameters] = part.trim().split(";");
    const quality = parameters.find(value => value.trim().startsWith("q="));
    const q = quality ? Number(quality.trim().slice(2)) : 1;
    if (!Number.isFinite(q) || q < 0 || q > 1) continue;
    if (type === "text/markdown") markdown = Math.max(markdown, q);
    if (type === "text/html") html = Math.max(html, q);
  }
  return markdown > 0 && markdown >= html;
}
