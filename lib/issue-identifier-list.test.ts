import { describe, expect, it } from "vitest";
import { sortedIdentifierList } from "@/lib/issue-constants";

describe("sortedIdentifierList", () => {
  it("lists a selection's identifiers comma-separated, smallest number first", () => {
    expect(
      sortedIdentifierList([
        { projectKey: "MIN", number: 120 },
        { projectKey: "MIN", number: 9 },
        { projectKey: "MIN", number: 33 },
      ]),
    ).toBe("MIN-9, MIN-33, MIN-120");
  });

  it("orders a cross-project tie by project key", () => {
    expect(
      sortedIdentifierList([
        { projectKey: "WEB", number: 4 },
        { projectKey: "API", number: 4 },
        { projectKey: "WEB", number: 2 },
      ]),
    ).toBe("WEB-2, API-4, WEB-4");
  });

  it("does not reorder the caller's array", () => {
    const issues = [{ projectKey: "MIN", number: 2 }, { projectKey: "MIN", number: 1 }];
    sortedIdentifierList(issues);
    expect(issues[0].number).toBe(2);
  });
});
