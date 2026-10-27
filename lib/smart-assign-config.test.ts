import { describe, expect, it } from "vitest";
import { smartAssignFillsEmptyAssignee } from "./smart-assign-config";

describe("smartAssignFillsEmptyAssignee (MIN-811)", () => {
  it("names Smart Assign for a live issue of an opted-in project, triage included", () => {
    expect(smartAssignFillsEmptyAssignee(true, "todo")).toBe(true);
    expect(smartAssignFillsEmptyAssignee(true, "triage")).toBe(true);
  });

  it("keeps Unassigned when the toggle is off or unknown", () => {
    expect(smartAssignFillsEmptyAssignee(false, "todo")).toBe(false);
    expect(smartAssignFillsEmptyAssignee(undefined, "todo")).toBe(false);
  });

  it("keeps Unassigned for issues Smart Assign never assigns", () => {
    expect(smartAssignFillsEmptyAssignee(true, "canceled")).toBe(false);
    expect(smartAssignFillsEmptyAssignee(true, "duplicate")).toBe(false);
  });
});
