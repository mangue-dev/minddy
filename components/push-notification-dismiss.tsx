"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { closeNotificationsForView } from "@/lib/push/dismiss";

/**
 * Closes push notifications for the screen you are currently viewing.
 * No rendering: this component only exists for its effect, next to
 * `<PushServiceWorker />` in the app's providers.
 *
 * ## The three moments when you have to look at
 *
 * They do not overlap, and one would be missing in any pair:
 *
 * • **navigation** — the common case: the notification arrived while
 * that we were doing something else, and we open the ticket from the app ;
 * • **return to the tab** (`visibilitychange`) — the notification is
 * arrived while the page concerned was already open, but in the background.
 * Nothing moves on the road side when you return to it;
 * • **display of a push** (`push-shown`, posted by public/sw.js) — we are
 * RIGHT on the page, in the foreground, when the banner falls. Neither route nor
 * visibility changes: without this message, this one would remain forever.
 *
 * Hence the common condition: we only close if the tab is **visible**. A
 * notification that we haven't had the opportunity to see must remain — a tab
 * forgotten in the background on the right ticket would swallow everything, silently.
 *
 * ## `useSearchParams`, and therefore `<Suspense>`
 *
 * The target of a notification lives in the query (`?issue=…`), not in the
 * path: opening a ticket from your board ONLY changes that. `usePathname`
 * alone would never wake up. This is what requires mounting the component under
 * a `<Suspense>` border, on the app-providers side.
 */
export function PushNotificationDismiss() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const url = search ? `${pathname}?${search}` : pathname;

    const sweep = () => {
      if (document.visibilityState !== "visible") return;
      void closeNotificationsForView(url);
    };

    sweep();

    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === "push-shown") sweep();
    };

    document.addEventListener("visibilitychange", sweep);
    // Optional all the way through: `navigator.serviceWorker` does not exist in
    // context not secure or in Firefox private browsing.
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      document.removeEventListener("visibilitychange", sweep);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [pathname, search]);

  return null;
}
