import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getScratchpad, setScratchpad } from "@/lib/server/scratchpad";
import { MAX_SCRATCHPAD_LENGTH } from "@/lib/scratchpad";
import { withPrivateNoStore } from "@/lib/server/private-response";
import { readRichDocumentInput, writeRichDocument } from "@/lib/server/rich-documents";

/**
 * GET /api/me/scratchpad — the user's single personal notes doc (markdown +
 * task progress). PUT replaces it. Both act *as the user* (RLS self-manage on
 * user_scratchpad), so no service client is needed.
 */
async function readScratchpad(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const state = await getScratchpad(auth.supabase, auth.user.id);
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function writeScratchpad(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const content = (body as { content?: unknown } | null)?.content;
  const rev = (body as { rev?: unknown } | null)?.rev;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 0) {
    return NextResponse.json(
      { error: "rev must be the non-negative integer version you edited from" },
      { status: 400 }
    );
  }
  if (content.length > MAX_SCRATCHPAD_LENGTH) {
    return NextResponse.json({ error: "content too long" }, { status: 400 });
  }

  try {
    const { conflicted, ...state } = await setScratchpad(
      auth.supabase,
      auth.user.id,
      content,
      rev
    );
    // The editor's document of the note (MIN-728), kept only for a clean write
    // and only when its projection is exactly the Markdown just stored: the
    // Markdown, which the notebook tools read line by line, stays the
    // authority, and a merged or clipped write simply has no document.
    const document = (body as { content_doc?: unknown } | null)?.content_doc;
    if (!conflicted && document !== undefined && document !== null) {
      const read = await readRichDocumentInput(document, "notebook");
      if (read.ok && read.markdown.trim() === state.content.trim()) {
        await writeRichDocument({ kind: "notebook", id: auth.user.id, projectId: null }, read.content)
          .catch((error) => console.error("[api/me/scratchpad] document save failed:", (error as Error).message));
      }
    }
    // 409 with the CURRENT server state — the client 3-way merges its edit onto
    // this and retries with the fresh rev.
    return NextResponse.json(state, { status: conflicted ? 409 : 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export const GET = withPrivateNoStore(readScratchpad);
export const PUT = withPrivateNoStore(writeScratchpad);
