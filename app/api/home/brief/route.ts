import { NextResponse, type NextRequest } from "next/server";
import { resolveNumoBackgroundEnabled } from "@/lib/numo-background";
import { getAuthedUser } from "@/lib/server/api-auth";
import { scheduleHomeBriefRewrite } from "@/lib/server/numo/home-brief";
import { getHomeBriefEntryIds, getLatestHomeBrief } from "@/lib/server/numo/home-brief-content";
import { homeBriefCoverage } from "@/lib/server/numo/home-brief-prompt";
import {
  isJournalUuid,
  listJournalEntryStates,
  markJournalEntriesSeen,
} from "@/lib/server/numo/journal-content";
import { getServiceClient } from "@/lib/supabase-service";

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
 *   shown, and a rewrite that leaves that news out is scheduled.
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
    const brief = await getLatestHomeBrief(service, userId);
    if (!brief) return NextResponse.json({ brief: null });
    const states = await listJournalEntryStates(service, userId, brief.journal_entry_ids);
    const coverage = homeBriefCoverage(brief, states, Date.now(), SETTLED_NEWS_TTL_MS);
    const settled = Date.now() - Date.parse(brief.generated_at) > REWRITE_GRACE_MS;
    if (coverage !== "current" && coverage !== "empty" && settled) scheduleHomeBriefRewrite(userId);
    if (coverage === "outdated" || coverage === "empty") return NextResponse.json({ brief: null });

    // The conversation may have left with its wake (retention): no link then.
    let conversationId = brief.conversation_id;
    if (conversationId) {
      const { data } = await service.from("conversations").select("id")
        .eq("id", conversationId).eq("user_id", userId).maybeSingle();
      if (!data) conversationId = null;
    }
    return NextResponse.json({
      brief: {
        id: brief.id,
        content: brief.content,
        suggestions: brief.suggestions,
        conversation_id: conversationId,
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
