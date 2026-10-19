import { afterEach, describe, expect, it, vi } from "vitest";
import { queueSettingsSectionFocus, takeSettingsSectionFocus } from "./settings-section-focus";

describe("settings section hand-off to a new tab", () => {
  afterEach(() => {
    vi.useRealTimers();
    takeSettingsSectionFocus();
  });

  it("hands the queued section over exactly once", () => {
    queueSettingsSectionFocus("/settings?tab=smart-fill&section=account-issue-indexing");
    expect(takeSettingsSectionFocus()).toBe("account-issue-indexing");
    expect(takeSettingsSectionFocus()).toBeNull();
  });

  it("clears the queue for a destination without a section", () => {
    queueSettingsSectionFocus("/settings?section=account-theme");
    queueSettingsSectionFocus("/home");
    expect(takeSettingsSectionFocus()).toBeNull();
  });

  it("drops a section that no settings screen took in time", () => {
    vi.useFakeTimers();
    queueSettingsSectionFocus("/settings?section=account-theme");
    vi.advanceTimersByTime(16_000);
    expect(takeSettingsSectionFocus()).toBeNull();
  });
});
