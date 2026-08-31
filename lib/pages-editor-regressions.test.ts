// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";

import {
  BlockPlaceholder,
  pagePlaceholder,
} from "@/components/pages/block-placeholder";
import { DETAILS_SUMMARY_CLASS } from "@/components/pages/blocks/details";
import { pageExtensions } from "@/components/pages/page-extensions";

const translate = ((key: string) => key) as never;

describe("page editor regressions", () => {
  it("does not paint the new-line placeholder over an empty code block", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      content: "<pre><code></code></pre>",
      extensions: [
        ...pageExtensions({ headless: true }),
        BlockPlaceholder.configure({ text: pagePlaceholder(translate) }),
      ] as never,
    });

    editor.commands.focus("end");
    editor.view.dom.dispatchEvent(new FocusEvent("focus"));

    expect(element.querySelector("[data-placeholder]")).toBeNull();

    editor.destroy();
    element.remove();
  });

  it("replaces the native disclosure marker with one custom chevron", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      content: "<details><summary>Summary</summary><p>Content</p></details>",
      extensions: pageExtensions(),
    });

    const disclosure = element.querySelector('[data-type="details"]');
    const summary = disclosure?.querySelector("summary");
    expect(disclosure?.querySelectorAll(".page-details-toggle")).toHaveLength(1);
    expect(summary?.classList.contains(DETAILS_SUMMARY_CLASS)).toBe(true);

    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(
      /\.page-editor \.page-details-summary\s*\{[^}]*display:\s*block;[^}]*list-style:\s*none;/s,
    );
    expect(css).toMatch(
      /\.page-editor \.page-details-summary::-webkit-details-marker\s*\{[^}]*display:\s*none;/s,
    );

    editor.destroy();
    element.remove();
  });
});
