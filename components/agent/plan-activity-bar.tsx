"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Spinner, cn } from "mangue-ui";
import { CheckCircle2, ChevronRight, Circle, CircleSlash, ListChecks } from "lucide-react";
import { AgentBeam } from "@/components/agent-beam";
import type { PlanStep } from "@/lib/agent-plan";

/**
 * La CHECKLIST de la session, juste au-dessus du composer.
 *
 * Le plan vivait dans le fil, à l'endroit où l'agent l'avait posé — c'est-à-dire
 * à un endroit qui remonte : dix tool-calls plus tard il est sorti de l'écran, et
 * savoir où en est le travail demande de faire défiler vers le haut pour retrouver
 * une carte qu'on relit en entier. Or c'est l'information qu'on consulte le plus
 * souvent, et la seule qui résume le tour en un coup d'œil.
 *
 * Elle prend donc la place où le fil dépose ce qui doit rester sous les yeux :
 * contre le composer, à sa largeur, au dessin exact de la barre des sous-agents
 * ([subagent-activity-bar](./subagent-activity-bar.tsx)) et du bloc « fichiers
 * changés » — même surface, même chevron, même retrait de liste. Le fil n'a
 * qu'une grammaire.
 *
 * Repliée, elle ne dit que ce qu'on cherchait : l'étape EN COURS, et le compte
 * fait/total. Dépliée, le plan entier, du même dessin que la carte qu'il remplace.
 * Une seule ligne de hauteur tant qu'on ne l'ouvre pas : l'input ne descend pas
 * pendant qu'on écrit.
 *
 * L'étape en cours porte un SPINNER, pas une pastille immobile : c'est la marque
 * « ça tourne » de minddy (les sous-agents, la colonne des conversations), et
 * c'est la seule différence à lire entre l'étape en cours et celles qui ont été
 * cochées. Une icône fixe ne s'en distinguait que par sa forme.
 *
 * Elle ne vit que pendant le tour qui a posé son plan (cf. `livePlan`) : ce qui
 * s'affiche ici avance forcément, d'où le liseré toujours allumé — exactement
 * comme la carte des sous-agents.
 */
export function PlanActivityBar({ steps }: { steps: PlanStep[] }) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  if (steps.length === 0) return null;

  const done = steps.filter((s) => s.status === "completed").length;
  const current = steps.find((s) => s.status === "in_progress");

  return (
    <div className="px-3 pb-2">
      {/* Le liseré « agent en cours » (MIN-46), au rayon de la carte. Toujours
          allumé : cette carte n'existe QUE pendant le tour qui écrit son plan. */}
      <AgentBeam active className="rounded-xl">
        <div className="rounded-xl border border-border bg-card">
          <Collapsible open={open} onOpenChange={setOpen}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground">
                <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                <ListChecks className="size-3.5 shrink-0" />
                {/* L'étape en cours plutôt que le mot « Plan » : c'est elle qu'on
                    vient chercher. Le shimmer ne court que tant qu'elle avance. */}
                <span className={cn("truncate", current && "text-shimmer")}>
                  {current ? current.step : t("plan")}
                </span>
                {/* Collé à droite et tabulaire : un compteur ne doit pas danser
                    quand l'étape d'à côté change de longueur. */}
                <span className="ml-auto shrink-0 pl-2 tabular-nums">
                  {done}/{steps.length}
                </span>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="flex flex-col px-1.5 pb-2">
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs",
                      s.status === "in_progress" ? "text-foreground" : "text-muted-foreground",
                      s.status === "cancelled" && "line-through",
                    )}
                  >
                    {s.status === "completed" ? (
                      <CheckCircle2 className="mt-px size-3.5 shrink-0 text-brand" />
                    ) : s.status === "in_progress" ? (
                      <Spinner className="mt-px size-3.5 shrink-0 text-brand" />
                    ) : s.status === "cancelled" ? (
                      <CircleSlash className="mt-px size-3.5 shrink-0" />
                    ) : (
                      <Circle className="mt-px size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0">{s.step}</span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </AgentBeam>
    </div>
  );
}
