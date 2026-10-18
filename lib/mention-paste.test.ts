// @vitest-environment jsdom
//
// Pasting copied text with typed mentions into the Numo composer (MIN-734):
// the mentions come back with their ids, from HTML or from link-form text.
import { describe, expect, it } from "vitest";
import { pastedMentionPieces } from "@/lib/mention-paste";

const ISSUE = "9f1c2a3b-0000-4000-8000-000000000001";

describe("splitting a paste into text and mentions", () => {
  it("reads the anchors of copied HTML", () => {
    const html = `<p>Fix <a href="mention:issue/${ISSUE}">@MIN-42</a> today</p>`;
    expect(pastedMentionPieces(html, "Fix @MIN-42 today")).toEqual([
      "Fix ", { type: "issue", id: ISSUE, label: "MIN-42" }, " today",
    ]);
  });

  it("reads link-form plain text", () => {
    expect(pastedMentionPieces("", `Fix [@MIN-42](mention:issue/${ISSUE}) today`)).toEqual([
      "Fix ", { type: "issue", id: ISSUE, label: "MIN-42" }, " today",
    ]);
  });

  it("leaves ordinary text and links alone", () => {
    expect(pastedMentionPieces('<a href="https://example.com">site</a>', "site")).toEqual(["site"]);
  });
});
