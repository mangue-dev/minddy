import { describe, expect, it } from "vitest";
import { pageLinkTarget } from "@/lib/page-link";

const ORIGIN = "https://www.minddy.app";

describe("pageLinkTarget", () => {
  it("recognizes a relative and a same-origin page address", () => {
    expect(pageLinkTarget("/projects/p1/pages/pg1")).toEqual({ projectId: "p1", pageId: "pg1" });
    expect(pageLinkTarget(`${ORIGIN}/projects/p1/pages/pg1`, ORIGIN)).toEqual({
      projectId: "p1",
      pageId: "pg1",
    });
  });

  it("leaves another origin, a block anchor and the database preview to navigate", () => {
    expect(pageLinkTarget("https://example.com/projects/p1/pages/pg1", ORIGIN)).toBeNull();
    expect(pageLinkTarget(`${ORIGIN}/projects/p1/pages/pg1`)).toBeNull();
    expect(pageLinkTarget("//example.com/projects/p1/pages/pg1", ORIGIN)).toBeNull();
    expect(pageLinkTarget("/projects/p1/pages/pg1#block-1")).toBeNull();
    expect(pageLinkTarget("/projects/p1/pages/db?entry=pg1")).toBeNull();
  });

  it("ignores what is not a single page", () => {
    expect(pageLinkTarget(null)).toBeNull();
    expect(pageLinkTarget("/projects/p1/pages")).toBeNull();
    expect(pageLinkTarget("/projects/p1/pages/trash")).toBeNull();
    expect(pageLinkTarget("/projects/p1/pages/pg1/history")).toBeNull();
    expect(pageLinkTarget("/projects/p1?issue=i1")).toBeNull();
  });
});
