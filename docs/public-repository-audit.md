# Repository publication audit

Date: August 16, 2026. Scope: `main` and `production` branches, tracked
remotes, and locally inaccessible Git objects. This document is an audit report;
it is neither legal advice nor an effective revocation of a secret.

## Result

**Local rewriting done, publication not yet pushed.** The automated check
must be restarted after deleting local backup refs and
purging objects; the rewritten branches and tags will then be the only refs to
check before any push to a public repository.

The scan did not identify a private key or active token matching the
GitHub, OpenAI, Anthropic, Slack, AWS or Google patterns in the current tree. The
strings resembling test secrets and `scripts/extract-apns-secret.mjs`
are deliberately ignored: they are used to verify detection and are not
operational identifiers. A text search finds loopback and service-name URLs in
the documentation and tests; they are necessary for local development and are
not internal infrastructure URLs published by the project.

## History to be cleaned up

The paths below are still reachable from the refs and cause failure
`npm run check:public-repo`:

- `.claude/launch.json` and `.claude/settings.json` ; the first contained a
  absolute workstation path;
- `MIN-102-plan.md`, `MIN-184-plan.md`, `copy-audit*.{json,md}`, `dev.log` and
  `problems.md` ; internal work documents and logs;
- `captures/world/world.md` ; private capture state;
- `docs/audits/securite-2026-08-05.md`, `docs/desktop-signing.md` and
  `docs/rgpd/registre-des-traitements.md` ; internal documentation;
- an old version of `scripts/seed-inbox.mjs` containing an identifier of
  default account.

The removal of `.claude/launch.json` from the current tree is included in this
change. On August 16, 2026, local branches, refs `origin/*` followed and
tags have been rewritten with `git filter-branch` to remove each path
listed, along with all historical versions of `scripts/seed-inbox.mjs`.
The current version of the script, which requires a UUID passed as an argument,
was then reintroduced. A pre-rewrite mirror backup is kept outside the repository
to be published in `/private/tmp/minddy-before-public-history-rewrite-20260816.git`.

Git metadata also exposes the following author identities: Clément
Guérin (`81526886+mangue-dev@users.noreply.github.com`), mangué (GitHub address noreply), `minddy
agent` and `minddy-app[bot]`. They are not secrets, but constitute
personal data or attributions: the persons concerned must
confirm their publication. Commit messages contain context
product; they are included in the scope of human proofreading before export.

## Rewriting and revocation procedure

1. Before any rewriting, determine if the seed identifier has ever been
   active. If it has been, deactivate/run it on the supplier side before
   publish: removing a Git text does not revoke anything.
2. Clone a backup mirror out of the release repository and freeze the
   pushes. List the refs to keep with `git for-each-ref`.
3. On a working copy, use `git filter-repo` (or BFG after review) to
   remove the paths listed above from **all** refs intended to be
   published. If the seed identifier must remain in the code, replace it with
   a clearly synthetic fixture value before rewriting.
4. Check `git log --all`, `git fsck --full --no-reflogs --unreachable` and
   `npm run check:public-repo`; only push refs cleaned with
   `--force-with-lease` after warning contributors. Invalidate tags,
   caches, forks and archives that would expose old SHAs.
5. In each monitored clone, expire the reflogs then purge:
   `git reflog expire --expire=now --all` and `git gc --prune=now`. These commands
   are destructive: only launch them after validation of the backup.

Inaccessible objects observed locally are not pushed by an ordinary push, but
they must be purged before transferring a `.git` folder,
to create a bundle or deliver a repository archive.

## Current tree inventory

| Element | Observation | Decision before publication |
| --- | --- | --- |
| `captures/world/seed/` and `captures/shots/` | Tracked demo data/captures including JSONL, markdown and images. | Manually check that they only represent fictitious accounts, emails, projects and avatars. |
| `public/captures/` | 32 WebP captures intended for the public site. | Confirm their synthetic origin and the absence of real data. |
| `public/agents/*.svg`, `public/import/*.svg` | Logos of third-party products and services. | Obtain/archive authorization or replace with generic pictograms; the brands are not licensed by the AGPL. |
| `public/logo.svg`, `app/` and `desktop/build/` icons | minddy brand assets. | The holder must confirm that he owns the rights; document separate brand policy. |
| `app/fonts/inter-arrows.woff2` | Inter font, with `app/fonts/LICENSE-Inter.txt`. | Keep the SIL OFL-1.1 notice during any distribution. |
| `.claude/` and `CLAUDE.md` | Instructions/development tools followed. | Review license and confidentiality before maintaining public; `launch.json` was removed because it leaked a local path. |

GDPR documents still followed (`docs/rgpd/`) must be re-read to confirm
that they describe generic procedures and not subcontractors, contacts or
configurations not intended for the public.

## Licenses and chain of rights

The project declares `AGPL-3.0-only` in `package.json`; `LICENSE`, `NOTICE` and
`docs/licensing.md` preserve the historical MIT record, the attribution of
known contributors, the DCO policy and the Inter notice. This architecture is
compatible with publication under AGPL, provided that the contributors
historical have authorized their contribution under this license or that their
code is retired/relicensed.

The dependency inventory is locked in `pnpm-lock.yaml` and
`package-lock.json`. Existing policy lists MIT, Apache-2.0, ISC, BSD,
MPL-2.0 and LGPL-3.0-or-later (in particular via `sharp`) and does not report
GPL-2.0-only. These licenses are in principle compatible with the distribution
AGPL of the project, subject to keeping the notices and respecting the
LGPL/MPL obligations for the components concerned. The order
`pnpm licenses list --json` was unable to produce the complete inventory in this
environment because the pnpm store index is incomplete; the publishing CI must
run it from a clean installation and archive its result with the tag.

## Permanent control

`scripts/check-public-repo.mjs` controls the index, forbidden paths and
reasons for secrecy. Outside of `--staged` mode, it also inspects each reachable blob
from branches, tags and refs `origin/*`, so that a secret deleted from HEAD
remains blocking until the publishable history is cleaned. Checkpoints
premises under `refs/codex/*` are not included: they are not part of a push
standard and should never be exported with `git push --mirror` or a copy
from the `.git` folder. The mode
`--staged` remains voluntarily limited to candidate changes: it is adapted
to the local hook; the CI must execute the command without options.
