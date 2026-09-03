// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { PlainMarkdownLink } from "@/components/markdown-link";
import {
  handleMarkdownLinkClick,
  MarkdownLinkMark,
} from "@/components/markdown-link-mark";
import {
  MARKDOWN_LINK_CLASS,
  markdownLinkIconUrl,
  markdownLinkPresentation,
} from "@/lib/markdown-link";

vi.mock("mangue-ui", () => ({
  cn: (...classes: Array<string | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

describe("Markdown links", () => {
  it("routes public web links through the same-origin favicon endpoint", () => {
    expect(markdownLinkIconUrl("https://example.com/docs?q=one")).toBe(
      "/api/markdown-link-icon?url=https%3A%2F%2Fexample.com",
    );
    expect(markdownLinkIconUrl("mailto:hello@example.com")).toBeNull();
    expect(markdownLinkIconUrl("/projects/one")).toBeNull();
  });

  it("adds the shared class and icon to TipTap-rendered links", () => {
    expect(MarkdownLinkMark.options.openOnClick).toBe(false);
    const editor = new Editor({
      content: '<p><a href="https://example.com/docs">Documentation</a></p>',
      extensions: [StarterKit.configure({ link: false }), MarkdownLinkMark],
    });

    const html = editor.getHTML();
    expect(html).toContain(`class="${MARKDOWN_LINK_CLASS}"`);
    expect(html).toContain("--markdown-link-icon:");
    expect(html).toContain("example.com");
    expect(html).not.toContain("%2Fdocs");
    editor.destroy();
  });

  it("selects an editable TipTap link on a plain click", () => {
    const editor = new Editor({
      content: '<p>Visit <a href="https://example.com">Example</a>.</p>',
      extensions: [StarterKit.configure({ link: false }), MarkdownLinkMark],
    });
    const link = editor.view.dom.querySelector("a");
    expect(link).not.toBeNull();

    const event = new MouseEvent("click", {
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: link });

    expect(handleMarkdownLinkClick(editor.view, 1, event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.isActive("link")).toBe(true);
    editor.destroy();
  });

  it("uses the globe-only presentation for non-web links", () => {
    expect(markdownLinkPresentation("mailto:hello@example.com")).toEqual({
      class: MARKDOWN_LINK_CLASS,
    });
  });

  it("keeps the specified blue, un-underlined link style and globe fallback", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(
      /a\.markdown-link\s*\{[^}]*color:\s*#0085FF;[^}]*text-decoration:\s*none;/s,
    );
    expect(css).toContain("--markdown-link-icon");
    expect(css).toContain("%3Ccircle cx='12' cy='12' r='10'/%3E");
  });

  it("preserves a forge image button without the enriched link decoration", () => {
    const html = renderToStaticMarkup(
      createElement(
        PlainMarkdownLink,
        {
          href: "https://vercel.com/vercel-agent/request-review?owner=example",
          target: "_blank",
          rel: "noreferrer",
        },
        createElement(
          "picture",
          null,
          createElement("source", {
            media: "(prefers-color-scheme: dark)",
            srcSet: "https://agents-vade-review.vercel.sh/request-review-dark.svg",
          }),
          createElement("img", {
            src: "https://agents-vade-review.vercel.sh/request-review-light.svg",
            alt: "Request Review",
          }),
        ),
      ),
    );

    expect(html).toContain("<picture>");
    expect(html).toContain('alt="Request Review"');
    expect(html).toContain("text-primary underline underline-offset-2");
    expect(html).not.toContain(MARKDOWN_LINK_CLASS);
    expect(html).not.toContain("--markdown-link-icon");
  });
});
