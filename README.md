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

### Two-branch deploy workflow

Like AutoKap, deploys go through two branches:

- **`main`** → **preview** deploys (every push).
- **`production`** → the **production** deploy (only via `npm run deploy`).

Vercel watches the `production` branch, so pushing `production` _is_ the deploy
trigger — there is no explicit `vercel deploy` step.

**Release a version to production** (run from `main`):

```bash
npm run deploy            # interactive: pick a version bump, then deploys
npm run deploy -- patch   # non-interactive: bump patch (or minor/major/none)
```

`npm run deploy` (see [`deploy.sh`](deploy.sh)):

1. Checks the working tree is clean.
2. Replays the CI gates as a last net (tests, `node scripts/audit.mjs`,
   typecheck) and refuses to deploy a commit whose CI is red. The gates of
   record live in [`.github/workflows/ci.yml`](.github/workflows/ci.yml), which
   runs them on every pull request in a throwaway runner with no secrets — see
   [`CONTRIBUTING.md`](CONTRIBUTING.md).
3. Bumps the version (`patch`/`minor`/`major`, or `none`) — commits
   `chore: bump version to X` and tags `vX`. The tag is for release tracking
   only; minddy is private, nothing is published to npm.
4. Pushes the current branch → a preview deploy.
5. Merges the current branch into `production` and pushes it → the production
   deploy. On any failure it prints "production was NOT redeployed" and returns
   you to your branch.

### One-time setup

1. Create the `production` branch from `main` (identical to prod today, so no
   downtime) and push it:

   ```bash
   git checkout -b production && git push -u origin production && git checkout main
   ```

2. In the **Vercel dashboard** → minddy project → **Settings → Git**, set the
   **Production Branch** to `production`. This is what makes `main` preview-only;
   it can't be set from `vercel.json`. **Until you change it, pushes to `main`
   still deploy to production**, so do this before (or with) your first
   `npm run deploy`.

3. Still in **Settings → Environment Variables**, add `VERCEL_DEEP_CLONE` = `1`
   for **Production and Preview**. Vercel otherwise builds from a
   `git clone --depth=10`, where the `vX` tag of the running version is out of
   reach past ten commits — and the version indicator in the account menu counts
   commits from that tag to say how far ahead of its release a deployment is
   (`0.8.9-3` = three commits past `v0.8.9`, see
   [`scripts/commits-since-version.mjs`](scripts/commits-since-version.mjs)).
   Without the variable the count falls back to 0 and the bare version shows —
   never a wrong count, just no count.

PR humaine sans référence de ticket.
