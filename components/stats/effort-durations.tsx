"use client";

import { useLocale, useTranslations } from "next-intl";
import { EFFORT_MAP } from "@/lib/issue-constants";
import { durationParts, fmtNum } from "@/lib/stats-derive";
import type { StatsCycleEffort } from "@/lib/types";

/**
 * Durée médiane de complétion par effort (MIN-85).
 *
 * Anciennement cinq boîtes juxtaposées, chacune avec sa propre échelle
 * implicite : on ne pouvait pas voir qu'un L prend six fois plus qu'un S. Ici,
 * une barre par effort sur une échelle commune (le plus long = 100 %), donc la
 * comparaison est immédiate — c'est tout l'intérêt de la mesure.
 *
 * Ces durées sont des médianes, pas des moyennes : sur un échantillon de dix
 * tickets, un seul démarré avant des vacances suffit à faire dire à la moyenne
 * qu'un M prend trois semaines. Une barre qui ne décrit plus le cas courant ne
 * se compare plus à rien.
 */
export function EffortDurations({ byEffort }: { byEffort: StatsCycleEffort[] }) {
  const t = useTranslations("Stats");
  const locale = useLocale();

  const max = byEffort.reduce((m, e) => Math.max(m, e.medianSeconds), 0);

  return (
    <div className="flex flex-col gap-3">
      {byEffort.map((e) => {
        const parts = durationParts(e.medianSeconds);
        const width = max > 0 ? (e.medianSeconds / max) * 100 : 0;
        return (
          <div key={e.effort} className="flex items-center gap-3">
            <span className="w-7 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-center text-xs font-semibold text-muted-foreground">
              {EFFORT_MAP[e.effort].label}
            </span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              {/* Teinte neutre dérivée du texte : ces barres mesurent du TEMPS,
                  pas de la complétion — leur donner l'accent de marque ou le
                  vert « terminé » leur ferait dire autre chose. */}
              <div
                className="h-full rounded-full bg-foreground/30 transition-all"
                style={{ width: `${Math.max(width, 3)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
              {t(parts.key, { value: fmtNum(parts.value, locale) })}
            </span>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {t("effortSample", { count: e.sample })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
