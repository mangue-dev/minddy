import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SMART_FILL_REVEAL_EXPIRY_MS,
  beginSmartFillReveal,
  cardShowsLandedRow,
  endSmartFillReveal,
  getSmartFillReveal,
  landSmartFillReveal,
} from "./smart-fill-reveal";
import type { Issue } from "./types";

const placeholder = { id: "card", title: "Export fails" } as Issue;
const filled = { id: "card", title: "PDF export fails past 40 pages" } as Issue;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  endSmartFillReveal("card");
  vi.useRealTimers();
});

describe("Smart Fill reveal store", () => {
  it("holds the placeholder while filling, then reveals once the row lands", () => {
    beginSmartFillReveal(placeholder, "Export fails on long reports");
    const description = "Export fails on long reports";
    expect(getSmartFillReveal("card")).toEqual({ phase: "filling", placeholder, description });
    landSmartFillReveal(filled);
    expect(getSmartFillReveal("card")).toEqual({ phase: "revealing", placeholder, description, landed: filled });
  });

  it("clears a landed entry whose card never played it", () => {
    beginSmartFillReveal(placeholder);
    landSmartFillReveal(filled);
    vi.advanceTimersByTime(SMART_FILL_REVEAL_EXPIRY_MS - 1);
    expect(getSmartFillReveal("card")).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(getSmartFillReveal("card")).toBeUndefined();
  });

  it("never expires a card that is still filling", () => {
    beginSmartFillReveal(placeholder);
    vi.advanceTimersByTime(SMART_FILL_REVEAL_EXPIRY_MS * 10);
    expect(getSmartFillReveal("card")?.phase).toBe("filling");
  });

  it("ignores a landing for a card it does not hold", () => {
    landSmartFillReveal(filled);
    expect(getSmartFillReveal("card")).toBeUndefined();
  });
});

describe("cardShowsLandedRow", () => {
  const landed = {
    id: "card",
    number: 7,
    title: "PDF export fails past 40 pages",
    priority: "high",
    effort: "m",
    objective_id: null,
    assignee_id: "tom",
    category_ids: ["bug", "export"],
  } as unknown as Issue;

  it("matches once the card renders the landed row, in any category order", () => {
    expect(cardShowsLandedRow({ ...landed, category_ids: ["export", "bug"] }, landed)).toBe(true);
  });

  it.each([
    ["the title", { title: "Export fails" }],
    ["the estimated number", { number: 6 }],
    ["the priority", { priority: "none" }],
    ["the effort", { effort: null }],
    ["the assignee", { assignee_id: null }],
    ["a category", { category_ids: ["bug"] }],
  ])("waits while %s is still the placeholder's", (_field, stale) => {
    expect(cardShowsLandedRow({ ...landed, ...stale } as Issue, landed)).toBe(false);
  });
});
