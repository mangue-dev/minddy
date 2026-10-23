import { describe, expect, it } from "vitest";
import { orderObjectives, recentIssueCounts } from "./objective-order";
import type { ObjectiveStatus } from "./objective-validation";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const objective = (id: string, name: string, status: ObjectiveStatus) => ({ id, name, status });
const issue = (objective_id: string | null, daysAgo: number) => ({
  objective_id,
  created_at: new Date(NOW - daysAgo * DAY).toISOString(),
});
const names = (list: { name: string }[]) => list.map((o) => o.name);

describe("orderObjectives", () => {
  it("puts open objectives before closed ones, whatever their activity", () => {
    const objectives = [
      objective("1", "Shipped", "done"),
      objective("2", "Planned", "planned"),
      objective("3", "Dropped", "canceled"),
      objective("4", "Running", "in_progress"),
    ];
    const issues = [issue("1", 1), issue("1", 2), issue("3", 1)];
    expect(names(orderObjectives(objectives, issues, NOW))).toEqual([
      "Planned",
      "Running",
      "Shipped",
      "Dropped",
    ]);
  });

  it("ranks each group by tickets created in the last 30 days", () => {
    const objectives = [
      objective("a", "Alpha", "in_progress"),
      objective("b", "Beta", "planned"),
      objective("c", "Gamma", "done"),
      objective("d", "Delta", "done"),
    ];
    const issues = [
      issue("b", 3),
      issue("b", 10),
      issue("a", 5),
      // Old tickets do not count, however many there are.
      issue("a", 45),
      issue("a", 60),
      issue("a", 90),
      issue("d", 2),
    ];
    expect(names(orderObjectives(objectives, issues, NOW))).toEqual([
      "Beta",
      "Alpha",
      "Delta",
      "Gamma",
    ]);
  });

  it("breaks ties by name, case-insensitively, then by id", () => {
    const objectives = [
      objective("2", "beta", "planned"),
      objective("3", "Alpha", "planned"),
      objective("1", "Beta", "planned"),
    ];
    expect(orderObjectives(objectives, [], NOW).map((o) => o.id)).toEqual(["3", "1", "2"]);
  });

  it("gives the same order for any input order", () => {
    const objectives = [
      objective("a", "Onboarding", "planned"),
      objective("b", "Billing", "in_progress"),
      objective("c", "Search", "done"),
      objective("d", "Mobile", "planned"),
      objective("e", "Archive", "canceled"),
    ];
    const issues = [issue("d", 1), issue("b", 1), issue("d", 4), issue("c", 2)];
    const expected = orderObjectives(objectives, issues, NOW).map((o) => o.id);
    const reversed = orderObjectives([...objectives].reverse(), [...issues].reverse(), NOW);
    expect(reversed.map((o) => o.id)).toEqual(expected);
    expect(expected).toEqual(["d", "b", "a", "c", "e"]);
  });

  it("leaves its input untouched", () => {
    const objectives = [objective("b", "B", "planned"), objective("a", "A", "planned")];
    orderObjectives(objectives, [], NOW);
    expect(names(objectives)).toEqual(["B", "A"]);
  });
});

describe("recentIssueCounts", () => {
  it("counts the window's last instant and skips tickets without objective", () => {
    const counts = recentIssueCounts(
      [issue("a", 30), issue("a", 30.01), issue(null, 1), { objective_id: "a", created_at: "invalid" }],
      NOW
    );
    expect(counts.get("a")).toBe(1);
    expect(counts.size).toBe(1);
  });
});
