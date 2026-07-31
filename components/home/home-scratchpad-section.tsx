"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { NotebookPen } from "lucide-react";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useScratchpadSummary } from "@/lib/use-scratchpad-query";
import type { PlanTask } from "@/lib/plan";
import { scratchpadPreview, type ScratchpadPreviewSection } from "@/lib/scratchpad";

/** Combien de tâches la section montre au plus, toutes sections confondues. Le
    carnet reste le carnet : l'accueil n'en donne que le début. */
const TASKS_SHOWN = 6;

/** La case à cocher de la tâche, en lecture seule : l'accueil montre le carnet,
    on l'y modifie. Un point vide, à demi rempli pour ce qui est commencé. */
function TaskDot({ state }: { state: PlanTask["state"] }) {
  return (
    <span
      aria-hidden
      className="mt-[7px] size-1.5 shrink-0 rounded-full border border-muted-foreground/60 bg-transparent data-[started=true]:bg-muted-foreground/60"
      data-started={state === "in_progress"}
    />
  );
}

/**
 * Section « Carnet de tâches » de l'accueil.
 *
 * Le carnet vivait derrière un bouton du header et un chiffre sur sa pastille :
 * il fallait déjà savoir qu'on y avait laissé quelque chose pour aller le
 * rouvrir. La note est personnelle et cross-projet, exactement comme cette page —
 * elle y a donc sa place, en clair, avec ses tâches restantes groupées comme on
 * les a écrites.
 *
 * Rien à faire → rien du tout, comme « À trier » et « Échéances proches » : un
 * tableau de bord ne garde pas de place pour un état vide.
 */
export function HomeScratchpadSection() {
  const t = useTranslations("Scratchpad");
  const { open } = useScratchpad();
  const { content, progress } = useScratchpadSummary();

  const sections = useMemo(() => scratchpadPreview(content), [content]);

  const left = Math.max(progress.total - progress.done, 0);
  if (left === 0 || sections.length === 0) return null;

  // Le plafond se dépense en descendant : on remplit les sections dans l'ordre
  // du carnet jusqu'à épuisement, plutôt que d'en rogner une part à chacune.
  let budget = TASKS_SHOWN;
  const shown: ScratchpadPreviewSection[] = [];
  for (const section of sections) {
    if (budget <= 0) break;
    shown.push({ ...section, tasks: section.tasks.slice(0, budget) });
    budget -= section.tasks.length;
  }
  const hidden = sections.reduce((n, s) => n + s.tasks.length, 0) - TASKS_SHOWN;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{t("title")}</h2>
        <span className="text-sm text-muted-foreground">
          {t("tasksLeft", { count: left })}
        </span>
      </div>

      {/* Toute la carte ouvre le carnet : les tâches ne sont pas cliquables une à
          une — on ne coche pas depuis l'accueil, on entre dans la note. Le bouton
          est POSÉ sur la carte plutôt qu'autour : un <button> ne contient que du
          contenu de phrasé, et la liste des tâches n'en est pas. */}
      <div className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-muted/30">
        {shown.map((section, sectionIndex) => (
          <div key={sectionIndex} className="flex flex-col gap-1">
            {section.title && (
              <p className="truncate text-xs font-medium text-muted-foreground">
                {section.title}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {section.tasks.map((task) => (
                <li key={task.index} className="flex items-start gap-2 text-sm">
                  <TaskDot state={task.state} />
                  <span className="min-w-0 flex-1 truncate text-foreground/90">
                    {task.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <span className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          <NotebookPen className="size-3.5" />
          {hidden > 0 ? t("homeMore", { count: hidden }) : t("open")}
        </span>

        <button
          type="button"
          onClick={() => open("home")}
          aria-label={t("openAria")}
          className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </section>
  );
}
