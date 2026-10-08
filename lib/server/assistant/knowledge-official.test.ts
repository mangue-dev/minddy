import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentationArticle } from "@/lib/documentation";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ articles: [] as DocumentationArticle[] }));
vi.mock("@/lib/server/documentation", () => ({
  getPublishedDocumentation: (locale: string) => state.articles.filter(article => article.locale === locale),
}));
const { getKnowledgeArticle, getKnowledgeArticles, getKnowledgeTopicList } = await import("./knowledge");

describe("official product help migration", () => {
  beforeEach(() => {
    state.articles = [{
      id: "choose-an-instance", locale: "de", title: "Instanz wählen", summary: "Cloud oder eigene Instanz.",
      topic: "Betrieb", aliases: ["open-source"], audiences: ["member", "operator"], tags: ["cloud"],
      content: "## Verantwortung {#responsibilities}\n\nEigene Instanz und Cloud haben unterschiedliche Betreiber.",
      revision: 4, review: { revision: 4, fact: "Agent source review", language: "Agent language review", date: "2026-10-08" },
    } as DocumentationArticle];
  });

  it("resolves legacy aliases to the current localized source with its revision", () => {
    const article = getKnowledgeArticle("open-source", "de");
    expect(article?.id).toBe("choose-an-instance");
    expect(article?.sourceUrl).toBe("/de/dokumentation/choose-an-instance");
    expect(article?.revision).toBe(4);
    expect(article?.lastReviewed).toBe("2026-10-08");
    expect(article?.content).toContain("unterschiedliche Betreiber");
  });

  it("displaces the migrated legacy copy from both retrieval and catalog", () => {
    const catalog = getKnowledgeArticles("de");
    expect(catalog.some(article => article.id === "open-source")).toBe(false);
    expect(getKnowledgeTopicList("de")).toContain("topic: `choose-an-instance`");
    expect(getKnowledgeTopicList("de")).not.toContain("topic: `open-source`");
  });

  it("keeps unmigrated FAQ knowledge available and retrieval bounded", () => {
    expect(getKnowledgeArticle("self-hosting", "de")?.id).toBe("self-hosting");
    expect(getKnowledgeArticles("de", "cloud project minddy").length).toBeLessThanOrEqual(4);
    expect(getKnowledgeArticles("de", "zxqv664never")).toEqual([]);
  });
});
