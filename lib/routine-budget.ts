/**
 * The SPENDING CEILING of a routine passage — the setting, shared between the
 * server (which validates it and makes it enforceable) and the screen (which suggests it).
 *
 * It is expressed as a PERCENTAGE of the plan's monthly usage budget, never en
 * dollars: this is the unit in which the usage is read everywhere in minddy (the
 * header bar, the billing page, the exhausted budget card), the only
 * that the user has ever seen — and the only one that FOLLOWS the plan, without anything to
 * recalculate the day on which the subscription change.
 *
 * This module does not depend on anything: it is imported on the server side (`lib/server/routines.ts`)
 * as well as on the browser side (the wizard, the detail pane editor, the usual tracking
 *). A fault copied from both sides would have ended up diverging.
 */

/**
 * What a passage can spend by default: 15% of the month's budget.
 *
 * The default protects the MONTH, not just the worst passage. A routine starts
 * all by itself, several times a month, without anyone looking at its usual bar
 *: what counts is therefore not that an isolated passage stops before the
 * end of the budget, it is that a weekly routine lasts its month and leaves
 * the essentials to the work by hand. At 15%, six passages fit within the
 * budget; at 90%, just one was enough to take everything — and it happened.
 *
 * It comes together, routine by routine, when you know which one deserves to go further
 * further. This is the direction of action: a low ceiling by default is raised upon
 * decision, where a high ceiling is only lowered after the invoice.
 */
export const DEFAULT_MAX_SPEND_PERCENT = 15;

/** 100% = no specific ceiling: only the account quota limits the passage. */
export const NO_SPEND_CAP_PERCENT = 100;

/**
 * The levels proposed on the screen. A free field would require choosing an exact number where no one has an opinion to the nearest percent; these five
 * cover real intentions — “one daily routine among others”
 * (5%), default, “this one counts” (25%), “half my month”
 * (50%), and “no cap”.
 */
export const SPEND_CAP_CHOICES = [5, DEFAULT_MAX_SPEND_PERCENT, 25, 50, NO_SPEND_CAP_PERCENT];

/**
 * The ceiling returned to its limits (1–100, integer). An absurd value is worth the
 * default rather than a refusal: the CHECK of the base would not forgive, and
 * a routine must not refuse on a percentage poorly written by one of the
 * four doors.
 */
export function clampSpendPercent(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : NaN;
  if (Number.isNaN(n)) return DEFAULT_MAX_SPEND_PERCENT;
  return Math.min(100, Math.max(1, n));
}
