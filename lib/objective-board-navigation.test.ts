import { describe, expect, it, vi } from "vitest";

import {
  objectiveBoardHref,
  pushObjectiveBoardHistory,
} from "./objective-board-navigation";

describe("objective board navigation", () => {
  it("builds an encoded canonical objective board URL", () => {
    expect(objectiveBoardHref("project/id", "objective?one")).toBe(
      "/projects/project%2Fid?objective=objective%3Fone",
    );
  });

  it("adds a browser history entry without invoking a route fetch", () => {
    const pushState = vi.fn();
    pushObjectiveBoardHistory("project-1", "objective-2", { pushState });

    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/projects/project-1?objective=objective-2",
    );
  });
});
