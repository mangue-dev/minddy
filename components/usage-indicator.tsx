"use client";

import { useCallback, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  Gauge,
  Info,
  Loader2,
  Megaphone,
  Mic,
  WandSparkles,
} from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  cn,
} from "mangue-ui";
import {
  USAGE_SEGMENTS,
  type BillingPlanId,
  type UsageSegmentId,
} from "@/lib/billing-plans";
import {
  roundRemainingPercent,
  useBillingSummary,
} from "@/lib/use-billing-query";
import { createCheckoutApi, createPortalApi } from "@/lib/billing-api";
import { NumoIcon } from "@/components/numo-icon";

/**
 * Plan usage (MIN-72) — header pad + popover: unified budget bar
 * whose usage types tile consecutive segments; hover
 * a detail line lights the segment of this type IN PLACE, in its color
 * (mechanism taken from AutoKap credits-panel). The body (`UsageBreakdownBody`)
 * is shared as is with the billing tab of the settings.
 */

// Numo in line icon: frozen face, aligned with the size of the lucid icons.
// Its strokes are intrinsic to the drawing — strokeWidth deliberately ignored.
function NumoRowIcon({ className }: { className?: string; strokeWidth?: number }) {
  return <NumoIcon animated={false} className={className} />;
}

export const SEGMENT_UI: Record<
  UsageSegmentId,
  {
    icon: ComponentType<{ className?: string; strokeWidth?: number }>;
    text: string;
    labelKey:
      | "segmentAgents"
      | "segmentRoutines"
      | "segmentNumo"
      | "segmentDictation"
      | "segmentFeedback"
      | "segmentAutomations";
  }
> = {
  agents: { icon: Bot, text: "text-violet-600 dark:text-violet-400", labelKey: "segmentAgents" },
  // The routines (MIN-185), just after the agents: same engine, other line
  // bill — a subscription that we left running, not a gesture that we made.
  routines: { icon: CalendarClock, text: "text-sky-600 dark:text-sky-400", labelKey: "segmentRoutines" },
  numo: { icon: NumoRowIcon, text: "text-blue-600 dark:text-blue-400", labelKey: "segmentNumo" },
  dictation: { icon: Mic, text: "text-amber-600 dark:text-amber-400", labelKey: "segmentDictation" },
  feedback: { icon: Megaphone, text: "text-emerald-600 dark:text-emerald-400", labelKey: "segmentFeedback" },
  // What minddy fills out for you when the ticket is born: who takes it
  // (Smart Assign) and what it is (Smart-fill). WandSparkles — the Smart icon
  // Assign in the project settings, and that of Smart-fill in the
  // create form.
  automations: { icon: WandSparkles, text: "text-fuchsia-600 dark:text-fuchsia-400", labelKey: "segmentAutomations" },
};

const PLAN_LABEL_KEYS: Record<BillingPlanId, "planFree" | "planGo" | "planPro"> = {
  free: "planFree",
  go: "planGo",
  pro: "planPro",
};

export function UsageIndicator() {
  const t = useTranslations("Billing");
  const { loading, remainingPercent, state, usage } = useBillingSummary();
  const [open, setOpen] = useState(false);

  if (!loading && !usage?.managedAi) return null;

  const stateClass =
    state === "exhausted" || state === "low"
      ? "text-destructive hover:text-destructive"
      : state === "warning"
        ? "text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-400"
        : "text-muted-foreground hover:text-foreground";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("usageAria")}
          className={cn(
            "h-8 gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-medium tabular-nums shadow-none hover:bg-card",
            stateClass
          )}
        >
          <Gauge className="size-[15px]" strokeWidth={2} />
          {loading
            ? "…"
            : t("usagePercent", { percent: roundRemainingPercent(remainingPercent) })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <UsageBreakdownBody />
        <UsageFooter onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Header (% REMAINING + plan chip), gauge which empties when hovered by type,
 * reset date and detail lines. Standalone (reads `useBillingSummary`) —
 * the caller owns the shell (popover or card).
 *
 * @param bordered Separates blocks by high borders (card settings);
 * omitted for popover.
 */
export function UsageBreakdownBody({ bordered = false }: { bordered?: boolean }) {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const {
    loading,
    planId,
    includedUsd,
    remainingPercent,
    state,
    segments,
    nextResetAt,
  } = useBillingSummary();

  const [hoveredId, setHoveredId] = useState<UsageSegmentId | null>(null);

  const rows = USAGE_SEGMENTS.map((segment) => ({
    id: segment.id,
    barClass: segment.barClass,
    usd: segments.find((s) => s.id === segment.id)?.usd ?? 0,
    ...SEGMENT_UI[segment.id],
  }));

  // The gauge displays the REMAINING: it is full at the start of the period and
  // empty from the right. The consumed types therefore tile consecutively the
  // emptied portion (same scale, denominator = budget), from the edge of the
  // fill: the hovered segment lights in place. A line at zero
  // doesn't bring any segments.
  const hoveredIndex = rows.findIndex((row) => row.id === hoveredId);
  const hovered = hoveredIndex >= 0 ? rows[hoveredIndex] : null;
  const usdBefore = hovered
    ? rows.slice(0, hoveredIndex).reduce((sum, row) => sum + row.usd, 0)
    : 0;
  const hoveredOffset =
    hovered && includedUsd > 0
      ? Math.min(remainingPercent + (usdBefore / includedUsd) * 100, 100)
      : 0;
  const hoveredWidth =
    hovered && hovered.usd > 0 && includedUsd > 0
      ? Math.min((hovered.usd / includedUsd) * 100, 100 - hoveredOffset)
      : 0;

  const indicatorClass =
    state === "exhausted" || state === "low"
      ? "[&>div]:bg-destructive"
      : state === "warning"
        ? "[&>div]:bg-amber-500"
        : "";

  const nextReset = useMemo(() => {
    if (!nextResetAt) return null;
    const date = new Date(nextResetAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
    }).format(date);
  }, [nextResetAt, locale]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums leading-none text-foreground">
            {loading ? "—" : `${roundRemainingPercent(remainingPercent)}%`}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("ofBudget")}
          </span>
        </div>
        <span className="flex h-5 shrink-0 items-center rounded-full border border-primary bg-primary/10 px-2 text-xs font-semibold text-primary">
          {t(PLAN_LABEL_KEYS[planId])}
        </span>
      </div>

      <div className={cn("space-y-2 px-4 py-3", bordered && "border-t border-border")}>
        <div className="relative">
          {/* Filling = remaining budget: full on reset, empty one
 times the budget consumed. */}
          <Progress
            value={loading ? 0 : remainingPercent}
            className={cn("h-1.5", indicatorClass)}
          />
          {/* Hover overlay: paints the segment of the hovered type in place
 in the consumed portion, in its color. Slides to position
 and stretches; width 0 + fade to rest. */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 rounded-full transition-[left,width,opacity] duration-200",
              hovered?.barClass,
              hoveredWidth > 0 ? "opacity-100" : "opacity-0"
            )}
            style={{ left: `${hoveredOffset}%`, width: `${hoveredWidth}%` }}
          />
        </div>
        {nextReset && !loading && (
          <div className="flex pt-0.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Info className="size-3.5" strokeWidth={2} />
              {t("resetsAt", { date: nextReset })}
            </span>
          </div>
        )}
      </div>

      <div className={cn("px-4 py-3", bordered && "border-t border-border")}>
        {/* The gauge counts the remainder, the detail counts the consumed: we say,
 otherwise the two percentages read in the same direction. */}
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t("breakdownTitle")}
        </p>
        <ul className="space-y-1">
          {rows.map((row) => {
            const rowPercent =
              includedUsd > 0 ? Math.round((row.usd / includedUsd) * 100) : 0;
            const isZero = !loading && row.usd <= 0;
            const highlight = hoveredId === row.id && !isZero;
            const Icon = row.icon;
            return (
              <li
                key={row.id}
                className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1 transition-colors hover:bg-accent/50"
                onMouseEnter={() => setHoveredId(row.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      isZero
                        ? "text-muted-foreground/40"
                        : highlight
                          ? row.text
                          : "text-foreground/70"
                    )}
                    strokeWidth={2}
                  />
                  <span
                    className={cn(
                      "truncate text-sm transition-colors",
                      isZero
                        ? "text-muted-foreground/60"
                        : highlight
                          ? row.text
                          : "text-foreground"
                    )}
                  >
                    {t(row.labelKey)}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums transition-colors",
                    isZero
                      ? "text-muted-foreground/50"
                      : highlight
                        ? row.text
                        : "text-foreground"
                  )}
                >
                  {loading ? "—" : isZero ? "—" : `${Math.max(rowPercent, 1)}%`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

/**
 * CTA upgrade + link to the billing tab, under the body of the popover.
 * `onNavigate` lets the caller close their popover on click.
 */
function UsageFooter({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("Billing");
  const { status, planId } = useBillingSummary();
  const [redirecting, setRedirecting] = useState(false);

  const nextPlanId: BillingPlanId | null =
    planId === "free" ? "go" : planId === "go" ? "pro" : null;
  const canUpgrade = nextPlanId !== null && (status?.stripeConfigured ?? false);

  const handleUpgrade = useCallback(async () => {
    if (!nextPlanId || redirecting) return;
    setRedirecting(true);
    try {
      const hasSubscription = !!status?.subscription;
      const url = hasSubscription
        ? await createPortalApi()
        : await createCheckoutApi(nextPlanId);
      window.location.href = url;
    } catch (error) {
      console.error("[usage-indicator] upgrade failed:", error);
      setRedirecting(false);
    }
  }, [nextPlanId, redirecting, status?.subscription]);

  return (
    <div className="space-y-1 border-t border-border p-2">
      {canUpgrade && nextPlanId && (
        <Button
          type="button"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => void handleUpgrade()}
          disabled={redirecting}
        >
          {redirecting && <Loader2 className="size-3.5 animate-spin" />}
          {t("upgradeTo", { plan: t(PLAN_LABEL_KEYS[nextPlanId]) })}
        </Button>
      )}
      <Button
        asChild
        size="sm"
        variant={canUpgrade ? "ghost" : "outline"}
        className="w-full gap-1.5"
      >
        <Link href="/billing" onClick={onNavigate}>
          {t("viewBilling")}
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
