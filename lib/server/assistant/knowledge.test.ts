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

  it("exposes the self-hosting installation contract", () => {
    const article = getKnowledgeArticle("self-hosting");

    expect(article?.title).toBe("Self-hosting minddy");
    expect(article?.content).toContain("PostgreSQL, Auth, Storage, and Realtime");
    expect(article?.content).toContain("AGENT_EXECUTION_BACKEND=self-hosted");
    expect(article?.content).toContain("pnpm self-host:local");
    expect(article?.content).toContain("MINDDY_PUBLIC_APP_URL");
  });

  it("prefers the dedicated self-hosting topic for natural-language queries", () => {
    expect(getKnowledgeArticle("How do I self host minddy?")?.id).toBe("self-hosting");
  });

  it("exposes the self-hosting operations contract", () => {
    const article = getKnowledgeArticle("self-hosting-operations");

    expect(article?.content).toContain("block writes → create and verify a complete backup");
    expect(article?.content).toContain("raw bytes from the Supabase Storage backend");
    expect(article?.content).toContain("pnpm self-host:restore");
  });
});
