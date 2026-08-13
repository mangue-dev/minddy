"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { resolveSendMode } from "@/lib/keyboard/send-shortcut";
import { SendModeProvider } from "@/lib/keyboard/use-send-mode";

/**
 * Le seul endroit qui relie le COMPTE au raccourci d'envoi.
 *
 * Les composers lisent le contexte de [use-send-mode](@/lib/keyboard/use-send-mode) ;
 * eux ne connaissent pas Supabase, et c'est voulu (le board public monte les
 * mêmes champs sans compte). La lecture du `user_metadata` vit donc ici, dans la
 * coquille applicative — dessous, tout le monde a la préférence ; ailleurs, tout
 * le monde a le défaut.
 */
export function SendModeBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <SendModeProvider mode={resolveSendMode(user?.user_metadata)}>
      {children}
    </SendModeProvider>
  );
}
