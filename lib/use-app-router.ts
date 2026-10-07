"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMobileNavigation } from "./mobile-navigation-context";
import { useOptionalAppTabSession } from "./app-tabs-context";

/** Opening is distinct from local selection changes and passive redirects. */
export function useAppNavigation() {
  const session = useOptionalAppTabSession();
  const mobile = useMobileNavigation();
  return useCallback((href: string, open: () => void) => {
    if (mobile) mobile.open(open);
    else if (!session?.reuseDestination(href)) open();
  }, [session, mobile]);
}

/** User navigation reuses exact destinations; replace keeps local URL updates. */
export function useAppRouter() {
  const router = useRouter();
  const open = useAppNavigation();
  return useMemo(() => ({
    ...router,
    push: (...args: Parameters<typeof router.push>) => open(args[0], () => router.push(...args)),
  }), [router, open]);
}
