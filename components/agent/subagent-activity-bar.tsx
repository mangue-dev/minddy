"use client";

import { useState } from "react";
import { useNow, useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Spinner, cn } from "mangue-ui";
import { Bot, CheckCircle2, ChevronRight } from "lucide-react";
import { AgentBeam } from "@/components/agent-beam";
import type { TurnSubagent } from "@/lib/agent-subagents";

/** Le chrono d'une fille, à la forme de ceux du fil (`SubagentBlock`). */
function durationLabel(
  t: ReturnType<typeof useTranslations<"Agent">>,
  ms: number,
): string {
  const totalSec = Math.max(1, Math.round(Math.max(0, ms) / 1000));
  const minutes = Math.floor(totalSec / 60);
  return minutes > 0
    ? t("subagentForMinutes", { minutes, seconds: totalSec % 60 })
    : t("subagentForSeconds", { seconds: totalSec });
}

/** Instant parsé, ou `fallback` si l'ISO est illisible (jamais NaN au calcul). */
function msOr(iso: string | null, fallback: number): number {
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? fallback : ms;
}

/**
 * Ce que les SOUS-AGENTS du tour en cours font, juste au-dessus du composer
 * (MIN-112).
 *
 * Pendant qu'une fille travaille, le parent l'attend : il n'émet plus rien, le fil
 * se fige, et le tour en cours peut rester silencieux plusieurs minutes. Tout ce
 * qui dit que la session est vivante — la ligne repliée de la fille et son chrono —
 * est alors quelque part plus haut dans un fil qu'on a fini par quitter du regard.
 * On se demande si ça tourne encore.
 *
 * Cette carte est la réponse, et elle est là où l'on regarde en se posant la
 * question : contre le composer, à sa largeur, au dessin exact du bloc « fichiers
 * changés » ([changed-files-block](./changed-files-block.tsx)) — même surface, même
 * respiration, même chevron, même retrait de liste. Une carte de plus n'est pas un
 * dessin de plus : c'est le même, et le fil n'a qu'une grammaire.
 *
 * Repliée, elle ne dit que ce qu'on cherchait — COMBIEN de filles travaillent
 * encore, DEPUIS quand. Dépliée, le tour entier : chaque fille, son type, et sa
 * DURÉE — qui court pour celles au travail et se fige pour celles qui ont rendu.
 * Celles-là gardent leur ligne, marquée d'un ✓ : déléguer trois explorations et
 * n'en voir plus qu'une donne l'impression que les deux autres se sont perdues.
 *
 * La durée plutôt que le nombre d'étapes : une fille peut lire un gros fichier ou
 * réfléchir une minute sans rien poser, et un compteur d'étapes figé ressemble à
 * un agent mort — c'est déjà l'arbitrage de `SubagentBlock`.
 */
export function SubagentActivityBar({ subagents }: { subagents: TurnSubagent[] }) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);
  const now = useNow({ updateInterval: 1000 });

  const running = subagents.filter((s) => !s.endedAt);
  // Plus rien au travail : le parent a repris la main, le fil raconte à nouveau.
  if (running.length === 0) return null;

  // L'heure de la carte est celle de la plus ancienne fille ENCORE au travail :
  // c'est elle qui dit depuis combien de temps le tour attend.
  const oldestStart = Math.min(...running.map((s) => msOr(s.startedAt, now.getTime())));

  return (
    <div className="px-3 pb-2">
      {/* Le liseré « agent en cours » (MIN-46), le même qu'aux autres surfaces où
          quelque chose tourne — la carte d'un ticket, le composer pendant une
          réponse. Toujours allumé : cette carte n'existe QUE tant qu'une fille
          travaille. Son rayon est celui de la carte (`rounded-xl`), sans quoi il
          courrait sur des angles qui ne sont pas les siens. */}
      <AgentBeam active className="rounded-xl">
        <div className="rounded-xl border border-border bg-card">
          <Collapsible open={open} onOpenChange={setOpen}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground">
                <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                <Bot className="size-3.5 shrink-0" />
                <span className="truncate text-shimmer">
                  {t("subagentsWorking", { count: running.length })}
                </span>
                {/* Collé à droite et tabulaire : c'est un compteur qui change chaque
                    seconde, il ne doit ni danser ni se déplacer quand une fille de
                    plus rallonge le libellé. */}
                <span className="ml-auto shrink-0 pl-2 tabular-nums">
                  {durationLabel(t, now.getTime() - oldestStart)}
                </span>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              {/* Même retrait de liste que le bloc « fichiers changés » : les lignes
                  gardent leur propre marge et ne viennent pas buter contre le bord
                  de la carte. */}
              <div className="flex flex-col px-1.5 pb-2">
                {subagents.map((s) => {
                  const done = !!s.endedAt;
                  const start = msOr(s.startedAt, now.getTime());
                  // Figée sur son instant de fin, ou vivante — la même mécanique
                  // que le chrono d'un tour (`WorkAccordion`).
                  const end = done ? msOr(s.endedAt, start) : now.getTime();
                  return (
                    <div
                      key={s.id}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground"
                    >
                      {/* Une fille qui travaille porte un SPINNER — la marque
                          « ça tourne » de minddy (la colonne des conversations,
                          l'en-tête d'un projet replié). Une marque immobile ne
                          distinguait de la ✓ que par sa forme, alors que la
                          différence à lire est là : l'une bouge encore. */}
                      {done ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-brand" />
                      ) : (
                        <Spinner className="size-3.5 shrink-0 text-brand" />
                      )}
                      <span className="truncate">
                        {t(
                          s.mode === "implement"
                            ? "subagentImplementName"
                            : "subagentExploreName",
                        )}
                      </span>
                      {/* La durée d'une fille qui a rendu est une MESURE, pas un
                          compteur : elle ne bougera plus, et c'est ce qu'on retient
                          de son passage. Le gras la sort du chrono d'à côté, qui
                          court encore. */}
                      <span
                        className={cn("ml-auto shrink-0 tabular-nums", done && "font-semibold")}
                      >
                        {durationLabel(t, end - start)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </AgentBeam>
    </div>
  );
}
