"use client";

// La VUE d'une tâche de page — la case à cocher et rien d'autre.
//
// Le schéma, les quatre états et leur round-trip markdown ne sont PAS ici : ils
// vivent dans components/scratchpad/task-nodes.ts, que ce bloc reprend tel quel
// (cf. task-list.ts). Ce fichier n'ajoute que le geste, et volontairement pas
// celui du carnet : la vue du carnet (components/scratchpad/scratchpad-task.tsx)
// porte le lancement d'agent, la copie de prompt et les raccourcis de survol,
// qui n'ont aucun sens sur une page de doc.

import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
// `cx` et pas `cn` de mangue-ui : le baril tire le sélecteur d'emoji, et le
// registre de blocs cesserait d'être importable hors navigateur (cf. cx.ts).
import { cx } from "@/components/pages/blocks/cx";
import { Check, Circle, CircleSlash, Play } from "lucide-react";
import { isPlanTaskState, type PlanTaskState } from "@/lib/plan";
import type { MessageKey } from "@/lib/i18n-keys";

/** Le cycle du clic, dans l'ordre de la vie d'une tâche. Un clic suffit à
    parcourir les quatre états : une page n'a pas de menu ⋯ par tâche, et un
    quatrième état atteignable seulement au clavier serait un état mort. */
const CYCLE: readonly PlanTaskState[] = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
];

const LOOK: Record<
  PlanTaskState,
  { icon: typeof Circle; className: string; labelKey: MessageKey<"Pages"> }
> = {
  pending: {
    icon: Circle,
    className: "text-muted-foreground",
    labelKey: "taskPending",
  },
  in_progress: {
    icon: Play,
    className: "text-primary",
    labelKey: "taskInProgress",
  },
  completed: {
    icon: Check,
    className: "text-primary",
    labelKey: "taskCompleted",
  },
  cancelled: {
    icon: CircleSlash,
    className: "text-muted-foreground",
    labelKey: "taskCancelled",
  },
};

export function PageTaskItemView({ node, updateAttributes }: NodeViewProps) {
  const t = useTranslations("Pages");
  const raw = node.attrs.state;
  const state: PlanTaskState = isPlanTaskState(raw) ? raw : "pending";
  const look = LOOK[state];
  const Icon = look.icon;

  return (
    <NodeViewWrapper
      as="li"
      data-state={state}
      className="my-0.5 flex items-start gap-2"
    >
      <button
        type="button"
        // `contentEditable={false}` : sans ça, le caret se pose DANS le bouton
        // et la frappe suivante écrit à côté du texte de la tâche.
        contentEditable={false}
        aria-label={t(look.labelKey)}
        title={t(look.labelKey)}
        onClick={() =>
          updateAttributes({
            state: CYCLE[(CYCLE.indexOf(state) + 1) % CYCLE.length],
          })
        }
        className={cx(
          "mt-[0.3em] flex size-4 shrink-0 items-center justify-center rounded border border-border transition-colors hover:bg-muted",
          look.className,
          state === "completed" && "border-primary bg-primary/10"
        )}
      >
        <Icon className="size-3" strokeWidth={3} />
      </button>
      <NodeViewContent
        as="div"
        className={cx(
          "min-w-0 flex-1",
          (state === "completed" || state === "cancelled") &&
            "text-muted-foreground line-through"
        )}
      />
    </NodeViewWrapper>
  );
}
