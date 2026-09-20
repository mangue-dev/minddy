"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";

/** Only a UUID can name a conversation; anything else is junk the panel would
 * try to load and then report as an error. Same shape as the server-side
 * `NUMO_UUID`, kept local so this client component stays client-only. */
const NUMO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Compat surface for the retired `/numo` and `/agents` pages: every Numo
 * conversation lives in the FAB now, which has no URL. Their links are already
 * in circulation — push payloads delivered before the retirement, saved views,
 * bookmarks, app builds not yet updated — and must not die in a 404. This
 * surface opens the panel on the conversation the link named, then lands on
 * home. `?issue=` links and unresolvable references open the panel on the live
 * thread: nothing better can be derived from them.
 */
export function NumoCompatRedirect({
  retired,
}: {
  retired: "numo" | "agents";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = useAssistantPanelActions().open;
  // One-shot: `open` and `searchParams` may change identity while the async
  // body runs; the redirect must not replay itself because of that.
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    void (async () => {
      let conversationId: string | null = null;
      if (retired === "numo") {
        const conversation = searchParams.get("conversation");
        if (conversation && NUMO_ID.test(conversation)) {
          conversationId = conversation;
        }
      } else {
        // `/agents?run=` carried either a worker conversation id or a run id.
        // Ask the server for the common identity, best effort: a link that
        // resolves to nothing still opens the panel rather than a 404.
        const run = searchParams.get("run");
        if (run && NUMO_ID.test(run)) {
          for (const source of ["agent", "run"] as const) {
            const res = await fetch(
              `/api/numo/resolve?id=${encodeURIComponent(run)}&source=${source}`,
            ).catch(() => null);
            if (!res?.ok) continue;
            const resolved = (await res.json().catch(() => null)) as {
              conversationId?: string;
            } | null;
            if (resolved?.conversationId) {
              conversationId = resolved.conversationId;
              break;
            }
          }
        }
      }
      open({ conversationId });
      router.replace("/home");
    })();
  }, [open, router, retired, searchParams]);

  return null;
}
