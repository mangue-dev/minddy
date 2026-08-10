"use client";

// La VUE d'une tâche de page.
//
// Elle ne dessine RIEN d'elle-même : la case, ses quatre états, la hauteur de
// ligne sur laquelle elle se centre et la règle du texte barré viennent de
// components/scratchpad/task-checkbox.tsx, exactement comme le schéma et le
// markdown viennent de task-nodes.ts (cf. task-list.ts). Une tâche se coche de
// la même façon dans le carnet et dans une page — c'est le même objet.
//
// Ce que la page n'a PAS, et n'aura pas : le menu ⋯ du carnet. Il lance un
// agent et copie un prompt, ce qui n'a aucun sens dans un document — et il vit
// derrière trois contextes propres au carnet.

import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
import { cx } from "@/lib/cx";
import { isPlanTaskState, type PlanTaskState } from "@/lib/plan";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  TASK_LINE,
  TaskCheckbox,
  taskStruck,
} from "@/components/scratchpad/task-checkbox";

/** Typée en `MessageKey` et non en `string` : une clé assemblée à l'exécution
    échappe au contrôle de `tsc`, une table nommée ne lui échappe pas. */
const STATE_LABEL: Record<PlanTaskState, MessageKey<"Pages">> = {
  pending: "taskPending",
  in_progress: "taskInProgress",
  completed: "taskCompleted",
  cancelled: "taskCancelled",
};

export function PageTaskItemView({ node, updateAttributes }: NodeViewProps) {
  const t = useTranslations("Pages");
  const raw = node.attrs.state;
  const state: PlanTaskState = isPlanTaskState(raw) ? raw : "pending";
  const struck = taskStruck(state);
  // Le clic BASCULE entre « à faire » et « terminé », comme dans le carnet. Les
  // deux autres états s'écrivent au markdown (`[~]`, `[-]`) ou arrivent d'un
  // plan : les faire défiler au clic obligerait à cliquer trois fois pour
  // décocher une tâche.
  const toggled: PlanTaskState = struck ? "pending" : "completed";

  return (
    <NodeViewWrapper
      as="li"
      data-type="taskItem"
      data-state={state}
      className="group/task flex items-start gap-2.5 rounded-[3px] px-1 hover:bg-muted/50"
    >
      <span contentEditable={false} className={TASK_LINE}>
        <TaskCheckbox
          state={state}
          label={t(STATE_LABEL[state])}
          onToggle={() => updateAttributes({ state: toggled })}
        />
      </span>

      <NodeViewContent
        as="div"
        className={cx(
          "min-w-0 flex-1 leading-relaxed",
          struck &&
            "text-muted-foreground line-through [&_*]:text-muted-foreground",
          state === "in_progress" && "font-medium"
        )}
      />
    </NodeViewWrapper>
  );
}
