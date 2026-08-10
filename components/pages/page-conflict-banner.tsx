"use client";

// LE BANDEAU DE CONFLIT (MIN-271).
//
// Il ne paraît que pour ce que la fusion a refusé de trancher : un bloc que
// deux personnes ont écrit en même temps. Tout le reste — un paragraphe chez
// moi, un autre chez elle — a déjà été fusionné sans rien dire, et c'est le cas
// courant.
//
// Ce qu'il dit tient en une phrase, et il la dit au passé : le document porte
// déjà la version de l'autre. Le bouton n'est donc pas « résoudre », c'est
// « restaurer la mienne » — un retour en arrière explicite, sur un bloc nommé,
// que l'utilisateur peut aussi bien laisser tomber. Ce qu'on ne fait JAMAIS :
// écraser sans le dire, dans un sens ou dans l'autre.

import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { X } from "lucide-react";

import type { PageBlockConflict } from "@/lib/pages-merge";

/** Le début du texte d'un bloc — de quoi le reconnaître dans la page. */
function excerpt(node: PageBlockConflict["mine"]): string {
  if (!node) return "";
  const out: string[] = [];
  const walk = (current: { text?: unknown; content?: unknown }) => {
    if (typeof current.text === "string") out.push(current.text);
    if (Array.isArray(current.content)) {
      for (const child of current.content) {
        walk(child as { text?: unknown; content?: unknown });
      }
    }
  };
  walk(node as { text?: unknown; content?: unknown });
  return out.join("").trim().slice(0, 80);
}

export function PageConflictBanner({
  conflicts,
  onRestore,
  onDismiss,
}: {
  conflicts: PageBlockConflict[];
  onRestore: (conflict: PageBlockConflict) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("Pages");
  if (conflicts.length === 0) return null;

  return (
    <div
      role="status"
      className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t("conflictTitle")}</p>
          <p className="mt-0.5 text-muted-foreground">{t("conflictBody")}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {conflicts.map((conflict) => {
              const text = excerpt(conflict.mine);
              return (
                <li
                  key={conflict.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {conflict.mine === null
                      ? t("conflictBlockDeleted")
                      : text || t("conflictBlockUntitled")}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRestore(conflict)}
                  >
                    {conflict.mine === null
                      ? t("conflictRemoveMine")
                      : t("conflictRestoreMine")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("conflictDismiss")}
          onClick={onDismiss}
          className="-mr-1 -mt-1 size-7 shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
