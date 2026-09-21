import "server-only";

import {
  defaultLocale,
  locales,
  type Locale,
} from "@/i18n/config";
import { responseLanguageInstruction } from "@/lib/locale-language";
import type { KnowledgeArticle } from "@/lib/server/assistant/knowledge";

/**
 * The PURE parts of the FAQ ask box (MIN-590) — question validation, prompt
 * grounding, and answer extraction.
 *
 * They live here and not in `app/api/faq/answer/route.ts` for the same reason
 * as the dictation demo (`lib/server/demo-dictation.ts`): the endpoint is open
 * to an anonymous visitor, and what protects it must be exercisable by a test
 * — but the rest only concerns `lib/**` (see `vitest.config.ts`). The route
 * keeps the orchestration: read the configuration, call OpenRouter, write the
 * expense to the ledger.
 *
 * There is no retrieval step: the knowledge base is small (a dozen articles,
 * a few dozen kilobytes), so the prompt carries it whole. One completion per
 * question on the cheap fast model of the registry costs a fraction of a
 * cent — a homemade RAG could not be cheaper, only wrong.
 */

/** The pages that show a FAQ section, and where their Q/A lives. */
export const FAQ_SECTIONS = ["landing", "pricing", "mcp"] as const;

export type FaqSection = (typeof FAQ_SECTIONS)[number];

export function isFaqSection(value: unknown): value is FaqSection {
  return (
    typeof value === "string"
    && (FAQ_SECTIONS as readonly string[]).includes(value)
  );
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** Bounds of a legitimate question: long enough to be one, short enough to stay one. */
export const MIN_QUESTION_CHARS = 8;
export const MAX_QUESTION_CHARS = 500;

/** Bound of what we let the model write back. */
const MAX_ANSWER_CHARS = 900;

/**
 * The question as it goes to the model: trimmed, collapsed whitespace, and
 * bounded. `null` on anything else — an empty string, a control-character
 * paste, an oversized novel. The client already enforces the input length;
 * the server repeats it because it is the only boundary that matters.
 */
export function sanitizeFaqQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length < MIN_QUESTION_CHARS) return null;
  if (collapsed.length > MAX_QUESTION_CHARS) return null;
  // Strip control characters (a stray \x00 would ride the prompt for nothing).
  // eslint-disable-next-line no-control-regex
  const cleaned = collapsed.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return cleaned.length >= MIN_QUESTION_CHARS ? cleaned : null;
}

export function resolveFaqLocale(value: unknown): Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value)
    ? (value as Locale)
    : defaultLocale;
}

/**
 * The system prompt: who answers, on what grounds, with what discipline.
 *
 * The grounding is the page's own FAQ entries first (the visitor is reading
 * that page; its answers are canonical), then the product knowledge base —
 * end-user and both-audience articles in full, developer ones as a topic list
 * (operational self-hosting details would push the prompt for little gain on
 * public-site questions). The instruction to answer in the visitor's language
 * rides on the shared helper (`responseLanguageInstruction`), like every other
 * prompt that produces user-facing copy.
 */
export function buildFaqAnswerPrompt(params: {
  section: FaqSection;
  items: readonly FaqItem[];
  articles: readonly KnowledgeArticle[];
  locale: Locale;
}): string {
  const faqBlock = params.items
    .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
    .join("\n\n");
  const fullArticles = params.articles.filter(
    (article) => article.audience !== "developer",
  );
  const developerTopics = params.articles
    .filter((article) => article.audience === "developer")
    .map((article) => `- ${article.title} (topic: \`${article.id}\`): ${article.summary}`)
    .join("\n");

  return [
    "You answer questions from visitors of minddy's public website, in the FAQ section of a page.",
    "minddy is an open-source project tracker for teams working with AI: projects, issues, objectives, agents (MCP), plans, self-hosting.",
    "",
    `The page is the "${params.section}" page. Here are the questions and answers displayed on that page — they are the reference for what it says:`,
    "",
    faqBlock,
    "",
    "You also have minddy's product documentation. End-user and general articles, in full:",
    "",
    ...fullArticles.map(
      (article) => `## ${article.title}\n\n${article.content.trim()}`,
    ),
    "",
    "Developer-oriented topics exist but are not included here; mention them only if the question clearly asks about them:",
    "",
    developerTopics,
    "",
    "Rules:",
    "- Answer ONLY from the material above. If the knowledge does not contain the answer, say so briefly and point the visitor to the FAQ answers above or to the feedback board.",
    "- Never invent prices, limits, dates, or product capabilities.",
    "- Keep the answer short: a few sentences, at most two short paragraphs. Plain text only — no headings, no markdown lists.",
    "- If the question is answered on the page, prefer the page's own wording.",
    "",
    "Answer in this language: " + responseLanguageInstruction(params.locale),
  ].join("\n");
}

/**
 * What the route returns: the assistant message, trimmed to the hard bound.
 * Empty or missing content is a failure for the caller to turn into an error.
 */
export function extractFaqAnswer(content: unknown): string | null {
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_ANSWER_CHARS
    ? `${trimmed.slice(0, MAX_ANSWER_CHARS - 1).trimEnd()}…`
    : trimmed;
}

/**
 * Ceiling of questions per day, in memory therefore PER INSTANCE and reset on
 * deploy. It is a spending ceiling, not accounting: it exists for what the IP
 * meter cannot see (rotating addresses). Same safeguard as the dictation
 * demo, kept separate from it so one feature cannot consume the other's
 * budget.
 */
let dailyWindow = { day: -1, count: 0 };

export function withinFaqDailyBudget(limit: number): boolean {
  const day = Math.floor(Date.now() / 86_400_000);
  if (dailyWindow.day !== day) dailyWindow = { day, count: 0 };
  if (dailyWindow.count >= limit) return false;
  dailyWindow.count += 1;
  return true;
}

/** Start from scratch — for testing only. */
export function resetFaqDailyBudget(): void {
  dailyWindow = { day: -1, count: 0 };
}
