import { MINDDY_LOGO_PATH, MINDDY_LOGO_VIEWBOX } from "@/lib/brand";

const FONT_DATA_URL = /^data:font\/woff2;base64,[A-Za-z0-9+/]+=*$/;

/** CSP used by local shell documents, including their bundled Inter font. */
export const DESKTOP_SHELL_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:";

/** The same brandmark and wordmark pairing used by minddy's auth surfaces. */
export function desktopShellBrandHtml(): string {
  return `<div class="shell-brand" aria-label="minddy">
    <svg viewBox="${MINDDY_LOGO_VIEWBOX}" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" clip-rule="evenodd" d="${MINDDY_LOGO_PATH}"></path>
    </svg>
    <span>minddy</span>
  </div>`;
}

/**
 * Offline-safe subset of minddy and mangue-ui's visual contract.
 *
 * These documents cannot load the product stylesheet because they are rendered
 * precisely when the selected server is unavailable. Keep this small token and
 * primitive set aligned with app/globals.css and mangue-ui's button/input styles.
 */
export function desktopShellStyles(interFontDataUrl?: string): string {
  const fontFace =
    interFontDataUrl && FONT_DATA_URL.test(interFontDataUrl)
      ? `@font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: swap; src: url("${interFontDataUrl}") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }`
      : "";

  return `${fontFace}
    :root {
      color-scheme: light dark;
      --background: oklch(1 0 0);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --primary: oklch(0.21 0.012 265);
      --primary-foreground: oklch(0.985 0 0);
      --muted: oklch(0.935 0.008 268);
      --muted-foreground: oklch(0.5 0.01 266);
      --control: oklch(1 0 0);
      --control-hover: oklch(0.95 0.008 268);
      --border: oklch(0.895 0.012 268);
      --input: oklch(0.91 0.012 268);
      --ring: oklch(0.62 0.22 265);
      --brand: oklch(0.62 0.22 265);
      --destructive: oklch(0.58 0.22 27);
      font-family: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--background); color: var(--foreground); font-family: inherit; -webkit-font-smoothing: antialiased; }
    button, input { font: inherit; }
    .shell-brand { display: inline-flex; width: fit-content; align-items: center; gap: 8px; color: var(--foreground); font-size: 18px; font-weight: 650; letter-spacing: -.025em; }
    .shell-brand svg { width: auto; height: 28px; }
    .shell-button { height: 36px; display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; gap: 8px; border: 1px solid transparent; border-radius: 999px; padding: 0 14px; background-clip: padding-box; color: var(--foreground); font-size: 14px; font-weight: 550; line-height: 1; white-space: nowrap; cursor: pointer; transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease; }
    .shell-button:hover { background: var(--muted); }
    .shell-button-primary { background: var(--primary); color: var(--primary-foreground); }
    .shell-button-primary:hover { background: color-mix(in oklab, var(--primary) 90%, transparent); }
    .shell-button-outline { border-color: var(--border); background: var(--control); }
    .shell-button-outline:hover { background: var(--control-hover); }
    .shell-button-ghost { background: transparent; color: var(--muted-foreground); }
    .shell-button-ghost:hover { background: var(--muted); color: var(--foreground); }
    .shell-button:focus-visible, .shell-input:focus-visible, .shell-choice:focus-visible { outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 22%, transparent); }
    .shell-input { width: 100%; height: 40px; border: 1px solid var(--input); border-radius: 12px; padding: 0 12px; outline: none; background: var(--control); color: var(--foreground); font-size: 14px; transition: border-color 140ms ease, box-shadow 140ms ease; }
    .shell-input::placeholder { color: var(--muted-foreground); }
    .shell-label { display: block; color: var(--foreground); font-size: 13px; font-weight: 600; }
    .shell-help { color: var(--muted-foreground); font-size: 13px; line-height: 1.55; }
    .shell-error { color: var(--destructive); font-size: 12px; line-height: 1.45; }
    .shell-icon-well { display: grid; place-items: center; border-radius: 16px; background: var(--muted); color: var(--muted-foreground); }
    .shell-icon-well svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
    @media (prefers-color-scheme: dark) {
      :root {
        --background: oklch(0.165 0.004 264);
        --foreground: oklch(0.985 0 0);
        --card: oklch(0.214 0.005 264);
        --primary: oklch(0.97 0.004 265);
        --primary-foreground: oklch(0.18 0.01 265);
        --muted: oklch(0.255 0.005 264);
        --muted-foreground: oklch(0.62 0.003 250);
        --control: oklch(0.259 0.005 264);
        --control-hover: oklch(0.289 0.005 264);
        --border: oklch(1 0 0 / 8%);
        --input: oklch(1 0 0 / 12%);
        --ring: oklch(0.58 0.22 265);
        --brand: oklch(0.58 0.22 265);
        --destructive: oklch(0.704 0.191 22.216);
      }
    }`;
}
