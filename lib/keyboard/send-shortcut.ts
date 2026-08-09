/**
 * Le raccourci d'ENVOI, dit une seule fois pour toute l'application :
 * ⌘/Ctrl + Entrée envoie, Entrée seule passe à la ligne.
 *
 * Il vit ici, hors de tout composant, pour deux raisons : la règle est pure —
 * elle se teste sans monter de DOM — et les surfaces qui la LISENT (le tooltip
 * et les pastilles de [components/send-shortcut.tsx]) tirent mangue-ui derrière
 * elles, ce dont un test node n'a que faire. Les deux moitiés du geste restent
 * donc solidaires, sans que la touche dépende de l'habillage.
 */
export function isSendShortcut(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean {
  return e.key === "Enter" && (e.metaKey || e.ctrlKey);
}
