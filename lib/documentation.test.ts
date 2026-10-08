import { describe, expect, it } from "vitest";
import { documentationLocales, documentationPath, isPublishedDocumentation, parseDocumentation, resolveDocumentationPath, searchDocumentation, localizeDocumentationLink } from "./documentation-core.mjs";
import { localizedHref, switchLocaleHref } from "./locale-href";
import type { DocumentationArticle } from "./documentation";

const article = {
  id: "recover-access", title: "Réinitialiser l’accès", summary: "Retrouver votre compte.",
  locale: "fr", revision: 2, sourceRevision: 2, visibility: "public", status: "published",
  topic: "Account", owner: "@mangue-dev", updatedAt: "2026-10-08", compatibility: { version: "0.11.1 candidate" },
  review: { revision: 2, fact: "Agent factual review", language: "Agent language review", date: "2026-10-08" },
  sections: [{ id: "recover-access", title: "Récupération", level: 2 }],
  content: "## Récupération {#recover-access}\n\nVérifiez votre adresse électronique et réinitialisez votre accès.",
  tags: ["compte"], figures: [], requiredFigures: [],
} as unknown as DocumentationArticle;

describe("official documentation boundaries", () => {
  it("requires the coherent reviewed six-locale release set", () => {
    const variants = documentationLocales.map(locale => ({ ...article, locale }));
    expect(isPublishedDocumentation(article, variants)).toBe(true);
    expect(isPublishedDocumentation(article, variants.slice(1))).toBe(false);
    expect(isPublishedDocumentation(article, variants.map(item => item.locale === "de" ? { ...item, status: "draft" } : item))).toBe(false);
    expect(isPublishedDocumentation(article, variants.map(item => item.locale === "es" ? { ...item, sourceRevision: 1 } : item))).toBe(false);
    expect(isPublishedDocumentation(article, variants.map(item => item.locale === "it" ? { ...item, visibility: "internal" } : item))).toBe(false);
    expect(isPublishedDocumentation(article, variants.map(item => item.locale === "pt-BR" ? { ...item, review: { ...item.review, language: null } } : item))).toBe(false);
    expect(isPublishedDocumentation(article, variants.map(item => item.locale === "fr" ? { ...item, review: { ...item.review, date: "2026-02-31" } } : item))).toBe(false);
    expect(isPublishedDocumentation(article, variants.map(item => item.locale === "it" ? { ...item, sections: [] } : item))).toBe(false);
    expect(isPublishedDocumentation(article, [...variants, variants[0]])).toBe(false);
  });

  it("keeps required missing and stale illustrations unpublished", () => {
    const variants = documentationLocales.map(locale => ({ ...article, locale, requiredFigures: ["recovery"] }));
    expect(isPublishedDocumentation(article, variants)).toBe(false);
  });

  it("resolves locale URLs without admitting secret or nested paths", () => {
    expect(resolveDocumentationPath("/fr/documentation/recover-access")).toEqual({ locale: "fr", id: "recover-access" });
    for (const path of ["/p/secret", "/share/secret", "/f/secret", "/docs/../audit", "/docs/a/b", "/docs/a%2fb"]) expect(resolveDocumentationPath(path)).toBeNull();
    expect(localizedHref("/docs/recover-access#recover-access", "de")).toBe("/de/dokumentation/recover-access#recover-access");
    expect(switchLocaleHref("/fr/documentation/recover-access", "pt-BR")).toBe("/pt-br/documentacao/recover-access");
    expect(documentationPath(null, "en")).toBe("/docs");
  });

  it("finds accent-insensitive localized passages and requires every query term", () => {
    const hit = searchDocumentation([article], "reinitialiser acces")[0];
    expect(hit.href).toBe("/fr/documentation/recover-access#recover-access");
    expect(hit.excerpt).toContain("adresse électronique");
    expect(searchDocumentation([article], "compte serveur")).toEqual([]);
    expect(searchDocumentation([article], " ")).toEqual([]);
  });

  it("extracts semantic headings while leaving fenced command text alone", () => {
    const parsed = parseDocumentation('---\n{"id":"example"}\n---\n## First {#first}\n\n```sh\n## command output\n```\n');
    expect(parsed.sections).toEqual([{ level: 2, title: "First", id: "first" }]);
    expect(() => parseDocumentation('---\n{}\n---\n## Unstable\n')).toThrow("stable section ID");
  });

  it("localizes exact documentation links with query strings and fragments", () => {
    expect(localizeDocumentationLink("/docs?q=backup#topics", "fr")).toBe("/fr/documentation?q=backup#topics");
    expect(localizeDocumentationLink("/it/documentazione/recover-access#recover-access", "en")).toBe("/docs/recover-access#recover-access");
    expect(localizeDocumentationLink("/docs-private", "fr")).toBe("/docs-private");
    expect(localizeDocumentationLink("/share/secret", "de")).toBe("/share/secret");
  });

  it("returns every matching article and weights section titles above body text", () => {
    const articles = Array.from({ length: 25 }, (_, i) => ({ ...article, id: `article-${i}`, title: "Account", tags: [], summary: "Account help", content: "## Account {#account}\n\nRecovery is available." }));
    articles[24].content = "## Recovery {#recovery}\n\nAccount help.";
    const results = searchDocumentation(articles, "recovery");
    expect(results).toHaveLength(25);
    expect(results[0].id).toBe("article-24");
    expect(results[0].href).toContain("#recovery");
  });
});
