import "server-only";

import { locales, defaultLocale, type Locale } from "@/i18n/config";
import { avatarDataUri } from "@/lib/avatar";
import { ISSUE_PRIORITIES, isPriority } from "@/lib/issue-validation";
import {
  DEMO_CATEGORY_IDS,
  DEMO_MEMBER_IDS,
  type DemoCategoryId,
  type DemoMemberId,
  type DemoTicket,
} from "@/lib/demo-dictation";

/**
 * The PURE parts of the public dictation demo (MIN-150) — entry guards,
 * prompt, and validation of what the model returns.
 *
 * They live here and not in `app/api/demo/dictate/route.ts` * for a simple reason
 *: it is the only Minddy AI endpoint open to an anonymous visitor, and
 * what protects it must be exercisable by a test — but the rest only concerns
 * `lib/**` (see `vitest.config.ts`). The route keeps the orchestration: read the
 * configuration, call OpenRouter, write the expense to the ledger.
 */

/** What the model has the right to write, once validated. */
const MAX_TITLE_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 500;
/** Beyond that, a deadline is no longer a deadline but a hallucination. */
const MAX_DUE_DATE_DAYS = 400;

export interface DemoMember {
  id: DemoMemberId;
  name: string;
}
export interface DemoCategory {
  id: DemoCategoryId;
  name: string;
}

/**
 * Does the POST come from a page served by this host?
 *
 * A browser always sets `Origin` on a POST: a script that would like to use the demo as a free transcription API must at least use the
 * forge. This is the zero-cost filter, not security — the real limits are
 * the IP meter, the daily cap and the admin switch.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * Ceiling of passages per day, in memory therefore PER INSTANCE and reset to zero upon
 * deployment. It's a spending ceiling, not accounting: there is
 * for what the IP counter does not see (rotating addresses).
 */
let dailyWindow = { day: -1, count: 0 };

export function withinDailyBudget(limit: number): boolean {
  const day = Math.floor(Date.now() / 86_400_000);
  if (dailyWindow.day !== day) dailyWindow = { day, count: 0 };
  if (dailyWindow.count >= limit) return false;
  dailyWindow.count += 1;
  return true;
}

/** Start from scratch — for testing only. */
export function resetDailyBudget(): void {
  dailyWindow = { day: -1, count: 0 };
}

// The MIME table → format lives with the transcription client: it is the same
// for the demo, authenticated dictation and dictated feedback. Re-exported here because
// that the entrance guards of the demo are read (and tested) in one piece.
export { resolveAudioFormat } from "@/lib/server/openrouter-transcribe";

export function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value)
    ? (value as Locale)
    : defaultLocale;
}

export function resolveTimeZone(value: unknown): string {
  return typeof value === "string" && value.length > 0 && value.length <= 60
    ? value
    : "UTC";
}

/** "2026-08-02" in the visitor's time zone — the anchor for "Friday", "tomorrow". */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * The unique, forced tool. All fields are in `required`: a small pattern
 * simply does not respond to a field left out of the list, even when the
 * question calls for it.
 */
export const FILL_TICKET_TOOL = {
  type: "function" as const,
  function: {
    name: "fill_ticket",
    description:
      "File the dictated sentence into the issue fields. Call this exactly once.",
    parameters: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Short, concrete issue title, Linear-style, 80 chars max.",
        },
        description: {
          type: "string",
          description:
            "Two or three sentences faithful to what was said. Invent nothing.",
        },
        priority: { type: "string", enum: [...ISSUE_PRIORITIES] },
        due_date: {
          type: ["string", "null"],
          description: "Due date as YYYY-MM-DD, or null when no deadline was said.",
        },
        assignee: {
          type: ["string", "null"],
          enum: [...DEMO_MEMBER_IDS, null],
          description: "Id of the member who was named, or null when nobody was.",
        },
        category: {
          type: ["string", "null"],
          enum: [...DEMO_CATEGORY_IDS, null],
          description: "Id of the category that fits best, or null when none does.",
        },
      },
      required: ["title", "description", "priority", "due_date", "assignee", "category"],
    },
  },
};

export function buildDemoPrompt({
  locale,
  today,
  members,
  categories,
}: {
  locale: Locale;
  today: string;
  members: DemoMember[];
  categories: DemoCategory[];
}): string {
  return `You are Numo, the minddy assistant. A visitor dictated ONE sentence to create an issue. Turn it into a filled issue form by calling fill_ticket exactly once.

## Today
${today} — resolve "demain", "vendredi", "next week" against this date. Express due_date as YYYY-MM-DD.

## Members (assignee ids)
${members.map((m) => `- ${m.id} = ${m.name}`).join("\n")}

## Categories (category ids)
${categories.map((c) => `- ${c.id} = ${c.name}`).join("\n")}

## Rules
- Write title and description in ${locale === "fr" ? "French (with proper accents)" : "English"}, whatever language the sentence is in.
- The title says what the work IS, imperative and concrete — never a transcript of the sentence.
- The description restates what was said, faithfully. NEVER invent facts, steps, causes or numbers.
- Always set priority: read it from the words when stated, estimate it from urgency and impact otherwise.
- assignee only when a person was named, category only when one clearly fits, due_date only when a deadline was said. null otherwise — never guess.
- Call the tool once, then stop. No message after it.`;
}

/**
 * What comes out of the model, brought back to the setting and the enums: an invented member, an invented
 * priority or an absurd date do not come out of here. The endpoint being
 * open, this is the only barrier between an LLM response and the screen.
 */
export function sanitizeDemoTicket(
  raw: Record<string, unknown>,
  {
    transcript,
    today,
    members,
    categories,
  }: {
    transcript: string;
    today: string;
    members: DemoMember[];
    categories: DemoCategory[];
  },
): DemoTicket {
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, MAX_TITLE_CHARS)
      : // A model that has not been able to title must not return an empty card:
        // the phrase itself makes an acceptable title.
        transcript.slice(0, MAX_TITLE_CHARS);
  const description =
    typeof raw.description === "string"
      ? raw.description.trim().slice(0, MAX_DESCRIPTION_CHARS)
      : "";

  let dueDate: string | null = null;
  if (typeof raw.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date)) {
    const days = (Date.parse(raw.due_date) - Date.parse(today)) / 86_400_000;
    if (Number.isFinite(days) && days >= 0 && days <= MAX_DUE_DATE_DAYS) {
      dueDate = raw.due_date;
    }
  }

  const member = members.find((m) => m.id === raw.assignee) ?? null;
  const category = categories.find((c) => c.id === raw.category) ?? null;

  return {
    title,
    description,
    priority: isPriority(raw.priority) ? raw.priority : "none",
    dueDate,
    assignee: member
      ? { id: member.id, name: member.name, avatar: avatarDataUri(member.name) }
      : null,
    category,
  };
}
