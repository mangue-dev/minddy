/**
 * Questions `ask_user` (MIN-86) — normalized form shared between loops
 * server (Numo `loop.ts`, agent `agent-loop.ts`) and the question card of
 * him. Schema aligned with Claude Code's AskUserQuestion tool: each
 * question carries a short header (chip), a multi-selection mode (checkboxes)
 * or exclusive (radio), and `{label, description}` options including the first
 * can be recommended (“(Recommended)” suffix detected and removed from the label).
 *
 * The parser absorbs ALL historical forms:
 *  - actuelle : `{questions: [{question, header?, multi_select?, options: [{label, description?}]}]}`
 *  - v1 MIN-86 : `{questions: [{question, suggestions: string[]}]}`
 *  - legacy mono-question : `{question, suggestions}`
 * - its own standardized output (round-trip via the agent's feed).
 */

export interface AskUserOption {
  label: string;
  description: string;
  /** Option recommended by the model (1st + suffix “(Recommended)”). */
  recommended: boolean;
}

export interface AskUserQuestion {
  question: string;
  /** Short chip (≤12 characters) displayed as set tab. "" if absent. */
  header: string;
  /** true = several combinable responses (checkboxes); false = radio. */
  multiSelect: boolean;
  options: AskUserOption[];
}

/** Maximum number of questions displayed/transmitted for the same ask_user call. */
export const MAX_ASK_USER_QUESTIONS = 4;

/** Suffix “(Recommended)” / its French translation — detected and then removed from the label. */
const RECOMMENDED_SUFFIX = /\s*\(\s*(?:recommended|recommandée?)\s*\)\s*$/i;

function toOption(raw: unknown): AskUserOption | null {
  let label = "";
  let description = "";
  let recommended = false;
  if (typeof raw === "string") {
    label = raw;
  } else if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    label = typeof rec.label === "string" ? rec.label : "";
    description = typeof rec.description === "string" ? rec.description : "";
    recommended = rec.recommended === true;
  }
  if (RECOMMENDED_SUFFIX.test(label)) {
    label = label.replace(RECOMMENDED_SUFFIX, "");
    recommended = true;
  }
  label = label.trim();
  if (!label) return null;
  return { label, description: description.trim(), recommended };
}

function toQuestion(raw: unknown): AskUserQuestion | null {
  let question = "";
  let header = "";
  let multiSelect = false;
  let rawOptions: unknown;
  if (typeof raw === "string") {
    // Tolerance: the model sometimes sends naked questions.
    question = raw;
  } else if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    question = typeof rec.question === "string" ? rec.question : "";
    header = typeof rec.header === "string" ? rec.header.trim() : "";
    multiSelect = rec.multi_select === true || rec.multiSelect === true;
    rawOptions = rec.options ?? rec.suggestions;
  }
  question = question.trim();
  if (!question) return null;
  const options = Array.isArray(rawOptions)
    ? rawOptions.map(toOption).filter((o): o is AskUserOption => o !== null)
    : [];
  return { question, header, multiSelect, options };
}

export function parseAskUserQuestions(
  args: Record<string, unknown>
): AskUserQuestion[] {
  const out: AskUserQuestion[] = [];
  if (Array.isArray(args.questions)) {
    for (const item of args.questions) {
      const q = toQuestion(item);
      if (q) out.push(q);
    }
  }
  // Forme legacy mono-question ({question, suggestions}).
  if (out.length === 0) {
    const q = toQuestion(args);
    if (q) out.push(q);
  }
  return out.slice(0, MAX_ASK_USER_QUESTIONS);
}

/**
 * Composes the user message which answers a set of questions: the answer alone
 * for a single question, otherwise one `question → answer` line per question
 * (readable in the thread AND unambiguously for the model). An answer
 * multi-selection arrives already joined (“a, b, c”) by the card.
 */
export function composeAskUserReply(
  entries: Array<{ question: string; answer: string }>
): string {
  if (entries.length === 1) return entries[0].answer.trim();
  return entries
    .map((e) => `${e.question.trim()} → ${e.answer.trim()}`)
    .join("\n");
}

export interface AskUserAnswerEntry {
  question: string;
  /** null = response not found in message (free form, skip, old flow). */
  answer: string | null;
}

/**
 * Reverse of `composeAskUserReply`: re-associates the response message from
 * the user to the questions asked, for the folded “details” display of the
 * ask_user line of the thread. Single question → the whole message is the answer;
 * several → we find each line `question → answer`. An answer no
 * matchable (skip, free text typed outside the map) leaves `answer: null` — the
 * surface then displays the raw message.
 */
export function matchAskUserAnswers(
  questions: AskUserQuestion[],
  reply: string | null | undefined
): AskUserAnswerEntry[] {
  const entries: AskUserAnswerEntry[] = questions.map((q) => ({
    question: q.question,
    answer: null,
  }));
  const text = (reply ?? "").trim();
  if (!text) return entries;
  if (entries.length === 1) {
    entries[0].answer = text;
    return entries;
  }
  for (const line of text.split("\n")) {
    for (const e of entries) {
      if (e.answer !== null) continue;
      const prefix = `${e.question.trim()} → `;
      if (line.startsWith(prefix)) {
        e.answer = line.slice(prefix.length).trim() || null;
        break;
      }
    }
  }
  return entries;
}
