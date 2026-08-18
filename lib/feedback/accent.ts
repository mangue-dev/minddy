/**
 * Public board accent color (MIN-59) — shared client/server.
 *
 * The mango-ui UI has been recolored for a few CSS tokens. The public board
 * utilise `--primary` (chips du composeur), `--brand` (titres/liens au survol)
 * and `--ring` (focus). minddy only overrides `--primary` by default, so for
 * a coherent accent we put the three tokens together.
 */

/** Default = the `--primary` of app/globals.css (mindy blue). Serves as value of
    departure when the owner activates the personalization. */
export const DEFAULT_BOARD_ACCENT = "#3098D0";

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** A valid accent is a CSS hex (3 or 6 digits), canonical form of
    `<input type=color>` and `ColorInput` (mango-ui). */
export function isAccentColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

/** The tokens that an accent repaints — everything the public board consumes. */
const ACCENT_TOKENS = ["--primary", "--brand", "--ring"] as const;

function tokenBlock(selector: string, color: string): string {
  const decls = ACCENT_TOKENS.map((t) => `${t}:${color}`).join(";");
  return `${selector}{${decls}}`;
}

/**
 * CSS injected by the public board layout. Selectors with enhanced specificity
 * (`:root:root`, `:root.dark` — 0,2,0) to beat the `:root`/`.dark` rules
 * of the lib and globals.css regardless of the order of injection. Only the
 * valid hex values ​​are emitted (optional emphasis); otherwise empty string.
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
