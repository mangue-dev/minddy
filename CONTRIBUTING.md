# Contributing to minddy

Thank you for contributing. Participation is governed by our
[Code of Conduct](CODE_OF_CONDUCT.md). Use
[GitHub Discussions](https://github.com/mangue-dev/minddy/discussions) for usage
questions, the repository issue forms for reproducible bugs and proposals, and
the private channel in [SECURITY.md](SECURITY.md) for vulnerabilities.

Before starting a substantial change, open an issue and agree on its scope with
a maintainer. An issue is not a reservation: say that you intend to work on it,
keep progress visible, and tell the team if you stop. Project roles and review
expectations are documented in [GOVERNANCE.md](GOVERNANCE.md).

## License and DCO

Contributions are licensed under **AGPL-3.0-only**. We do not require a CLA or
copyright assignment. Every commit must include this Developer Certificate of
Origin sign-off:

```
Signed-off-by: First Name Last Name <email@example.com>
```

Use `git commit -s` to add it. Sign-off is required on every commit, including
commits rewritten during a rebase. Use `git commit --amend --signoff` for the
latest commit or an interactive rebase for a series. The sign-off certifies
that you have the right to submit the contribution under the project license;
it does not transfer your copyright. See [docs/licensing.md](docs/licensing.md)
for the full policy.

## Run untrusted changes safely

Repository code executes during common development commands:

| Command | Code that runs |
| --- | --- |
| `pnpm install` or `npm install` | Approved dependency installation scripts |
| `pnpm test` | Test setup, including `scripts/build-pages-md.mjs` |
| `pnpm dev` or `pnpm build` | `predev`/`prebuild`, agent VM, and page Markdown builders |

Do not execute an untrusted pull request in a checkout that contains production
credentials. Review changes to `scripts/`, package manifests, lockfiles,
`vitest.config.ts`, and `test/` first. Run the pull request in a disposable VM
or container with no `.env` file. `.env.example` is sufficient for static
checks and documents safe placeholders.

## CI and branches

Short-lived branches target `main`. There is no `develop` branch or persistent
release branch. CI runs the publication barrier, secret scan, lint, typecheck,
desktop bundle build, test suite, and dependency audit. Pull-request code runs
through `pull_request`, never `pull_request_target`, with a read-only token and
without repository secrets.

The protected promotion workflow is the only writer to `production`.
Maintainer releases use `pnpm deploy`; the release process is documented in
[docs/releases.md](docs/releases.md).

## Prepare a pull request

1. Branch from an up-to-date `main` and keep one goal per pull request.
2. Add or update tests, documentation, and locale catalogs as appropriate.
3. Run `pnpm lint`, `pnpm typecheck`, and the smallest relevant tests in an
   environment without secrets.
4. Explain the motivation, changes, checks, risks, and licenses for new
   dependencies or assets.
5. Sign off every commit with `git commit -s`.

Maintainers review external contributions before executing them. At least one
code-owner approval is required, and authors do not approve their own pull
requests. Maintainers may decline changes that are out of scope, unsafe,
insufficiently tested, or too costly to maintain.

## Maintainer workflow shortcuts

The repository includes a three-command workflow for maintainers who commit
from the VS Code Source Control view:

```bash
npm run work:start -- "short work name"
# Edit files, generate the commit message, and commit in VS Code.
npm run work:pr
# Merge the pull request on GitHub after its checks pass.
npm run work:done
```

The start command creates a short-lived branch from the latest `origin/main`.
The pull-request command pushes that branch, adds any missing DCO sign-offs,
and creates or updates its pull request. The done command refuses to run until
the pull request is merged, then synchronizes local `main` and removes the work
branch. Repository VS Code settings add the required DCO sign-off to commits
created from the Source Control view.

Run `npm run deploy` separately from a clean, synchronized `main` only when the
merged changes should reach production.

## Repository conventions

- Use pnpm for dependencies and keep `pnpm-lock.yaml`, `package-lock.json`, and
  `desktop/package-lock.json` synchronized when applicable.
- Add a test for new behavior. Typechecking does not replace tests.
- Put user-visible strings in the next-intl catalogs and preserve identical
  keys and placeholders across locales. Run the i18n contract test after
  changing a catalog.
- Write new comments, documentation, tests, configuration prose, and
  developer-facing messages in idiomatic English.
- Review the origin and license of every new dependency or asset.

## Report a vulnerability

Do not open a public issue. Follow the confidential reporting instructions in
[SECURITY.md](SECURITY.md#report-a-vulnerability).
