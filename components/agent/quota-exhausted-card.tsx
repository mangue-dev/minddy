"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { CircleGauge } from "lucide-react";
import { getBillingPlan, type BillingPlanId } from "@/lib/billing-plans";

/**
 * Le budget d'usage mensuel est tombé à zéro PENDANT un run : la session s'est
 * arrêtée à la frontière de round, son travail est poussé et son checkpoint gardé.
 * Cette carte clôt le tour dans le fil et dit les trois issues possibles.
 *
 * Elle ne montre que celles qui existent réellement :
 *  • un plan au-dessus, seulement s'il en existe un qui donne PLUS de budget ;
 *  • sa propre clé d'API, seulement si l'utilisateur n'en a pas déjà une ;
 *  • attendre le rechargement — toujours vrai, donc dit en dernier, en prose.
 * Une action qu'on ne peut pas prendre n'est pas une option, c'est un mur.
 *
 * L'usage se dit en POURCENTAGE, jamais en dollars : l'utilisateur a payé un
 * abonnement en euros, le coût brut en USD est une mécanique interne qui ne lui a
 * jamais été montrée ailleurs dans l'app (seul le tableau de bord admin en parle).
 * Ici c'est toujours 100 % — la carte ne s'affiche qu'à l'épuisement.
 */
export function QuotaExhaustedCard({
  resetsAt,
  nextPlanId,
  byok,
}: {
  /** ISO — fin de la fenêtre comptée : quand le budget se recharge. */
  resetsAt: string | null;
  /** Plan immédiatement au-dessus, ou null si déjà au sommet. */
  nextPlanId: BillingPlanId | null;
  /** L'utilisateur tourne déjà sur sa propre clé (alors le budget ne le concerne pas). */
  byok: boolean;
}) {
  const t = useTranslations("Agent");
  const format = useFormatter();

  const resetDate = resetsAt ? new Date(resetsAt) : null;
  const resetLabel =
    resetDate && !Number.isNaN(resetDate.getTime())
      ? format.dateTime(resetDate, { day: "numeric", month: "long" })
      : null;

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
              {/* Sur l'onglet, pas sur la page : « utiliser ma clé » doit
                  tomber sur le champ de clé, pas sur le profil (MIN-149). */}
              <Link href="/settings?tab=agent">{t("quotaUseOwnKey")}</Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Nom affichable d'un plan : son id capitalisé (« go » → « Go »). */
function planLabel(id: BillingPlanId): string {
  const plan = getBillingPlan(id);
  return plan.id.charAt(0).toUpperCase() + plan.id.slice(1);
}
