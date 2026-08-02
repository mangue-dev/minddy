"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { NotebookPen } from "lucide-react";
import { cn } from "mangue-ui";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useScratchpadSummary } from "@/lib/use-scratchpad-query";
import { useScrollFade } from "@/lib/use-scroll-fade";
import type { PlanTask } from "@/lib/plan";
import { scratchpadPreview, type ScratchpadPreviewSection } from "@/lib/scratchpad";

/**
 * Plafond DUR de ce qui est monté, pas de ce qui se voit : c'est la hauteur de la
 * carte qui coupe l'aperçu, et le fondu qui le dit. Assez pour déborder de
 * n'importe quelle carte, assez peu pour qu'un carnet de deux cents lignes ne
 * parte pas entier dans le DOM de l'accueil.
 */
const MAX_TASKS = 12;

/** Longueur du fondu de fin. Bien plus long que le liseré d'un scroller (2rem) :
    ici il ne signale pas un bord, il éteint le texte. */
const FADE = "5rem";

/** La case à cocher de la tâche, en lecture seule : l'accueil montre le carnet,
    on l'y modifie. Même dessin que dans le carnet (scratchpad-task.tsx) — une
    case vide à faire, cerclée et pleine en son centre pour ce qui est commencé —
    à l'échelle du texte de la carte. Le wrapper fait une ligne de haut pour que
    la case se centre sur la PREMIÈRE ligne, quoi que le texte devienne ensuite. */
function TaskBox({ state }: { state: PlanTask["state"] }) {
  return (
    <span aria-hidden className="flex h-[1.4375rem] shrink-0 items-center">
      <span
        className={cn(
          "flex size-3.5 items-center justify-center rounded-[4px] border",
          state === "in_progress" ? "border-primary" : "border-input"
        )}
      >
        {state === "in_progress" && (
          <span className="size-1.5 rounded-[2px] bg-primary" />
        )}
      </span>
    </span>
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
 * C'est un APERÇU DE LA NOTE, pas un résumé : les titres et les cases sont ceux
 * du carnet, le texte d'une tâche tient sur deux lignes plutôt que sur une moitié
 * de phrase, et ce qui dépasse s'efface en bas au lieu d'être compté. La première
 * version rognait chaque ligne à un `truncate` et empilait six tâches au plus
 * serré : tout y était, rien ne s'y lisait.
 *
 * Rien à faire → rien du tout, comme « À trier » et « Échéances proches » : un
 * tableau de bord ne garde pas de place pour un état vide.
 */
export function HomeScratchpadSection() {
  const t = useTranslations("Scratchpad");
  const { open } = useScratchpad();
  const { content, progress } = useScratchpadSummary();

  const sections = useMemo(() => scratchpadPreview(content), [content]);

  // Le fondu ne s'allume que si la note dépasse vraiment la carte : un carnet de
  // trois tâches se lit en entier, sans bas de page éteint pour rien.
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>("y", FADE);

  const left = Math.max(progress.total - progress.done, 0);
  if (left === 0 || sections.length === 0) return null;

  // Le plafond se dépense en descendant : on remplit les sections dans l'ordre
  // du carnet jusqu'à épuisement, plutôt que d'en rogner une part à chacune.
  let budget = MAX_TASKS;
  const shown: ScratchpadPreviewSection[] = [];
  for (const section of sections) {
    if (budget <= 0) break;
    shown.push({ ...section, tasks: section.tasks.slice(0, budget) });
    budget -= section.tasks.length;
  }

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
      <div className="group relative flex flex-col rounded-xl border border-border bg-card transition-colors hover:bg-muted/30">
        {/* `max-h-64` : le carnet reste le carnet — l'accueil n'en montre que le
            début, quatre ou cinq lignes lisibles, puis le texte s'éteint. Le
            fondu est un MASQUE posé sur le texte, et non un dégradé posé
            par-dessus : il laisse donc passer le fond de la carte, qui change au
            survol. */}
        <div
          ref={fadeRef}
          {...scrollProps}
          className="flex max-h-64 flex-col gap-4 overflow-hidden px-4 pt-3.5 pb-2"
        >
          {shown.map((section, sectionIndex) => (
            <div key={sectionIndex} className="flex flex-col gap-1.5">
              {section.title && (
                <p className="truncate text-sm font-semibold tracking-tight">
                  {section.title}
                </p>
              )}
              <ul className="flex flex-col gap-1.5">
                {section.tasks.map((task) => (
                  <li key={task.index} className="flex items-start gap-2.5">
                    <TaskBox state={task.state} />
                    {/* Deux lignes : de quoi comprendre une note écrite d'un
                        trait, sans qu'une seule tâche prenne toute la carte. */}
                    <span
                      className={cn(
                        "line-clamp-2 min-w-0 flex-1 text-sm leading-relaxed text-foreground/90",
                        task.state === "in_progress" &&
                          "font-medium text-foreground"
                      )}
                    >
                      {task.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* HORS du masque : le pied de carte reste net sous le texte éteint. */}
        <span className="flex items-center gap-1.5 px-4 pt-0.5 pb-3.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          <NotebookPen className="size-3.5" />
          {t("homeOpen")}
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
