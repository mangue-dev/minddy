# Conventions minddy

## Language policy: English-owned prose

All comments, docstrings, test descriptions, Markdown documentation, scripts,
configuration prose, and developer-facing CLI messages must be written in
idiomatic English. Do not add French prose to application code, tests, docs,
scripts, or configuration. The normal exception is the French runtime catalog
in `messages/fr.json`, together with intentional locale branches, language
fixtures, proper names, legal credits, identifiers, URLs, and API values.

When editing existing French comments or documentation, translate them as part
of the same change. Keep runtime translations and localization fixtures intact;
do not replace French product copy with English merely to satisfy this policy.
Before handing off a change that touches owned prose, run
`npm run check:owned-english`, the smallest relevant test or lint command, and
`git diff --check`.

## i18n: the placeholder is a contract between two files

Any visible string goes through next-intl, and lives as a double: `messages/en.json`
and `messages/fr.json`. Both catalogs have **exactly the same keys**
and **exactly the same placeholders**.

The rule that counts: **a placeholder message is called with its values.**

```tsx
// messages/en.json → "deleteViewTitle": "Delete “{name}”?"
t("deleteViewTitle", { name: view.name })   // ✅
t("deleteViewTitle")                        // ❌ affiche « Board.deleteViewTitle »
```

Forgetting doesn't lift anything or log anything: next-intl drops silently
on the path of the key, and it is this path that the user reads on the screen.
This happened twice (the view deletion dialog, the signature help
webhooks), and in both cases the code was correct in each file taken
separately — the fault existed only between the two.

Writing a string **and** its call in the same gesture is writing both
halves of a contract. Reading them separately doesn't verify this. What verifies it:

```bash
npx vitest run lib/i18n-contract.test.ts   # < 1 s
```

It calls the real formatter on the 2,600 keys and reports, in `fichier:ligne`,
any message to placeholder called without its values, plus any fr/en discrepancies.
**Launch it as soon as you touch `messages/*.json` or add a `t(...)`.**

Two more traps:

- `tsc` checks **key names** (via [global.d.ts](global.d.ts)) but **not**
placeholders — string values ​​in a JSON import are expanded by
`string`. A green type-check says nothing about this contract; only the test above says so.
- `<mot>` in a message is read as a **rich tag**, not as text.
For technical documentation, write `HMAC-SHA256(body)`, never `<HMAC body>`.

A key assembled at runtime (`t(\`errors.${code}\`)`) escapes typing: the
cast to `MessageKey<"Namespace">` ([lib/i18n-keys.ts](lib/i18n-keys.ts)), and
type key **tables** with `MessageKey` rather than `string`. Finally, a
translator passed in prop se type `ReturnType<typeof useTranslations<"Namespace">>`:
without the namespace, TypeScript gives up (TS2589) and no longer checks anything at all.

## Sitemap: hold `lastModified` in hand

When the **content of a public page really changes**, update it
`lastModified` of its route in [lib/public-routes.ts](lib/public-routes.ts),
on the date of the change (short ISO, `YYYY-MM-DD`).

`lastModified` is the only one of the three sitemap fields that Google still reads
(`priority` and `changeFrequency` have been ignored for a long time; Bing them
look a little longer): it is he who triggers a new passage of the crawler.
Hence the hand holding. A build date, updated with each deployment,
would say “everything has changed” every time — and Google quickly learns not to
believe, on the whole domain.

**What counts as a real change**: the text read by a visitor. THE
i18n namespaces of public pages in `messages/en.json` and `messages/fr.json`
(`Landing`, `Pricing`, `Legal`, `Terms`, `Privacy`, `Cookies`), and
the components those pages render.

**What is not one**: a refactor, a style or animation adjustment,
a typo correction — nothing that leaves the page saying the same thing.

Only one page changes → only one date moves. Never put sixes together
hit: this is exactly the signal that hand holding is used to avoid.

| Key | Pages | Content |
| --- | --- | --- |
| `home` | `/`, `/fr` | [app/(marketing)/page.tsx](<app/(marketing)/page.tsx>) + namespace `Landing` |
| `pricing` | `/pricing`, `/fr/tarifs` | [app/(marketing)/pricing/page.tsx](<app/(marketing)/pricing/page.tsx>) + namespace `Pricing` |
| `legal` | `/legal`, `/fr/mentions-legales` | [app/(legal)/legal/page.tsx](<app/(legal)/legal/page.tsx>) + namespace `Legal` |
| `terms` | `/terms`, `/fr/cgu` | [app/(legal)/terms/page.tsx](<app/(legal)/terms/page.tsx>) + namespace `Terms` |
| `privacy` | `/privacy`, `/fr/confidentialite` | [app/(legal)/privacy/page.tsx](<app/(legal)/privacy/page.tsx>) + namespace `Privacy` |
| `cookies` | `/cookies`, `/fr/cookies` | [app/(legal)/cookies/page.tsx](<app/(legal)/cookies/page.tsx>) + namespace `Cookies` |

The sitemap ([app/sitemap.ts](app/sitemap.ts)) reads this table, like the proxy,
page metadata and nav and footer links. Add a
public page = one more entry in `PUBLIC_ROUTES`, nothing else to wire.

## TypeScript: editor and repository do not compile with the same binary

Since MIN-180, `typescript` is in **7.0.2**, the native compiler. It's him
what `npm run typecheck` and `next build` type-check run: on the Mac
(12 cores), 14.8 s → 2.1 s cold for the first, 15.4 s → 2.4 s for the
second, and the complete build goes from 26.6 s to 13.2 s.

**The gain is more modest on Vercel, and it is a question of hearts.** The
build machine is in `standard` (4 cores): measured under equal conditions — same
machine, same cache, two consecutive deployments differing only in version
of the compiler — the type-check goes from **38.9 s to 14.5 s** (×2.7, step ×6), and
build job from 59.7s to 43.3s. The native compiler is massively
parallel ; on 4 cores it cannot render what it renders on 12. Do not
transpose the numbers from the position to the CI, in one direction or the other.

**The counterpart**, to know rather than to discover: `typescript@7` does not deliver
of `tsserver.js`. `typescript.tsdk` therefore cannot point to it, and the editor
continues to use its embedded TypeScript — in JS, in 5.x. **The publisher and the CI
no longer run the same compiler.** On this code both render
identical diagnostics, measured in MIN-174: clean deposit with 0 errors for both
sides, and on 6 probes carrying 11 deliberate faults, same codes, same
`ligne:colonne`, same messages — i18n safeguard included (a translator passed
prop without its namespace remains refused). It is therefore livable. But if one day
diagnosis differs, **it is `npm run typecheck` which is authentic**, not the
Editor's red underline.

`typescript@7` does not provide the compiler API either: its root export
points to `lib/version.cjs`, the package only contains `bin/tsc` and the native
binary. Hence the alias `typescript-api` (→ `typescript@5.9.3`) in `package.json`,
including [the MIN-169 structural test](lib/server/agent/subagent-runner-init.test.ts)
is the only consumer — it needs `createSourceFile` to read a tree.
This is not a typo: a `import ts from "typescript"` elsewhere in the
repository would not compile.

Two reflexes that go with it:

- `incremental` is at `true`: **purge `tsconfig.tsbuildinfo`** first
error counting or any duration measure, otherwise both lie.
- The repository holds **two lockfiles**. Add by `pnpm add`, then resynchronize
with `npm install --package-lock-only --legacy-peer-deps` (the deposit carries a
pre-existing tiptap peer conflict which blocks npm without this flag).
- **Install with the CI pnpm version — `10.28.0`**, the one pinned
[ci.yml](.github/workflows/ci.yml), never `pnpm@latest`. pnpm 11 rewrites the
lockfile by losing the `packageExtensions` injections: on pnpm 11, the
`shiki: ^3.19.0` that `package.json` pushes into `streamdown` disappears, the
two copies of shiki diverge and `npm run typecheck` encounters an error
in `components/ai-elements/message.tsx` — a file that no one has
touch. The symptom does not indicate its cause: check
`git diff pnpm-lock.yaml` before going to debug the code.

## Lint: an extinct rule is a decision, not an oversight

```bash
npm run lint # oxlint --deny-warnings — entire repository, 2 sec
```

**Run it before responding.** It also runs in CI, before typecheck, and
it catches a class of errors that `tsc` does not see: optional chaining which
dereference `undefined`, dead variable, `fetch` with a body on a GET.

Two sets of rules run there: the oxlint `correctness` rules, and
**anti-slop** ([github.com/dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop)),
fifteen rules that reject low-proof TypeScript patterns. The plugin is
**sold** in `tools/oxlint/anti-slop/` — this is the principle of its author:
the files are ours, therefore modifiable. `tsconfig.json` excludes them, they are
loaded by oxlint, not by `tsc`.

**Selection is the heart of [oxlint.config.ts](oxlint.config.ts).** The fifteen
anti-slop rules at `error` on this repository give **7,926 errors**; a linter
Never throw and catch nothing. What is lit is therefore what the deposit
holds at **zero** — so what a PR can no longer regress. What is extinct
is **with his account on the day of the audit**, in comments on the line:

```ts
"anti-slop/no-unknown-returns": "off", // 77 — closest to tenable
"anti-slop/require-safety-comment-for-type-assertion": "off", // 3653
```

This number is what makes a ratchet possible: **we relight a rule when its
account has fallen back to zero, not before.** Without it, “off” is no longer distinguishable
from an oversight, and no one knows what it would cost to relight.

Certain lines are not a count to be lowered but a **disagreement of
background**, and the comment says it: `no-module-mocking` refuses `vi.mock`, so
that the test doctrine below is already finer than the rule;
`no-shape-in-symbol-names` refuses the word “shape”, which here is almost always
of the domain (the shape of a mention bullet, the shapes of the grain canvas).

**A local exception is written with its reason.** `oxlint-disable-next-line` alone
don't say anything to the one who comes next:

```ts
// The spread is NOT superfluous: `headers.delete()` mutates the collection we
// iterate. Without the copy, the iterator skips headers — and which ones it skips
// are precisely the ones we wanted to remove.
// oxlint-disable-next-line unicorn/no-useless-spread
for (const name of [...headers.keys()]) {
```

This is the case that matters most, because the rule is **wrong** and the
"fix" would introduce the bug. There are five in the repository, all commented:
[proxy.ts](proxy.ts) and [lib/analytics.ts](lib/analytics.ts) (mutation during
iteration), [lib/server/mcp/tools.ts](lib/server/mcp/tools.ts) (`Reflect.get`
is the Proxy trap API, the only one to transmit `receiver`), and
[captures/shots/issue-plan/shot.mjs](captures/shots/issue-plan/shot.mjs) — dont
the `const RETIRED = true` is neither exported nor referenced because `publish.mjs`
reads it **by regex on the source text**. “Cleaning” it would put this folder back
in production, silently.

## Tests: new behavior comes with its own

```bash
npx vitest run                       # 362 fichiers, 4 559 cas, 18 s
npx vitest run lib/server/agent # a folder, when we iterate
```

**Toss it before responding, on anything related to behavior.**
`npm run typecheck` does not replace it: it says that the types agree, not
that the code does what we believe. The PR 48 feature compiled — it
subscribed to a real-time channel and never switched back. A green type-check
says nothing about a life cycle, and the rest says nothing about a behavior that
no one wrote: **what we add comes with its test, in the same gesture.**

These 362 files are the best documentation in the repository, and the most invisible:
you don't come across them, you have to go and open them. **Before writing a test,
read one that looks like** — it gives the shape, the mocks and the border, and it
avoid inventing a decor that the neighbor has already built:

| What we test | The example to open |
| --- | --- |
| Pure logic (no IO) | [prune.test.ts](lib/server/agent/prune.test.ts) — we call, we assert, nothing to mount |
| A loop that talks to an API | [supervisor.test.ts](lib/server/agent/vm/supervisor.test.ts) — fake opencode server, replayed SSE flow, and what is NOT called |
| An agent tool | [opencode-tools.test.ts](lib/server/agent/vm/opencode-tools.test.ts) — the real tools generator, faced with the job |
| A server surface | [control-plane.test.ts](lib/server/agent/control-plane.test.ts) — we only mock what OUT of the process (base, direct, ledger) |

Special case already covered above: the i18n contract, of which
`lib/i18n-contract.test.ts` is the safeguard — to be launched as soon as you touch
`messages/*.json` or add a `t(...)`.

## Groundwork: a detached promise dies with the response

In a query, any work outside the critical path — usage timestamp, purge
opportunistic purge, session sliding, analytics flush — goes through
**`afterOrNow`** ([lib/server/after-safe.ts](lib/server/after-safe.ts)).

```ts
// ❌ the response leaves, Vercel freezes the summon, the fetch dies in flight
void service.from("api_keys").update({ last_used_at: now }).eq("id", id)
  .then(({ error }) => { if (error) console.error(…) });

// ✅ after the response, but the invocation remains alive for as long as it takes
afterOrNow(async () => {
  const { error } = await service.from("api_keys").update({ last_used_at: now }).eq("id", id);
  if (error) console.error(…);
});
```

A detached promise is known to no one: as soon as the answer is given,
the function is frozen and the outgoing connection is cut. `after()` is the only
channel that says the opposite to the platform — Next switches to `waitUntil` which
**returns** its callback ([after-context.js](node_modules/next/dist/server/after/after-context.js),
`await callback()`). Hence the shape of the hook: you have to **give back** the
promise, not untie it inside. `afterOrNow` takes care of it, and falls back
on immediate execution outside of query (automation cascades, MIN-147).

**What it looks like in the logs**: `TypeError: fetch failed` — the message
network error that `postgrest-js` copies as is into `error.message`. THE
the sign that stands out is the asymmetry: *only* detached calls fail,
`await` of the same handler passes. A Supabase failure would cause the
two. Do not go looking for a breakdown.

And above all, it doesn't always show. The request succeeds, the user has no
nothing, the test passes — at best an isolated error line, at worst nothing at all:
the public board session slide was detached from the start, without
never say anything, and sessions expired at a fixed 90 days instead of sliding.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
