"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "mangue-ui";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";
import { eventKey } from "@/lib/keyboard/event-key";

/**
 * Le champ de filtre de la ligne de titre d'une sidebar secondaire.
 *
 * Ce n'est PAS la recherche de l'application — celle du header ouvre la palette,
 * une modale qui cherche partout et qui emmène ailleurs. Celui-ci réduit la
 * liste qui est juste en dessous, en place, et rien d'autre. D'où le vocabulaire
 * (« Filtrer les… », jamais « Rechercher ») et l'apparence : ni bordure ni fond,
 * la même grammaire discrète que les déclencheurs de filtre de l'app, pas un
 * champ de formulaire. Deux boîtes de recherche sur la même bande de 60 px, aux
 * deux bouts de l'écran, ne doivent pas se ressembler.
 *
 * Le placeholder NOMME la liste : c'est lui qui reprend le rôle du titre qu'on a
 * retiré de cette ligne (le fil d'Ariane l'écrivait déjà, 340 px plus à droite).
 */
export function SidebarFilterField({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /** « Filtrer les pull requests… » — sert aussi d'étiquette accessible. */
  placeholder: string;
  /** Étiquette du bouton d'effacement (lecteur d'écran + survol). */
  clearLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // `/` met le focus ici, où qu'on soit sur la page. Une seule sidebar
  // secondaire est montée à la fois, donc pas d'ambiguïté sur la cible ; le test
  // `offsetParent` écarte le cas où elle est repliée (mobile, détail ouvert),
  // où voler le focus vers un champ invisible ne mènerait nulle part.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Pas de garde sur `shiftKey` : en AZERTY, « / » SE TAPE avec Shift. C'est
      // `e.key` qui tranche, et il ne peut pas valoir « / » et « ? » à la fois —
      // le raccourci de l'aide-mémoire reste donc intact.
      if (eventKey(e) !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const input = ref.current;
      if (!input || input.offsetParent === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        // `text-base` sous md : en dessous de 16 px, iOS zoome sur le champ au
        // focus et ne redézoome jamais.
        className={cn(
          "min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm",
          "placeholder:text-muted-foreground",
        )}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          // La touche ne doit pas remonter : elle fermerait le volet mobile ou
          // le dialogue parent alors qu'on voulait juste vider le filtre.
          e.stopPropagation();
          if (value) onChange("");
          else ref.current?.blur();
        }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label={clearLabel}
          className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * La normalisation partagée par tous les filtres de sidebar : minuscules, sans
 * accents. « Décor » doit se trouver en tapant « decor », et l'inverse aussi.
 */
export function normalizeFilterText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Vrai si TOUS les mots de la requête se retrouvent dans l'un des champs offerts.
 * Les mots, et pas la chaîne entière : « numo auth » doit matcher une PR dont le
 * titre porte l'un et la branche l'autre.
 */
export function matchesFilter(
  query: string,
  fields: (string | null | undefined)[],
): boolean {
  const words = normalizeFilterText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeFilterText(
    fields.filter((f): f is string => !!f).join(" "),
  );
  return words.every((w) => haystack.includes(w));
}
