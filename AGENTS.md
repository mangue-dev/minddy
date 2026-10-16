# Minddy agent rules and development conventions

`AGENTS.md` and `CLAUDE.md` are identical copies of this guide, so every coding
agent reads the same rules. Edit both files together;
`scripts/agent-instructions.test.mjs` fails when they differ.

## Architecture and entry points

Minddy is a Next.js App Router application with React, Tailwind CSS, and
`mangue-ui`. Supabase provides Postgres, Auth, Storage, and Realtime. The optional
Electron shell has a separate package and build under `desktop/`.

| Area | Source of truth |
| --- | --- |
| Authenticated product routes | `app/(app)/` |
| Marketing and legal routes | `app/(marketing)/`, `app/(legal)/`, `lib/public-routes.ts` |
| HTTP APIs and public capabilities | `app/api/`, `app/f/`, `app/p/` |
| Reusable UI and client behavior | `components/`, `lib/` |
| Server business logic | `lib/server/` |
| Browser, session, and privileged database clients | `lib/supabase.ts`, `lib/supabase-server.ts`, `lib/supabase-service.ts` |
| Numo conversations and tools | `lib/server/numo/`, `lib/server/assistant/` |
| Code workers and sandbox lifecycle | `lib/server/agent/`, `lib/server/agent/vm/` |
| External MCP tools and authentication | `lib/server/mcp/` |
| Database schema and policies | `supabase/migrations/` |
| Locale catalogs and configuration | `messages/`, `i18n/config.ts` |
| Release and maintenance tooling | `scripts/`, `.github/workflows/` |

Server-only modules use the `server-only` import guard. Keep authorization at
server boundaries; a privileged database client does not replace membership or
capability validation. Follow the existing domain repository and codec when
reading or writing protected content rather than accessing its raw columns.

`npm run dev` and `npm run build` first generate the Agent VM and page-Markdown
bundles through their lifecycle hooks. Vitest also builds the page projection
through `test/build-pages-md-setup.ts`. The root TypeScript configuration excludes
`desktop/`; CI checks the Electron bundle separately with
`node scripts/build-desktop.mjs`.

See [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and
[the edition guide](docs/editions.md) for setup and supported deployment modes.

## Language policy: English-owned prose

- All new comments, docstrings, test descriptions, internal documentation,
  configuration prose, and developer-facing CLI messages must be written in
  idiomatic English.
- Do not add French prose to application code, tests, documentation, scripts, or
  configuration. French runtime copy belongs in `messages/fr.json`; official
  reader documentation and its assets use their declared locale under
  `content/documentation/<locale>/` and `public/documentation/<locale>/`.
- Preserve intentional runtime translations in every supported catalog,
  language-specific test fixtures, locale branches, proper names, legal credits,
  identifiers, URLs, API values, and behavior. Do not translate those into
  English copies.
- When editing existing French prose, translate it as part of the same change
  unless it is one of the intentional runtime or language-fixture exceptions.
  Do not change runtime translations or test semantics to satisfy the language
  policy.

### Translation-task boundary

Translate comments and documentation without changing code, identifiers, URLs,
configuration keys, migration behavior, or test semantics. If a French string
is required to test localization or to serve the French locale, keep it and
make the exception obvious from its surrounding code or fixture path.

## Verification

- Run `npm run check:owned-english` after changing comments, documentation,
  tests, scripts, or configuration prose.
- Run the smallest relevant test or lint command after source/configuration
  changes (see [Lint and tests](#lint-and-tests)).
- Review `git diff --check` and confirm that excluded paths are untouched.

## Keep documentation current

- Always review documentation impact when modifying code. Add documentation
  for new features, correct it when behavior changes, and remove obsolete
  instructions and illustrations when a feature is removed. Complete affected
  public guides, technical references and internal instructions in the same PR;
  do not defer documentation to a later release or separate task.
- Documentation edits are required only when the change affects documented
  behavior, controls, configuration or contributor workflows. A small fix,
  refactor, formatting change or test-only PR that leaves documentation accurate
  needs no documentation edit, new illustration or article review record. An
  accurate manual may need no prose edit, but it always needs an impact review.
- Follow the [documentation maintenance contract](content/documentation/README.md#release-maintenance)
  and [editorial guide](docs/documentation-editorial-guide.md), including their
  writing, technical inline-code, factual review, illustration and capture rules.
- Keep the public manual equally complete in `en`, `fr`, `de`, `es`, `it`, and
  `pt-BR`. Update full translations, localized UI labels, examples, captions,
  alt text, screenshots and responsive diagrams together. Internal contributor
  documentation remains English.
- Every release that changes the desktop version requires a documentation
  review against the release delta and intended version before freezing the
  candidate. Update affected articles, illustrations, compatibility and actual
  review evidence; a version bump or changelog entry alone is insufficient.
- Run `npm run check:documentation`, `npm run check:knowledge`,
  `npm run check:owned-english` and `git diff --check` for documentation
  changes, and require `npm run check:documentation:release` before
  publication. Record affected article/workflow/figure IDs and checks when
  documentation changes. For a PR with no documentation impact, a brief note is
  sufficient; do not require article IDs or release-wide checks. Avoid cosmetic
  edits or invented review dates. Unresolved documentation gaps caused by the
  change block completion.

## Internationalization: catalog and call-site contract

Visible interface copy uses `next-intl`. The supported locales are `en`, `fr`,
`de`, `pt-BR`, `it`, and `es`, defined in `i18n/config.ts`. Keep all catalogs aligned
on keys and placeholders when changing a message.

A placeholder message must receive its values:

```tsx
// messages/en.json: "deleteViewTitle": "Delete “{name}”?"
t("deleteViewTitle", { name: view.name });
```

The key types in `global.d.ts` do not prove placeholder correctness: imported
JSON values widen to `string`. Run the actual formatter contract whenever you
change `messages/*.json` or add a translation call:

```bash
npx vitest run lib/i18n-contract.test.ts
```

The test checks catalog parity and missing values at statically identifiable
call sites. Runtime-assembled keys still need explicit review. Use
`MessageKey<"Namespace">` from `lib/i18n-keys.ts` for key tables, and preserve the
namespace when typing a translator prop:
`ReturnType<typeof useTranslations<"Namespace">>`.

Angle-bracket syntax such as `<word>` is a rich-text tag in ICU messages. Use
plain notation such as `HMAC-SHA256(body)` for technical text unless a rich-text
formatter is intended.

## Public routes and sitemap dates

`lib/public-routes.ts` defines public route metadata and explicit localized URLs.
The proxy rewrites localized URLs to their canonical English implementation and
sets the locale header; internal authenticated routes use the locale preference
cookie. The table is shared by the sitemap, metadata, proxy, and navigation.

When public content materially changes, update only the corresponding
`lastModified` date (`YYYY-MM-DD`). Avoid changing dates on every build or for
refactors that preserve content. Changelog freshness comes from
`CHANGELOG_LAST_MODIFIED` in `lib/changelog.ts`.

Adding a public page requires its route implementation, catalogs, and a matching
`PUBLIC_ROUTES` entry with every supported locale path. Review neighboring route
and metadata tests as well.

## Toolchain and lockfiles

Use Node.js 24 and pnpm **10.28.0**, as pinned by
[the CI workflow](.github/workflows/ci.yml):

```bash
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

The repository maintains `pnpm-lock.yaml` for actual installation and
`package-lock.json` for npm compatibility. After an intentional dependency
change, synchronize both lockfiles using the pinned pnpm version and
`npm install --package-lock-only --legacy-peer-deps`. Review the lockfile diff;
preserve `pnpm.packageExtensions`, overrides, and patched dependencies.

`npm run typecheck` uses the repository's TypeScript 7 compiler. The editor may
use a different TypeScript version; use repository diagnostics for validation.
Source-inspection tests import the `typescript-api` alias for the TypeScript 5
compiler API. Do not substitute an import from `typescript` in these tests.
`tsconfig.json` enables incremental compilation; remove `tsconfig.tsbuildinfo`
only when a clean diagnostic or timing comparison is required.

## Lint and tests

Run the smallest relevant behavioral tests after a code change, along with the
repository lint and type check where applicable:

```bash
npm run lint
npm run typecheck
npx vitest run lib/server/agent
npm test
npm run test:tooling
```

`npm run lint` runs `oxlint --deny-warnings`. The vendored anti-slop plugin lives
in `tools/oxlint/anti-slop/`; `oxlint.config.ts` documents intentionally disabled
rules and their historical audit counts. Re-enable a count-based rule only after
its violations reach zero. Explain each local suppression with the concrete
reason that makes it necessary. For example, copying `headers.keys()` before
mutating the collection prevents iteration from skipping entries.

A successful type check does not prove lifecycle or runtime behavior. Add a
focused regression for a behavior change and read a neighboring test before
inventing a new fixture or mocking approach. Avoid tests that merely duplicate
the implementation. Vitest discovers tests in `lib`, `components`, and `tools`,
using Node by default; DOM suites opt into jsdom per file. Prefer observable
outcomes and distinct boundary cases over exact CSS, logo, or source formatting
assertions. Structural checks remain useful for security and cross-file contracts
that runtime tests do not exercise. Do not require a test file for every module.
Use fake timers for polling and debounce tests instead of real elapsed waits;
keep real process deadlines where process termination is the behavior under test.

| Test concern | Existing example |
| --- | --- |
| Pure logic | `lib/server/agent/prune.test.ts` |
| API/SSE worker loop | `lib/server/agent/vm/supervisor.test.ts` |
| Generated Agent tools | `lib/server/agent/vm/opencode-tools.test.ts` |
| Server boundary with external dependencies mocked | `lib/server/agent/control-plane.test.ts` |

CI additionally runs release tooling, self-hosted contracts, edition-specific
build/start checks, dependency auditing, and publication/secret guards. Consult
the workflow for the current commands; historical test counts and local timings
are not acceptance criteria. Opt-in database tests need an isolated fixture and
must be reported separately from the default suite's skipped cases.

`test:tooling` discovers deterministic Node tests under `scripts` and
`captures/lib`; `*.integration.test.mjs` suites keep their explicit prerequisites
and commands. CI runs two complete Vitest shards alongside validation and keeps
the required `Tests & typecheck` gate dependent on both. See the
[MIN-617 review](docs/validation/min-617-test-suite-review.md) for the inventory,
cleanup decisions, timings, and database coverage limits.

## Encryption boundaries and operational gates

Scoped managed keys, row/object codecs, and bounded backfill workers live in
`lib/server/encryption/`. Domain `*-content.ts` modules connect those codecs to
application readers and writers. Project, user, and system scopes are distinct;
keep decrypted keys and content out of client persistence and diagnostic logs.

Changes to encrypted surfaces require both access and schema validation:

```bash
npm run check:encrypted-access
npm run check:encryption-schema
```

Read [the encryption inventory](docs/security/encryption/README.md) and
[the latest corrective review](docs/security/encryption/review-2026-09-29.md)
for source/copy coverage, writer fences, authenticated backfill proofs,
historical-key requirements, sandbox cleanup, and local-client copies.

Keep code CI readiness separate from production data closure. The readiness
endpoint explicitly reports `globalReadiness: "not_assessed"`; critical-family
and forge-object scans cannot certify the whole application or retained copies.
Staging performance, actual Storage-service restore, historical-copy retirement,
and provider cleanup remain operational gates. Do not infer completed production
encryption from isolated fixtures, and do not enable flags or run a migration or
deployment without the applicable authorization.

## Background work and response lifetime

Use `afterOrNow` from `lib/server/after-safe.ts` for best-effort work outside a
request's critical path, including usage timestamps, session refresh, and
opportunistic maintenance:

```ts
afterOrNow(async () => {
  await performMaintenance();
});
```

Return or await the work inside the callback. Detaching a promise from a request
can allow its invocation to finish before the work completes. `afterOrNow`
schedules with Next.js `after()` and catches errors; outside a request context it
starts the callback immediately. Required writes must still complete in the
critical path so a successful response reflects their outcome.

## Git workflow (this repository only)

Apply these rules only when the `origin` remote is `mangue-dev/minddy`. Never
apply them to another project.

### Before changing code

1. Check the Git state and refresh the remote references
   (`git fetch origin --prune`).
2. Pick one dedicated branch for the goal.
3. Check whether that branch already exists locally or on `origin`:
   - If it exists locally, switch to it and continue the work there.
   - If it exists only on `origin`, create its local tracking branch.
   - If it does not exist, create it with
     `npm run work:start -- "short work name"`.
4. Never create a second branch for the same work.
5. Never commit or push directly to `main` or `production`.
6. Always preserve pre-existing uncommitted changes.

### When the work is ready

- Run `npm run work:pr -- "Short title" -m "Complete description"` to create
  the pull request. The `-m` flag may be repeated for several paragraphs.
- If the pull request already exists, the command pushes the new commits but
  keeps its title and description, including manual edits. Use `npm run work:pr`
  for follow-up commits; supplying another title or description also succeeds
  without replacing either field. Never retitle or rewrite the description
  of an existing pull request unless explicitly requested. A deliberate rewrite
  needs the explicit `--replace` flag of `work:pr` (or a manual `gh pr edit`).
- After confirming the pull request is merged, run `npm run work:done`.
- Run `npm run deploy` only when the user explicitly asks for a production
  deployment.

## Commits and pull requests

- Always write commit messages and pull request titles and descriptions in
  idiomatic English.
- Commit messages follow the Conventional Commits style used in this
  repository (`feat:`, `fix:`, `refactor:`, …).
- Every pull request carries a complete, real description: what was done, why,
  how it was verified, and anything a reviewer needs to know. Never reduce a
  pull request description to a bare `Signed-off-by` trailer or a copy of the
  commit message. The DCO trailer belongs in the commits, not as the body of
  the pull request.
- For UI changes, include screenshots of the work in the pull request
  description whenever feasible. Keep these images up to date as the pull
  request evolves. Prefer light mode by default; include both light and dark
  mode screenshots when relevant, but covering both modes is optional.
- Every commit must carry the DCO sign-off (see below).

## DCO sign-offs

- Every commit an agent creates or amends must include a `Signed-off-by`
  trailer that exactly matches the commit author's name and email. Use
  `git commit --signoff`, including when amending a commit.
- Never use a generic agent identity for the sign-off when the commit has a
  different author. Before pushing or updating a pull request, verify every
  non-merge commit in its range has the matching trailer and repair the
  history when necessary.

## Minddy tools

- Treat the Minddy MCP tools as available for issue work in this repository.
  Discover their callable names by searching for the `mcp__minddy__` prefix;
  do not conclude that they are unavailable from an exact short-name lookup.
- When an issue identifier and project ID are provided, read the issue and its
  plan, keep plan task states synchronized while working, add a concise outcome
  comment, and update the issue status when the requested work is complete.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
