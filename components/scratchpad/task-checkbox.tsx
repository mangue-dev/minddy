"use client";

// LA case à cocher d'une tâche — celle du carnet et celle d'une page.
//
// Elle vit ici, à côté du schéma partagé (task-nodes.ts), et pas dans l'une des
// deux vues : les quatre états du plan (`[ ]` / `[~]` / `[x]` / `[-]`) sont un
// vocabulaire du produit, et deux dessins du même vocabulaire, ce sont deux
// produits. Le carnet et les pages ne diffèrent que par ce qu'ils ajoutent
// AUTOUR — le menu ⋯ du carnet lance un agent, ce qui n'a aucun sens dans un
// document.
//
// `cx` et pas `cn` : cette vue est montée par le registre de blocs des pages,
// qui doit rester importable hors navigateur (cf. lib/cx.ts).

import { Check, Minus } from "lucide-react";
import { cx } from "@/lib/cx";
import type { PlanTaskState } from "@/lib/plan";

/**
 * La hauteur d'UNE ligne de texte (`leading-relaxed` sur `text-sm`) : la case
 * et le menu se centrent dessus, quoi que le texte fasse ensuite en passant à
 * la ligne. C'est ce qui les tient sur la BASELINE de la première ligne plutôt
 * que sur le haut du bloc.
 */
export const TASK_LINE = "flex h-[1.625rem] shrink-0 items-center";

/** Le texte d'une tâche est-il barré ? Terminée et annulée, pas les autres. */
export function taskStruck(state: PlanTaskState): boolean {
  return state === "completed" || state === "cancelled";
}

export function TaskCheckbox({
  state,
  label,
  onToggle,
  className,
}: {
  state: PlanTaskState;
  /** Ce que le lecteur d'écran annonce — le texte de la tâche, chez l'appelant. */
  label: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      // `preventDefault` au `mousedown` : sans lui le caret se pose dans le
      // bouton et la frappe suivante écrit à côté du texte de la tâche.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={cx(
        "flex size-4 items-center justify-center rounded-[4px] border transition-colors",
        state === "pending" && "border-input hover:border-muted-foreground/60",
        state === "in_progress" && "border-primary",
        state === "completed" && "border-primary bg-primary text-primary-foreground",
        state === "cancelled" && "border-input bg-muted text-muted-foreground",
        className
      )}
    >
      {state === "in_progress" && (
        <span className="size-2 rounded-[2px] bg-primary" />
      )}
      {state === "completed" && <Check className="size-3" />}
      {state === "cancelled" && <Minus className="size-3" />}
    </button>
  );
}
