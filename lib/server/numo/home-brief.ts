import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTranslator } from "next-intl";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import type englishCatalog from "@/messages/en.json";
import { displayName } from "@/lib/display-name";
import { mentionLinks, mentionMarkdown, mentionTargetKey } from "@/lib/mention-link";
import { resolveNumoBackgroundEnabled } from "@/lib/numo-background";
import { afterOrNow } from "@/lib/server/after-safe";
import { forcedToolCall } from "@/lib/server/feedback/forced-tool-call";
import { markdownForReader, UNAVAILABLE_MENTION_LABEL } from "@/lib/server/mention-access";
import { resolveConfiguredModel } from "@/lib/server/model-config";
import { accessibleProjectIds } from "@/lib/server/project-access";
import { hasUsageBudget } from "@/lib/server/usage";
import { getServiceClient } from "@/lib/supabase-service";
import { getLatestHomeBriefDigest, writeHomeBrief } from "./home-brief-content";
import {
  buildHomeBriefSystemPrompt,
  buildHomeBriefUserMessage,
  HOME_BRIEF_TOOL,
  homeBriefDigest,
  homeBriefParameters,
  sanitizeHomeBrief,
  selectHomeBriefEntries,
  type HomeBriefEntry,
  type HomeBriefMemory,
} from "./home-brief-prompt";
import {
  listOpenJournalEntries,
  listUnseenJournalEntries,
  type NumoJournalEntry,
} from "./journal-content";
import { listNumoMemories } from "./memory-content";

/**
 * Numo's word on the home page (MIN-930): rewritten in the background after a
 * Numo turn that wrote or closed a journal entry, so the home page is current
 * before the user opens it. One short call (`home_brief_model`) reads the
 * journal's open entries, the closed ones the user has not seen, and their
 * memories, and returns the text and up to four suggestions. Each rewrite is
 * a new version (`home-brief-content.ts`); opening the home page reads the
 * latest one and costs nothing.
 *
 * Nothing is written, and nothing is paid for, when:
 * - background Numo (or its memory) is switched off;
 * - the journal holds nothing open or unseen: the home page then shows no
 *   word at all;
 * - the entries the word would cover are the ones the latest version already
 *   covers, in the same state;
 * - the user has no budget left, or no AI provider answers (an instance
 *   without AI configured): the home page keeps the greeting alone.
 */

export type HomeBriefOutcome =
  | "switched_off"
  | "empty"
  | "unchanged"
  | "budget_exhausted"
  | "no_answer"
  | "written";

const DAY_MS = 86_400_000;

function localeOf(metadata: Record<string, unknown>): Locale {
  return locales.includes(metadata.locale as Locale) ? metadata.locale as Locale : defaultLocale;
}

function age(createdAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(createdAt)) / DAY_MS);
  if (!Number.isFinite(days) || days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** The open entries and the unseen closed ones, each once, newest first. */
function mergeEntries(open: NumoJournalEntry[], unseen: NumoJournalEntry[]): NumoJournalEntry[] {
  const byId = new Map<string, NumoJournalEntry>();
  for (const entry of [...open, ...unseen]) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** Two of the greetings the home page may show, so the model knows what is already said. */
async function greetingsFor(locale: Locale, name: string): Promise<string[]> {
  // Typed as the English catalog, so the greetings' placeholders are known.
  const messages = await loadMessages(locale) as unknown as typeof englishCatalog;
  const t = createTranslator({ locale, messages, namespace: "Home" });
  return name
    ? [t("greetMorning", { name }), t("greetEvening", { name })]
    : [t("greetMorningNoName"), t("greetEveningNoName")];
}

/** The name the home page greets the user with (`app/(app)/home/page.tsx`). */
function greetedName(metadata: Record<string, unknown>, email: string | null): string {
  const text = (key: string) => typeof metadata[key] === "string" ? metadata[key] as string : "";
  return displayName({
    full_name: text("display_name") || text("full_name") || text("name") || null,
    email,
  }, "");
}

export async function rewriteHomeBrief(userId: string,
  service: SupabaseClient = getServiceClient(), now = new Date()): Promise<HomeBriefOutcome> {
  const { data: account, error } = await service.auth.admin.getUserById(userId);
  if (error) throw new Error("Unable to read the account for Numo's home brief");
  const metadata = (account?.user?.user_metadata ?? {}) as Record<string, unknown>;
  if (!resolveNumoBackgroundEnabled(metadata)) return "switched_off";

  const [open, unseen] = await Promise.all([
    listOpenJournalEntries(service, userId),
    listUnseenJournalEntries(service, userId),
  ]);
  const merged = mergeEntries(open, unseen);
  const projectIds = [...new Set(merged.flatMap((entry) => entry.project_id ? [entry.project_id] : []))];
  const visible = projectIds.length ? await accessibleProjectIds(userId, projectIds) : new Set<string>();
  const entries = selectHomeBriefEntries(merged
    .filter((entry) => entry.project_id === null || visible.has(entry.project_id))
    .map((entry): HomeBriefEntry & { conversationId: string | null; createdAt: string } => ({
      id: entry.id,
      age: age(entry.created_at, now),
      state: entry.closed_at ? "settled" : "open",
      seen: entry.seen_at !== null,
      project: entry.project_id ? mentionMarkdown("project", entry.project_id) : null,
      text: entry.content,
      closedReason: entry.closed_reason,
      conversationId: entry.source_conversation_id,
      createdAt: entry.created_at,
    })));
  if (entries.length === 0) return "empty";

  const digest = homeBriefDigest(entries);
  if (await getLatestHomeBriefDigest(service, userId) === digest) return "unchanged";
  if (!(await hasUsageBudget(userId, "assistant", "home_brief_model"))) {
    console.warn("[numo-home-brief] skipped: budget_exhausted");
    return "budget_exhausted";
  }

  const stored = await listNumoMemories(service, userId).catch(() => []);
  const memoryProjects = [...new Set(stored.flatMap((memory) =>
    memory.project_id && !visible.has(memory.project_id) ? [memory.project_id] : []))];
  if (memoryProjects.length) {
    for (const id of await accessibleProjectIds(userId, memoryProjects)) visible.add(id);
  }
  const memories: HomeBriefMemory[] = stored
    .filter((memory) => memory.project_id === null || visible.has(memory.project_id))
    .map((memory) => ({
      scope: memory.project_id ? `project ${mentionMarkdown("project", memory.project_id)}` : "all projects",
      text: memory.content,
    }));
  const name = greetedName(metadata, account?.user?.email ?? null);
  const locale = localeOf(metadata);
  const rawMessage = buildHomeBriefUserMessage({ name: name || null, entries, memories });
  // Stored mentions carry no label: give them the one the user may see, so
  // the model knows what each record is and copies a complete link.
  // A record the user may not see (labelled "unavailable") is never one the
  // word may point to; without the relabeling, no link is trusted at all.
  const relabeled = await markdownForReader(userId, rawMessage, service).catch(() => null);
  const message = relabeled ?? rawMessage;
  const known = new Set(relabeled === null ? [] : mentionLinks(relabeled)
    .filter((link) => link.label !== UNAVAILABLE_MENTION_LABEL)
    .map((link) => mentionTargetKey(link.type, link.id, link.meta)));

  const { model } = await resolveConfiguredModel("home_brief_model").catch(() => ({ model: null }));
  if (!model) return "no_answer";
  const args = await forcedToolCall(
    model,
    buildHomeBriefSystemPrompt({ locale, greetings: await greetingsFor(locale, name) }),
    message,
    HOME_BRIEF_TOOL,
    homeBriefParameters(),
    {
      xTitle: "minddy Numo home brief",
      logPrefix: "[numo-home-brief]",
      modelKey: "home_brief_model",
      maxTokens: 1_024,
      reasoning: "low",
      preferNonReasoning: true,
      timeoutMs: 30_000,
      record: { feature: "numo_home_brief", billTo: { userId } },
    },
  );
  const brief = args ? sanitizeHomeBrief(args, { name: name || null, knownMentions: known }) : null;
  if (!brief) return "no_answer";

  // The conversation that wrote the newest covered entry: the home page
  // opens it to show what Numo did.
  const newest = [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .find((entry) => entry.conversationId);
  await writeHomeBrief(service, userId, {
    content: brief.content,
    suggestions: brief.suggestions,
    journalEntryIds: entries.map((entry) => entry.id),
    journalDigest: digest,
    conversationId: newest?.conversationId ?? null,
  });
  return "written";
}

/**
 * Rewrite the word after the response, best effort: called at the end of a
 * Numo turn that changed the journal. A failure leaves the previous version,
 * and the next change tries again.
 */
export function scheduleHomeBriefRewrite(userId: string): void {
  afterOrNow(async () => {
    try {
      const outcome = await rewriteHomeBrief(userId);
      if (outcome === "written") console.info("[numo-home-brief] written");
    } catch (error) {
      console.error("[numo-home-brief] rewrite_failed:", (error as Error).name);
    }
  });
}
