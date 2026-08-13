/**
 * Le raccourci d'ENVOI, dit une seule fois pour toute l'application.
 *
 * Deux modes, et un seul est un choix de compte :
 *
 * - `mod-enter` (le défaut, celui de toujours) : ⌘/Ctrl + Entrée envoie, Entrée
 *   seule passe à la ligne. C'est ce qu'il faut à un composer où l'on écrit
 *   plusieurs phrases ;
 * - `enter` : Entrée envoie. Pour qui vient de Slack et tape court.
 *
 * **⌘/Ctrl + Entrée envoie dans les DEUX modes.** Le réglage ajoute une touche,
 * il n'en retire pas : la mémoire musculaire de celui qui bascule continue de
 * marcher, et une légende « ⌘↵ » restée quelque part ne devient jamais fausse.
 *
 * **Maj + Entrée ne l'est dans AUCUN.** C'est la touche du saut de ligne, dans
 * les deux modes et sans exception — en `enter` parce que c'est la seule qui
 * reste pour respirer, en `mod-enter` parce qu'un ⌘⇧Entrée parti par erreur est
 * exactement ce qu'on ne veut pas d'un geste d'envoi.
 *
 * La règle vit ici, hors de tout composant, pour deux raisons : elle est pure —
 * elle se teste sans monter de DOM — et les surfaces qui la LISENT (le tooltip
 * et les pastilles de [components/send-shortcut.tsx]) tirent mangue-ui derrière
 * elles, ce dont un test node n'a que faire. Les deux moitiés du geste restent
 * donc solidaires, sans que la touche dépende de l'habillage.
 *
 * Ce module ne dépend de RIEN (ni React, ni Supabase) : les composers le lisent
 * côté client via [use-send-mode.ts](use-send-mode.ts), l'écran de réglages
 * l'écrit. C'est la seule définition d'« envoyer au clavier ».
 */

/** Les deux modes, dans l'ordre où l'écran de réglages les propose. */
export const SEND_MODES = ["mod-enter", "enter"] as const;

export type SendMode = (typeof SEND_MODES)[number];

/** Le mode historique, et celui d'un compte qui n'a rien choisi. */
export const DEFAULT_SEND_MODE: SendMode = "mod-enter";

/** La clé du `user_metadata` Supabase où vit la préférence, comme ses voisines
    (`smart_fill`, `numo_default_status`, …). */
export const SEND_MODE_META_KEY = "send_shortcut";

export const isSendMode = (v: unknown): v is SendMode =>
  typeof v === "string" && (SEND_MODES as readonly string[]).includes(v);

/** Le mode d'envoi du compte, lu dans son `user_metadata`. Une absence — un
    compte neuf n'a pas de métadonnée du tout — se lit comme le défaut. */
export function resolveSendMode(
  meta: Record<string, unknown> | null | undefined,
): SendMode {
  const value = meta?.[SEND_MODE_META_KEY];
  return isSendMode(value) ? value : DEFAULT_SEND_MODE;
}

/**
 * L'événement clavier est-il le raccourci d'envoi ?
 *
 * `mode` par défaut à `mod-enter` : les surfaces qui ne connaissent PAS le
 * compte (les formulaires, où Entrée appartient à l'éditeur de description ;
 * un board public, où il n'y a pas de compte) l'appellent sans argument et
 * gardent le contrat de toujours.
 */
export function isSendShortcut(
  e: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  },
  mode: SendMode = DEFAULT_SEND_MODE,
): boolean {
  if (e.key !== "Enter") return false;
  // Maj + Entrée saute la ligne, toujours — c'est ce qui rend le mode `enter`
  // habitable, et ça ne coûte rien au mode `mod-enter`.
  if (e.shiftKey) return false;
  if (e.metaKey || e.ctrlKey) return true;
  // ⌥Entrée reste à l'éditeur (saut de ligne doux) : le mode `enter` ne prend
  // que la frappe NUE.
  return mode === "enter" && !e.altKey;
}
