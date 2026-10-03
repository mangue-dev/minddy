"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { SITE_NAME } from "@/lib/site";
import type { RetainedAppView } from "@/lib/retained-app-views";

/** Local retained navigation does not run the server metadata route again.
 * Mount before the board so an issue panel can subsequently own its title.
 * Activity reconnects this effect before the panel's DocumentTitle effect. */
export function RetainedBoardTitle({ view }: { view: RetainedAppView }) {
  const client = useQueryClient();
  const t = useTranslations("Meta");
  const subscribe = useCallback((notify: () => void) => client.getQueryCache().subscribe((event) => {
    if (event.query.queryKey.length === 1 && event.query.queryKey[0] === "projects") notify();
  }), [client]);
  const read = useCallback(() => client.getQueryData<{ id: string; name: string }[]>(["projects"])?.find((project) => project.id === view.route.projectId)?.name ?? null, [client, view.route.projectId]);
  const name = useSyncExternalStore(subscribe, read, () => null);
  const title = `${view.kind === "global-board" ? t("all") : name ?? t("project")} · ${SITE_NAME}`;
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const apply = () => {
      // A panel owns any title different from the last board title. When it
      // closes and restores that title, adopt a project rename received meanwhile.
      if (applied.current === null || document.title === applied.current) {
        document.title = title;
        applied.current = title;
      }
    };
    apply();
    const node = document.querySelector("title");
    const observer = new MutationObserver(() => {
      if (document.title !== title && document.title === applied.current) apply();
    });
    if (node) observer.observe(node, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
  useEffect(() => () => { applied.current = null; }, []);
  return null;
}
