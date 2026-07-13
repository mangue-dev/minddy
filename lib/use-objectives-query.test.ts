import { describe, expect, it } from "vitest";
import { objectiveProgress } from "./use-objectives-query";
import type { IssueEffort } from "./issue-constants";

type LinkedIssue = {
  objective_id: string | null;
  status: string;
  effort?: IssueEffort | null;
};

const issue = (
  status: string,
  effort: IssueEffort | null,
  objective_id: string | null = "obj"
): LinkedIssue => ({ objective_id, status, effort });

describe("objectiveProgress", () => {
  it("weights percent by effort points, not issue count", () => {
    // An XL (8pts) done next to an XS (1pt) left is 8/9 of the work, not 1/2.
    const { percent } = objectiveProgress("obj", [
      issue("done", "xl"),
      issue("todo", "xs"),
    ]);
    expect(percent).toBe(89);
  });

  it("keeps done/total as raw issue counts, independent of effort", () => {
    const { done, total } = objectiveProgress("obj", [
      issue("done", "xl"),
      issue("todo", "xs"),
      issue("in_progress", "m"),
    ]);
    expect(done).toBe(1);
    expect(total).toBe(3);
  });

  it("grants partial effort credit for in-flight statuses", () => {
    // in_progress = 10%, in_review = 50% of the issue's points.
    expect(objectiveProgress("obj", [issue("in_progress", "m")]).percent).toBe(10);
    expect(objectiveProgress("obj", [issue("in_review", "m")]).percent).toBe(50);
  });

  it("counts an unsized issue as a medium (3 points)", () => {
    // null-effort done (3pts) + XS todo (1pt): 3/4 = 75%, whereas a raw count
    // would read 50%.
    const { percent } = objectiveProgress("obj", [
      issue("done", null),
      issue("todo", "xs"),
    ]);
    expect(percent).toBe(75);
  });

  it("returns 0/0 and 0% when nothing is linked", () => {
    expect(objectiveProgress("obj", [issue("done", "xl", "other")])).toEqual({
      done: 0,
      total: 0,
      percent: 0,
    });
  });

  it("ignores issues linked to other objectives", () => {
    const { done, total, percent } = objectiveProgress("obj", [
      issue("done", "l"),
      issue("todo", "l", "other"),
    ]);
    expect({ done, total, percent }).toEqual({ done: 1, total: 1, percent: 100 });
  });
});
