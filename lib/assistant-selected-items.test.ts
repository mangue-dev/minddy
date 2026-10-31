import { describe, expect, it } from "vitest";
import { selectedItemsPageContext } from "./assistant-selected-items";

describe("selectedItemsPageContext (MIN-873)", () => {
  it("keeps a single record on its kind's singular fields", () => {
    expect(selectedItemsPageContext("feedback", [{ id: "f1", title: "Dark mode" }])).toEqual({
      feedbackId: "f1",
      feedbackTitle: "Dark mode",
    });
    expect(selectedItemsPageContext("objective", [{ id: "o1", title: "Launch" }])).toEqual({
      objectiveId: "o1",
      objectiveName: "Launch",
    });
  });

  it("sends several records as one list of their kind", () => {
    expect(
      selectedItemsPageContext("page", [
        { id: "p1", title: "Spec" },
        { id: "p2", title: "Roadmap" },
      ]),
    ).toEqual({
      selectedItems: [
        { kind: "page", id: "p1", label: "Spec" },
        { kind: "page", id: "p2", label: "Roadmap" },
      ],
    });
  });
});
