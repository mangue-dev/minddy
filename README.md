# minddy

Blank Next.js 16 (Turbopack) + React 19 + Tailwind v4 starter, wired to
[`mangue-ui`](../../mangue-ui/packages/mangue-ui).

```bash
npm install     # installs mangue-ui from the local file: path
npm run dev
```

## How mangue-ui is wired

- **`next.config.mjs`** — `transpilePackages: ["mangue-ui"]` (the lib ships source).
- **`app/globals.css`** — imports `mangue-ui/tokens.css`, `@source`s the lib so
  Tailwind generates its classes, then overrides tokens (this file is yours).
- **`app/layout.tsx`** — provides the `--font-*` variables and wraps in `ThemeProvider`.
- Components: `import { Button, ... } from "mangue-ui"`.

## Switching from local to published

While developing, `mangue-ui` resolves from the sibling repo via
`"mangue-ui": "file:../../mangue-ui/packages/mangue-ui"`. Once mangue-ui is
published to npm, swap that line for a real version (e.g. `"^0.1.0"`) and
`npm install` — nothing else changes.

## Deploying on Vercel

Works out of the box once mangue-ui is on npm: `transpilePackages` + the
`@source` line are the only requirements. (The `file:` path won't resolve on
Vercel — publish first, or keep this app in a monorepo with mangue-ui.)
