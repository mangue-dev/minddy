"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  CircleDot,
  Timer,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "mangue-ui";
import { useHomeSummaryQuery } from "@/lib/use-home-summary-query";

function StatRow({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-[2ch] font-medium tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export function HomeGlobalCard() {
  const t = useTranslations("Home");
  // Les trois compteurs viennent de `count` SQL (MIN-89) : ils étaient dérivés
  // du board agrégé, ce qui obligeait l'accueil à télécharger tous les tickets
  // de tous les projets pour n'en afficher que trois nombres.
  const { counts, loading } = useHomeSummaryQuery();

  return (
    <section className="flex h-full min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground">
      <h2 className="text-sm font-semibold tracking-tight">{t("globalTitle")}</h2>

      <div className="flex flex-1 flex-col gap-2">
        {loading ? (
          <>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-36" />
          </>
        ) : (
          <>
            <StatRow icon={CircleDot} value={counts.open} label={t("globalOpen")} />
            <StatRow
              icon={Timer}
              value={counts.inProgress}
              label={t("globalInProgress")}
            />
            <StatRow
              icon={UserRound}
              value={counts.mine}
              label={t("globalAssignedToMe")}
            />
          </>
        )}
      </div>

      <Link
        href="/all"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {t("globalAllIssues")}
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}
