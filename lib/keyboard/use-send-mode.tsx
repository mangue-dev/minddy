"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import {
  DEFAULT_SEND_MODE,
  isSendShortcut,
  type SendMode,
} from "@/lib/keyboard/send-shortcut";

/**
 * The method of sending the count, as read by composers.
 *
 * A context, and NOT a `useAuth()` placed in each composer: these components
 * are mounted on both sides of the authentication — the public board (MIN-37)
 * renders the same comment field for an anonymous visitor. Go through the
 * account would make them all import `lib/auth-context`, so the Supabase client,
 * in the bundle of a public page which does not load any today.
 *
 * The context therefore carries the value, and only one place fills it: the shell
 * application ([app/(app)/send-mode-boundary.tsx]), which already has the account under
 * hand. Everywhere else — public pages, authentication screens — the
 * default value applies, and this is the correct behavior: without an account, no
 * preferably, so ⌘/Ctrl + Enter.
 */
const SendModeContext = createContext<SendMode>(DEFAULT_SEND_MODE);

export function SendModeProvider({
  mode,
  children,
}: {
  mode: SendMode;
  children: ReactNode;
}) {
  return (
    <SendModeContext.Provider value={mode}>{children}</SendModeContext.Provider>
  );
}

/** The shipping method in effect here. */
export function useSendMode(): SendMode {
  return useContext(SendModeContext);
}

/**
 * The sending test, already linked to the mode - what the composers plug in:
 *
 * ```tsx
 * const isSend = useIsSendShortcut();
 * onKeyDown={(e) => { if (isSend(e)) { e.preventDefault(); send(); } }}
 * ```
 *
 * Stable as long as the mode does not change, to remain poseable depending on a
 * `useCallback` de gestionnaire.
 */
export function useIsSendShortcut() {
  const mode = useSendMode();
  return useCallback(
    (e: {
      key: string;
      metaKey: boolean;
      ctrlKey: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
    }) => isSendShortcut(e, mode),
    [mode],
  );
}
