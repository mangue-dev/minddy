// @vitest-environment jsdom
//
// The guardrail of the DOOR for writing pages (MIN-350).
//
// Two things, and the first is the one that expires: `lib/page-content-schema.ts`
// handwrite the list of nodes, marks and their attributes, because
// that a server cannot mount a tiptap editor on each backup for
// ask the registry. This list must therefore be kept equal to the register — and
// it is this file that holds it, by mounting the REAL schema under jsdom, like
// lib/pages-blocks.test.ts.
//
// A block added without its entry in the list causes this test to fail. This is the
// only way to have both: a validation that costs nothing to write,
// and a list that does not drift.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import {
  PAGE_MARK_ATTRIBUTES,
  PAGE_NODE_ATTRIBUTES,
  checkPageContent,
  isSafePageUrl,
} from "@/lib/page-content-schema";

function schema() {
  const editor = new Editor({ extensions: pageExtensions({ headless: true }) });
  const nodes: Record<string, string[]> = {};
  for (const [name, type] of Object.entries(editor.schema.nodes)) {
    nodes[name] = Object.keys(type.spec.attrs ?? {}).sort();
  }
  const marks: Record<string, string[]> = {};
  for (const [name, type] of Object.entries(editor.schema.marks)) {
    marks[name] = Object.keys(type.spec.attrs ?? {}).sort();
  }
  editor.destroy();
  return { nodes, marks };
}

function sorted(table: Record<string, readonly string[]>) {
  return Object.fromEntries(
    Object.entries(table).map(([name, attrs]) => [name, [...attrs].sort()])
  );
}

describe("the hand-written list and the registry", () => {
  it("contain exactly the same nodes and attributes", () => {
    expect(sorted(PAGE_NODE_ATTRIBUTES)).toEqual(schema().nodes);
  });

  it("contain exactly the same marks and attributes", () => {
    expect(sorted(PAGE_MARK_ATTRIBUTES)).toEqual(schema().marks);
  });
});

describe("les adresses", () => {
  it("accepte ce que minddy sert et ce qu'un auteur cite légitimement", () => {
    // Our files are RELATIVE (lib/page-files.ts), and an external image is
    // a normal and documented case (blocks/image.ts).
    expect(isSafePageUrl("/api/projects/x/pages/files/y")).toBe(true);
    expect(isSafePageUrl("https://exemple.org/graphe.png")).toBe(true);
    expect(isSafePageUrl("//exemple.org/graphe.png")).toBe(true);
    expect(isSafePageUrl("mailto:contact@minddy.app")).toBe(true);
  });

  it("rejects an executable protocol, including whitespace and casing", () => {
    expect(isSafePageUrl("javascript:alert(1)")).toBe(false);
    // Browsers follow these: normalization removes whitespace and
    // control characters BEFORE reading the protocol.
    expect(isSafePageUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafePageUrl(" JavaScript:alert(1)")).toBe(false);
    expect(isSafePageUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafePageUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafePageUrl("blob:https://minddy.app/abc")).toBe(false);
    expect(isSafePageUrl("")).toBe(false);
    expect(isSafePageUrl(null)).toBe(false);
  });
});

describe("le corps", () => {
  it("rejects the entire document as soon as an address is hostile", () => {
    expect(
      checkPageContent({
        type: "doc",
        content: [
          { type: "image", attrs: { src: "javascript:alert(1)", alt: "x" } },
        ],
      })
    ).toEqual({ ok: false, reason: "unsafe-url" });
  });

  it("refuse un `href` de marque hostile aussi", () => {
    expect(
      checkPageContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "clique",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ],
      })
    ).toEqual({ ok: false, reason: "unsafe-url" });
  });

  it("rejects a node and a mark that no surface can render", () => {
    expect(
      checkPageContent({ type: "doc", content: [{ type: "script" }] })
    ).toEqual({ ok: false, reason: "unknown-node" });
    expect(
      checkPageContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "onclick" }] }],
          },
        ],
      })
    ).toEqual({ ok: false, reason: "unknown-node" });
  });

  it("rejects a root that is not a document", () => {
    expect(checkPageContent({ type: "paragraph" })).toEqual({
      ok: false,
      reason: "unknown-node",
    });
  });

  it("RETIRE un attribut inconnu au lieu de refuser la page", () => {
    // This is already what ProseMirror does by loading the document; refuse
    // would make any deployment of the editor capable of blocking a left tab
    // open on the previous version.
    const checked = checkPageContent({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "/api/x", alt: "a", onerror: "alert(1)" },
        },
      ],
    });
    expect(checked).toMatchObject({ ok: true });
    expect(checked.ok && checked.content).toEqual({
      type: "doc",
      content: [{ type: "image", attrs: { src: "/api/x", alt: "a" } }],
    });
  });

  it("laisse un document ordinaire intact", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "b1" },
          content: [
            {
              type: "text",
              text: "minddy",
              marks: [
                { type: "bold" },
                { type: "link", attrs: { href: "https://www.minddy.app" } },
              ],
            },
          ],
        },
      ],
    };
    const checked = checkPageContent(doc);
    expect(checked).toEqual({ ok: true, content: doc });
  });
});
