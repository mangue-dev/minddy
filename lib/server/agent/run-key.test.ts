import { describe, expect, it } from "vitest";

import { runKeyCapUsd } from "./run-key";

/**
 * The ceiling of the run key holds TWO budgets which do not have the same status.
 *
 * The one of the RUN is a governor: the loop stops there by saying it, and the
 * key doubles it by a margin so that it is always our message that
 * the user read, never a 402 from API.
 *
 * The ACCOUNT one is a HARD cap. It does not multiply: beyond that, we would
 * spend money that does not exist. This is what the old version granted —
 * it multiplied the `min` of the two, including the floor, so that a user
 * with $3 left and no run budget (the COMMON case) received a $4.50 key.
 */

describe("runKeyCapUsd", () => {
  it("sans budget de run, la clé vaut EXACTEMENT ce qui reste au compte", () => {
    // The common case — a hand-launched run has no `budget_usd`. The margin
    // has nothing to bite here: this remainder is the included budget of the plan, not a
    // user instructions that could be exceeded by a hair.
    expect(runKeyCapUsd({ accountRemainingUsd: 3 })).toBe(3);
    expect(runKeyCapUsd({ accountRemainingUsd: 0.4 })).toBe(0.4);
  });

  it("prend le plus serré des deux, et le compte a le DERNIER mot", () => {
    // The account has $10, the run $2: this is the budget for the run which limits, margin included.
    expect(runKeyCapUsd({ runBudgetUsd: 2, accountRemainingUsd: 10 })).toBe(3);
    // The opposite: the margin of the run cannot exceed what the account still has.
    // (old version made $3 here, for $2 actually available)
    expect(runKeyCapUsd({ runBudgetUsd: 10, accountRemainingUsd: 2 })).toBe(2);
  });

  it("déduit ce que le run a déjà dépensé", () => {
    // A cap that does not deduct would recharge each time.
    expect(runKeyCapUsd({ runBudgetUsd: 2, runSpentUsd: 1.5 })).toBe(0.75);
  });

  it("le plancher couvre le round qui déborde — mais jamais au-delà du compte", () => {
    // Run budget exhausted, the account still has money: the floor avoids a key
    // dead, and therefore an unreadable 402 where the loop can say “budget reached”.
    expect(runKeyCapUsd({ runBudgetUsd: 2, runSpentUsd: 2, accountRemainingUsd: 5 })).toBe(0.25);
    // Dry account: the floor does not apply. A $0 key is the result
    // FAIR — the loop, which opposes the same remainder to its expenditure, will not call for
    // anyway not the model (`budget_exhausted` before the first round).
    expect(runKeyCapUsd({ runBudgetUsd: 0, accountRemainingUsd: 0 })).toBe(0);
    expect(runKeyCapUsd({ accountRemainingUsd: 0.1 })).toBe(0.1);
  });

  it("laisse une marge au-dessus du budget DU RUN : c'est la boucle qui arrête", () => {
    const budget = 4;
    expect(runKeyCapUsd({ runBudgetUsd: budget })).toBeGreaterThan(budget);
  });

  it("reste borné quand le restant du compte est inconnu (quota injoignable)", () => {
    // The loop is then also without a ceiling: this key is the only safeguard
    // of the passage. We do NOT make infinity — that's what this module exists for
    // avoid — but enough for an ordinary run ($0.07 to $0.24) to succeed.
    const cap = runKeyCapUsd({});
    expect(Number.isFinite(cap)).toBe(true);
    expect(cap).toBeGreaterThan(0.25);
  });
});
