// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IssuePriority } from "@/lib/issue-constants";
import { PriorityIndicator } from "./issue-indicators";

function render(priority: IssuePriority) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<PriorityIndicator priority={priority} />);
  return [...host.querySelectorAll("rect")];
}

describe("PriorityIndicator", () => {
  it.each([
    ["none", 0, ""],
    ["low", 1, "#1DD82C"],
    ["medium", 2, "#FADB28"],
    ["high", 3, "#FA8028"],
  ] as const)("draws %s as three rising bars with %i filled", (priority, filled, color) => {
    const bars = render(priority);
    expect(bars).toHaveLength(3);

    const heights = bars.map((bar) => Number(bar.getAttribute("height")));
    expect(heights[0]).toBeLessThan(heights[1]);
    expect(heights[1]).toBeLessThan(heights[2]);
    // Bottom-aligned: every bar ends on the same baseline.
    const bottoms = bars.map((bar, i) => Number(bar.getAttribute("y")) + heights[i]);
    expect(new Set(bottoms).size).toBe(1);

    // The filled bars are the shortest ones, from the left.
    const fills = bars.map((bar) => bar.getAttribute("fill"));
    expect(fills).toEqual([0, 1, 2].map((i) => (i < filled ? color : null)));
  });

  it("keeps urgent as a red square with an exclamation mark", () => {
    const [square] = render("urgent");
    expect(square.getAttribute("width")).toBe("14");
    expect(square.getAttribute("height")).toBe("14");
    expect(square.getAttribute("fill")).toBe("#FA2828");
  });
});
