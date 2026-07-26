// Per-issue implementation plan: parsing, per-line state rewrites and
// before/after diffing of the plan markdown. Server-safe (no React import) so
// both the UI renderer and the event emitter share ONE parser.
//
// The markdown is the single source of truth. Tasks are checkbox lines:
//   - [ ] pending · - [~] in progress · - [x] completed · - [-] cancelled
// Checkboxes under a "Questions" heading are OPEN QUESTIONS, not work: they
// stay tasks (same indices, same interactions — ticking one means "answered")
// but count for nothing, so a plan waiting on three decisions doesn't read as
// 0/8 when it holds 5 real steps.
// Known v1 limitation: a checkbox inside a blockquote or an ordered list is
// still parsed as a task (rendered without its surrounding decoration).

export const PLAN_TASK_STATES = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type PlanTaskState = (typeof PLAN_TASK_STATES)[number];

/** Hard cap on the stored plan markdown (protects the diff and prompt contexts). */
export const MAX_PLAN_LENGTH = 65_536;

export interface PlanTask {
  /** 0-based order among tasks — identity (with text) for event diffing. */
  index: number;
  /** Index into plan.split("\n") — identity for single-line rewrites. */
  line: number;
  /** Nesting depth (0 = top-level), derived from leading whitespace. */
  depth: number;
  /** Label after the marker, trimmed (inline markdown preserved). */
  text: string;
  state: PlanTaskState;
  /** Sits under a "Questions" heading: an open question, not a work task. */
  question: boolean;
}

/** Cancelled tasks and questions are excluded from both counts. */
export interface PlanProgress {
  done: number;
  total: number;
}

export type PlanSegment =
  | { kind: "prose"; markdown: string }
  | { kind: "tasks"; tasks: PlanTask[] };

export interface ParsedPlan {
  tasks: PlanTask[];
  segments: PlanSegment[];
  progress: PlanProgress;
}

// Groups: 1 = indentation, 2 = bullet + brackets prefix, 3 = state char, 4 = text.
const TASK_LINE = /^(\s*)([-*+] \[)([ ~xX-])(\]\s+)(.*)$/;
const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;
// Groups: 1 = hashes (rank), 2 = heading text.
const HEADING_LINE = /^\s{0,3}(#{1,6})\s+(.*)$/;
/** Opens a questions section — "Questions", "Open questions", "Questions ouvertes". */
const QUESTION_HEADING = /\bquestions?\b/i;

const STATE_BY_MARKER: Record<string, PlanTaskState> = {
  " ": "pending",
  "~": "in_progress",
  x: "completed",
  X: "completed",
  "-": "cancelled",
};

const MARKER_BY_STATE: Record<PlanTaskState, string> = {
  pending: " ",
  in_progress: "~",
  completed: "x",
  cancelled: "-",
};

export const isPlanTaskState = (v: unknown): v is PlanTaskState =>
  typeof v === "string" && (PLAN_TASK_STATES as readonly string[]).includes(v);

/** Indentation width with tabs counted as 4 columns. */
const indentDepth = (ws: string): number => {
  let cols = 0;
  for (const ch of ws) cols += ch === "\t" ? 4 : 1;
  return Math.floor(cols / 2);
};

export function parsePlan(plan: string | null | undefined): ParsedPlan {
  const tasks: PlanTask[] = [];
  const segments: PlanSegment[] = [];
  if (!plan) return { tasks, segments, progress: { done: 0, total: 0 } };

  const lines = plan.split("\n");
  let proseStart: number | null = null;
  let fence: string | null = null; // opening fence chars while inside a code block
  // Rank of the open "Questions" heading, null outside one. A heading of the
  // same or higher rank closes the section; a deeper one nests inside it.
  let questionRank: number | null = null;

  const flushProse = (end: number) => {
    if (proseStart === null) return;
    const markdown = lines.slice(proseStart, end).join("\n");
    if (markdown.trim()) segments.push({ kind: "prose", markdown });
    proseStart = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fenceMatch = line.match(FENCE_LINE);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      )
        fence = null;
    }

    if (!fence) {
      const heading = line.match(HEADING_LINE);
      if (heading) {
        const rank = heading[1].length;
        if (questionRank !== null && rank <= questionRank) questionRank = null;
        if (QUESTION_HEADING.test(heading[2])) questionRank = rank;
      }
    }

    const match = fence ? null : line.match(TASK_LINE);
    if (!match) {
      if (proseStart === null) proseStart = i;
      continue;
    }

    flushProse(i);
    const task: PlanTask = {
      index: tasks.length,
      line: i,
      depth: indentDepth(match[1]),
      text: match[5].trim(),
      state: STATE_BY_MARKER[match[3]],
      question: questionRank !== null,
    };
    tasks.push(task);

    const last = segments[segments.length - 1];
    if (last?.kind === "tasks") last.tasks.push(task);
    else segments.push({ kind: "tasks", tasks: [task] });
  }
  flushProse(lines.length);

  const active = tasks.filter((t) => t.state !== "cancelled" && !t.question);
  return {
    tasks,
    segments,
    progress: {
      done: active.filter((t) => t.state === "completed").length,
      total: active.length,
    },
  };
}

export const planProgress = (plan: string | null | undefined): PlanProgress =>
  parsePlan(plan).progress;

/** Rewrite exactly one task line's state marker, leaving every other byte intact. */
export function setTaskState(
  plan: string,
  line: number,
  state: PlanTaskState
): string {
  const lines = plan.split("\n");
  const match = lines[line]?.match(TASK_LINE);
  if (!match) return plan;
  lines[line] = match[1] + match[2] + MARKER_BY_STATE[state] + match[4] + match[5];
  return lines.join("\n");
}

/** The plan with every task marker normalized to "[ ]" — used to tell pure
 *  state flips apart from real content edits. */
export function stripTaskStates(plan: string | null | undefined): string {
  if (!plan) return "";
  const lines = plan.split("\n");
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = lines[i].match(FENCE_LINE);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      )
        fence = null;
    }
    if (fence) continue;
    const match = lines[i].match(TASK_LINE);
    if (match) lines[i] = match[1] + match[2] + " " + match[4] + match[5];
  }
  return lines.join("\n");
}

export interface PlanTaskTransition {
  text: string;
  from: PlanTaskState;
  to: PlanTaskState;
}

/**
 * State transitions between two versions of the plan. Tasks are paired by
 * normalized text; duplicate texts are paired by order of appearance.
 * Added/removed tasks yield no transition (covered by the "plan edited" event).
 */
export function diffPlanTasks(
  before: string | null | undefined,
  after: string | null | undefined
): PlanTaskTransition[] {
  const group = (plan: string | null | undefined) => {
    const byText = new Map<string, PlanTask[]>();
    for (const task of parsePlan(plan).tasks) {
      const key = task.text;
      const bucket = byText.get(key);
      if (bucket) bucket.push(task);
      else byText.set(key, [task]);
    }
    return byText;
  };

  const beforeByText = group(before);
  const transitions: PlanTaskTransition[] = [];
  for (const [text, afterTasks] of group(after)) {
    const beforeTasks = beforeByText.get(text);
    if (!beforeTasks) continue;
    const n = Math.min(beforeTasks.length, afterTasks.length);
    for (let i = 0; i < n; i++) {
      if (beforeTasks[i].state !== afterTasks[i].state) {
        transitions.push({
          text,
          from: beforeTasks[i].state,
          to: afterTasks[i].state,
        });
      }
    }
  }
  return transitions;
}
