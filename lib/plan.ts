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
//
// That exclusion is the one thing here that can silently swallow real work, so
// the heading has to BE about questions, not merely mention the word: a work
// section called "The switch (to write once the question has been decided)" used to
// open one (MIN-146), and every task under it stopped counting.
//
// The section still runs until a heading of the same or higher rank — a deeper
// one nests inside it, which is what lets a scratchpad hang "### Detail" under
// its questions. The corollary is worth knowing when WRITING a plan: put the
// sections that follow "## Questions" at that same rank, or they nest inside it
// and the whole plan counts for nothing.
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
/** Heading text without its numbering, emoji or emphasis: "2. **Questions**" → "questions". */
const headingKey = (text: string): string =>
  text
    .replace(/[*_`~]/g, "")
    .replace(/^[^\p{L}]+/u, "")
    .trim()
    .toLowerCase();

/**
 * Opens a questions section — "Questions", "Open questions", "Questions
 * Open”, “Question for you”, “## 2. Questions”.
 *
 * Anchored on purpose: the heading has to START with the word (bar one
 * qualifier), so a work section that merely mentions a question in passing
 * stays work.
 */
const QUESTION_HEADING =
  /^(?:open|remaining|unresolved|outstanding|pending)?\s*questions?\b/i;

export const isQuestionHeading = (text: string): boolean =>
  QUESTION_HEADING.test(headingKey(text));

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
        if (isQuestionHeading(heading[2])) questionRank = rank;
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

/** Does the ticket have an actionable plan (at least one task)? This is the
 * question asked by the UI — “Generate plan” or “Check plan” — and
 * prompts, which ask to WRITE the plan or REREAD it point by point. */
export const hasPlanTasks = (plan: string | null | undefined): boolean =>
  parsePlan(plan).tasks.length > 0;

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

/** Index of the first heading line matching `match` at or after `from`, or -1.
 *  Fence-aware: the walk always starts at line 0 so a '#' inside a code block
 *  opened before `from` is not mistaken for a heading. */
function findHeadingLine(
  lines: string[],
  match: (text: string) => boolean,
  from = 0
): number {
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
      continue;
    }
    if (fence || i < from) continue;
    const heading = lines[i].match(HEADING_LINE);
    if (heading && match(heading[2])) return i;
  }
  return -1;
}

/**
 * Append a markdown block to a plan WITHOUT touching a single existing byte —
 * how a precision that lands after the plan was written gets recorded. The
 * alternative (resending a whole rewritten plan) silently drops whatever the
 * writer didn't happen to carry over, task states included.
 *
 * With `section`, the block goes at the END of the section opened by the
 * matching heading (before the next heading of any level); returns null when no
 * such heading exists, so the caller can say so rather than append elsewhere.
 * Without it, the block goes at the end of the plan — or just above its
 * "Questions" heading when it has one: a checkbox landing under that heading
 * would be read as an open question and count for nothing (see parsePlan). An
 * empty plan simply becomes the block.
 */
export function appendToPlan(
  plan: string | null | undefined,
  block: string,
  section?: string | null
): string | null {
  const addition = block.replace(/^\n+/, "").replace(/\s+$/, "");
  const current = plan ?? "";
  const wanted = section?.trim() ? section.trim().toLowerCase() : null;
  if (!addition) return current;
  if (!current.trim()) return wanted ? null : addition;

  const lines = current.split("\n");
  let insertAt = lines.length;

  if (wanted) {
    const headingIdx = findHeadingLine(
      lines,
      (text) => text.trim().toLowerCase() === wanted
    );
    if (headingIdx === -1) return null;
    const nextHeading = findHeadingLine(lines, () => true, headingIdx + 1);
    if (nextHeading !== -1) insertAt = nextHeading;
  } else {
    const questions = findHeadingLine(lines, isQuestionHeading);
    if (questions !== -1) insertAt = questions;
  }

  // Sit tight under the section rather than after its trailing blank lines.
  while (insertAt > 0 && lines[insertAt - 1].trim() === "") insertAt--;

  const head = lines.slice(0, insertAt);
  // The blank lines the block is being slipped in front of are re-emitted as
  // the single separator below — kept here they would double up.
  let tailAt = insertAt;
  while (tailAt < lines.length && lines[tailAt].trim() === "") tailAt++;
  const tail = lines.slice(tailAt);
  // One blank line between the block and its surroundings, except between two
  // checkbox lines — a gap there would split one list into two on screen.
  const joinsTasks =
    TASK_LINE.test(head[head.length - 1] ?? "") &&
    TASK_LINE.test(addition.split("\n")[0]);
  const out = [...head];
  if (head.length > 0 && !joinsTasks) out.push("");
  out.push(...addition.split("\n"));
  if (tail.length > 0) out.push("", ...tail);
  return out.join("\n");
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
