"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";

/**
 * Bouton « copier » d'un bloc de configuration du site public (MIN-93).
 *
 * Les libellés arrivent en PROPS, traduits côté serveur, et non par un
 * `useTranslations` : un namespace lu depuis un composant client du site public
 * doit être ajouté à `PUBLIC_CLIENT_NAMESPACES`, ce qui le sérialise dans le
 * document des SIX pages publiques — landing comprise, dont le budget d'octets
 * est le sujet entier de MIN-100. Deux chaînes en props coûtent deux chaînes.
 *
 * Retour visuel sur place plutôt qu'un toast : le `Toaster` est déjà chargé
 * paresseusement pour l'app, et ouvrir une notification en bas d'écran pour un
 * bouton qu'on regarde est un aller-retour de l'œil pour rien.
 */
export function CopyButton({
  text,
  label,
  copiedLabel,
  className,
}: {
  /** Ce qui part dans le presse-papiers. */
  text: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  // Le composant peut disparaître pendant les deux secondes d'affichage.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : on ne dit
      // pas « copié » pour autant.
      return;
    }
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? copiedLabel : label}
    </button>
  );
}
