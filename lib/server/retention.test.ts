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

  it("traverse les changements de mois et d'année", () => {
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
    ["readNotifications", 180, "notifications lues : 6 mois"],
    ["pendingInvitations", 90, "invitations en attente : 90 jours"],
    ["agentRunTrace", 30, "traces des runs d'agent : 30 jours après la fin"],
    ["stripeWebhookPayload", 90, "charge utile des webhooks Stripe : 90 jours"],
    ["trash", 30, "corbeille : 30 jours avant suppression définitive"],
    [
      "dormantFeedbackIdentities",
      90,
      "participants de board sans contribution : 90 jours",
    ],
    [
      "orphanAttachments",
      7,
      "objets téléversés puis jamais rattachés : 7 jours de grâce (MIN-348)",
    ],
  ] as const)("%s vaut %i jours — %s", (key, days, _promise) => {
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
