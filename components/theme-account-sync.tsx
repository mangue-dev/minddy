"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "mangue-ui/components/theme-provider";
import { useAuth } from "@/lib/auth-context";
import {
  ACCOUNT_THEME_META_KEY,
  resolveAccountTheme,
  resolveStoredAccountTheme,
} from "@/lib/account-theme";

/**
 * Reconciles the device theme with the ACCOUNT theme, once per sign-in.
 *
 * The pre-paint path (proxy header → ThemeInitScript) already renders the
 * account theme correctly on every document load; this component covers what
 * a document load cannot see:
 *
 * - **Legacy accounts** — `user_metadata.theme` doesn't exist yet. The current
 *   device preference is CLAIMED as the account setting, so the fleet adopts
 *   itself the first time each account opens the app (same repair-at-session
 *   pattern as the `locale` refresher in AuthProvider). A device without any
 *   stored choice claims nothing: an absence stays an absence.
 * - **Drift within a live session** — a stale localStorage (the cache the
 *   provider reads on mount) is corrected from the metadata right after
 *   hydration instead of waiting for the next reload.
 *
 * Deliberately ONCE per user id, not on every `user` identity change:
 * supabase-js re-issues auth events with fresh objects constantly, and a
 * comparison against a possibly-stale JWT would fight the user's own click
 * while its metadata write is still in flight. Remote changes made on another
 * device land on the next document load — like every other account setting.
 */
export function ThemeAccountSync() {
  const { user, updateUserMetadata } = useAuth();
  const { theme, setTheme } = useTheme();

  // Live mirror of the applied theme: the effect below runs once per user id
  // and must read the CURRENT value, not the one captured at sign-in.
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Once per user id, for the lifetime of the shell.
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user || syncedFor.current === user.id) return;
    syncedFor.current = user.id;

    const saved = resolveAccountTheme(user.user_metadata);
    if (saved) {
      if (themeRef.current !== saved) setTheme(saved);
      return;
    }
    // No account theme yet: claim the device's own preference, once.
    const local = resolveStoredAccountTheme(window.localStorage);
    if (local) {
      void updateUserMetadata({ [ACCOUNT_THEME_META_KEY]: local }).catch(
        () => {},
      );
    }
  }, [user, setTheme, updateUserMetadata]);

  return null;
}
