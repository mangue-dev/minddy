import { describe, expect, it } from "vitest";

import { RETENTION_DAYS, cutoff } from "./retention";
import { TRASH_RETENTION_DAYS } from "../trash-retention";

/**
 * MIN-119 — retention periods.
 *
 * What these tests protect is not arithmetic (it is trivial) but
 * the CONTRACT: the confidentiality policy announces durations to the public, and
 * `RETENTION_DAYS` is what enforces them. A value that moves here without the
 * policy moving, it's a promise that we no longer keep - so the values
 * themselves are frozen by a test, with the public sentence next to it.
 */

const NOW = new Date("2026-07-30T12:00:00.000Z");

describe("cutoff", () => {
  it("moves back by the requested number of days", () => {
    expect(cutoff(30, NOW)).toBe("2026-06-30T12:00:00.000Z");
  });

  it("crosses month and year boundaries", () => {
    expect(cutoff(365, new Date("2026-01-15T00:00:00.000Z"))).toBe(
      "2025-01-15T00:00:00.000Z"
    );
  });

  it("returns today's date for zero days", () => {
    expect(cutoff(0, NOW)).toBe(NOW.toISOString());
  });
});

describe("RETENTION_DAYS", () => {
  // Each line: the value, and what the privacy policy says about it.
  it.each([
    ["readNotifications", 180, "read notifications: 6 months"],
    ["pendingInvitations", 30, "pending invitations: 30 days"],
    ["agentRunTrace", 30, "agent run traces: 30 days after completion"],
    ["stripeWebhookPayload", 90, "Stripe webhook payloads: 90 days"],
    ["trash", 30, "trash: 30 days before permanent deletion"],
    [
      "dormantFeedbackIdentities",
      90,
      "board participants without contributions: 90 days",
    ],
    [
      "orphanAttachments",
      7,
      "uploaded objects never attached: 7-day grace period (MIN-348)",
    ],
  ] as const)("%s has %i days of retention — %s", (key, days, _promise) => {
    expect(RETENTION_DAYS[key]).toBe(days);
  });

  // The duration displayed on each line of the trash and that applied by the
  // night scan are the SAME constant. If the two got back together
  // live separately, the screen would promise a deadline that the cron would not meet.
  it("the trash applies the duration announced by the screen", () => {
    expect(RETENTION_DAYS.trash).toBe(TRASH_RETENTION_DAYS);
  });

  it("keeps nothing indefinitely or retroactively", () => {
    for (const days of Object.values(RETENTION_DAYS)) {
      expect(days).toBeGreaterThan(0);
      expect(Number.isFinite(days)).toBe(true);
    }
  });
});
