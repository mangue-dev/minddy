"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { CircleGauge } from "lucide-react";
import { getBillingPlan, type BillingPlanId } from "@/lib/billing-plans";

/**
 * Un run s'est arrêté sur une frontière de DÉPENSE, à la fin d'un round : son
 * travail est poussé et son checkpoint gardé. Cette carte clôt le tour dans le
 * fil et dit ce qui s'est passé.
 *
 * **Deux frontières, deux cartes.** Le budget mensuel du COMPTE tombé à zéro
 * (`cause: "account"`) et le plafond de dépense d'un PASSAGE DE ROUTINE
 * (`cause: "run_cap"`) s'arrêtent au même endroit dans le code, mais ne se
 * répondent pas du tout : la première laisse trois issues (attendre, monter de
 * plan, sa propre clé), la seconde n'en a qu'une — relever le plafond de la
 * routine, dans la routine. Proposer un upgrade à quelqu'un dont le budget du
 * mois est encore presque entier lui ferait payer plus cher pour un problème
 * qu'il n'a pas.
 *
 * Sur le chemin `account`, elle ne montre que les issues qui existent
 * réellement :
 *  • un plan au-dessus, seulement s'il en existe un qui donne PLUS de budget ;
 *  • sa propre clé d'API, seulement si l'utilisateur n'en a pas déjà une ;
 *  • attendre le rechargement — toujours vrai, donc dit en dernier, en prose.
 * Une action qu'on ne peut pas prendre n'est pas une option, c'est un mur.
 *
 * L'usage se dit en POURCENTAGE, jamais en dollars : l'utilisateur a payé un
 * abonnement en euros, le coût brut en USD est une mécanique interne qui ne lui a
 * jamais été montrée ailleurs dans l'app (seul le tableau de bord admin en parle).
 * Sur le chemin `account` c'est toujours 100 % ; sur l'autre, c'est le plafond
 * lui-même, dans l'unité où il a été réglé.
 */
export function QuotaExhaustedCard({
  resetsAt,
  nextPlanId,
  byok,
  cause = "account",
  capPercent = null,
}: {
  /** ISO — fin de la fenêtre comptée : quand le budget se recharge. */
  resetsAt: string | null;
  /** Plan immédiatement au-dessus, ou null si déjà au sommet. */
  nextPlanId: BillingPlanId | null;
  /** L'utilisateur tourne déjà sur sa propre clé (alors le budget ne le concerne pas). */
  byok: boolean;
  /** Quelle frontière a mordu. Absent = le compte (les runs d'avant le plafond). */
  cause?: "account" | "run_cap";
  /** Le plafond du passage, en % du budget mensuel. */
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
   * Le plafond du PASSAGE : rien à proposer, tout à expliquer. La suite se règle
   * sur la routine — et c'est justement d'où on vient pour lire ce fil, donc
   * aucun lien à poser.
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
