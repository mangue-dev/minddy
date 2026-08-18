"use client";

// What the PAGE adds to the shared task: its surface area (MIN-274).
//
// The counterpart of `ScratchpadTaskSurface` (components/scratchpad/scratchpad-task.tsx),
// and it only differs where the two surfaces really differ:
//
//  - TO LEAVE. The notebook is a modal: you close it, and its disassembly flushes
// autosave. A page does not close — but the handover has just written a
// `[~]` in the document, and the subsequent navigation would unmount the editor
// with this writing still pending. Hence the explicit `flush()` before
// to leave, exactly like opening a subpage (page-view.tsx).
// - THE PROMPT. `buildPageTaskPrompt` (lib/pages-prompt.ts): the page has a name,
// and its MCP tools are those of the pages.
//  - PROMOTE. Numo already has the page in ambient context (`useAssistantContext`,
// MIN-273): he can therefore remove the task himself once the ticket
// created, what the prompt asks it to do.

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { buildPageTaskPrompt } from "@/lib/pages-prompt";
import {
  TaskSurfaceProvider,
  type TaskSurface,
} from "@/components/scratchpad/task-surface";

export function PageTaskSurface({
  projectId,
  pageTitle,
  flush,
  children,
}: {
  /** The project of the page. Passed AT THE OPENING of Numo (MIN-353): an imposed scope
 *, otherwise the handover would continue the open conversation —
 * perhaps global, or that of another project — instead of opening a thread here. */
  projectId: string;
  /** The DISPLAYED title of the page — so the one you may have just typed. */
  pageTitle: string;
  /** Write what is pending. To wait before any navigation. */
  flush: () => Promise<void>;
  children: ReactNode;
}) {
  const t = useTranslations("Pages");
  const router = useRouter();
  const openAssistant = useAssistantPanel().open;

  const surface = useMemo<TaskSurface>(
    () => ({
      // The MCP block serves the EXTERNAL agent (Claude Code, Cursor) in which we
      // paste: he has the page tools and can check the line when leaving.
      copyPrompt: (markdown) =>
        buildPageTaskPrompt(markdown, { page: pageTitle }),

      // The Numo run starts WITHOUT the block — same rule as the notebook: this
      // that we read in the composer is exactly what is leaving (the server
      // lets pass an already wrapped prompt, cf. `isScratchpadPrompt`).
      launchAgent: (markdown) => {
        const prompt = buildPageTaskPrompt(markdown, {
          page: pageTitle,
          mcp: false,
        });
        setAgentComposeDraft({ kind: "free", prompt });
        void flush().finally(() =>
          router.push(`/agents?compose=${FREE_COMPOSE_PARAM}`)
        );
      },

      promote: (note) => {
        // The panel opens right away — it doesn't unmount the editor, so
        // nothing urges writing; we launch it anyway, so that the `[~]`
        // is gone before Numo rereads the page.
        void flush();
        openAssistant({
          projectId,
          prompt: t("promotePrompt", { note, page: pageTitle }),
        });
      },
    }),
    [t, projectId, pageTitle, flush, router, openAssistant]
  );

  return <TaskSurfaceProvider value={surface}>{children}</TaskSurfaceProvider>;
}
