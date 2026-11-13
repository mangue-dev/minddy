"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { showInbox } from "@/lib/inbox-launcher";
import { getMobileBridge } from "@/lib/mobile/bridge";
import { resolveOpenPath } from "@/lib/mobile/open-path";

/**
 * Opens the paths the mobile shell hands the page (MIN-907): a notification
 * tapped or a universal link followed while the product is on screen. The
 * shell reloads the WebView only when no page listens, as on the sign-in
 * screens.
 */
export function MobileOpenPathListener() {
  const router = useRouter();
  useEffect(() => {
    const shell = getMobileBridge()?.shell;
    if (!shell?.addListener) return;
    const handle = shell.addListener("openPath", ({ path }) => {
      const action = resolveOpenPath(path);
      if (!action) return;
      if (action.kind === "inbox") showInbox();
      else router.push(action.href);
    });
    return () => {
      void Promise.resolve(handle).then((listener) => listener.remove(), () => {});
    };
  }, [router]);
  return null;
}
