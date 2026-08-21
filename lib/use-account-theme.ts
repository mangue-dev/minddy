"use client";

import { useCallback } from "react";
import { useTheme } from "mangue-ui/components/theme-provider";
import { useAuth } from "./auth-context";
import { useAnalytics } from "./use-analytics";
import {
  ACCOUNT_THEME_META_KEY,
  type AccountTheme,
} from "./account-theme";

/**
 * The theme, as an ACCOUNT setting.
 *
 * Wraps mango-ui's `useTheme`: applying stays local and instant (the provider
 * toggles `<html>` and its localStorage cache), and the chosen value is also
 * written to `user_metadata` so every other device picks it up — the proxy
 * re-asserts it to the layout on the next document, and the pre-paint script
 * applies it before the first paint.
 *
 * The persistence is fire-and-forget, like the onboarding stamps: the local
 * switch must never feel blocked by a network write, and a failed sync
 * self-heals on the next change (the device keeps working either way).
 * Every UI surface that offers the theme — settings, sidebar submenu, command
 * palette, mobile account sheet — goes through here, which also makes it the
 * single place that emits `theme_changed`.
 */
export function useAccountTheme() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { user, updateUserMetadata } = useAuth();
  const { track } = useAnalytics();

  const setSharedTheme = useCallback(
    (next: AccountTheme) => {
      setTheme(next);
      track("theme_changed", { theme: next });
      if (!user) return;
      void updateUserMetadata({ [ACCOUNT_THEME_META_KEY]: next }).catch(
        () => {},
      );
    },
    [setTheme, track, updateUserMetadata, user],
  );

  return { theme, resolvedTheme, setTheme: setSharedTheme };
}
