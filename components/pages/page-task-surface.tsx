"use client";

// Page-specific task actions (MIN-274). Pending editor changes are flushed
// before the common Numo entry reads the page. Copy-prompt keeps the external
// MCP instructions, while internal Numo requests carry the canonical page id
// and rely on Numo's native page tools.

import { useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { buildPageTaskPrompt } from "@/lib/pages-prompt";
import {
  TaskSurfaceProvider,
  type TaskSurface,
} from "@/components/scratchpad/task-surface";

export function PageTaskSurface({
  projectId,
  pageId,
  pageTitle,
  flush,
  children,
}: {
  /** Project scope captured with this page-specific request. */
  projectId: string;
  /** Stable page identity carried into Numo together with its displayed title. */
  pageId: string;
  /** The DISPLAYED title of the page — so the one you may have just typed. */
  pageTitle: string;
  /** Persist pending editor changes before Numo reads the page. */
  flush: () => Promise<void>;
  children: ReactNode;
}) {
  const t = useTranslations("Pages");
  const { openIntent } = useAssistantPanel();

  const surface = useMemo<TaskSurface>(
    () => ({
      // The MCP block serves the EXTERNAL agent (Claude Code, Cursor) in which we
      // paste: he has the page tools and can check the line when leaving.
      copyPrompt: (markdown) =>
        buildPageTaskPrompt(markdown, { page: pageTitle }),

      // Internal Numo requests omit the external MCP setup block.
      launchAgent: (markdown) => {
        const prompt = buildPageTaskPrompt(markdown, {
          page: pageTitle,
          mcp: false,
        });
        void flush().finally(() =>
          openIntent({
            source: "page",
            action: "custom",
            projectId,
            prompt,
            pageContext: { projectId, pageId, pageTitle },
          })
        );
      },

      promote: (note) => {
        // The panel does not unmount the editor, but persist the new task state
        // before Numo rereads the page.
        void flush();
        openIntent({
          source: "page",
          action: "promote",
          projectId,
          prompt: t("promotePrompt", { note, page: pageTitle }),
          pageContext: { projectId, pageId, pageTitle },
        });
      },
    }),
    [t, projectId, pageId, pageTitle, flush, openIntent]
  );

  return <TaskSurfaceProvider value={surface}>{children}</TaskSurfaceProvider>;
}
