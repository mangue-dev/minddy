"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { CircleGauge } from "lucide-react";
import { getBillingPlan, type BillingPlanId } from "@/lib/billing-plans";

/**
 * A run stopped on an EXPENDITURE boundary, at the end of a round: its
 * work is pushed and its checkpoint guarded. This card ends the turn in the
 * thread and said what happened.
 *
 * **Two borders, two maps.** The monthly ACCOUNT budget dropped to zero
 * (`cause: "account"`) and the spending limit of a ROUTINE PASS
 * (`cause: "run_cap"`) stops at the same place in the code, but does not
 * do not respond at all: the first leaves three outcomes (wait, go up
 * plan, its own key), the second has only one — raise the ceiling of the
 * routine, in routine. Suggest an upgrade to someone whose budget
 * month is still almost whole would make him pay more for a problem
 * qu'il n'a pas.
 *
 * On the `account` path, it only shows the exits that exist
 * really :
 *  • un plan au-dessus, seulement s'il en existe un qui donne PLUS de budget ;
 * • its own API key, only if the user does not already have one;
 * • wait for reload — always true, so said last, in prose.
 * An action that cannot be taken is not an option, it is a wall.
 *
 * Usage is expressed in PERCENTAGE, never in dollars: the user has paid a
 * subscription in euros, the gross cost in USD is an internal mechanism which does not
 * never been shown elsewhere in the app (only the admin dashboard talks about it).
 * On the `account` path it is always 100%; on the other, it's the ceiling
 * itself, in the unit where it was settled.
 */
export function QuotaExhaustedCard({
  resetsAt,
  nextPlanId,
  byok,
  cause = "account",
  capPercent = null,
}: {
  /** ISO — end of window counted: when the budget recharges. */
  resetsAt: string | null;
  /** Plane immediately above, or null if already at the top. */
  nextPlanId: BillingPlanId | null;
  /** The user is already running on his own key (so the budget does not concern him). */
  byok: boolean;
  /** Which border has bitten. Absent = the count (the runs before the cap). */
  cause?: "account" | "run_cap";
  /** The ceiling of the passage, as a % of the monthly budget. */
  capPercent?: number | null;
}) {
  const t = useTranslations("Agent");
  const format = useFormatter();

  const resetDate = resetsAt ? new Date(resetsAt) : null;
  const resetLabel =
    resetDate && !Number.isNaN(resetDate.getTime())
      ? format.dateTime(resetDate, { day: "numeric", month: "long" })
      : null;

  /**
   * The PASSAGE ceiling: nothing to propose, everything to explain. The rest is resolved
   * on routine — and that's precisely where we're coming from to read this thread, so
   * no link to post.
   */
  if (cause === "run_cap") {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <CircleGauge className="size-4 shrink-0 text-muted-foreground" />
          {t("runCapTitle")}
        </div>
        <p className="mt-2 text-muted-foreground">
          {capPercent != null ? t("runCapReached", { percent: capPercent }) : null}{" "}
          {t("runCapWorkKept")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <CircleGauge className="size-4 shrink-0 text-muted-foreground" />
        {t("quotaTitle")}
      </div>

      <p className="mt-2 text-muted-foreground">
        {t("quotaWorkKept")}{" "}
        {resetLabel ? t("quotaResetsOn", { date: resetLabel }) : t("quotaResetsSoon")}
      </p>

      {(nextPlanId || !byok) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {nextPlanId ? (
            <Button asChild size="sm">
              <Link href="/billing">
                {t("quotaUpgrade", { plan: planLabel(nextPlanId) })}
              </Link>
            </Button>
          ) : null}
          {!byok ? (
            <Button asChild size="sm" variant="ghost">
              {/* On the tab, not on the page: “use my key” must
 fall on the key field, not on the profile (MIN-149). */}
              <Link href="/settings?tab=agent">{t("quotaUseOwnKey")}</Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Displayable name of a plan: its capitalized id (“go” → “Go”). */
function planLabel(id: BillingPlanId): string {
  const plan = getBillingPlan(id);
  return plan.id.charAt(0).toUpperCase() + plan.id.slice(1);
}
