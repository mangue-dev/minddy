# Releases publiques

This document is the release contract for minddy's **public heart**.
`npm run deploy` is the single entry for the maintainer: his assistant chooses
and orchestrates the operations below. Specialized workflows and scripts
remain separated internally to be replayable by the CI, but it is not
necessary to launch them one by one.

### Heart and Cloud, concretely

The **minddy heart** is the distributable product: source code, migrations,
Next.js application and desktop shell. A core release creates a version
durable public (`v0.10.0`) that any operator can download and
install. It does not, in itself, modify the site used by our customers.

**Minddy Cloud** is our running instance on `www.minddy.app`: the
same core, configured with our Supabase, our domains, our optional services
and our Vercel accommodation. Deploying it changes what users see
in production. It can be deployed several times between two core releases.
The marketing pages live in the same web build: publishing them is therefore a
Cloud deployment, but a marketing change alone does not deserve a new
product version.

Any Cloud promotion is preceded by the
[`security release checklist`](security-release-checklist.md). The report
completed, its residual risks and the pentest decision are reviewed before
approval of the production environment; their reference is preserved
in the GitHub run of the promoted SHA.

## The three cadences

| Perimeter | Identifier | Trigger | Artifact or evidence |
| --- | --- | --- | --- |
| Public Heart | SemVer `X.Y.Z`, annotated tag `vX.Y.Z` | workflow `Public core release`, on the SHA of `production` | source, migrations, manifest, notes and checksums; GitHub attestations once the repository is public |
| Minddy Cloud | SHA Git + immutable identifier of the Vercel deployment | workflow `Promote production`, after green CI and approval | Same SHA on `main` and `production`, URL and status of GitHub Deployment Vercel |
| Marketing website | SHA Git + deployment identifier | site hosting pipeline | deployment ; no bump or tag from the heart if only the marketing content changes |

The deposit remains simple: the contributions converge on `main`, the branches
work goes through pull request, and `production` only denotes what
serves Minddy Cloud. There is no long-running release branch. A
patch of an old major part exceptionally from a branch
`release/X.x`, then receives a normal SemVer tag.

## Versioning and release notes

The heart follows SemVer:

- **patch**: compatible correction, hardening or additive migration without
  change of public contract;
- **minor**: compatible functionality, new optional variable or
  additive migration which requires documented action;
- **major**: API/configuration breakage, announced deletion or migration of
  data incompatible with the old application.

The public [changelog](https://minddy.app/changelog) documents user-visible
deliveries. Add a product entry through `scripts/changelog-add.mjs`; it updates
the app's localized release notes. Cloud operations and purely marketing
changes remain in their respective journals.

## The single order

Depuis un `main` propre :

```bash
npm run deploy
```

The assistant displays what it has detected since the last tag and since
`production`, then suggests:

1. **Automatic recommendation**: selection based on modified files;
2. **Publish everything directly**: core + web Cloud + macOS;
3. **Choose perimeter by perimeter**;
4. cancel.

In automatic mode:

- product/API/migrations/docs files suggest a core release;
- any commit missing from `production` suggests web deployment;
- the marketing paths are indicated and do not alone lead to a release of the
  heart;
- macOS is only suggested if the actual shell footprint differs from the
  last publication.

If core is selected, the wizard asks for patch/minor/major or an explicit
version. It updates the four manifests/lockfiles, creates the
commit signed DCO, pushes `main` and waits for its remote CI. It then triggers
`Promote production`, which is waiting for environment approval
`cloud-production`, rechecks successful CI of exact SHA, rejects any discrepancies
and advances `production` in fast-forward. Workflow waits for GitHub Deployment
Vercel `Production` to `success` status. It does not use any local Vercel tokens.

A core release involves this Cloud promotion: the public tag cannot be
created only on a commit actually deployed. After promotion, the wizard launches
`Public core release` to `production` with version and immutable SHA. The
workflow `scripts/release-policy.mjs` refuses a different ref, a checkout
different or a different `production` head. A version prepared but left
without a tag after a failure is detected and offered again, without a second bump.

Scriptable variants are `npm run deploy -- auto`, `-- all` and
`-- custom`. Even 'all' retains the version checks and question:
“direct” means a single route, not a bypass of the CI.

For each path that includes the web, the command requests the stable reference
of the safety report, if residual risks are recorded there and the
pentest status. In non-interactive, use
`MINDDY_SECURITY_REVIEW_REF`, `MINDDY_RESIDUAL_RISKS` and
`MINDDY_PENTEST_STATUS` as described by the checklist. The workflow
`Promote production` refuses an outdated checklist, missing proof or a
pentest required but not completed before opening approval gate.

The workstation never loads `.env` and does not create any trust artifacts. He
only does a quick test of the release scripts before preparing the request;
lint, typecheck, tests, audit, web build, artifacts, signature and notarization
spin in disposable runners. Production secrets remain in the
GitHub environments or in the organization's Vercel integration.

Internally, `scripts/prepare-release.mjs` refuses a non-SemVer version or an
existing tag. The public workflow repeats the repository barrier,
frozen installation, lint, typecheck, desktop bundle, tests, audit and a real
`next build` without secrets. It generates the artifacts before creating the
tag and attests them when the repository visibility supports GitHub artifact
attestations. Any required step failing before tag creation therefore does not
leave a half-release.

## Artifacts of the heart

`scripts/build-release-artifacts.mjs` makes in `.release/`:

- `minddy-vX.Y.Z-source.tar.gz`, deterministic commit archive;
- `minddy-vX.Y.Z-migrations.tar.gz`, migrations, bootstrap and runbooks useful for
  installation or update;
- `release-manifest.json`, which links version, tag, SHA, previous release,
  added migrations and archive hashes;
- `UPDATE.md` and a link to the public changelog;
- `SHA256SUMS`.

GitHub also provides its automatic tag archives. For a public repository, the
workflow adds a long-term keyless certificate of provenance thanks to the OIDC
identity of the runner. User-owned private repositories do not support that
GitHub API, so earlier releases rely on the published checksums and emit an
explicit workflow notice. After downloading:

```bash
# Always available:
shasum -a 256 -c SHA256SUMS
# Available for releases created after the repository becomes public:
gh attestation verify minddy-v0.10.0-source.tar.gz --repo mangue-dev/minddy-issues
```

A “reproducible build” here means that the recipe, Node/pnpm versions,
the lockfile and controls live in GitHub Actions and run in a
blank runner. The source archives are bit-for-bit reproducible for the same
commit(`git archive` + `gzip -n`). The Next build verifies the web application; the
deployed binary remains specific to the environment, because the variables
`NEXT_PUBLIC_*` are part of the build. Minddy Cloud therefore registers its SHA and
its Vercel identifier instead of presenting its build configured as a
Generic self-hosting artifact.

After each successful Cloud deployment, the operator saves in the repository
private `mangue-dev/minddy-cloud-ops` an immutable provenance manifest: SHA and
version of this core, tree and head of migrations, private configuration SHA,
contract/configuration fingerprints, Vercel deployment identifier and project
Supabase. The manifest does not contain any environment values ​​or client data.
The public workflow stops at the Vercel verdict and never clones the private repository:
this log supplements proof of exploitation without becoming a dependency of the heart.

## Migrations, updates and rollbacks

The manifest and `UPDATE.md` list the migration diff from the tag
previous. The archive also provides the complete history, necessary for bootstrapping.
The reference operational procedure remains
[`self-hosting-operations.md`](self-hosting-operations.md): backup
Postgres + Storage coordinate, stop of writes, migrations before new
application, verification, then reopening.

Migrations are forward-only. Before their application, return to the tag
previous one is enough. After a migration declared compatible backwards, the old
code can be restarted during the documented window. In all the others
case, the rollback is the restoration **of the same set** Postgres, Storage,
configuration and application version. Never invent a `down.sql` during
the incident.

### Hotfix Cloud

An emergency follows the same simple path as any Cloud patch:

1. create the correction from the `main` head, with non-regression test;
2. commit the correction to `main`, then run `npm run deploy`;
3. check the SHA of `production` and the associated Vercel deployment.

Never correct only `production`, even temporarily: the next
fast-forward would lose the fix and make the served state impossible to
reproduce from `main`.

### Rollback Cloud without rewriting

Find the `STABLE_SHA` in the last successful Vercel deployment. Don't
force `production` to this old commit. Restore your tree on `main`
current, then produce a **new** rollback commit:

```bash
git fetch origin main
git switch main
git merge --ff-only origin/main
git restore --source "$STABLE_SHA" --staged --worktree -- .
git commit -s -m "revert(cloud): restore $STABLE_SHA"
npm run deploy -- custom
```

Before deployment, check compatibility with migrations already applied:
they remain forward-only and are never canceled by this restoration of
code. In the menu, select only the web Cloud. The new commit is
pushed to `main`, tested, then `production` points to this same SHA by
fast-forward. Its application tree restores the stable version without rewriting
the history. The background correction then starts from this restored `main` and receives
a new deployment; she never lives only on `production`.

## App macOS publique

The desktop does not automatically receive each version of the core: it is a
window on the web, and a web modification does not change the shell. When
`npm run desktop:check` shows a different fingerprint, launch **macOS public
release** with a core version already released. The workflow rebuilt on
`macos-26`, signs, notarizes, staples the ticket, checks the update flow,
adds its checksums and attestations, then attaches `.dmg`, `.zip`, blockmaps and
`latest-mac.yml` to the existing release.

The following secrets belong to the GitHub environment
`public-release`, not to an account or a personal keychain:

- `MACOS_CERTIFICATE_P12_BASE64` and `MACOS_CERTIFICATE_PASSWORD` ;
- `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`;
- `PUBLIC_DESKTOP_FEED_URL` and `PUBLIC_DESKTOP_BLOB_READ_WRITE_TOKEN` for the
  Generic stable electron-updater flow.

The role must be transferable to another maintainer and the secrets must
be rotary. The workflow attaches immutable binaries to GitHub Releases and
updates the generic stream manifest **last**, after the binaries.
Storage can be Vercel Blob as in
[`desktop-release.md`](desktop-release.md), but its identifiers are those of
organization and publication is carried out by the CI.

## GitHub approvals and settings

- `cloud-production` protects `Promote production` with required maintainers;
  only he can advance `production` with the ephemeral `GITHUB_TOKEN`;
- `public-release` protects the tag, GitHub Release and Apple secrets;
- `production` prohibits force-push and delete. His only writing actor
  authorized is the promotion workflow;
- Git Vercel integration must publish an exactly named GitHub Deployment
  `Production`, otherwise the promotion ends in failure even if the branch has
  advanced. After restarting the Vercel deployment, rerunning the command verifies the
  same SHA and resumes waiting.

Explicit approval is done in the GitHub interface while
`npm run deploy` is waiting. It is logged with the run, the requested SHA and the
Vercel verdict. Reproducible settings are listed in
`.github/REPOSITORY_SETTINGS.md`.

## Prepublication validation for the first self-hosted release pair

The historical `v0.9.4` and `v0.9.5` tags are lightweight and predate the
self-hosting contract. They must never be moved or replaced. When clean-room
acceptance blocks the first public release, prepare two consecutive final
SemVer commits and validate their exact Git objects before publication:

1. Prepare a clean source commit whose manifests declare the first version and
   which contains the complete self-hosting contract. Prepare its direct
   descendant for the next patch version. Neither commit may rely on an
   uncommitted file or a patch applied by the validator.
2. Create annotated, temporary candidate refs. Their namespace distinguishes
   lifecycle evidence from a published release:

   ```bash
   export SOURCE_VERSION=0.10.0
   export TARGET_VERSION=0.10.1
   git tag -a "preflight/v$SOURCE_VERSION" "$SOURCE_SHA" \
     -m "minddy v$SOURCE_VERSION preflight"
   git tag -a "preflight/v$TARGET_VERSION" "$TARGET_SHA" \
     -m "minddy v$TARGET_VERSION preflight"
   git bundle create minddy-preflight.bundle \
     "refs/tags/preflight/v$SOURCE_VERSION" \
     "refs/tags/preflight/v$TARGET_VERSION"
   if command -v sha256sum >/dev/null 2>&1; then
     sha256sum minddy-preflight.bundle > SHA256SUMS
   else
     shasum -a 256 minddy-preflight.bundle > SHA256SUMS
   fi
   ```

   Replace each placeholder with two different consecutive versions. Record
   the bundle checksum, both annotated-tag object IDs, and both commit IDs.
3. Transfer only the bundle and checksum to the disposable host. Run the
   prepublication path in
   [`self-hosting-clean-room.md`](self-hosting-clean-room.md), including the
   complete install, update, backup, blank restore, and evidence seal. A passing
   preflight alone is not lifecycle acceptance.
4. If any code, documentation, manifest, migration, lockfile, or candidate ref
   changes, discard the evidence and repeat the complete run. Fixes always
   produce new commits; candidate refs are never moved for an accepted report.
5. Promote and publish the source version, then the target version, through
   `deploy.sh`. Use a fresh publishing clone so the target candidate can remain
   ahead of `origin/main` while the source is promoted first. Import the
   accepted candidate bundle into that clone, verify that the current public
   `main` is an ancestor of the source, and never recreate or move either
   candidate ref:

   ```bash
   export CANDIDATE_BUNDLE=/secure/evidence/minddy-preflight.bundle
   export PUBLISH_DIR="$(mktemp -d)"
   git clone git@github.com:mangue-dev/minddy-issues.git "$PUBLISH_DIR"
   git -C "$PUBLISH_DIR" fetch "$CANDIDATE_BUNDLE" \
     "refs/tags/preflight/v$SOURCE_VERSION:refs/tags/preflight/v$SOURCE_VERSION" \
     "refs/tags/preflight/v$TARGET_VERSION:refs/tags/preflight/v$TARGET_VERSION"
   export SOURCE_SHA="$(git -C "$PUBLISH_DIR" rev-parse "preflight/v$SOURCE_VERSION^{commit}")"
   export TARGET_SHA="$(git -C "$PUBLISH_DIR" rev-parse "preflight/v$TARGET_VERSION^{commit}")"
   git -C "$PUBLISH_DIR" merge-base --is-ancestor origin/main "$SOURCE_SHA"
   git -C "$PUBLISH_DIR" merge-base --is-ancestor "$SOURCE_SHA" "$TARGET_SHA"
   git -C "$PUBLISH_DIR" switch -C main "$SOURCE_SHA"
   (cd "$PUBLISH_DIR" && npm run deploy -- custom)
   git -C "$PUBLISH_DIR" merge --ff-only "$TARGET_SHA"
   (cd "$PUBLISH_DIR" && npm run deploy -- custom)
   ```

   In each assistant run, select public core and Cloud web, and provide the
   security-review evidence required by the release checklist. Select macOS
   only when that artifact is part of the release. `deploy.sh` pushes the exact
   checked-out candidate, waits for its successful `main` CI, advances the
   protected `production` branch, verifies the Production deployment, and only
   then creates the public tag. Do not push the target to `main` before the
   source run completes. After publication, verify both mappings:

   ```bash
   test "$(git rev-parse "v$SOURCE_VERSION^{commit}")" = "$SOURCE_SHA"
   test "$(git rev-parse "v$TARGET_VERSION^{commit}")" = "$TARGET_SHA"
   test "$(git cat-file -t "v$SOURCE_VERSION")" = tag
   test "$(git cat-file -t "v$TARGET_VERSION")" = tag
   ```

   The public tags are immutable. Delete the temporary candidate refs only
   after these checks; retain the accepted report and bundle checksum with the
   release evidence.

## Self-hosted distribution support

The public core release is the only minddy self-hosting distribution. Its
canonical tagged source, migrations, compatibility record, and future
deployment assets all live in this repository. The full release guarantee and
the distinction between the managed-Supabase and official-Supabase-stack paths
are defined in [the self-hosted distribution contract](self-hosting-distribution.md).
Operators must use the matrix recorded for the release they deploy; Minddy
Cloud deployment state is not a self-hosting artifact or a fallback service.

## Failure and recovery

- Before creating the tag: correct the commit or configuration, then restart.
- Tag pushed but release absent: do not move the tag; create the release at
  from the artifacts preserved by the workflow, or publish a patch if the
  content is false.
- Release published: it is immutable. A correction gives a new
  version ; assets are not replaced silently.
- Failed Cloud deployment: follow the Vercel/runbook base rollback. Don't
  remove a correct public release to reflect a Cloud incident.
