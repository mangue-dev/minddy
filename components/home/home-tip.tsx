"use client";

// L'astuce du bas de l'accueil (MIN — « Home page »), à la Cursor : une ligne
// discrète, tout en bas, qui apprend un geste de l'application.
//
// Le vivier et la règle qui le tient sont dans lib/home-tips.ts ; ce fichier ne
// s'occupe que du rendu.
//
// Deux points valent d'être dits ici :
//
//  1. **La graine ne se pose qu'au montage**, comme pour le salut juste
//     au-dessus (cf. useGreeting dans app/(app)/home/page.tsx) : un tirage au
//     rendu serveur donnerait une astuce différente de part et d'autre de
//     l'hydratation. Les touches, elles, dépendent de la plateforme
//     (`resolveKeyToken` lit `navigator`) et ont la même contrainte.
//  2. **Le paragraphe est rendu de toute façon**, vide en attendant la graine.
//     Il occupe donc sa ligne dès le premier peint, et l'astuce qui arrive ne
//     pousse rien.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { KbdSequence } from "@/components/ui/kbd";
import { resolveKeyToken } from "@/lib/keyboard/shortcuts";
import { pickTip, tipShortcut } from "@/lib/home-tips";

export function HomeTip() {
  const t = useTranslations("Home.tips");
  const tk = useTranslations("Keyboard");
  const [seed, setSeed] = useState<number | null>(null);

  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  const tip = seed === null ? null : pickTip(seed);
  const shortcut = tip ? tipShortcut(tip) : undefined;

  return (
    // `mt-auto` la colle au bas de la rangée, qui est le bas de la page : la
    // rangée vaut `1fr` quoi qu'elle porte, donc poser l'astuce ici ne déplace
    // pas le composer resté au centre exact de la fenêtre.
    <p className="mt-auto flex min-h-5 flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-8 text-xs text-muted-foreground">
      {tip && (
        <>
          <Lightbulb className="size-3.5 shrink-0" aria-hidden />
          <span className="text-balance">{t(tip.key)}</span>
          {shortcut && (
            <KbdSequence
              keys={shortcut.keys.map((step) => step.map(resolveKeyToken))}
              size="sm"
              separator={tk("then")}
            />
          )}
        </>
      )}
    </p>
  );
}
