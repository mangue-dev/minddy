"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { formatModShortcut } from "@/lib/keyboard/shortcuts";

/**
 * Mode zen (MIN-134) : le board seul, sans barre latérale, sans header, sans le
 * FAB de Numo. Il se bascule DEPUIS LA PALETTE uniquement — lui donner un bouton
 * ajouterait un élément d'interface à celle qu'il prétend épurer.
 *
 * L'état vit en mémoire, et nulle part ailleurs. C'est le filet de sécurité :
 * qui l'a activé par mégarde et ne sait plus comment en sortir recharge la page
 * — le réflexe universel — et retrouve son interface. Le poser en sessionStorage
 * survivrait au rechargement et refermerait cette porte de sortie ; localStorage,
 * pire, la condamnerait pour toutes les sessions à venir.
 *
 * Le toast d'activation dit donc les deux sorties : ⌘K, et le rechargement.
 * En sortie, pas de toast : le header et la sidebar qui reviennent le disent
 * déjà, mieux qu'une phrase.
 */
interface ZenModeContextValue {
  /** Chrome masqué (sidebar, header, FAB). */
  zen: boolean;
  toggle: () => void;
}

const ZenModeContext = createContext<ZenModeContextValue | null>(null);

export function ZenModeProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Nav");
  const [zen, setZen] = useState(false);

  // Le toast se déclenche AVANT le setState, pas dedans : un updater doit rester
  // pur — React le rejoue (StrictMode en dev, et rien ne garantit un seul appel
  // en général), et le toast partait alors en double.
  const toggle = useCallback(() => {
    // Le raccourci se lit à la bascule, jamais au rendu : on est déjà dans le
    // navigateur, donc `navigator` dit la vraie plateforme (⌘K ou Ctrl+K).
    if (!zen) toast.success(t("zenModeOn", { shortcut: formatModShortcut("K") }));
    setZen((on) => !on);
  }, [zen, t]);

  const value = useMemo<ZenModeContextValue>(() => ({ zen, toggle }), [zen, toggle]);

  return <ZenModeContext.Provider value={value}>{children}</ZenModeContext.Provider>;
}

export function useZenMode(): ZenModeContextValue {
  const ctx = useContext(ZenModeContext);
  if (!ctx) {
    throw new Error("useZenMode must be used within a ZenModeProvider");
  }
  return ctx;
}
