# MIN-696 theme palettes documentation review

Reviewed by agent:/root on 2026-10-18 against the MIN-696 working tree. This is
an agent factual and language self-review, not a human approval or evidence of
a production deployment.

The audience is any signed-in member. The outcome is to choose a palette for
light mode and another for dark mode, turn high contrast on, and turn the
translucency of menus off.

Affected workflow ID: A01. Article `accounts`, section `preferences` (under
`profile-and-preferences`), changed in all six locales at revision 11.
Knowledge topic `settings-and-data` now lists the Numo-settable fields.

## Factual evidence

- `lib/theme-presets.ts`: ten presets per mode in three groups — accent
  colors (minddy, Blue, Violet, Green, Orange, Rose), full palettes
  (Solarized, Catppuccin Latte/Mocha, Nord) and accessibility (High contrast) —
  saved as `theme_light`, `theme_dark` and `theme_transparency` in account
  metadata. Accent presets change only the primary action and the focus
  ring; they declare no surface, chrome, selection or text token
  (`lib/theme-presets.test.ts` holds that).
- `app/theme-presets.css`: each palette applies only under its own mode class;
  the high-contrast palettes and `data-transparency="off"` make floating
  surfaces opaque and remove backdrop blur.
- `components/settings/account-preferences-section.tsx`: the Light mode
  palette, Dark mode palette and Transparency rows, below Theme.
- `proxy.ts`, `app/layout.tsx`, `lib/theme-script.ts`: the saved palettes are
  applied before the first paint of every signed-in document, so another device
  picks them up on its next page load.
- `lib/server/account-settings.ts`, `lib/server/assistant/tools.ts`: Numo can
  read and change the three fields.
- `lib/theme-presets.test.ts` measures WCAG contrast for every custom palette.

## Figures

`profile-and-preferences-preferences-workflow` was recaptured on 2026-10-18 in
all six locales with `captures/shots/documentation-refresh/shot.mjs`, against
the local development server running this working tree, signed in as the demo
account Camille Roy. Each image is 816 × 421 CSS pixels at 2× density, in light
mode, with 24 px margins, and shows the complete Appearance card (language,
theme, both palette selectors, transparency). The agent opened every PNG and
checked labels, margins and clipping; the Spanish transparency hint was first
truncated, so its message was shortened and that locale recaptured. Business
writes stayed blocked (only `POST /api/me/local-snapshots`, the encrypted local
cache, was refused). Alt text was updated in every locale; the caption still
holds. Capture records: `visual-refresh-captures-2026-10-09.json` (the shared
log of this script, now dated per capture).

## Browser check

On 2026-10-18 the agent previewed both high-contrast palettes on the local
development server by setting the root attributes (account preferences were
not changed): account preferences, the select menu with a highlighted row, the
board, the issue side panel with its composer, and keyboard focus. The current
settings item first lacked its marker (`aria-current="true"`, not `"page"`);
the selector was widened and rechecked. No capture was taken.
