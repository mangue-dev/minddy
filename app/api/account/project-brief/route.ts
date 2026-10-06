import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { MAX_INITIAL_BRIEF_CHARS } from "@/lib/project-brief";
import { getAuthedUser } from "@/lib/server/api-auth";
import { readPageContent } from "@/lib/server/page-content-input";
import { bodyFromMarkdownServer } from "@/lib/server/pages-projection";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";

/** Project and validate a brief without creating a project or storing a page. */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const refused = rateLimitRefusal(auth.user.id, "project-brief", { limit: 30 });
  if (refused) return refused;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const markdown = (body as { markdown?: unknown } | null)?.markdown;
  if (typeof markdown !== "string" || !markdown.trim()) {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  if (markdown.length > MAX_INITIAL_BRIEF_CHARS) {
    return NextResponse.json({ error: t("pageTooLarge") }, { status: 413 });
  }

  try {
    const content = readPageContent(await bodyFromMarkdownServer(markdown));
    if (content === "too-large") {
      return NextResponse.json({ error: t("pageTooLarge") }, { status: 413 });
    }
    if (content === "too-deep" || content === "refused" || content === undefined) {
      return NextResponse.json({ error: t(content === "too-deep" ? "pageTooDeep" : "pageContentRefused") }, { status: 400 });
    }
    return NextResponse.json({ content }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[api/account/project-brief] projection failed:", err);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
