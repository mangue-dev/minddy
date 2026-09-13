"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { CircleGauge } from "lucide-react";
import { getBillingPlan, type BillingPlanId } from "@/lib/billing-plans";

export interface NumoUsageExhaustedDetails {
  cause: "account" | "routine_cap";
  percent: number;
  resetsAt: string | null;
  nextPlanId: BillingPlanId | null;
  byok: boolean;
  routineId: string | null;
}

export function parseNumoUsageExhausted(
  metadata: Record<string, unknown>,
): NumoUsageExhaustedDetails | null {
  const raw = metadata.usage_exhausted;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.cause !== "account" && value.cause !== "routine_cap") return null;
  const percent = Number(value.percent);
  if (!Number.isFinite(percent) || percent < 0) return null;
  return {
    cause: value.cause,
    percent,
    resetsAt: typeof value.resetsAt === "string" ? value.resetsAt : null,
    nextPlanId:
      value.nextPlanId === "free" ||
      value.nextPlanId === "go" ||
      value.nextPlanId === "pro"
        ? value.nextPlanId
        : null,
    byok: value.byok === true,
    routineId: typeof value.routineId === "string" ? value.routineId : null,
  };
}

export function NumoUsageExhaustedCard({
  details,
}: {
  details: NumoUsageExhaustedDetails;
}) {
  const t = useTranslations("Assistant");
  const format = useFormatter();
  const reset = details.resetsAt ? new Date(details.resetsAt) : null;
  const resetLabel =
    reset && !Number.isNaN(reset.getTime())
      ? format.dateTime(reset, { day: "numeric", month: "long" })
      : null;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <CircleGauge className="size-4 shrink-0 text-muted-foreground" />
        {details.cause === "routine_cap"
          ? t("usageRoutineTitle", { percent: details.percent })
          : t("usageAccountTitle", { percent: details.percent })}
      </div>
      <p className="mt-2 text-muted-foreground">
        {details.cause === "routine_cap"
          ? t("usageRoutineBody")
          : resetLabel
            ? t("usageAccountResetsOn", { date: resetLabel })
            : t("usageAccountResetsSoon")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {details.cause === "routine_cap" ? (
          <Button asChild size="sm" variant="ghost">
            <Link href="/routines">{t("usageManageRoutine")}</Link>
          </Button>
        ) : (
          <>
            {details.nextPlanId ? (
              <Button asChild size="sm">
                <Link href="/billing">
                  {t("usageUpgrade", {
                    plan: getBillingPlan(details.nextPlanId).id.replace(
                      /^./,
                      (c) => c.toUpperCase(),
                    ),
                  })}
                </Link>
              </Button>
            ) : null}
            {!details.byok ? (
              <Button asChild size="sm" variant="ghost">
                <Link href="/settings?tab=agent">{t("usageUseOwnKey")}</Link>
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
