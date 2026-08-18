# Contribute to minddy

Thank you for contributing. Any participation is subject to
[Code of Conduct](CODE_OF_CONDUCT.md). Usage questions go into
[GitHub Discussions](https://github.com/mangue-dev/minddy-issues/discussions),
bugs and improvements in issue forms, and vulnerabilities
exclusively through the private channel of [SECURITY.md](SECURITY.md).

Before a non-trivial change, open an exit and wait for the perimeter
be accepted. An open issue is not a reservation: indicate that you
want to process it, keep the work visible and warn if you abandon it.
Governance, decision deadlines and review roles are described in
[GOVERNANCE.md](GOVERNANCE.md).

## License and DCO

Contributions are distributed under **AGPL-3.0-only**. No CLA or any
assignment of copyright is not requested. However, each commit must carry the DCO
following, which certifies that you have the right to submit your contribution under
this license:

```
Signed-off-by: First Name Last Name <email@example.com>
```

Use `git commit -s` to add it. The complete policy, including
notices and the rule applicable to operators of modified instances, is in
[docs/licensing.md](docs/licensing.md).

Sign-off is required on **every commit**, including after a rebase. For
fix last commit, use `git commit --amend --signoff`; for one
series, rebase it and sign each commit. The DCO workflow blocks the merge if it
Missing a valid line. The sign-off certifies your rights, it does not replace
the author and does not transfer your copyright.

## ⚠ This repository executes code upon installation

Read before cloning a pull request on your machine. It's not a
principle precaution: **opening this repository and running it is enough to execute
the code it contains**, without ever opening a test file.

Three paths, all triggered by commands that we type without thinking:

| Order | What runs |
| --- | --- |
| `pnpm install` / `npm install` | installation scripts for authorized dependencies (`pnpm.onlyBuiltDependencies`: `esbuild`) |
| `npm run test` (`vitest`) | [scripts/build-pages-md.mjs](scripts/build-pages-md.mjs), launched as a subprocess by [test/build-pages-md-setup.ts](test/build-pages-md-setup.ts) **before the first test** |
| `npm run dev`, `npm run build` | `predev`/`prebuild` → [scripts/build-agent-vm.mjs](scripts/build-agent-vm.mjs) and `build-pages-md.mjs` |

On a maintainer's workstation, this code runs **next to a `.env` which carries
the production key `service_role`**. A `scripts/` file modified in a
PR, or a dependency added to the lockfile, reads this file as easily as
`cat`.

**The practical consequence: do not check a PR by launching it on your computer
of work.** The CI is there for that — it plays exactly these gates in a
Disposable runner who sees no secrets. If you still need to carry out a
PR locally:

1. First read the diff of `scripts/`, `package.json`, lockfiles,
`vitest.config.ts` and `test/` — this is where what runs on its own lives.
2. Do it in a container or disposable VM, on a clone **without `.env`**.
3. Failing this, remove `.env` from the folder for the duration of the test. A `.env.example`
is enough to keep things moving: it is safe and speaks to nothing.

## CI is the pipeline

[.github/workflows/ci.yml](.github/workflows/ci.yml) plays, on each pull
request and each push on `main`/`production`:

- `pnpm run check:public-repo`
- `pnpm run lint`
- `pnpm run typecheck`
- `node scripts/build-desktop.mjs`
- `pnpm run test`
- `node scripts/audit.mjs` — high/critical vulnerabilities on **three**
repository lockfiles (`pnpm-lock.yaml`, `package-lock.json`,
  `desktop/package-lock.json`), entire tree

The workflow is triggered on `pull_request` and **never** on
`pull_request_target`: the job that executes fork code runs without access to
repository secrets, with a read-only `GITHUB_TOKEN`. No `secrets.*`
must appear in this file. A job that needs a secret is a job that
should not run PR code.

[`deploy.sh`](deploy.sh) is the maintainer's one-stop helper. It detects the
modified perimeters, automatically offers public core, web Cloud and macOS,
or allows “all” and a manual choice. It orchestrates repeatable workflows
described in [docs/releases.md](docs/releases.md), awaits approval of the
promotion and the verdict of each perimeter. Only the protected workflow advances
`production` ; only its SHA can receive a public tag. The command does not read
never `.env`, and the above CI remains the common versioned pipeline.

## Prepare a pull request

1. Start from an up-to-date branch and keep a single goal per pull request.
2. Add or adapt tests, documentation, and language catalogs.
3. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` in an environment
   without secrets.
4. Describe the why, changes, checks, risks and
license any new dependencies or resources in the PR model.
5. Sign each commit with `git commit -s`.

An external contribution is first reread without executing its code. A
maintainer then authorizes the fork CI, requests the necessary corrections
and verifies the DCO, checks and conversations before merging. An approval
owner code is mandatory; the author does not endorse his own PR. The merger
made by squash. Maintainers can refuse an out-of-scope change,
insufficiently secure or whose maintenance cost exceeds the benefit, even if
its implementation works.

## Work in the depot

- **Package manager: pnpm.** This is what actually installs
(`node_modules` is a pnpm store). The depot also holds a
`package-lock.json`: after a `pnpm add`, resynchronize with
  `npm install --package-lock-only --legacy-peer-deps` (a peer conflict
pre-existing tiptap blocks npm without this flag).
- **A new behavior comes with its test.** `npx vitest run` (18 s).
Typecheck does not override it.
- **Visible strings**: they pass through next-intl and live as a duplicate in
`messages/en.json` and `messages/fr.json`, with the same keys and the same
placeholders. After touching it: `npx vitest run lib/i18n-contract.test.ts`.
- The detailed conventions of the deposit are in [CLAUDE.md](CLAUDE.md), its
security architecture in [SECURITY.md](SECURITY.md).

Dependency updates follow [GOVERNANCE.md](GOVERNANCE.md): origin
and license verified, lockfiles synchronized, no automatic merging of a
major version, CI and high/critical audit required.

## Report a vulnerability

Do not open a public exit: write to the contact indicated at the end of the
[SECURITY.md](SECURITY.md), which also describes the incident procedure.
