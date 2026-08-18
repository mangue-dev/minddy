/**
 * The current cycle window, calculated EXACTLY like the application.
 *
 * Why this duplication: the cycle displayed is not the one we choose,
 * it is the one that the server deduces from today's date. `reconcileCycles`
 * (lib/server/cycles.ts) calculates the window containing “today” from
 * of the count cadence, then CREATE the line if it is missing. A seeded cycle
 * on other dates would therefore be stored in the past, and the screen would show a
 * freshly created empty cycle next to it.
 *
 * Important consequence: the frozen capture clock (`CAPTURE.frozenNow`)
 * only applies to BROWSER. The server runs at real time.
 * The cycle data is therefore dated relative to the current window,
 * recalculated each time the seed is executed — and they expire when the window
 * toggle. Rerunning 003 and 004 is enough to bring them up to date.
 *
 * Mirror `cycleStartOf` in lib/cycle.ts. Any discrepancy breaks the
 * attachment — this function and that of the app must remain the same.
 */

const DAY_MS = 86_400_000;

/** 1970-01-05 is a Monday: the anchor which fixes the parity of the fortnights. */
const EPOCH_MONDAY = "1970-01-05";

/**
 * Demo account cadence. Must match the metadata written on the
 * compte par 004-cycle.mjs (`cycle_duration_weeks`, `cycle_start_dow`), sinon
 * the application will recalculate another window than the one seeded.
 */
export const DEMO_CADENCE = { startDow: 1, durationWeeks: 2 };

const toUTC = (date) => Date.parse(`${date}T00:00:00.000Z`);
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date, days) => fromUTC(toUTC(date) + days * DAY_MS);
const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);

/** Today's date, REAL time — this is what the server will see. */
export function todayISO(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Start of the window containing `date`, for the given cadence. */
export function cycleStartOf(date, cadence = DEMO_CADENCE) {
  const anchor = addDays(EPOCH_MONDAY, cadence.startDow - 1);
  const periodDays = cadence.durationWeeks * 7;
  const elapsed = diffDays(anchor, date);
  return addDays(anchor, Math.floor(elapsed / periodDays) * periodDays);
}

/** The current window: `end` is EXCLUSIVE (= start of the next one). */
export function currentCycleWindow(cadence = DEMO_CADENCE, today = todayISO()) {
  const start = cycleStartOf(today, cadence);
  return {
    start,
    end: addDays(start, cadence.durationWeeks * 7),
    today,
    lengthDays: cadence.durationWeeks * 7,
  };
}

/**
 * A dated moment in the window: `dayOffset` days after its start, at
 * l'heure `hour` (UTC).
 *
 * Bounded twice: by the end of the window, so that no data falls out
 * outside the cycle it illustrates; and by TODAY, because a ticket created
 * or finished tomorrow would read “in 2 days” on the screen. Depending on when
 * the seed turns within a fortnight, several days therefore fall back on the
 * current day - this is intentional, it is better to compress than to date in the future.
 */
export function dayInWindow(window, dayOffset, hour = 10) {
  const clamped = Math.max(0, Math.min(dayOffset, elapsedDays(window)));
  const day = addDays(window.start, clamped);
  return `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

/** Days elapsed since the start of the window, without exceeding its end. */
export function elapsedDays(window) {
  return Math.max(0, Math.min(window.lengthDays - 1, diffDays(window.start, window.today)));
}

/**
 * An instant distributed PROPORTIONALLY in the already elapsed part of the
 * window: `fraction` 0 = its start, 1 = today.
 *
 * This is what the seeds use rather than a fixed day offset. A
 * fortnight sown on the 3rd day is only 3 days old: permanent offsets
 * would all crash to today, and all dates would display
 * “at the moment”. With a fraction, the data remains spread regardless of the
 * moment when the seed turns.
 */
export function spreadInWindow(window, fraction, hour = 10) {
  const span = elapsedDays(window);
  const clamped = Math.max(0, Math.min(1, fraction));
  return dayInWindow(window, Math.round(clamped * span), hour);
}
