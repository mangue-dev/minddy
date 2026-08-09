import { eventKey } from "@/lib/keyboard/event-key";

/**
 * Le frappé est-il EXACTEMENT « ⌘/Ctrl + `key` » ?
 *
 * « Exactement » est le mot qui compte : ⇧ ou ⌥ en plus font un AUTRE raccourci,
 * et laisser passer ⌘⇧O sur une règle « ⌘ et la lettre O » vole la combinaison
 * du voisin. C'est la même règle que celle du bouton de dictée (⌘⇧D ne doit
 * jamais partir sur ⌘D), sortie ici pour être lisible et testable.
 *
 * La répétition est écartée : un raccourci qui NAVIGUE n'a rien à faire dix fois
 * parce qu'on a gardé la touche enfoncée.
 */
export function matchesModCombo(
  e: Pick<KeyboardEvent, "key" | "repeat" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  key: string
): boolean {
  if (e.repeat || e.shiftKey || e.altKey) return false;
  if (!(e.metaKey || e.ctrlKey)) return false;
  return eventKey(e) === key;
}
