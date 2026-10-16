import { describe, expect, it } from "vitest";
import { retainedPageDocumentCost, retainPageDocuments } from "./retained-page-documents";

const page = (text = "Document") => ({ database_schema: null, content: { type: "doc", content: [
  { type: "paragraph", attrs: { blockId: "paragraph" }, content: [{ type: "text", text }] },
] } });

describe("bounded document retention", () => {
  it("charges only known small text bodies one unit", () => {
    expect(retainedPageDocumentCost(page())).toBe(1);
    expect(retainedPageDocumentCost(undefined)).toBe(2);
    expect(retainedPageDocumentCost({ database_schema: null, content: { type: "paragraph" } })).toBe(2);
    expect(retainedPageDocumentCost({ ...page(), database_schema: [] })).toBe(2);
    expect(retainedPageDocumentCost(page("x".repeat(25_001)))).toBe(2);
    expect(retainedPageDocumentCost({ database_schema: null, content: { type: "doc", content: Array.from({ length: 201 }, () => ({ type: "paragraph" })) } })).toBe(2);
    expect(retainedPageDocumentCost({ database_schema: null, content: { type: "doc", content: [{ type: "image", attrs: { src: "file" } }] } })).toBe(2);
    expect(retainedPageDocumentCost({ database_schema: null, content: { type: "doc", content: [{ type: "paragraph", marks: [{ type: "link", attrs: { href: "x".repeat(25_001) } }] }] } })).toBe(2);
  });

  it("bounds MRU documents and drops removed, draft or large inactive surfaces", () => {
    const eligible = new Set(["a", "b", "c"]);
    expect(retainPageDocuments(["a", "b"], "a", eligible)).toEqual(["b", "a"]);
    expect(retainPageDocuments(["a", "b"], "c", eligible)).toEqual(["b", "c"]);
    expect(retainPageDocuments(["a", "b"], "large", eligible)).toEqual(["b", "large"]);
    expect(retainPageDocuments(["b", "large"], "c", eligible)).toEqual(["b", "c"]);
    expect(retainPageDocuments(["a", "b"], null, new Set(["b"]))).toEqual(["b"]);
    expect(retainPageDocuments(["a", "a", "b", "c"], null, eligible)).toEqual(["b", "c"]);
  });
});
