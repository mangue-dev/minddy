import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getKnowledgeArticle, getKnowledgeTopicList } = await import("./knowledge");

describe("Numo product knowledge", () => {
  it("returns the open-source article by its stable topic id", () => {
    const article = getKnowledgeArticle("open-source");

    expect(article?.title).toBe("Open source and self-hosting");
    expect(article?.content).toContain("GNU AGPL v3.0 only");
  });

  it("publishes the open-source topic in the prompt catalog", () => {
    expect(getKnowledgeTopicList()).toContain("topic: `open-source`");
  });
});
