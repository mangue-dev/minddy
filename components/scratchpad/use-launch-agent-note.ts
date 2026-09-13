"use client";

import { useScratchpad } from "@/lib/scratchpad-context";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { useAssistantPanel } from "@/lib/assistant-panel-context";

/**
 * Entrust a task, section, or full scratchpad note to Numo. Closing the
 * scratchpad flushes its autosave; the complete task framing then enters the
 * common conversation with the current route project as optional context.
 * Numo's native scratchpad tools replace the external MCP instructions used by
 * the copy-prompt workflow.
 */
export function useLaunchAgentNote(): (
  note: string,
  opts?: { section?: boolean }
) => void {
  const { close: closeScratchpad } = useScratchpad();
  const { openIntent, routeProjectId } = useAssistantPanel();

  return (note: string, opts?: { section?: boolean }) => {
    const text = note.trim();
    if (!text) return;
    closeScratchpad();
    openIntent({
      source: "scratchpad",
      action: "custom",
      projectId: routeProjectId,
      prompt: buildScratchpadPrompt(text, {
        section: opts?.section,
        mcp: false,
      }),
    });
  };
}
