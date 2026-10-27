import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PALETTE_NONE,
  assigneeOptions,
  categoryOptions,
  effortOptions,
  objectiveOptions,
  priorityOptions,
  toggleCategory,
} from "./command-palette-options";
import type { Member } from "@/lib/types";

const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("palette field options (MIN-820)", () => {
  it("opens the effort scale on a dimmed Not set, every rung with the triangle", () => {
    const options = effortOptions("Not set", { current: "m" });
    expect(options.map((o) => o.value)).toEqual([PALETTE_NONE, "xs", "s", "m", "l", "xl"]);
    expect(options[0].label).toBe("Not set");
    expect(options.every((o) => html(o.icon).includes("<svg"))).toBe(true);
    expect(html(options[0].icon)).toContain("opacity-60");
    expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual(["m"]);
  });

  it("marks Not set when the ticket has no effort, and nothing in bulk", () => {
    expect(effortOptions("Not set", { current: null })[0].selected).toBe(true);
    expect(effortOptions("Not set").some((o) => o.selected)).toBe(false);
  });

  it("offers priority from Not set upwards, each with its indicator", () => {
    const options = priorityOptions((p) => p, { current: "none" });
    expect(options.map((o) => o.value)).toEqual(["none", "low", "medium", "high", "urgent"]);
    expect(options.every((o) => html(o.icon).includes("<svg"))).toBe(true);
    expect(options[0].selected).toBe(true);
  });

  it("renders objectives as their colored pill in the given order, name kept for search", () => {
    const options = objectiveOptions(
      [
        { id: "b", name: "Beta", color: "teal", status: "in_progress" },
        { id: "a", name: "Alpha", color: null, status: "planned" },
      ],
      "No objective",
      { current: "a" }
    );
    expect(options.map((o) => o.value)).toEqual([PALETTE_NONE, "b", "a"]);
    expect(options[1].label).toBe("Beta");
    const pill = html(options[1].labelNode);
    expect(pill).toContain("data-objective-pill");
    expect(pill).toContain("<svg");
    expect(options[2].selected).toBe(true);
    expect(options[0].labelNode).toBeUndefined();
  });

  it("gives members their avatar and the clear option the Smart Assign glyph", () => {
    const member = { user_id: "u1", display_name: "Camille", avatar_seed: "s" } as unknown as Member;
    const smart = assigneeOptions([member], { label: "Smart Assign", smartAssign: true }, { current: "u1" });
    expect(html(smart[0].icon)).toContain("<svg");
    expect(smart[1].icon).toBeTruthy();
    expect(smart[1].selected).toBe(true);
    expect(assigneeOptions([member], { label: "Unassigned" })[0].icon).toBeUndefined();
  });

  it("keeps categories in settings order with their color dot, marking the ticket's own", () => {
    const options = categoryOptions(
      [
        { id: "c2", name: "Bug", color: "#ff0000" },
        { id: "c1", name: "Feature", color: "#00ff00" },
      ],
      ["c1"]
    );
    expect(options.map((o) => o.label)).toEqual(["Bug", "Feature"]);
    expect(html(options[0].icon)).toContain("background-color:#ff0000");
    expect(options.map((o) => o.selected)).toEqual([false, true]);
  });

  it("toggles one category in or out of the ticket's set", () => {
    expect(toggleCategory(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleCategory(["a", "b"], "a")).toEqual(["b"]);
  });
});
