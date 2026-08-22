import { describe, expect, it } from "vitest";
import {
  CODE_LANGUAGE_ALLOWED,
  codeLanguage,
  extractCodeBlock,
  type HastNode,
} from "@/lib/markdown-code";

describe("CODE_LANGUAGE_ALLOWED", () => {
  it("the stock sanitizer keeps language-* classes on <code>", () => {
    // The whole highlighting feature rides on this invariant of the
    // sanitize schema — if a dependency update drops it, fenced blocks
    // lose their language badge and highlight silently.
    expect(CODE_LANGUAGE_ALLOWED).toBe(true);
  });
});

describe("codeLanguage", () => {
  it("reads the language token out of the class list", () => {
    expect(
      codeLanguage({
        type: "element",
        tagName: "code",
        properties: { className: ["language-typescript", "extra"] },
        children: [],
      }),
    ).toBe("typescript");
  });

  it("returns an empty string for a bare code block", () => {
    expect(
      codeLanguage({
        type: "element",
        tagName: "code",
        properties: {},
        children: [],
      }),
    ).toBe("");
  });
});

describe("extractCodeBlock", () => {
  const pre = (children: HastNode[]) => ({
    type: "element",
    tagName: "pre",
    properties: {},
    children,
  });

  it("extracts the text and the language of a fenced block", () => {
    const block = extractCodeBlock(
      pre([
        {
          type: "element",
          tagName: "code",
          properties: { className: ["language-python"] },
          children: [
            {
              type: "element",
              tagName: "span",
              properties: {},
              children: [{ type: "text", value: "print(" }],
            },
            { type: "text", value: '"hi")' },
          ],
        },
      ]),
    );
    expect(block).toEqual({ code: 'print("hi")', language: "python" });
  });

  it("extracts an indented block without language", () => {
    const block = extractCodeBlock(
      pre([
        {
          type: "element",
          tagName: "code",
          properties: {},
          children: [{ type: "text", value: "ls -la\n" }],
        },
      ]),
    );
    expect(block).toEqual({ code: "ls -la\n", language: "" });
  });

  it("returns null when there is no <code> child", () => {
    expect(extractCodeBlock(pre([]))).toBeNull();
  });

  it("returns null for anything that is not a <pre>", () => {
    expect(extractCodeBlock(undefined)).toBeNull();
    expect(extractCodeBlock(null)).toBeNull();
    expect(
      extractCodeBlock({ type: "text", value: "not a block" }),
    ).toBeNull();
  });

  it("keeps trailing newlines so copy yields byte-identical source", () => {
    const block = extractCodeBlock(
      pre([
        {
          type: "element",
          tagName: "code",
          properties: {},
          children: [{ type: "text", value: "a\nb\n" }],
        },
      ]),
    );
    expect(block?.code).toBe("a\nb\n");
  });
});
