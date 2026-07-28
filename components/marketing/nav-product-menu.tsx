"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { NumoFace } from "@/components/numo-face";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * Le menu « Produit » de la nav publique.
 *
 * Pourquoi un menu et pas six liens : la nav pointait quatre ancres au hasard
 * du plan de la page (« Le tracker », « Les agents », « Tarifs », « FAQ »), ce
 * qui obligeait le visiteur à deviner ce qu'il y avait derrière chacune. Un
 * seul mot — Produit — et six entrées qui se lisent d'un coup d'œil demandent
 * un survol de plus, mais suppriment la devinette.
 *
 * ÉCRIT À LA MAIN plutôt qu'avec Radix NavigationMenu : la primitive n'est pas
 * réexportée par `mangue-ui` et le paquet n'est pas résolvable en direct
 * (pnpm strict). L'ajouter en dépendance obligerait à resynchroniser les deux
 * lockfiles du dépôt pour un seul composant.
 *
 * Ce qui est repris de la primitive, parce que c'est ce qui fait la différence
 * entre un menu utilisable et un menu qui se ferme sous le curseur :
 *
 *  - **Fermeture différée.** Sortir du déclencheur pour entrer dans le panneau
 *    fait passer le curseur au-dessus du vide. Sans délai, le menu se ferme
 *    pendant le trajet.
 *  - **Pas de zone morte.** L'espace entre la pastille et le panneau est DANS
 *    la zone survolée (padding du conteneur, pas marge du panneau).
 *  - **Clavier.** Le déclencheur est un vrai bouton : Entrée / Espace / Flèche
 *    bas ouvrent, Échap ferme et rend le focus. Le panneau reste ouvert tant
 *    que le focus est dedans, sinon on ne pourrait pas le traverser au Tab.
 *  - **Tactile.** Le survol n'existe pas : le clic bascule.
 */

/**
 * Les slugs du menu Produit. Union de littéraux, et non `string` : c'est ce qui
 * permet à TypeScript de résoudre `navMenu_${key}_title` en clés réelles et de
 * les confronter au catalogue. Ajouter une entrée sans ajouter ses deux messages
 * ne compile pas.
 */
export type ProductEntryKey =
  | "tracker"
  | "speed"
  | "agents"
  | "numo"
  | "feedback"
  | "more"
  | "mcp";

export type ProductEntry = {
  /** Clé i18n : `navMenu_<key>_title` et `navMenu_<key>_desc`. */
  key: ProductEntryKey;
  href: string;
  /** `null` pour Numo, qui porte son propre logo plutôt qu'une icône générique. */
  icon: LucideIcon | null;
};

/** Délai de grâce avant fermeture, le temps de traverser vers le panneau. */
const CLOSE_DELAY_MS = 140;

export function NavProductMenu({
  entries,
  label,
  locale,
  className,
}: {
  entries: ReadonlyArray<ProductEntry>;
  label: string;
  /** Langue servie : les ancres pointent sur `/fr` quand la page est en français. */
  locale: Locale;
  className?: string;
}) {
  const t = useTranslations("Landing");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Échap ferme et REND LE FOCUS au déclencheur : sans ça, le focus reste sur
  // un élément qui vient de disparaître et la tabulation repart du document.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      // Le focus qui sort du bloc ferme le menu — mais seulement s'il part
      // VRAIMENT ailleurs, d'où le test sur la cible entrante.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex items-center gap-1 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          open ? "text-foreground" : "hover:text-foreground",
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {/* `pt-3` sur le conteneur et non une marge sur le panneau : l'écart avec
          la pastille doit rester survolable, sinon le menu se ferme dès qu'on
          descend vers lui. `-translate-x-1/2` le centre sous son déclencheur. */}
      <div
        id={panelId}
        className={cn(
          "absolute top-full left-1/2 z-50 -translate-x-1/2 pt-3",
          !open && "pointer-events-none",
        )}
      >
        <div
          className={cn(
            // 36rem : deux colonnes où chaque description tient sur UNE ligne.
            // Plus étroit, trois entrées repassaient à la ligne et décalaient
            // leurs voisines — la grille se lisait de travers.
            // Fond OPAQUE, contrairement à la pastille de la nav : le badge du
            // hero transparaissait au travers d'un `bg-popover/95`, et un menu
            // qui laisse lire la page derrière lui se lit deux fois moins vite.
            "w-[min(92vw,36rem)] origin-top rounded-2xl border border-border bg-popover p-2 shadow-xl",
            "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            open ? "translate-y-0 scale-100 opacity-100" : "-translate-y-1 scale-[0.98] opacity-0",
          )}
        >
          <ul className="grid gap-0.5 sm:grid-cols-2">
            {entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <li key={entry.key}>
                  <a
                    href={localizedHref(entry.href, locale)}
                    onClick={() => setOpen(false)}
                    tabIndex={open ? undefined : -1}
                    className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                  >
                    {/* Icônes MONOCHROMES, teintées seulement au survol. Une
                        pastille de couleur par entrée transforme le menu en
                        nuancier et noie la hiérarchie : le titre doit se lire
                        avant l'icône, pas l'inverse. */}
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground transition-colors group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary">
                      {Icon ? (
                        <Icon className="h-4 w-4" />
                      ) : (
                        <NumoFace className="h-3.5 w-auto" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {t(`navMenu_${entry.key}_title`)}
                      </span>
                      <span className="block text-xs leading-snug text-muted-foreground">
                        {t(`navMenu_${entry.key}_desc`)}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
