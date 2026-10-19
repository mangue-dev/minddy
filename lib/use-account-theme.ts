"use client";

import { useCallback, useRef } from "react";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "./auth-context";
import { useAnalytics } from "./use-analytics";
import {
  ACCOUNT_THEME_META_KEY,
  type AccountTheme,
} from "./account-theme";
import {
  resolveThemeAppearance,
  THEME_PRESET_META_KEYS,
  THEME_TRANSPARENCY_META_KEY,
  type ThemeAppearance,
  type ThemeMode,
  type ThemePresetId,
  isThemePresetFor,
} from "./theme-presets";
import {
  applyDocumentAppearance,
  readDocumentAppearance,
  useDocumentAppearance,
} from "./theme-appearance";

/** One counter per field: a failed write reverts only when no newer choice
 * for the SAME field has been made since (rapid A → B → A clicks). */
const writeGenerations: Record<keyof ThemeAppearance, number> = {
  light: 0,
  dark: 0,
  transparency: 0,
};

/**
 * The theme, as an ACCOUNT setting.
 *
 * Wraps the ThemeProvider's `useTheme`: applying stays local and instant (the provider
 * toggles `<html>` and its localStorage cache), and the chosen value is also
 * written to `user_metadata` so every other device picks it up — the proxy
 * re-asserts it to the layout on the next document, and the pre-paint script
 * applies it before the first paint.
 *
 * The mode persistence is fire-and-forget, like the onboarding stamps: the
 * local switch must never feel blocked by a network write, and a failed sync
 * self-heals on the next change (the device keeps working either way).
 * Every UI surface that offers the mode — settings, sidebar submenu, command
 * palette, mobile account sheet — goes through here, which also makes it the
 * single place that emits `theme_changed`. Mode writes patch only `theme`, so
 * they never touch the palettes below.
 *
 * Palettes and the glass toggle (MIN-696) are offered by the settings screen
 * only. They apply to `<html>` at once, then persist; `setPreset` and
 * `setTransparency` resolve to `false` when the write failed, after putting
 * back the last saved value (unless a newer choice superseded it), so the
 * caller can report the failure.
 */
export function useAccountTheme() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { user, updateUserMetadata } = useAuth();
  const { track } = useAnalytics();
  const appearance = useDocumentAppearance();

  // The failure path runs after an await: it must read the account as it is
  // THEN (a previous write may have landed), not as this render captured it.
  const userRef = useRef(user);
  userRef.current = user;

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

  const persist = useCallback(
    async <K extends keyof ThemeAppearance>(
      field: K,
      value: ThemeAppearance[K],
      patch: Record<string, unknown>,
    ): Promise<boolean> => {
      const root = document.documentElement;
      const generation = ++writeGenerations[field];
      applyDocumentAppearance(root, { ...readDocumentAppearance(root), [field]: value });
      if (!userRef.current) return true;
      try {
        await updateUserMetadata(patch);
        return true;
      } catch {
        if (writeGenerations[field] === generation) {
          const saved = resolveThemeAppearance(userRef.current?.user_metadata);
          applyDocumentAppearance(root, {
            ...readDocumentAppearance(root),
            [field]: saved[field],
          });
        }
        return false;
      }
    },
    [updateUserMetadata],
  );

  const setPreset = useCallback(
    (mode: ThemeMode, preset: ThemePresetId): Promise<boolean> => {
      if (!isThemePresetFor(mode, preset)) return Promise.resolve(false);
      track("theme_preset_changed", { mode, preset });
      return persist(mode, preset as ThemeAppearance[typeof mode], {
        [THEME_PRESET_META_KEYS[mode]]: preset,
      });
    },
    [persist, track],
  );

  const setTransparency = useCallback(
    (enabled: boolean): Promise<boolean> => {
      track("account_preference_toggled", { key: THEME_TRANSPARENCY_META_KEY, enabled });
      return persist("transparency", enabled, { [THEME_TRANSPARENCY_META_KEY]: enabled });
    },
    [persist, track],
  );

  return {
    theme,
    resolvedTheme,
    setTheme: setSharedTheme,
    appearance,
    setPreset,
    setTransparency,
  };
}
