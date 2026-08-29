import { describe, expect, it } from "vitest";

import { isBlankTrashPage } from "./trash";

describe("isBlankTrashPage", () => {
  it("hides an abandoned page draft", () => {
    expect(
      isBlankTrashPage(
        {
          title: "  ",
          icon: null,
          content: { type: "doc", content: [{ type: "paragraph" }] },
        },
        false,
      ),
    ).toBe(true);
  });

  it("keeps an untitled page that contains text", () => {
    expect(
      isBlankTrashPage(
        {
          title: "",
          icon: null,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Notes" }],
              },
            ],
          },
        },
        false,
      ),
    ).toBe(false);
  });

  it("keeps a blank page that owns deleted subpages", () => {
    expect(
      isBlankTrashPage(
        { title: "", icon: null, content: { type: "doc", content: [] } },
        true,
      ),
    ).toBe(false);
  });

  it("keeps a page with a title or icon", () => {
    expect(isBlankTrashPage({ title: "Plan", icon: null }, false)).toBe(false);
    expect(isBlankTrashPage({ title: "", icon: "📄" }, false)).toBe(false);
  });
});
