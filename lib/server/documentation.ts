import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { documentationLocales, isPublishedDocumentation, parseDocumentation } from "@/lib/documentation-core.mjs";
import type { DocumentationArticle } from "@/lib/documentation";
import type { Locale } from "@/i18n/config";
import legacyRoutes from "@/content/documentation/legacy-routes.json";
import type { DocumentationLegacyRoute } from "@/lib/documentation-core.mjs";

const ROOT = path.join(process.cwd(), "content/documentation");

/** Only explicit locale directories are read. Repository docs and audits never are. */
export const getDocumentationDrafts = cache((): DocumentationArticle[] => {
  return documentationLocales.flatMap(locale => {
    const directory = path.join(ROOT, locale);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter(file => /^[a-z0-9-]+\.md$/.test(file)).map(file => {
      const article = parseDocumentation(fs.readFileSync(path.join(directory, file), "utf8")) as DocumentationArticle;
      if (article.id !== file.slice(0, -3) || article.locale !== locale) {
        throw new Error(`Documentation identity does not match its path: ${locale}/${file}`);
      }
      return article;
    });
  });
});

export const getPublishedDocumentation = cache((locale: Locale): DocumentationArticle[] => {
  const all = getDocumentationDrafts();
  return all.filter(article => article.locale === locale && isPublishedDocumentation(article, all))
    .sort((a, b) => a.title.localeCompare(b.title, locale));
});

export function getDocumentationArticle(id: string, locale: Locale): DocumentationArticle | null {
  return getPublishedDocumentation(locale).find(article => article.id === id || article.aliases.includes(id)) ?? null;
}

export function getLegacyDocumentationRoute(id: string): DocumentationLegacyRoute | undefined {
  return (legacyRoutes as Record<string, DocumentationLegacyRoute>)[id];
}

/** Local review only. Production, sitemap and Numo always use published content. */
export function isDocumentationPreview(): boolean {
  return process.env.NODE_ENV === "development" && process.env.MINDDY_DOCUMENTATION_PREVIEW === "1";
}

export function getVisibleDocumentation(locale: Locale): DocumentationArticle[] {
  return isDocumentationPreview()
    ? getDocumentationDrafts().filter(article => article.locale === locale && article.visibility === "public")
      .sort((a, b) => a.title.localeCompare(b.title, locale))
    : getPublishedDocumentation(locale);
}
