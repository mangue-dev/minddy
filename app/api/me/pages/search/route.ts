import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { runPageSearch } from "@/lib/server/pages-search";

/** What ⌘K displays at once: beyond that, we type, we don't scroll. */
const MAX_HITS = 20;

/**
 * GET /api/me/pages/search?q= — search the CONTENT of pages of ALL my
 * projects (MIN-276).
 *
 * The counterpart of `/api/me/search-index`, and its opposite in form: this
 * index is a snapshot that we load once per tab, because the
 * titles are filtered as you type without a server. The bodies do not descend
 * not in the browser — we are not going to send the entire wiki to search for it
 * at the customer. So one route per typing, delayed, limited to twenty lines.
 *
 * No listing of projects here: the research goes to the SESSION client,
 * and `search_pages` is SECURITY INVOKER — it's `pages_select`, so
 * `can_access_project`, which decides what I see. A page of a project that
 * is not mine does not come out, and the road does not have to know it.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!query.trim()) return NextResponse.json([]);

  const result = await runPageSearch(auth.supabase, {
    query,
    limit: MAX_HITS,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(result.hits);
}
