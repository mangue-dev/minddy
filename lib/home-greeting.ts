// The hello of welcome: not a fixed greeting, a breeding ground.
//
// “Hello, Clément Guérin” on the first visit is courteous; at the third it is
// furniture. The title of reception therefore draws from a pool which depends on
// LOCAL and current time — “it’s late” at 11 p.m., “new week” one
// Monday morning — and draw lots from what remains.
//
// The register is that of a colleague, not of a friend: the variety comes from this
// that the moment has truth to say, never a joke. A formula that we
// wouldn't write in a team message has nothing to do here.
//
// Two rules carry the file:
//
// 1. Each formula exists in two keys, with and without the name (`keyNoName`) —
// like the couple `greeting` / `greetingNoName` that she joins. The fishpond
// is therefore always full, whether we know the user name or not.
// 2. The range is calculated on LOCAL time, which the server does not know (it
// is in UTC). The draw is therefore driven by a seed that the caller does not
// install only AFTER editing — otherwise server rendering and hydration
// would choose two different sentences. See app/(app)/home/page.tsx.

import type { MessageKey } from "@/lib/i18n-keys";

export interface GreetingVariant {
  /** The formula, including the name. */
  key: MessageKey<"Home">;
  /** The same, without the name — when the account has none. */
  keyNoName: MessageKey<"Home">;
}

const pair = (
  key: MessageKey<"Home">,
  keyNoName: MessageKey<"Home">,
): GreetingVariant => ({ key, keyNoName });

/**
 * The ranges of the day, in local time.
 *
 * The night ends at midnight instead of entering it: "good evening" is right at 11 p.m. and
 * wrong at 3 a.m., and early morning only has two formulas because it doesn't not
 * three honest ones — better two just ones than three of which one rings hollow.
 */
const NIGHT: GreetingVariant[] = [
  pair("greetNightLate", "greetNightLateNoName"),
  pair("greetNightEnd", "greetNightEndNoName"),
];

const MORNING: GreetingVariant[] = [
  pair("greetMorning", "greetMorningNoName"),
  pair("greetMorningNewDay", "greetMorningNewDayNoName"),
  pair("greetMorningStart", "greetMorningStartNoName"),
];

const MIDDAY: GreetingVariant[] = [
  pair("greetMidday", "greetMiddayNoName"),
  pair("greetMiddayHalf", "greetMiddayHalfNoName"),
  pair("greetMiddayLunch", "greetMiddayLunchNoName"),
];

const AFTERNOON: GreetingVariant[] = [
  pair("greetAfternoon", "greetAfternoonNoName"),
  pair("greetAfternoonHello", "greetAfternoonHelloNoName"),
];

const EVENING: GreetingVariant[] = [
  pair("greetEvening", "greetEveningNoName"),
  pair("greetEveningEndOfDay", "greetEveningEndOfDayNoName"),
  pair("greetEveningHave", "greetEveningHaveNoName"),
];

/** What the day of the week adds to the pool of time — never what it
 replaces: a Saturday evening can say “good evening” as well as “good weekend”. */
const MONDAY = pair("greetMonday", "greetMondayNoName");
const FRIDAY = pair("greetFriday", "greetFridayNoName");
const WEEKEND = pair("greetWeekend", "greetWeekendNoName");

/** The time range of `hour` (0–23). */
function slotOf(hour: number): GreetingVariant[] {
  if (hour < 5) return NIGHT;
  if (hour < 12) return MORNING;
  if (hour < 14) return MIDDAY;
  if (hour < 18) return AFTERNOON;
  return EVENING;
}

/**
 * The breeding ground of the moment: the time slot, plus the extra of the day when it has
 * something to say.
 *
 * Monday only counts in the morning — “new week” at 7 p.m. is wrong — and
 * Friday stops announcing the weekend once in the evening came, where it is
 * already there.
 */
export function greetingPool(date: Date): GreetingVariant[] {
  const hour = date.getHours();
  const day = date.getDay();
  const slot = slotOf(hour);

  const pool = [...slot];
  if (day === 0 || day === 6) pool.push(WEEKEND);
  else if (day === 1 && slot === MORNING) pool.push(MONDAY);
  else if (day === 5 && (slot === MORNING || slot === MIDDAY || slot === AFTERNOON))
    pool.push(FRIDAY);

  return pool;
}

/**
 * A pool formula, driven by `seed`. Deterministic with equal seed: it is
 * which allows the caller to keep the same sentence as long as the page lives, and
 * to change it on the next reload.
 */
export function pickGreeting(date: Date, seed: number): GreetingVariant {
  const pool = greetingPool(date);
  return pool[Math.abs(Math.trunc(seed)) % pool.length];
}
