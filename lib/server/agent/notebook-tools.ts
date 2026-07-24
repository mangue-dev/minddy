import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  getScratchpad,
  applyScratchpadTaskChanges,
  type ScratchpadTaskChange,
} from "@/lib/server/scratchpad";
import { createIssueForProject } from "@/lib/server/create-issue";
import { parsePlan, isPlanTaskState } from "@/lib/plan";

/**
 * Tools CARNET de l'agent de code (MIN-84) : un run lancé depuis le carnet de
 * tâches n'est ancré à aucun ticket — son ancrage est la NOTE de son lanceur, et
 * ces tools remplacent les tools ticket (issue-tools.ts) :
 *  - `read_scratchpad`         → l'état VIVANT du carnet du lanceur (contenu,
 *                                 tâches indexées, rev) — la note d'amorce n'est
 *                                 qu'un snapshot.
 *  - `update_scratchpad_task`  → coche/décoche des tâches du carnet par index
 *                                 (même logique que le tool MCP, partagée via
 *                                 applyScratchpadTaskChanges).
 *  - `create_issue`            → promeut le travail en VRAI ticket du projet du
 *                                 run, quand ça le mérite — jamais automatique.
 * Service client : l'accès a été contrôlé au lancement (membre du projet), et le
 * carnet est celui du PROPRIÉTAIRE du run (il est strictement personnel).
 */

export interface NotebookToolContext {
  /** Propriétaire du run — son carnet est celui qu'on lit/écrit. */
  userId: string;
  projectId: string;
  projectKey: string;
}

/** Noms des tools carnet (routés vers ce module par execute.ts). */
export const NOTEBOOK_TOOL_NAMES = new Set([
  "read_scratchpad",
  "update_scratchpad_task",
  "create_issue",
]);

type ToolOutcome = { result: unknown; success: boolean };

function scratchpadPayload(content: string, rev: number) {
  const parsed = parsePlan(content);
  return {
    content,
    rev,
    progress: parsed.progress,
    tasks: parsed.tasks.map((t) => ({
      task_index: t.index,
      text: t.text,
      state: t.state,
    })),
  };
}

async function readScratchpad(ctx: NotebookToolContext): Promise<ToolOutcome> {
  const state = await getScratchpad(getServiceClient(), ctx.userId);
  return { result: scratchpadPayload(state.content, state.rev), success: true };
}

async function updateScratchpadTask(
  ctx: NotebookToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const raw = Array.isArray(args.tasks) ? (args.tasks as Array<Record<string, unknown>>) : [];
  const changes: ScratchpadTaskChange[] = [];
  for (const item of raw) {
    const index = typeof item.task_index === "number" ? item.task_index : NaN;
    if (!Number.isInteger(index) || index < 0 || !isPlanTaskState(item.state)) {
      return {
        result: {
          error:
            "Each change needs a non-negative integer task_index (from read_scratchpad) and a state among pending | in_progress | completed | cancelled.",
        },
        success: false,
      };
    }
    changes.push({ task_index: index, state: item.state });
  }
  if (changes.length === 0) {
    return { result: { error: "tasks is required (at least one change)." }, success: false };
  }

  const expectedRev =
    typeof args.expected_rev === "number" && Number.isInteger(args.expected_rev)
      ? args.expected_rev
      : undefined;
  const outcome = await applyScratchpadTaskChanges(
    getServiceClient(),
    ctx.userId,
    changes,
    expectedRev,
  );
  if (outcome.status === "stale_rev") {
    return {
      result: {
        error: `The notebook changed since rev ${expectedRev} (it is now at rev ${outcome.rev}), so your task indices may no longer match. Call read_scratchpad again for fresh indices and retry.`,
      },
      success: false,
    };
  }
  if (outcome.status === "out_of_range") {
    return {
      result: {
        error: `task_index ${outcome.index} is out of range — the notebook has ${outcome.total} task(s) (valid indices 0..${Math.max(0, outcome.total - 1)}).`,
      },
      success: false,
    };
  }
  if (outcome.status === "conflict") {
    return {
      result: {
        error:
          "The notebook was edited concurrently while applying your change. Call read_scratchpad again for fresh indices and retry.",
      },
      success: false,
    };
  }
  return {
    result: scratchpadPayload(outcome.state.content, outcome.state.rev),
    success: true,
  };
}

async function createIssue(
  ctx: NotebookToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) return { result: { error: "title is required." }, success: false };

  const result = await createIssueForProject({
    projectId: ctx.projectId,
    actorId: ctx.userId,
    viaAssistant: true,
    input: {
      title,
      // `todo` : un ticket issu d'une note déjà en travail n'a rien à trier.
      status: "todo",
      ...(typeof args.description === "string" && args.description.trim()
        ? { description: args.description }
        : {}),
      ...(typeof args.priority === "string" ? { priority: args.priority } : {}),
      ...(typeof args.effort === "string" ? { effort: args.effort } : {}),
    },
  });
  if (!result.ok) {
    return {
      result: { error: result.errorKey ?? result.rawMessage ?? "Issue creation refused." },
      success: false,
    };
  }
  const number = (result.issue as { number?: number }).number;
  return {
    result: {
      ok: true,
      id: (result.issue as { id?: string }).id,
      identifier: typeof number === "number" ? `${ctx.projectKey}-${number}` : null,
      title,
    },
    success: true,
  };
}

/** Exécute un tool carnet. L'appelant a déjà routé sur `NOTEBOOK_TOOL_NAMES`. */
export async function executeNotebookTool(
  ctx: NotebookToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "read_scratchpad":
        return await readScratchpad(ctx);
      case "update_scratchpad_task":
        return await updateScratchpadTask(ctx, args);
      case "create_issue":
        return await createIssue(ctx, args);
      default:
        return { result: { error: `Unknown notebook tool: ${name}` }, success: false };
    }
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
  }
}
