"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Skeleton } from "mangue-ui";
import {
  StatsCard,
  StatsSection,
} from "@/components/stats/stats-chrome";
import { ADMIN_SECTIONS, adminSectionAnchor } from "@/lib/admin-sections";
import {
  buildUseCaseRows,
  KNOWN_USE_CASES,
  type UseCaseRow,
} from "@/lib/admin-decisions-quality";
import type { MessageKey } from "@/lib/i18n-keys";
import type { AdminDecisionsQuality } from "@/lib/types";

/**
 * `/admin` → Overview → “AI decisions” (MIN-567): the shadow comparison of
 * the decision layer, read as its calibration screen.
 *
 * The LLM pass replayed after a confident Jev decision is the REFERENCE
 * (the implementation proven before MIN-557), so the agreement read here
 * measures Jev's precision per use case — the data that justifies raising,
 * lowering, or keeping `jev_confidence_floor`, and switching a use case to
 * LLM-first (`jev_llm_first`) when it proves structurally bad. The knobs
 * are shown next to the data because the two are read together; they are
 * plain `app_config` keys, edited from the database, not from this page.
 *
 * The weekly figures arrive as SUMS and COUNTS and are aggregated in
 * `lib/admin-decisions-quality.ts` (pure, tested): weeks of very different
 * traffic weigh by their sample counts, so the displayed latencies and cost
 * stay per-sample averages.
 */

function fmtLatency(ms: number | null): string {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

function fmtCost(usd: number | null): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0";
  if (usd < 1) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(2)}`;
}

export function AdminDecisionsQuality() {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [data, setData] = useState<AdminDecisionsQuality | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/decisions-quality");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as AdminDecisionsQuality);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: UseCaseRow[] = useMemo(
    () => (data ? buildUseCaseRows(data.weeks) : []),
    [data],
  );

  const percent = useCallback(
    (value: number | null) =>
      value == null
        ? "—"
        : format.number(value, { style: "percent", maximumFractionDigits: 0 }),
    [format],
  );

  const useCaseLabel = useCallback(
    (useCase: string) =>
      KNOWN_USE_CASES.has(useCase)
        ? t(`decisions.useCases.${useCase}` as MessageKey<"Admin">)
        : useCase,
    [t],
  );

  return (
    <StatsSection
      id={adminSectionAnchor(ADMIN_SECTIONS.overviewDecisions)}
      title={t("decisions.title")}
      info={t("decisions.info")}
    >
      <StatsCard className="flex flex-col gap-5">
        {data && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {data.settings.enabled
                ? t("decisions.enabled")
                : t("decisions.disabled")}
            </span>
            <span>
              {t("decisions.floor")}:{" "}
              <span className="tabular-nums">
                {percent(data.settings.confidenceFloor)}
              </span>
            </span>
            <span>
              {t("decisions.shadowRate")}:{" "}
              <span className="tabular-nums">
                {percent(data.settings.shadowSampleRate)}
              </span>
            </span>
            <span>
              {t("decisions.llmFirst")}:{" "}
              {data.settings.llmFirstUseCases.length > 0 ? (
                <span className="font-medium text-foreground">
                  {data.settings.llmFirstUseCases
                    .map(useCaseLabel)
                    .join(", ")}
                </span>
              ) : (
                t("decisions.llmFirstNone")
              )}
            </span>
          </div>
        )}

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("decisions.noData")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("decisions.useCase")}</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("decisions.samples")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("decisions.agreement")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("decisions.weekly")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("decisions.jevLatency")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("decisions.llmLatency")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("decisions.shadowCost")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.useCase} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {useCaseLabel(row.useCase)}
                        {row.replayFailed > 0 ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("decisions.replayFailed", { count: row.replayFailed })}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.samples}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {percent(
                          row.comparable > 0 ? row.agreeCount / row.comparable : null,
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.series.map((value, index) => (
                          <span key={index} className="ml-1.5 first:ml-0">
                            {percent(value)}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtLatency(row.jevLatencyMs)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtLatency(row.llmLatencyMs)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtCost(row.llmCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("decisions.weeklyHint")}</p>
          </>
        )}
      </StatsCard>
    </StatsSection>
  );
}
