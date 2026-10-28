# minddy brand guide

October 2026 (MIN-838). The reference for anyone, person or agent, who shows
minddy: the logo, the colors, the type, the graphic model, the way it looks in
images and the way it speaks. It sits above two existing contracts and does
not repeat them:

- [DESIGN.md](../DESIGN.md): how the interface is built (tokens,
  components, interaction rules);
- [docs/localization-and-copy.md](localization-and-copy.md): how
  interface strings are written and translated.

When the brand and one of those disagree, fix the disagreement in the same
change rather than picking one silently.

## 1. What minddy is

minddy holds every software project in one calm place, and works hand in hand
with AI agents. It is the tracker, not the agent: it keeps the work, the plans
and the decisions so that people and agents can act on them. Its intelligence
is ambient: present when needed, invisible otherwise.

The mark tells the same story: a brain-shaped outline (everything you hold)
with two arcs inside, like a small figure juggling (the work kept in motion).

### Personality: warm and clever

| minddy is | minddy is not |
| --- | --- |
| Warm: it speaks to a person, with a smile when it fits | Cute: no mascots in copy, no exclamation marks to sound friendly |
| Clever: one precise idea, the obvious word | Smug: no puns that need a second read, no in-jokes |
| Plain: says what happens and what to do | Technical for its own sake: no infrastructure words the reader didn't ask for |
| Calm: few words, one thing at a time | Loud: no urgency, no superlatives, no "revolutionary" |

## 2. Logo

### The mark

The logo is a single mark: the six-bump outline and its two inner arcs, drawn
with one stroke on a 48-unit grid (stroke 4, round caps and joins).

- The stroke master and every version below live in the brand archive, which
  is kept outside the repository (`logo/minddy-logo.svg`, `currentColor`).
- In the repository, `lib/brand.ts` holds the mark as one filled path on the
  same 48-unit grid (the master's stroke outlined, `fill-rule="evenodd"`).
  Every surface reads it from there: `components/minddy-logo.tsx`, the
  favicon (`app/icon.tsx`), the share images (`app/og/`) and the desktop shell
  documents (`lib/desktop/shell-ui.ts`). `public/logo.svg` and
  `public/import/minddy-*.svg` are static copies of the same path.

The mark is never rebuilt, redrawn or traced. Use the files.

### Versions

| Version | File | Use |
| --- | --- | --- |
| Outline, ink | `logo/minddy-logo-noir.svg` | Default on light backgrounds |
| Outline, white | `logo/minddy-logo-blanc.svg` | Default on dark backgrounds |
| Outline, current color | `logo/minddy-logo.svg` | In code, so it follows the text color |
| Duotone | `logo/minddy-logo-duotone-*.svg` | On a pastel surface of the same family (white fill, ink of the tone) |
| Duotone, dark | `logo/minddy-logo-duotone-sombre.svg` | On the night surface |
| Filled | `logo/minddy-logo-plein-*.svg` | Large brand moments only (posters, stickers), never in the product chrome |

### Name next to the mark

There is no drawn wordmark. The name is set in **Inter SemiBold**, lowercase,
next to the mark:

- mark height = 1.55 × the font size (28 px mark beside 18 px text);
- gap between mark and name = 0.45 × the font size (8 px at 18 px);
- the name is vertically centered on the mark, in the same color.

### Clear space and minimum size

- Keep empty space around the mark equal to **a quarter of its width** on
  every side. Nothing (text, edge, other logo) enters it.
- Minimum size: **16 px** on screen (favicon), 6 mm in print. Below 24 px use
  the outline version, never the filled or duotone ones.

### Do not

- Do not add gradients, shadows, glows, reflections, bevels or 3D.
- Do not rotate, tilt, mirror or stretch the mark, and do not move its arcs.
- Do not recolor it outside the palette below, or in two colors outside the
  duotone files.
- Do not put the outline mark on a busy photo or a mid-tone where it loses
  contrast; put it on a flat tile instead.
- Do not set "minddy" in another typeface, outline it, or draw it by hand.
- Do not place the mark inside a speech bubble, a circle badge or another
  shape that is not an approved app icon.

## 3. Name and product names

- **minddy**, always lowercase, even at the start of a sentence or a title.
  Never "Minddy", "MINDDY" or "minddy.app" as the name.
- Product names are written as is and never translated: **Numo**,
  **Smart Assign**, **Smart Fill**, **minddy Cloud**, **MCP**.
- Third parties cite minddy by its name and its mark from the files above,
  without implying an endorsement.

## 4. Color

The brand color is **lavender**. It is the default accent of the app (primary
actions, selected controls, focus) and the identity color everywhere else.
Ink and paper carry everything else; pastels belong to marketing.

### Core

| Role | Light | Dark | Note |
| --- | --- | --- | --- |
| Lavender, accent | `#7059C4` | `#B6A5F0` | Buttons, toggles, segmented controls, focus ring. Text on it: white in light (5.4:1), `#1B1530` in dark (8.1:1) |
| Lavender, tint | `#DED5F2` | `#29233D` | Icon tiles, brand surfaces |
| Lavender, wash | `#F0ECF6` | `#211C31` | Large quiet areas (cards, banners) |
| Lavender, ink | `#3F2F63` | `#CBBCF3` | Mark and text on lavender surfaces |
| Ink | `#111111` | `#0A0A0B` (night) | Text, the mark, the "Noir" theme |
| Paper | `#FFFFFF` / `#F4F5F8` | `#15131C` | Backgrounds |

The former brand blue (`#0085FF` and the `brand` token `oklch(0.62 0.22 265)`)
is retired.

### Pastel family (marketing)

The seven landing tones, always flat, each with its own ink:

| Tone | Surface | Ink |
| --- | --- | --- |
| Sage | `#EAF0E5` | `#263C2C` |
| Mint | `#E0EFE8` | `#1E4436` |
| Lavender | `#F0ECF6` | `#433352` |
| Peach | `#F7ECDF` | `#573E28` |
| Sky | `#E6EDF5` | `#293D56` |
| Rose | `#F5E7EB` | `#583642` |
| Butter | `#F3F0DA` | `#514B28` |

### Rules

- **Flat only.** No gradients, meshes, noise or glows, in the product or in
  marketing.
- **Lavender stays rare.** One accent action per view; the rest of the screen
  is ink and gray. Hierarchy comes from size, weight and spacing.
- Status, priority, destructive and project colors never use lavender, and
  lavender never means a status.
- Pastels are surfaces for marketing and illustrations, not UI states.
- Any new pair is checked for contrast: 4.5:1 for text, 3:1 for icons and
  focus rings.

## 5. Typography

- **Inter** for everything: interface, marketing, the name.
  - Display headlines: Medium (500), tracking −0.055 em (80 px / −4.4 px on
    the landing), tight leading.
  - The name "minddy": SemiBold (600).
  - Body: Regular (400).
- **Instrument Serif** only for a rare editorial accent (a quote, one word in
  a headline), never for a whole paragraph or a UI label.
- Sentence case everywhere; no all-caps headlines.

## 6. Graphic model: the "m"

The "m" is drawn from the two top bumps of the mark
(`modele-graphique/lettre-m*.svg`). It is a graphic model, not a letter:

- use it as a large cropped pattern on a flat pastel or night surface
  (`motif-m-*.svg`), one color, with the tone's ink;
- let it bleed off the edge; never more than one per composition;
- never use it to spell "minddy" or any other word, and never next to the
  mark at the same size.

## 7. Images and staging

- Show the real product, captured with the demo account (Camille Roy) and its
  demo projects, never a real person's account.
- Light mode by default; dark mode when the subject is dark mode or when a
  pair helps.
- Stage captures on a flat pastel or paper surface, with generous margins and
  the app's own rounded window; no device mock-ups with reflections, no
  tilted 3D perspectives.
- No stock photos, no AI-generated people, no fake interfaces.
- Illustrations use the pastel family and the flat isometric tiles already on
  the landing.

## 8. Voice and tone

Interface strings follow the copy contract; this section covers everything
else (landing, changelog, social posts, emails, release notes).

- **Lead with what the reader gets**, then how. "Every project in one place,
  ready for your agents."
- **8 to 16 words per marketing block.** One idea per block.
- **No keyboard shortcuts in marketing copy**; they belong in the product.
- **Say who acts**: a person or minddy (Numo for the assistant). An automated
  gesture is signed by minddy, a human one by the human.
- **No filler**: "seamless", "unlock", "supercharge", "revolutionary",
  "simply", "just". No exclamation marks in system or product copy.
- **A smile, not a joke**: a light turn of phrase is welcome where the moment
  is relaxed (empty states, changelog); never in errors, billing or security.

| Do | Don't |
| --- | --- |
| "Your agents pick up where you left off." | "Supercharge your workflow with AI-powered agents!" |
| "Numo found three duplicate issues." | "Our AI has successfully detected duplicates." |
| "Nothing to triage. Enjoy the quiet." | "Oops! Looks like there's nothing here 🙈" |

French copy uses the formal register; other locales follow the register
table of the copy contract.

## 9. Applications

The main app icon is the light tile: a white surface with the black outline
mark, the mark at about 72 % of the icon body. Paths starting with
`icones/` or `exemples/` are in the brand archive.

| Surface | Files |
| --- | --- |
| macOS app icon | `desktop/build/icon.icon`, the Icon Composer document (logo layer, light fill, Liquid Glass, dark and tinted variants); open and save it in Icon Composer, then run `node scripts/build-dmg-assets.mjs`. Other themes: `icones/macos/` |
| Linux and Windows app icons | The light tile on the Apple grid: `desktop/build/icon-windows.png` and the Linux icon named in `desktop/electron-builder.yml` |
| Windows Store package | `desktop/build/appx/`: the manifest tiles, and `Square44x44Logo.targetsize-*` in three forms (plain, `_altform-unplated`, `_altform-lightunplated`) for every size from 16 to 256 px. Windows takes the taskbar, Start and search icon from these; without the unplated forms it draws the icon on a dark plate |
| Favicon | `app/icon.tsx` (vector, tinted per environment), `app/favicon.ico`, `app/icon1.png` |
| PWA | `public/web-app-manifest-*.png` (rounded tiles, `any`), `public/web-app-manifest-maskable-512x512.png` (full bleed, `maskable`), `public/apple-icon.png`; each has a blue `-preview` twin served by preview builds (`lib/pwa-icons.ts`) |
| Share card | `app/og/route.tsx`; reference composition `exemples/carte-partage-og-1200x630.*` |
| Social post | `exemples/post-social-1080.*` |
| GitHub banner | `exemples/banniere-github-1280x320.*` |

Every application follows the same recipe: one flat surface, the mark or the
"m", one Inter headline, nothing else.
