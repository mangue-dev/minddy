import { NextResponse, type NextRequest } from "next/server";
import { resolveNumoBackgroundEnabled } from "@/lib/numo-background";
import { getAuthedUser } from "@/lib/server/api-auth";
import { readResultForReader } from "@/lib/server/mention-access";
import { scheduleHomeBriefRewrite } from "@/lib/server/numo/home-brief";
import { getHomeBriefEntryIds, getLatestHomeBrief } from "@/lib/server/numo/home-brief-content";
import {
  homeBriefCoverage,
  homeBriefUsage,
  homeBriefUsageKey,
} from "@/lib/server/numo/home-brief-prompt";
import { getUsageForecast } from "@/lib/server/usage-analytics";
import {
  isJournalUuid,
  listJournalEntryStates,
  markJournalEntriesSeen,
} from "@/lib/server/numo/journal-content";
import { getServiceClient } from "@/lib/supabase-service";
import { aiConsentRefusal } from "@/lib/server/ai-consent";

/**
 * GET /api/home/brief — Numo's word on the home page (MIN-930): the latest
 * version Numo wrote in the background, with its suggestions. Reading it
 * never calls a model itself.
 *
 * The word is shown only while it still tells the truth about the journal
 * entries it covers (read without their text):
 * - an entry it covers changed state or left (closed, deleted): it is
 *   outdated, Home shows none and a rewrite is scheduled;
 * - none of its entries is open or unseen any more: there is nothing to say;
 * - news it gave about a settled entry was seen a while ago: it is still
 *   shown, and a rewrite that leaves that news out is scheduled;
 * - the AI budget's forecast changed (MIN-946): the budget is now on track to
 *   run out before it resets, on another day, or no longer is. The word is
 *   outdated, and a rewrite that says so is scheduled, even when Numo has
 *   written no word yet.
 *
 * `brief: null` also when background Numo is switched off or Numo has
 * written nothing yet (no AI configured, or no journal entry so far).
 */

/** A version this recent may still be followed by the rewrite its turn scheduled. */
const REWRITE_GRACE_MS = 2 * 60_000;
/** Settled news seen this long ago no longer belongs in the word. */
const SETTLED_NEWS_TTL_MS = 10 * 60_000;

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!resolveNumoBackgroundEnabled(auth.user.user_metadata as Record<string, unknown>)) {
    return NextResponse.json({ brief: null });
  }
  const userId = auth.user.id;
  const service = getServiceClient();
  try {
    const [brief, forecast] = await Promise.all([
      getLatestHomeBrief(service, userId),
      getUsageForecast(userId).catch(() => null),
    ]);
    const usageKey = homeBriefUsageKey(homeBriefUsage(forecast));
    if (!brief) {
      if (usageKey) scheduleHomeBriefRewrite(userId);
      return NextResponse.json({ brief: null });
    }
    const states = await listJournalEntryStates(service, userId, brief.journal_entry_ids);
    const coverage = homeBriefCoverage(brief, states, Date.now(), SETTLED_NEWS_TTL_MS, usageKey);
    const settled = Date.now() - Date.parse(brief.generated_at) > REWRITE_GRACE_MS;
    if (coverage !== "current" && coverage !== "empty" && settled) scheduleHomeBriefRewrite(userId);
    if (coverage === "outdated" || coverage === "empty") return NextResponse.json({ brief: null });

    return NextResponse.json({
      brief: {
        id: brief.id,
        content: brief.content,
        // A suggestion fills the composer: its mentions carry the name this
        // reader may see, so they become pills there (stored without names).
        suggestions: await readResultForReader(userId, brief.suggestions, service)
          .catch(() => brief.suggestions),
        generated_at: brief.generated_at,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load Numo's word" }, { status: 503 });
  }
}

/**
 * POST /api/home/brief `{ seen: <brief id> }` — the home page showed this
 * version: the journal entries it covers are marked seen.
 */
export async function POST(request: NextRequest) {
  // The mobile app asks before any AI work (MIN-907, guideline 5.1.2(i)).
  const consentRefusal = await aiConsentRefusal();
  if (consentRefusal) return consentRefusal;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as { seen?: unknown } | null;
  const id = body?.seen;
  if (!isJournalUuid(id)) {
    return NextResponse.json({ error: "Expected { seen: <brief id> }" }, { status: 400 });
  }
  const service = getServiceClient();
  try {
    const entryIds = await getHomeBriefEntryIds(service, auth.user.id, id);
    if (!entryIds) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ seen: await markJournalEntriesSeen(service, auth.user.id, entryIds) });
  } catch {
    return NextResponse.json({ error: "Could not update Numo's journal" }, { status: 503 });
  }
}
