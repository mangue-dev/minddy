import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  getScratchpad,
  applyScratchpadTaskChanges,
  mutateScratchpad,
  setScratchpad,
  type ScratchpadTaskChange,
} from "@/lib/server/scratchpad";
import {
  appendScratchpadTasks,
  splitScratchpadSections,
  MAX_SCRATCHPAD_LENGTH,
  type NewTask,
} from "@/lib/scratchpad";
import { parsePlan, isPlanTaskState } from "@/lib/plan";

/**
 * Tools NOTEBOOK of the code agent (MIN-84, extended to MIN-125): the notebook of
 * PERSONAL tasks of the run launcher — a single markdown note, without notion of
 * project. Served at BOTH anchors: a ticket run holds the notebook of its
 * launcher as well as a run launched from the notebook itself.
 * - `read_scratchpad` → the LIVE state of the notebook (contents, tasks
 * indexed, rev) — the leader is just one snapshot.
 * - `add_scratchpad_tasks` → adds tasks, at the end or under a section.
 * - `update_scratchpad_task` → checks/unchecks tasks by index (same logic
 * as the MCP tool, shared via
 * applyScratchpadTaskChanges).
 * - `set_scratchpad` → rewrites the entire notebook (the way to
 * DELETE a task), under compare-and-swap.
 * Customer service: the notebook is that of the OWNER of the run (it is strictly
 * personal), and the line is keyed by user_id.
 */

export interface ScratchpadToolContext {
  /** Run owner — his notebook is the one we read/write. */
  userId: string | null;
}

/** Names of the tools in this module. They live in `platform-tool-names.ts` since
 * MIN-224 — ROUTING goes down to the microVM, EXECUTION stays here — and are
 * re-exported so nothing has to change import. */
export { SCRATCHPAD_TOOL_NAMES } from "./platform-tool-names";

/** Max number of tasks per call (aligned with Numo chat and MCP). */
const MAX_TASKS_PER_CALL = 50;
/** Cap of the label of an added task. */
const MAX_TASK_TEXT = 2000;

const CONCURRENT_EDIT =
  "The notebook is being edited right now; call read_scratchpad again and retry.";

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
      // The nesting depth: without it, the flat list passes a
      // subtask for a separate task, and the agent loses what the notebook says.
      depth: t.depth,
    })),
  };
}

async function readScratchpad(userId: string): Promise<ToolOutcome> {
  const state = await getScratchpad(getServiceClient(), userId);
  return { result: scratchpadPayload(state.content, state.rev), success: true };
}

async function addScratchpadTasks(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const raw = Array.isArray(args.tasks) ? (args.tasks as Array<Record<string, unknown>>) : null;
  if (!raw || raw.length === 0 || raw.length > MAX_TASKS_PER_CALL) {
    return {
      result: { error: `tasks must be a list of 1 to ${MAX_TASKS_PER_CALL} tasks.` },
      success: false,
    };
  }
  const tasks: NewTask[] = [];
  for (const item of raw) {
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) return { result: { error: "Every task needs a non-empty text." }, success: false };
    if (item.state !== undefined && !isPlanTaskState(item.state)) {
      return {
        result: {
          error: `Invalid task state "${String(item.state)}" — use pending, in_progress, completed or cancelled.`,
        },
        success: false,
      };
    }
    if (
      item.depth !== undefined &&
      (typeof item.depth !== "number" ||
        !Number.isInteger(item.depth) ||
        item.depth < 0)
    ) {
      return {
        result: { error: "depth must be a non-negative integer (0 = top level)." },
        success: false,
      };
    }
    tasks.push({
      text: text.slice(0, MAX_TASK_TEXT),
      state: isPlanTaskState(item.state) ? item.state : "pending",
      depth: typeof item.depth === "number" ? item.depth : 0,
    });
  }
  const section =
    typeof args.section === "string" && args.section.trim() ? args.section.trim() : undefined;

  const service = getServiceClient();
  // The addition is POSITION-INDEPENDENT: mutateScratchpad rereads and reapplies under
  // CAS in case of conflict, so tasks land on the most recent text
  // of the user instead of overwriting their current edition.
  const outcome = await mutateScratchpad(service, userId, (content) =>
    appendScratchpadTasks(content, tasks, section),
  );
  if (outcome.status === "aborted") {
    const current = await getScratchpad(service, userId);
    const known = splitScratchpadSections(current.content)
      .map((s) => s.title)
      .filter((title): title is string => title !== null);
    return {
      result: {
        error: `Section "${section}" was not found. ${known.length > 0 ? `Existing sections: ${known.join(", ")}.` : "The notebook has no sections yet."} Omit "section" to add at the end, or create the heading with set_scratchpad first.`,
      },
      success: false,
    };
  }
  if (outcome.status === "conflict") {
    return { result: { error: CONCURRENT_EDIT }, success: false };
  }
  return {
    result: {
      added: tasks.length,
      ...scratchpadPayload(outcome.state.content, outcome.state.rev),
    },
    success: true,
  };
}

async function updateScratchpadTask(
  userId: string,
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
    userId,
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
    result: {
      // The thread counts on it to say "2 tasks updated".
      updated: changes.length,
      ...scratchpadPayload(outcome.state.content, outcome.state.rev),
    },
    success: true,
  };
}

/**
 * TOTAL rewriting of the notebook — and the only way to DELETE a task.
 * `expected_rev` is MANDATORY here, where Numo chat and MCP leave it
 * optional: this is the overwriting of a personal document without history or undo,
 * written by an autonomous agent — an expired `rev` should be refused, not arbitrated.
 */
async function setScratchpadTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const content = typeof args.content === "string" ? args.content : null;
  if (content === null) {
    return {
      result: {
        error:
          "content must be a string — the FULL new notebook markdown (call read_scratchpad first and keep everything you are not changing). An empty string clears the notebook.",
      },
      success: false,
    };
  }
  if (content.length > MAX_SCRATCHPAD_LENGTH) {
    return {
      result: { error: `The notebook is capped at ${MAX_SCRATCHPAD_LENGTH} characters.` },
      success: false,
    };
  }
  const expectedRev = args.expected_rev;
  if (typeof expectedRev !== "number" || !Number.isInteger(expectedRev) || expectedRev < 0) {
    return {
      result: {
        error:
          "expected_rev is required — pass the `rev` of the read_scratchpad your content is based on, so a concurrent edit by the user can never be overwritten.",
      },
      success: false,
    };
  }

  const write = await setScratchpad(getServiceClient(), userId, content, expectedRev);
  if (write.conflicted) {
    return {
      result: {
        error: `The notebook changed since rev ${expectedRev} (it is now at rev ${write.rev}) — the user edited it meanwhile, and nothing was written. Call read_scratchpad again, reapply your change onto the fresh content, then retry.`,
      },
      success: false,
    };
  }
  return { result: scratchpadPayload(write.content, write.rev), success: true };
}

/** Runs a notebook tool. The caller has already routed to `SCRATCHPAD_TOOL_NAMES`. */
export async function executeScratchpadTool(
  ctx: ScratchpadToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const userId = ctx.userId;
  if (!userId) {
    return {
      result: { error: "This run has no owner, so there is no notebook to read or write." },
      success: false,
    };
  }
  try {
    switch (name) {
      case "read_scratchpad":
        return await readScratchpad(userId);
      case "add_scratchpad_tasks":
        return await addScratchpadTasks(userId, args);
      case "update_scratchpad_task":
        return await updateScratchpadTask(userId, args);
      case "set_scratchpad":
        return await setScratchpadTool(userId, args);
      default:
        return { result: { error: `Unknown scratchpad tool: ${name}` }, success: false };
    }
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
  }
}
