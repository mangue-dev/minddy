import { describe, expect, it } from "vitest";

import { isOfferedProject } from "./use-offered-projects";

describe("isOfferedProject (MIN-751)", () => {
  const hidden = new Set(["h"]);

  it("offers every project I did not hide", () => {
    expect(isOfferedProject("a", hidden)).toBe(true);
    expect(isOfferedProject("a", new Set())).toBe(true);
  });

  it("never offers a hidden project, unless it is the one on screen", () => {
    expect(isOfferedProject("h", hidden)).toBe(false);
    expect(isOfferedProject("h", hidden, ["a", null])).toBe(false);
    expect(isOfferedProject("h", hidden, [null, "h"])).toBe(true);
  });
});
