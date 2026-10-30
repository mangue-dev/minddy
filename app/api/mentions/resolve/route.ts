import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { boundedText } from "@/lib/server/bounded-body";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { isMentionLinkType } from "@/lib/mention-link";
import type { ObjectiveStatus } from "@/lib/objective-validation";
import {
  MAX_MENTION_REFS,
  mentionKey,
  resolveMentionTargets,
  type MentionRef,
} from "@/lib/server/mention-access";

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 32 * 1024;
const RESOLVES_PER_MINUTE = 600;

/**
 * POST /api/mentions/resolve — what the signed-in reader may see of the
 * mentions a text makes (MIN-734). Body: `{ refs: [{ type, id, meta? }] }`,
 * at most 200; `meta.project` names a skill's project (MIN-872). Answer: `{ mentions: [{ type, id, label, status? }] }`, where `label`
 * is the target's current label, or `null` when it is unknown, deleted or not
 * the reader's to see — the three are indistinguishable on purpose. An
 * objective the reader may see also carries its `status`. See
 * lib/server/mention-access.ts.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimitRefusal(auth.user.id, "mention-resolve", { limit: RESOLVES_PER_MINUTE });
  if (limited) return limited;

  const text = await boundedText(request, MAX_BODY_BYTES);
  let body: unknown = null;
  try {
    body = text === null ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  const raw = (body as { refs?: unknown } | null)?.refs;
  if (!Array.isArray(raw) || raw.length > MAX_MENTION_REFS) {
    return NextResponse.json({ error: "Invalid mentions" }, { status: 400, headers: NO_STORE });
  }
  const refs: MentionRef[] = [];
  for (const item of raw) {
    const { type, id, meta } = (item ?? {}) as { type?: unknown; id?: unknown; meta?: unknown };
    const project = (meta as { project?: unknown } | null | undefined)?.project;
    if (!isMentionLinkType(type) || typeof id !== "string" || id.length > 64 ||
        (project !== undefined && (typeof project !== "string" || project.length > 64))) {
      return NextResponse.json({ error: "Invalid mentions" }, { status: 400, headers: NO_STORE });
    }
    refs.push(typeof project === "string" ? { type, id, meta: { project } } : { type, id });
  }
  const statuses = new Map<string, ObjectiveStatus>();
  const resolution = await resolveMentionTargets(auth.user.id, refs, undefined, statuses);
  return NextResponse.json({
    mentions: refs.map((ref) => {
      const status = statuses.get(mentionKey(ref));
      return { ...ref, label: resolution.get(mentionKey(ref)) ?? null, ...(status ? { status } : {}) };
    }),
  }, { headers: NO_STORE });
}
