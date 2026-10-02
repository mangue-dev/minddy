import { describe, expect, it } from "vitest";
import {
  consumedDeepLinkHref,
  deepLinkLensDecision,
  deepLinkNeedsAllFilter,
  isTerminalPrState,
} from "./sidebar-deep-link";

type Item = { id: string; state: "open" | "closed" };

const isTarget = (item: Item) => item.id === "target";
const isOpen = (item: Item) => item.state === "open";

describe("secondary sidebar deep links", () => {
  it("keeps the current filter when the selected item is already visible", () => {
    expect(
      deepLinkNeedsAllFilter([{ id: "target", state: "open" }], isTarget, isOpen),
    ).toBe(false);
  });

  it("widens the filter when the selected item is excluded", () => {
    expect(
      deepLinkNeedsAllFilter([{ id: "target", state: "closed" }], isTarget, isOpen),
    ).toBe(true);
  });

  it("waits for a missing selected item instead of changing the filter", () => {
    expect(deepLinkNeedsAllFilter([], isTarget, isOpen)).toBe(false);
  });

  it("decides 'pending' while the target has not arrived", () => {
    expect(deepLinkLensDecision([], isTarget, isOpen)).toBe("pending");
  });

  it("decides 'settled' once the target is visible in the lens", () => {
    expect(
      deepLinkLensDecision([{ id: "target", state: "open" }], isTarget, isOpen),
    ).toBe("settled");
  });

  it("decides 'widen' when the resolved target sits outside the lens", () => {
    expect(
      deepLinkLensDecision([{ id: "target", state: "closed" }], isTarget, isOpen),
    ).toBe("widen");
  });

  it("treats merged and closed PRs as the end of a deep link's job", () => {
    expect(isTerminalPrState("merged")).toBe(true);
    expect(isTerminalPrState("closed")).toBe(true);
    expect(isTerminalPrState("open")).toBe(false);
    expect(isTerminalPrState("draft")).toBe(false);
  });

  it("strips the deep-link params from the address, keeping the rest", () => {
    expect(consumedDeepLinkHref("/pull-requests", "?pr=pr-1")).toBe("/pull-requests");
    expect(consumedDeepLinkHref("/pull-requests", "?run=run-1")).toBe("/pull-requests");
    expect(
      consumedDeepLinkHref("/pull-requests", "?pr=pr-1&connected=git"),
    ).toBe("/pull-requests?connected=git");
    expect(consumedDeepLinkHref("/pull-requests", "")).toBe("/pull-requests");
  });
});
