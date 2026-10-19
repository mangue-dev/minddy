// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityHeatmap } from "@/components/stats/activity-heatmap";
import type { HeatmapDay, StatsHeatmap } from "@/lib/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/en.json";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

/** 53 weeks from a Sunday, one completion on the very last day. */
function heatmap(): StatsHeatmap {
  const days: HeatmapDay[] = [];
  const start = Date.UTC(2025, 9, 12); // a Sunday
  for (let i = 0; i < 53 * 7; i++) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    days.push({ date, count: 0, issues: 0, tasks: 0 });
  }
  days[days.length - 1] = { ...days[days.length - 1], count: 1, issues: 1 };
  return {
    tz: "UTC",
    start: days[0].date,
    end: days[days.length - 1].date,
    max: 1,
    days,
  } as StatsHeatmap;
}

describe("ActivityHeatmap", () => {
  let container: HTMLDivElement;
  let root: Root;
  let width = 0;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // jsdom has no layout: give the measured box the width under test.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function render(boxWidth: number) {
    width = boxWidth;
    const data = heatmap();
    await act(async () => {
      root.render(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement(TooltipProvider, null, createElement(ActivityHeatmap, { heatmap: data })),
        }),
      );
    });
    return data;
  }

  const cells = () => [...container.querySelectorAll<HTMLElement>("[data-day-index]")];

  it("keeps only the most recent whole weeks that fit, ending on today", async () => {
    // 12px of label room, then 10 columns of 16px minus the last 4px gutter.
    const data = await render(12 + 10 * 16 - 4);
    const shown = cells();
    expect(shown).toHaveLength(10 * 7);
    expect(shown.at(-1)?.getAttribute("aria-label")).toContain("1 issue");
    expect(shown.at(-1)?.getAttribute("aria-label")).toContain(
      new Date(`${data.end}T00:00:00Z`).getUTCFullYear().toString(),
    );
  });

  it("shows the whole year when it fits", async () => {
    await render(2000);
    expect(cells()).toHaveLength(53 * 7);
  });
});
