"use client";

// What the NOTEBOOK adds to the shared task: its node, and its surface.
//
// The view itself is no longer here — it's the same in a page since
// MIN-274 (task-item-view.tsx). Only the two things remain which are
// really from the notebook: graft the view onto the node, and say what “entrust a
// task” means when it comes out of a notebook rather than a document.

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
 * The “notebook” surface: what surrounds the gesture when the task leaves here.
 *
 * The three gestures close on the notebook BEFORE opening anything else, and this
 * is not polite: its dismantling is what flushes the autosave
 * (scratchpad-editor.tsx), therefore which makes the state set just before by
 * sustainable. `useLaunchAgentNote` takes care of this for the agent; the promotion
 * handmade, to make room for the Numo panel.
 */
export function ScratchpadTaskSurface({ children }: { children: ReactNode }) {
  const t = useTranslations("Scratchpad");
  const { close } = useScratchpad();
  const { open: openAssistant, routeProjectId } = useAssistantPanel();
  const launchNote = useLaunchAgentNote();

  const surface = useMemo<TaskSurface>(
    () => ({
      copyPrompt: (markdown) =>
        buildScratchpadPrompt(markdown, { section: true }),
      launchAgent: (markdown) => launchNote(markdown, { section: true }),
      // The ROUTE project, therefore the current project if we consult one, and
      // the global mode otherwise — where Numo asks which one. The notebook is
      // cross-project, it does not impose any on its side.
      //
      // Passed explicitly from MIN-353: omit `projectId` no longer wanted
      // say “follow the way”, but “don’t touch the open conversation”.
      promote: (note) => {
        close();
        openAssistant({
          projectId: routeProjectId,
          prompt: t("promotePrompt", { note }),
        });
      },
    }),
    [t, close, openAssistant, routeProjectId, launchNote]
  );

  return <TaskSurfaceProvider value={surface}>{children}</TaskSurfaceProvider>;
}

/** The notebook task node (task-nodes.ts) + the shared view. The schema and the
 * round-trip markdown live separately to remain testable without React. */
export const ScratchpadTaskItem = ScratchpadTaskItemBase.extend({
  addNodeView() {
    return taskItemNodeView();
  },
});

export { ScratchpadTaskList };
