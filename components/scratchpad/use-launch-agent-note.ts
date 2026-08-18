"use client";

import { useRouter } from "next/navigation";
import { useScratchpad } from "@/lib/scratchpad-context";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";

/**
 * “Launch an agent” from the notebook (MIN-84) — the gesture common to the three
 * scopes (a task, a section, the entire notebook): closes the notebook (its
 * disassembly flushes the autosave, cf. scratchpad-editor.tsx), places a draft
 * WITHOUT ticket initiated from the note (the prompt, freely editable before sending) and
 * navigates to the composer of the Agents page, where you choose project, model
 * and branch.
 *
 * The draft carries the COMPLETE prompt, that of “copy the prompt”: framing
 * “ these are personal notes, not a spec", semantics of the boxes, and the
 * section named in plain text. The raw note read "- [~] restart the
 * cron" in a composer that we are supposed to reread and correct before sending —
 * but this was not what the agent was going to receive: the server was packing in
 * its back. What we see is now what leaves (the server lets through
 * a prompt already packaged, cf. `isScratchpadPrompt`), and remains editable.
 *
 * WITHOUT the MCP block, like the run notebook on the server side: the native tools of numo
 * (read_scratchpad / update_scratchpad_task) replace it.
 */
export function useLaunchAgentNote(): (
  note: string,
  opts?: { section?: boolean }
) => void {
  const router = useRouter();
  const { close: closeScratchpad } = useScratchpad();

  return (note: string, opts?: { section?: boolean }) => {
    const text = note.trim();
    if (!text) return;
    closeScratchpad();
    setAgentComposeDraft({
      kind: "free",
      prompt: buildScratchpadPrompt(text, {
        section: opts?.section,
        mcp: false,
      }),
    });
    router.push(`/agents?compose=${FREE_COMPOSE_PARAM}`);
  };
}
