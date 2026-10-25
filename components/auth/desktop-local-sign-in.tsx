"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { LOCAL_INSTANCE_ORIGIN } from "@/lib/desktop/local-account";
import { getSupabase } from "@/lib/supabase";

/**
 * Signs the desktop app's own local account in (MIN-781).
 *
 * On the minddy the app installed on this computer, nobody should type an
 * email or a password: the app manages that account and hands this page a
 * session (`bridge.localSession`), which the Supabase client adopts like any
 * sign-in. Everywhere else the bridge answers null and the forms stay.
 *
 * On the managed instance's own address the forms are covered while the app
 * answers, so they do not flash before the redirect.
 */
export function DesktopLocalSignIn() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy">("idle");

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.localSession) return;
    if (window.location.origin === LOCAL_INSTANCE_ORIGIN) setState("busy");
    let cancelled = false;
    void (async () => {
      try {
        const session = await bridge.localSession!();
        if (cancelled) return;
        if (!session) {
          setState("idle");
          return;
        }
        setState("busy");
        const { error } = await getSupabase().auth.setSession(session);
        if (cancelled) return;
        if (error) {
          setState("idle");
          return;
        }
        router.replace(sanitizeInternalRedirectPath(new URLSearchParams(window.location.search).get("redirect")));
      } catch {
        if (!cancelled) setState("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state === "idle") return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background" role="status">
      <Spinner className="size-6" />
      <p className="text-sm text-muted-foreground">{t("localSignIn")}</p>
    </div>
  );
}
