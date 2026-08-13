"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import {
  DEFAULT_SEND_MODE,
  isSendShortcut,
  type SendMode,
} from "@/lib/keyboard/send-shortcut";

/**
 * Le mode d'envoi du compte, tel que le lisent les composers.
 *
 * Un contexte, et NON un `useAuth()` posé dans chaque composer : ces composants
 * sont montés des deux côtés de l'authentification — le board public (MIN-37)
 * rend le même champ de commentaire pour un visiteur anonyme. Passer par le
 * compte les ferait tous importer `lib/auth-context`, donc le client Supabase,
 * dans le bundle d'une page publique qui n'en charge aucun aujourd'hui.
 *
 * Le contexte porte donc la valeur, et un seul endroit la remplit : la coquille
 * applicative ([app/(app)/send-mode-boundary.tsx]), qui a déjà le compte sous la
 * main. Partout ailleurs — pages publiques, écrans d'authentification — la
 * valeur par défaut s'applique, et c'est le bon comportement : sans compte, pas
 * de préférence, donc ⌘/Ctrl + Entrée.
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

/** Le mode d'envoi en vigueur ici. */
export function useSendMode(): SendMode {
  return useContext(SendModeContext);
}

/**
 * Le test d'envoi, déjà lié au mode — ce que branchent les composers :
 *
 * ```tsx
 * const isSend = useIsSendShortcut();
 * onKeyDown={(e) => { if (isSend(e)) { e.preventDefault(); send(); } }}
 * ```
 *
 * Stable tant que le mode ne change pas, pour rester posable en dépendance d'un
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
