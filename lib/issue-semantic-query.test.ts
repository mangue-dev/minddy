import { describe, expect, it } from "vitest";
import { isSemanticQuery, normalizeSemanticQuery, semanticExtras } from "./issue-semantic-query";

describe("isSemanticQuery", () => {
  it.each(["MIN-42", "min-", "#42", "42", "min 42", "ab", "login", "ux bug"])(
    "leaves identifiers and short lookups to lexical search: %s",
    (query) => expect(isSemanticQuery(query)).toBe(false),
  );

  it.each([
    "single sign-on for enterprise",
    "connexion qui échoue",
    "Abmeldung funktioniert nicht",
    "invoices",
  ])("sends descriptive queries to semantic search: %s", (query) => {
    expect(isSemanticQuery(query)).toBe(true);
  });

  it("normalizes case, spaces and length for the cache key", () => {
    expect(normalizeSemanticQuery("  Dark   MODE ")).toBe("dark mode");
    expect(normalizeSemanticQuery("x".repeat(400))).toHaveLength(300);
  });
});

describe("semanticExtras", () => {
  const eligible = new Map([["a", "A"], ["b", "B"], ["c", "C"]]);

  it("keeps semantic order, only eligible ids, never one already shown, bounded", () => {
    expect(semanticExtras(["x", "c", "a", "b"], eligible, new Set(["a"]), 5)).toEqual(["C", "B"]);
    expect(semanticExtras(["a", "b", "c"], eligible, new Set(), 2)).toEqual(["A", "B"]);
  });
});
