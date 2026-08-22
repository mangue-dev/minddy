import { defaultSchema } from "rehype-sanitize";

/* Minimal hast node shape — same walk-level contract as components/markdown. */
export type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/* The stock sanitize schema keeps exactly one class on <code>:
   `language-*` (asserted below) — the marker a fenced block (```ts)
   leaves for the renderer. Everything else is stripped. */
export const CODE_LANGUAGE_ALLOWED =
  defaultSchema.attributes?.code?.some(
    (rule) =>
      Array.isArray(rule) &&
      rule[0] === "className" &&
      rule[1] instanceof RegExp &&
      rule[1].source.startsWith("^language-"),
  ) ?? false;

/** Reads the `language-*` class into a bare token ("ts", "python"...). */
export function codeLanguage(node: HastNode): string {
  const className = node.properties?.className;
  const classes = Array.isArray(className) ? className : [];
  for (const value of classes) {
    if (typeof value === "string" && value.startsWith("language-")) {
      return value.slice("language-".length);
    }
  }
  return "";
}

/** Concatenates every text descendant, in document order. */
function textContent(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textContent).join("");
}

export interface ExtractedCodeBlock {
  code: string;
  language: string;
}

/**
 * Pulls `{code, language}` out of the hast tree of a `<pre>`, as produced by
 * remark → rehype for a fenced or indented code block. Returns null when the
 * subtree is not the expected shape (no `<pre>` should reach here otherwise).
 */
export function extractCodeBlock(
  node: HastNode | undefined | null,
): ExtractedCodeBlock | null {
  if (!node || node.tagName !== "pre") return null;
  const codeChild = (node.children ?? []).find(
    (child) => child.tagName === "code",
  );
  if (!codeChild) return null;
  return {
    code: textContent(codeChild),
    language: codeLanguage(codeChild),
  };
}
