"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { resolveSendMode } from "@/lib/keyboard/send-shortcut";
import { SendModeProvider } from "@/lib/keyboard/use-send-mode";

/**
 * The only place that connects the ACCOUNT to the sending shortcut.
 *
 * Composers read the context of [use-send-mode](@/lib/keyboard/use-send-mode);
 * they don't know Supabase, and that's intentional (the public board raises the
 * same fields without account). The reading of `user_metadata` therefore lives here, in the
 * application shell — underneath, everyone has the preference; elsewhere, everything
 * the world is flawed.
 */
export function SendModeBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <SendModeProvider mode={resolveSendMode(user?.user_metadata)}>
      {children}
    </SendModeProvider>
  );
}
