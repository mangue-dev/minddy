// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { assistantDraftHtml } from "./assistant-composer-draft";

describe("assistant composer draft serialization", () => {
  it("keeps token metadata while removing portal-rendered children", () => {
    const editor = document.createElement("div");
    editor.innerHTML = [
      "Review ",
      '<span data-mention-id="issue"><span>MIN-523</span></span>',
      " with ",
      '<span data-skill-path="skills/review"><button>Review skill</button></span>',
      ' <span data-command-id="research">/research</span>',
    ].join("");

    const snapshot = assistantDraftHtml(editor);

    expect(snapshot).toContain('data-mention-id="issue"');
    expect(snapshot).toContain('data-skill-path="skills/review"');
    expect(snapshot).toContain("/research");
    expect(snapshot).not.toContain("MIN-523");
    expect(snapshot).not.toContain("Review skill");
  });
});
