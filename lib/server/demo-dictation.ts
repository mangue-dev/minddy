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
 * Les pièces PURES de la démo de dictée publique (MIN-150) — gardes d'entrée,
 * prompt, et validation de ce que le modèle renvoie.
 *
 * Elles vivent ici et pas dans `app/api/demo/dictate/route.ts` pour une raison
 * simple : c'est le seul endpoint IA de minddy ouvert à un visiteur anonyme, et
 * ce qui le protège doit être exerçable par un test — or la suite ne regarde que
 * `lib/**` (voir `vitest.config.ts`). La route garde l'orchestration : lire la
 * configuration, appeler OpenRouter, écrire la dépense au ledger.
 */

/** Ce que le modèle a le droit d'écrire, une fois validé. */
const MAX_TITLE_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 500;
/** Au-delà, une échéance n'est plus une échéance mais une hallucination. */
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
 * Le POST vient-il d'une page servie par cet hôte ?
 *
 * Un navigateur pose toujours `Origin` sur un POST : un script qui voudrait se
 * servir de la démo comme d'une API de transcription gratuite doit au moins le
 * forger. C'est le filtre à coût nul, pas une sécurité — les vraies bornes sont
 * le compteur par IP, le plafond journalier et l'interrupteur d'admin.
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
 * Plafond de passages par jour, en mémoire donc PAR INSTANCE et remis à zéro au
 * déploiement. C'est un plafond de dépense, pas une comptabilité : il existe
 * pour ce que le compteur par IP ne voit pas (adresses tournantes).
 */
let dailyWindow = { day: -1, count: 0 };

export function withinDailyBudget(limit: number): boolean {
  const day = Math.floor(Date.now() / 86_400_000);
  if (dailyWindow.day !== day) dailyWindow = { day, count: 0 };
  if (dailyWindow.count >= limit) return false;
  dailyWindow.count += 1;
  return true;
}

/** Repart de zéro — pour les tests uniquement. */
export function resetDailyBudget(): void {
  dailyWindow = { day: -1, count: 0 };
}

// La table MIME → format vit avec le client de transcription : elle est la même
// pour la démo, la dictée authentifiée et le retour dicté. Ré-exportée ici parce
// que les gardes d'entrée de la démo se lisent (et se testent) d'un seul bloc.
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

/** "2026-08-02" dans le fuseau du visiteur — l'ancre des « vendredi », « demain ». */
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
 * L'outil unique, forcé. Tous les champs sont dans `required` : un petit modèle
 * ne répond simplement pas un champ laissé hors de la liste, même quand la
 * question l'appelle.
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
 * Ce qui sort du modèle, ramené au décor et aux enums : un membre inventé, une
 * priorité inventée ou une date absurde ne sortent pas d'ici. L'endpoint étant
 * ouvert, c'est la seule barrière entre une réponse de LLM et l'écran.
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
      : // Un modèle qui n'a pas su titrer ne doit pas rendre une carte vide :
        // la phrase elle-même fait un titre acceptable.
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
