/**
 * Couleur d'accent du board public (MIN-59) — partagé client/serveur.
 *
 * L'UI mangue-ui se recolore depuis quelques tokens CSS. Le board public
 * utilise `--primary` (chips du composeur), `--brand` (titres/liens au survol)
 * et `--ring` (focus). minddy n'override que `--primary` par défaut, donc pour
 * un accent cohérent on repose les trois tokens ensemble.
 */

/** Défaut = le `--primary` de app/globals.css (bleu minddy). Sert de valeur de
    départ quand l'owner active la personnalisation. */
export const DEFAULT_BOARD_ACCENT = "#3098D0";

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Un accent valide est un hex CSS (3 ou 6 chiffres), forme canonique de
    `<input type=color>` et de `ColorInput` (mangue-ui). */
export function isAccentColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

/** Les tokens qu'un accent repeint — tout ce que le board public consomme. */
const ACCENT_TOKENS = ["--primary", "--brand", "--ring"] as const;

function tokenBlock(selector: string, color: string): string {
  const decls = ACCENT_TOKENS.map((t) => `${t}:${color}`).join(";");
  return `${selector}{${decls}}`;
}

/**
 * CSS injecté par le layout du board public. Sélecteurs à spécificité renforcée
 * (`:root:root`, `:root.dark` — 0,2,0) pour battre les règles `:root`/`.dark`
 * de la lib et de globals.css quel que soit l'ordre d'injection. Seules les
 * valeurs hex valides sont émises (accent optionnel) ; sinon chaîne vide.
 */
export function buildBoardAccentCss(
  accentLight: string | null | undefined,
  accentDark: string | null | undefined
): string {
  const blocks: string[] = [];
  if (isAccentColor(accentLight)) blocks.push(tokenBlock(":root:root", accentLight));
  if (isAccentColor(accentDark)) blocks.push(tokenBlock(":root.dark", accentDark));
  return blocks.join("");
}
