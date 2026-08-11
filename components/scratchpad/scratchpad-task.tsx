"use client";

// Ce que le CARNET ajoute à la tâche partagée : son nœud, et sa surface.
//
// La vue elle-même n'est plus ici — elle est la même dans une page depuis
// MIN-274 (task-item-view.tsx). Ne restent que les deux choses qui sont
// vraiment du carnet : greffer la vue sur le nœud, et dire ce que « confier une
// tâche » veut dire quand elle sort d'un carnet plutôt que d'un document.

import { useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useLaunchAgentNote } from "@/components/scratchpad/use-launch-agent-note";
import {
  TaskSurfaceProvider,
  type TaskSurface,
} from "@/components/scratchpad/task-surface";
import { taskItemNodeView } from "@/components/scratchpad/task-item-view";
import {
  ScratchpadTaskItemBase,
  ScratchpadTaskList,
} from "@/components/scratchpad/task-nodes";

/**
 * La surface « carnet » : ce qui entoure le geste quand la tâche part d'ici.
 *
 * Les trois gestes se ferment sur le carnet AVANT d'ouvrir autre chose, et ce
 * n'est pas de la politesse : son démontage est ce qui flushe l'autosave
 * (scratchpad-editor.tsx), donc ce qui rend durable l'état posé juste avant par
 * la passation. `useLaunchAgentNote` s'en charge pour l'agent ; la promotion le
 * fait à la main, pour laisser la place au panneau de Numo.
 */
export function ScratchpadTaskSurface({ children }: { children: ReactNode }) {
  const t = useTranslations("Scratchpad");
  const { close } = useScratchpad();
  const openAssistant = useAssistantPanel().open;
  const launchNote = useLaunchAgentNote();

  const surface = useMemo<TaskSurface>(
    () => ({
      copyPrompt: (markdown) =>
        buildScratchpadPrompt(markdown, { section: true }),
      launchAgent: (markdown) => launchNote(markdown, { section: true }),
      // Pas de projectId : le panneau suit la route, donc le projet courant si
      // on en consulte un, et en mode global Numo demande lequel — le carnet,
      // lui, est cross-projet.
      promote: (note) => {
        close();
        openAssistant({ prompt: t("promotePrompt", { note }) });
      },
    }),
    [t, close, openAssistant, launchNote]
  );

  return <TaskSurfaceProvider value={surface}>{children}</TaskSurfaceProvider>;
}

/** Le nœud tâche du carnet (task-nodes.ts) + la vue partagée. Le schéma et le
 *  round-trip markdown vivent à part pour rester testables sans React. */
export const ScratchpadTaskItem = ScratchpadTaskItemBase.extend({
  addNodeView() {
    return taskItemNodeView();
  },
});

export { ScratchpadTaskList };
