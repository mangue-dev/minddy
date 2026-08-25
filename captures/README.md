# captures/

**Internal** tool to automate minddy screenshots.

It's not a product, it won't be packaged, it won't be published. All this
which is here is specific to minddy: tables, routes, selectors
are written in hard copy, and that is intentional. If one day it has to be used elsewhere, it will be
a rewrite and a separate decision.

Scope: **screenshots only.** No clips, no videos.

## What it is

A dedicated demo account on the production base, whose data is
deliberately created and versioned here. Playwright scripts that
photograph the screens by connecting to them. A register which allows the agent
to refresh an existing capture knowing what had been done before.

```
captures/
world/demo world
world.md readable register: account, projects, data, log
seed/data addition scripts, idempotent and ordered
shots/one capture = one folder
    <nom>/
intent.md what the image SHOULD show, and why
shot.mjs the Playwright script
out/ produced PNGs
      history.jsonl un enregistrement par run : date, commit, verdict
lib/ shared base
config.mjs authorized scope — source of truth
guards.mjs security layer between seeds and database
browser.mjs deterministic context (reduced-motion, frozen clock, etc.)
session.mjs single connection, reused by all captures
frame.mjs staging (browser mockup)
.auth/ session Playwright — never committed
```

## The basis is that of PRODUCTION

There is no local Supabase on this project. The scripts therefore write in
the real basis, and the entire file is built around this constraint.

The invariant is contained in a sentence: **no writing can reach a line
which does not belong to the demo world.** Correct a title, change a status or
removing three demo tickets is normal and permitted. It's touching the rest which
is impossible.

The guardrails are in `lib/guards.mjs` and cannot be bypassed:

1. **Table whitelist** in `lib/config.mjs`. Expanding it requires
   changement de fichier, donc un diff visible.
2. **Connection checked on insertion.** A line that points to a real
user or a real project is rejected before reaching the network.
3. **Rereading before modification or withdrawal.** The lines concerned are read and
verified as ours before we touch it. We never do
   confiance au filtre.
4. **No TRUNCATE, no arbitrary SQL, no reset.** No exceptions,
even on request.
5. **Blast radius measurement.** If lines outside demo disappear, alert
and stop. An increase is just the competing activity of a real
user, it is reported without blocking.
6. **Confirmation required.** Nothing is written without the user having seen,
in French, the list of what will change and why.
7. **Never the app's HTTP API.** We write in base directly, which
short-circuits the routes and therefore the Smart Assign, notifications,
PostHog events, Resend emails and billing.

The only destructive operation of the folder is `deleteDemoWorld()`, which deletes
the demo account and let the foreign keys clean up the rest in cascade.
It refuses any account whose email does not match the demo reason.

## Mise en route

```bash
npm i -D playwright && npx playwright install chromium
```

Then in `.env`, add the demo account password:

```
CAPTURES_DEMO_PASSWORD=...
```

Then, in Claude Code:

- `capture-world` to create the demo account and give it data;
- `capture-shot` to produce or refresh a capture.

## Throw by hand

```bash
node captures/lib/session.mjs # refreshes the demo session
node captures/shots/<nom>/shot.mjs # produces the capture
```

By default, captures target `http://localhost:3000`. To aim for a
deployment :

```bash
CAPTURE_BASE_URL=https://preview.minddy.app node captures/shots/<nom>/shot.mjs
CAPTURE_BASE_URL=https://www.minddy.app node captures/shots/<nom>/shot.mjs
```

`preview` and `www` share the SAME base: the demo world is the same for both
sides, only the code differs. This is what makes `preview` useful here — a capture
which breaks there and goes to prod signals a UI change not yet delivered,
no missing data. Session is linked to origin: change target
request to replay `node captures/lib/session.mjs` with the same
`CAPTURE_BASE_URL`.

### Locale and theme are part of the capture contract

Use the canonical production origin, `https://www.minddy.app`, never the apex
`https://minddy.app`. Production redirects the apex to `www`, but
`NEXT_LOCALE` is a host-only cookie: the redirect drops the locale selected by
the capture context and can revive a stale cookie from the saved authenticated
session. The result is deceptively plausible—English demo data inside French
application chrome. `canonicalCaptureBaseUrl()` normalizes this known alias,
but commands and history entries should still record the canonical origin.

Do not infer the variant language from seeded titles or issue descriptions;
those are data and may intentionally remain English in every locale. Every shot
must call `settle()` before `shoot()`. It verifies the rendered `<html lang>`
against the requested variant and fails instead of writing a mislabeled file.

The authenticated account theme also takes precedence over browser
`localStorage` in the real application. `settle()` deliberately reasserts the
requested capture theme after hydration and verifies it before the screenshot.
This is why a new shot must use the shared browser helpers rather than calling
Playwright's screenshot API directly. After a refresh, visually inspect at
least one English image and confirm that each light/dark pair is distinct
before publishing it.

To deliver PNGs already produced, without restarting a single take:

```bash
node captures/lib/publish.mjs --shots
```

## What is versioned, and why

Everything except `.auth/`. PNGs, scripts, seeds and registers are in
Git voluntarily: this is what allows the agent to refresh a capture by
knowing what existed before, what had been created, and what the image was
supposed to show. This is obsolescence tracking, in ten lines and without service.
