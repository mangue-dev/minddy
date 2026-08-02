"use client";

import { useState } from "react";
import { useNow, useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "mangue-ui";
import { Bot } from "lucide-react";
import { Markdown } from "@/components/markdown";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * UN sous-agent, replié (MIN-112). Ligne compacte au gabarit de `ReasoningBlock` et
 * de `ToolCallRow` : une étape du déroulé du tour, pas un message.
 *
 * Pourquoi replier plutôt que rendre les events de la fille dans le flux : un
 * sous-agent produit autant d'events qu'un tour entier (réflexions, tool-calls,
 * résultats). Les laisser passer mélangerait deux sessions dans une seule ligne de
 * lecture, et le tour qui a délégué deviendrait le plus illisible de la
 * conversation — l'inverse exact de ce que la délégation apporte.
 *
 * Ce que la ligne dit, et pourquoi elle ne dit pas plus : l'utilisateur veut savoir
 * QUEL type d'agent tourne et S'IL tourne encore. Ni son identifiant technique
 * (`sub-1` ne lui apprend rien — il reste dans le rapport déplié, où il sert à
 * rapprocher la ligne des mentions qu'en fait l'agent parent), ni sa tâche (elle
 * est déjà sur la ligne `spawn_agent` juste au-dessus).
 *
 * À droite, une seule valeur à la fois, comme `ReasoningBlock` :
 *  - PENDANT le travail, un chrono qui tourne — c'est le signal de vie. Le compte
 *    d'étapes, lui, peut rester figé plusieurs dizaines de secondes pendant que la
 *    fille réfléchit ou lit un gros fichier, et un compteur figé ressemble à un
 *    agent mort.
 *  - UNE FOIS FINI, le nombre d'étapes : la durée n'apprend plus rien, l'effort si.
 */
export function SubagentBlock({
  mode,
  /**
   * Tool-calls de la fille — le seul signal d'avancement que le fil voit passer, et
   * ce que le libellé appelle « étapes ». À ne pas confondre avec les `rounds` que
   * `agent_status` / `list_agents` rapportent au parent : ceux-là viennent de la
   * boucle fille et sont plus petits (un round peut porter plusieurs tool-calls).
   * Deux mesures, deux mots — jamais le même nombre présenté deux fois.
   */
  steps,
  subagentId,
  report,
  error,
  delivered,
  partial,
  /** `created_at` du PREMIER event de la fille : le début de son chrono. */
  startedAt,
  /** `created_at` de l'event qui l'a close, ou null tant qu'elle tourne. */
  endedAt,
}: {
  mode: "explore" | "implement" | null;
  steps: number;
  subagentId: string;
  report: string;
  error: string;
  delivered: boolean;
  partial: boolean;
  startedAt: string;
  endedAt: string | null;
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const trace = (report || error).trim();
  // « Interrompu » ne se lit pas dans les events de la fille (une boucle suspendue
  // n'émet ni résumé ni erreur) : c'est le PARENT qui l'annonce, en livrant un
  // rapport marqué partiel. Sans ce signal, une fille coupée resterait « lancée »
  // pour toujours dans un fil relu.
  const state = error
    ? "Failed"
    : report
      ? "Done"
      : delivered
        ? partial
          ? "Cut"
          : "Done"
        : "Running";
  const running = state === "Running";
  // `mode` ne peut être null que sur un event antérieur au marquage (aucun en base) —
  // on retombe alors sur la formulation d'exploration, la moins engageante.
  const family = mode === "implement" ? "Implement" : "Explore";

  // Clé assemblée à l'exécution : castée explicitement en `MessageKey<"Agent">`
  // (convention de lib/i18n-keys.ts) — c'est le point précis où le compilateur
  // cesse de vérifier, et les huit combinaisons existent bien aux deux catalogues.
  const label = t(`subagent${family}${state}` as MessageKey<"Agent">);

  // Chrono en direct tant que ça tourne, figé ensuite — même mécanique que
  // `WorkAccordion` (`useNow`), et non l'approche de `ReasoningBlock` : celle-ci
  // s'appuie sur une durée MESURÉE côté serveur et rediffusée, or une fille n'émet
  // aucun battement de ce genre. Ici l'horloge locale est le seul moyen de montrer
  // qu'elle est vivante, et elle s'arrête sur un instant réel (`endedAt`).
  const now = useNow({ updateInterval: running ? 1000 : undefined });
  const startMs = Date.parse(startedAt);
  const safeStart = Number.isNaN(startMs) ? now.getTime() : startMs;
  const elapsedMs = running
    ? Math.max(0, now.getTime() - safeStart)
    : Math.max(0, Date.parse(endedAt ?? startedAt) - safeStart);
  const totalSec = Math.max(1, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const counter = running
    ? minutes > 0
      ? t("subagentForMinutes", { minutes, seconds: totalSec % 60 })
      : t("subagentForSeconds", { seconds: totalSec })
    : t("subagentSteps", { count: steps });

  const row = (
    <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
      <Bot className={cn("size-3 shrink-0", state === "Failed" && "text-destructive")} />
      <span className={cn("flex-1 truncate text-left", running && "text-shimmer")}>{label}</span>
      {/* Tabulaire : le compteur ne doit pas danser en changeant de chiffre. */}
      <span className="shrink-0 tabular-nums">{counter}</span>
    </div>
  );

  // Rien à déplier tant qu'elle travaille : son rapport n'existe pas encore, et son
  // texte n'est pas streamé (cf. le runner — un enfant qui streamerait écraserait la
  // bulle en cours d'écriture du parent, ils partagent le topic du run).
  if (running) return row;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full outline-hidden transition-colors hover:text-foreground">
        {row}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 py-1 text-xs text-muted-foreground">
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            {t("subagentReportLabel")}
            {/* L'identifiant vit ICI : l'agent parent y fait référence dans sa
                réponse (« le rapport de sub-1 »), et c'est le seul endroit où il
                aide à rapprocher les deux. */}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{subagentId}</code>
          </p>
          {/* Le rapport est du MARKDOWN : une fille écrit des titres, des listes et
              des chemins en `code`. Rendu en texte brut, on lisait « ## Fichiers à la
              racine » et des « --- » à l'écran. */}
          {trace ? (
            <Markdown className="text-xs">{trace}</Markdown>
          ) : (
            <p>{t("subagentNoReport")}</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
