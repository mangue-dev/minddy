import { describe, expect, it, vi } from "vitest";

import { buildOptimisticPage } from "./optimistic-page";
import {
  isPreparedPageData,
  PAGE_NAVIGATION_FRESH_MS,
  preparePageNavigation,
} from "./use-pages-query";

describe("optimistic page creation", () => {
  it("uses the client identity and appends the page to its sibling group", () => {
    const now = new Date("2026-09-02T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const page = buildOptimisticPage(
      "project-1",
      {
        id: "11111111-1111-4111-8111-111111111111",
        parent_id: "parent-1",
        title: "Draft",
      },
      [
        { parent_id: null, position: "a0" },
        { parent_id: "parent-1", position: "a0" },
      ],
    );

    expect(page).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      project_id: "project-1",
      parent_id: "parent-1",
      title: "Draft",
      version: 1,
      content: { type: "doc", content: [] },
      created_at: now.toISOString(),
    });
    expect(page.position > "a0").toBe(true);

    vi.useRealTimers();
  });
});

describe("page navigation freshness", () => {
  it("accepts only a short-lived prefetch as the document basis", () => {
    const now = 10_000_000;
    preparePageNavigation("page-1", now);

    expect(
      isPreparedPageData("page-1", now - PAGE_NAVIGATION_FRESH_MS, now),
    ).toBe(true);
    expect(isPreparedPageData("other-page", now, now)).toBe(false);
    expect(
      isPreparedPageData("page-1", now, now + PAGE_NAVIGATION_FRESH_MS + 1),
    ).toBe(false);
  });
});
