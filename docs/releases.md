# Public releases

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
[`security release checklist`](security-release-checklist.md). Use a short review of the changed surface and reuse applicable prior evidence;
a full audit or pentest is not required for every release. A solo maintainer may
approve with the absence of independent review recorded explicitly. The report,
residual risks and justified pentest decision are recorded before protected
production approval; their reference is preserved in the GitHub run of the
promoted SHA. Confirmed serious security issues still block publication.

## The three cadences

| Perimeter | Identifier | Trigger | Artifact or evidence |
| --- | --- | --- | --- |
| Public Heart | SemVer `X.Y.Z`, annotated tag `vX.Y.Z` | workflow `Public core release`, on the SHA of `production` | source, migrations, manifest, notes and checksums; GitHub attestations once the repository is public |
| Minddy Cloud | SHA Git + immutable identifier of the Vercel deployment | workflow `Promote production`, after green CI and approval | Same SHA on `main` and `production`, URL and status of GitHub Deployment Vercel |
| Marketing website | SHA Git + deployment identifier | site hosting pipeline | deployment ; no bump or tag from the heart if only the marketing content changes |

## Branch contract

The delivery flow is deliberately short:

`feature/*` → pull request → `main` → approved fast-forward → `production` →
Vercel Production deployment → `vX.Y.Z`

- `main` is the default integration branch, the target of pull requests, and
  the candidate served by `preview.minddy.app`. It may contain changes
  that have passed CI but have not yet been approved or deployed to production.
- `production` is an automation-only pointer to the exact SHA currently served
  by Minddy Cloud. Humans do not commit or merge into it. The protected
  `Promote production` workflow is its only writer and may only fast-forward it
  from a green `main` SHA after `cloud-production` approval.
- A public `vX.Y.Z` tag can only be created from the promoted `production` SHA
  after Vercel has reported a successful GitHub Deployment named `Production`.

Each branch has its own database: `main` deploys preview against the
Supabase `preview` branch, and `production` deploys Minddy Cloud against the
production project. Migrations are applied to preview during development and
reach production only through `Promote production`, which applies them after
approval and before the fast-forward. See
[database environments](database-environments.md) for the procedure and the
backward-compatibility rule.

There is no `develop` branch and no long-running release branch. Work stays on
short-lived branches and converges on `main` through pull requests. A patch for
an older major version may exceptionally use a temporary `release/X.x` branch,
then receives a normal SemVer tag.

## Versioning and release notes

The heart follows SemVer:

- **patch**: compatible correction, hardening or additive migration without
  change of public contract;
- **minor**: compatible functionality, new optional variable or
  additive migration which requires documented action;
- **major**: API/configuration breakage, announced deletion or migration of
  data incompatible with the old application.

The public [changelog](https://minddy.app/changelog) announces confirmed
production versions. Prepare one localized release draft using the existing
changelog skill and `scripts/changelog-add.mjs`. Small updates use compact text;
substantial releases use illustrated bentos. The protected promotion workflow
publishes the content only after the exact SHA's successful production
deployment. See [the changelog workflow](changelog.md) for the schema, storage
configuration, performance budgets, and historical backfill.

## Documentation gate

Documentation must remain current with every code change, including feature
additions, behavior changes and removals. Review impact first: small fixes,
refactors, formatting and test-only PRs that leave documentation accurate need
no documentation edit or new illustration. A brief note suffices for that PR;
the release documentation gate still applies when the desktop version changes.
Follow the
[maintenance contract](../content/documentation/README.md#release-maintenance)
and [editorial guide](documentation-editorial-guide.md). Update affected public
guides in all six languages, localized examples, captions, alternative text,
screenshots and responsive diagrams, plus technical references and internal
instructions, through the same reviewed PR as the change.

Every release that changes the desktop version requires a review of the manual
against the release delta and intended version before freezing the candidate.
Update affected articles, visuals, compatibility and genuine review evidence;
record verified applicability or retained evidence for unchanged guides. A
changelog entry does not replace these updates. Run
`npm run check:documentation`, `npm run check:knowledge`,
`npm run check:owned-english`, `npm run check:documentation:release` and
`git diff --check`. Unresolved essential content, translation or illustration
gaps block publication. Include documentation in the immutable candidate;
later corrections require a new candidate and rebuilt affected artifacts.

## The single order

From a clean `main` checkout:

```bash
npm run deploy
```

The assistant displays what it has detected since the last tag and since
`production`, then suggests:

1. **Automatic recommendation**: selection based on modified files;
2. **Publish everything directly**: core + web Cloud + desktop applications;
3. **Choose perimeter by perimeter**;
4. cancel.

In automatic mode:

- product/API/migrations/docs files suggest a core release;
- any commit missing from `production` suggests web deployment;
- the marketing paths are indicated and do not alone lead to a release of the
  heart;
- desktop applications are only suggested if the actual shell footprint differs
  from the last publication.

`main` accepts only squash-merged pull requests, so the assistant never pushes
to it. It refuses to run when the local `main` differs from `origin/main`, and
it publishes the version that `main` already declares.

Prepare a core version in a pull request before running the assistant:

```bash
npm run work:start -- "release X.Y.Z"
npm run release:prepare -- X.Y.Z
```

`release:prepare` updates the five manifests and lockfiles, including the
public MCP registry manifest, whose publication is documented in
[mcp-registry-publication.md](mcp-registry-publication.md). Add the version's
row to `deploy/self-hosted/compatibility.json`, bump `MINDDY_RELEASE` and
`MINDDY_IMAGE` in `deploy/self-hosted/.env.example`, commit with the DCO
sign-off and open the pull request with `npm run work:pr`. That pull request
runs the [release preflight](#release-preflight).

When no new version is prepared, the automatic mode deploys the Cloud web
without a core release, and the `all` and `custom` modes stop with these
instructions if the core was selected.

Once the candidate is on `main`, the assistant checks the repository settings
(see the preflight), waits for the remote CI of that commit, then triggers
`Promote production`. The workflow waits for the `cloud-production` approval,
rechecks the successful CI of the exact SHA, rejects any discrepancy, applies
the pending migrations to the production database and fast-forwards
`production`. It then waits for the Vercel GitHub Deployment `Production` to
reach `success`. It uses no local Vercel token.

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
existing tag. `Public core release` runs three jobs behind one
`public-release` approval:

1. `authorize` holds the approval. It checks the release policy, the public
   repository barrier and the OCI tag's absence, and requires the successful
   `main` CI run of the exact commit. That run already covered lint, typecheck,
   the desktop bundle, every test suite, the dependency audit and the edition
   builds in blank runners, so the release does not repeat them.
2. `image` builds the container on one runner per architecture
   (`ubuntu-24.04` and `ubuntu-24.04-arm`) and pushes each image by digest,
   without a tag.
3. `publish` builds the source artifacts, assembles the two digests into the
   candidate manifest, scans it, attests and signs it, promotes the official
   tags, then creates the Git tag and the GitHub Release.

The last two jobs depend on the first, so nothing runs before the approval, and
only `publish` holds a token that can write the repository, sign or attest. Any
step failing before the tag is created leaves no half-release.

## Release preflight

A failure inside `Public core release` is found after the candidate was merged,
promoted and approved, and its fix costs another pull request, another
promotion and another approval. Two checks run earlier.

The **`Release preflight` workflow** builds the release artifacts, builds the
container image on both architectures without publishing it, and applies the
release's vulnerability threshold. It runs on every pull request that changes
the `Dockerfile`, a version manifest, the compatibility matrix, or the release
scripts and workflows, so the pull request that prepares a version always runs
it. It reads no secret. The pinned base image ages without any commit: start
the workflow by hand on `main` before preparing a release, and fix a finding in
the same pull request as the version bump.

```bash
gh workflow run release-preflight.yml --ref main
```

**`npm run release:preflight`** reads the repository settings that only a
maintainer can see, and `npm run deploy` runs it before requesting an approval:

- every action used by the selected workflows is in the Actions allowlist (a
  missing pin ends the workflow in `startup_failure`);
- every secret and variable those workflows read is configured on their
  environment or on the repository. Only names are read;
- with `--version X.Y.Z`: both manifests declare the version, its tag is free,
  and the compatibility row and `.env.example` reference it.

It needs a GitHub CLI session with repository administration access.

## Artifacts of the heart

### Official OCI image

The release workflow publishes `ghcr.io/mangue-dev/minddy:vX.Y.Z` from the
same release SHA as the source artifacts. The exact SemVer tag is append-only;
stable releases also advance the convenience aliases `vX.Y` and `vX`. Operators
must deploy the manifest digest recorded in the GitHub Release, not either
moving alias. The release assets include the digest identity and checksums;
the registry image carries its SPDX SBOM, SLSA provenance, and keyless Sigstore
signature. Run and verification instructions are in
[`container-image.md`](container-image.md).

`scripts/build-release-artifacts.mjs` makes in `.release/`:

- `minddy-vX.Y.Z-source.tar.gz`, deterministic commit archive;
- `minddy-vX.Y.Z-migrations.tar.gz`, migrations, bootstrap and runbooks useful for
  installation or update;
- `release-manifest.json`, which links version, tag, SHA, previous release,
  added migrations, archive hashes, and the exact self-hosting compatibility
  row and file checksum;
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
gh attestation verify minddy-v0.10.0-source.tar.gz --repo mangue-dev/minddy
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

1. create a short-lived hotfix branch from the current `main` head and add a
   regression test;
2. merge it into `main` through the normal reviewed pull request and green CI;
3. run `npm run deploy`, approve the fast-forward, and verify that `production`
   and the Vercel Production deployment both use the selected `main` SHA.

Never patch `production` directly, even temporarily. It is a deployed-SHA
pointer, not a development branch; a direct change would break the guarantee
that every served commit was reviewed and tested on `main`.

### Rollback Cloud without rewriting

Find `STABLE_SHA` in the last successful Vercel deployment. Do not move
`production` backward or force-push it. From the current `main`, create a
short-lived rollback branch and produce a **new** rollback commit:

```bash
git fetch origin main
git switch -c rollback/cloud-$STABLE_SHA origin/main
git restore --source "$STABLE_SHA" --staged --worktree -- .
git commit -s -m "revert(cloud): restore $STABLE_SHA"
```

Before deployment, check compatibility with migrations already applied:
they remain forward-only and are never canceled by this restoration of
code. Merge the rollback through a reviewed pull request, then run
`npm run deploy -- custom` from the updated `main` and select only Minddy Cloud.
The new commit is tested on `main`, then `production` fast-forwards to the same
SHA. Its application tree restores the stable version without rewriting
history. Any follow-up fix also starts from `main`; it never exists only on
`production`.

## Public desktop applications

The desktop does not automatically receive each version of the core: it is a
window on the web, and a web modification does not change the shell. When
`npm run desktop:check` shows a different fingerprint, launch **Public desktop
release** with a core version already released. One job builds Linux AppImage,
DEB, and RPM packages on Ubuntu for `x64` and `arm64`, signs every Linux
package and each architecture-specific update manifest with GPG, verifies each
signature, attaches the public key, checksums, signatures, and attestations,
and adds the signing fingerprint to the release notes. A second job builds
Windows x64 and ARM64 Store MSIX packages, validates their manifests, and
exercises installation with disposable signed copies while leaving the Store
submissions unsigned. Microsoft Store is the exclusive Windows signing,
distribution, and update channel.

macOS is not built by the workflow. The Developer ID certificate and the
notarization credentials stay on the maintainer's Mac, which signs, notarizes
and publishes the macOS feed, then records the publication in
`desktop/released.json` through a pull request; the steps are in
[desktop-release.md](desktop-release.md#macos-from-the-maintainers-mac). The
record changes no deployed file, so it needs no promotion of its own; the next
Cloud deployment carries it. See
[linux-desktop.md](linux-desktop.md) for the Linux verification contract and
[desktop-release.md](desktop-release.md#windows-microsoft-store) for the Windows
release contract.

Native desktop packages are built only by this publication workflow. Daily CI
still bundles the Electron sources and tests the release helpers, but it does
not spend Windows or Linux runner minutes producing packages that will be
discarded.

The following secrets belong to the GitHub environment
`public-release`, not to an account or a personal keychain:

- `PUBLIC_DESKTOP_FEED_URL` and `PUBLIC_DESKTOP_BLOB_READ_WRITE_TOKEN` for the
  Generic stable electron-updater flow.
- `LINUX_GPG_PRIVATE_KEY` and `LINUX_GPG_PASSPHRASE`, plus the public
  `LINUX_GPG_FINGERPRINT`, for detached Linux package and metadata signatures.
The `public-release` environment variables `WINDOWS_STORE_IDENTITY_NAME` and
`WINDOWS_STORE_PUBLISHER` carry the immutable Partner Center identity. They are
configuration, not secrets. Store MSIX packages are attached unsigned for
Partner Center to sign. Windows does not use the generic updater feed.

The role must be transferable to another maintainer and the secrets must
be rotary. The workflow attaches immutable binaries to GitHub Releases and
updates the generic stream manifest **last**, after the binaries.
Storage can be Vercel Blob as in
[`desktop-release.md`](desktop-release.md), but its identifiers are those of
organization and publication is carried out by the CI.

## GitHub approvals and settings

- `cloud-production` protects `Promote production` with required maintainers;
  its dedicated deploy key is exposed only after approval and is the only
  credential that can advance `production`;
- `public-release` protects the tag, the GitHub Release and the Linux signing
  key. One
  approval covers a whole `Public core release` run: its first job holds the
  environment and the other two depend on it;
- `production` prohibits updates, force-pushes, and deletion for every human
  identity. Its only writable deploy key belongs to the promotion workflow;
- Git Vercel integration must publish an exactly named GitHub Deployment
  `Production`, otherwise the promotion ends in failure even if the branch has
  advanced. After restarting the Vercel deployment, rerunning the command verifies the
  same SHA and resumes waiting.

Explicit approval is done in the GitHub interface while
`npm run deploy` is waiting. It is logged with the run, the requested SHA and the
Vercel verdict. Reproducible settings are listed in
`.github/REPOSITORY_SETTINGS.md`.

## Prepublication validation for the first self-hosted release pair

This procedure is the record of how `v0.10.0` and `v0.10.1` were published. It
predates the `main` ruleset: its step 5 relied on the assistant pushing a
candidate to `main`, which the ruleset now refuses. A future pair goes through
two prepared pull requests instead.

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
   git clone git@github.com:mangue-dev/minddy.git "$PUBLISH_DIR"
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
   security-review evidence required by the release checklist. Select desktop
   applications only when their artifacts are part of the release. `deploy.sh`
   pushes the exact checked-out candidate, waits for its successful `main` CI,
   advances the protected `production` branch, verifies the Production
   deployment, and only then creates the public tag. Do not push the target to
   `main` before the source run completes. After publication, verify both
   mappings:

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
  A configuration fix (allowlist, secret, registry setting) needs no new
  commit: dispatch `Public core release` again for the same SHA. A code fix
  changes the candidate, so it needs a new promotion first.
- Tag pushed but release absent: do not move the tag; create the release at
  from the artifacts preserved by the workflow, or publish a patch if the
  content is false.
- Release published: it is immutable. A correction gives a new
  version ; assets are not replaced silently.
- Failed Cloud deployment: follow the Vercel/runbook base rollback. Don't
  remove a correct public release to reflect a Cloud incident.
