# MIN-407 public clean-room validation — 2026-09-08

Result: **BLOCKED**. Public artifact verification passes, but the published
reference-instance lifecycle is incomplete (MIN-503), and full-profile startup
fails before database bootstrap (MIN-504). No first-time human
operator participated. Neither the documentation replay nor a passing release
preflight is evidence of a completed installation/update/restore lifecycle.

## Scope and immutable inputs

The public pair is [v0.10.25](https://github.com/mangue-dev/minddy/releases/tag/v0.10.25)
to [v0.10.26](https://github.com/mangue-dev/minddy/releases/tag/v0.10.26).
The repository and all six core assets for each release were retrieved over
HTTPS without a GitHub account, credential helper, or registry credentials.

| Identity | v0.10.25 | v0.10.26 |
| --- | --- | --- |
| Annotated tag object | `bbf648eb0a31ec6ea23bf672bf93e08d2b3ae4e8` | `187e9200bc57393948ffa128d509d9c473cecf62` |
| Commit | `a233e7fb07a881dcdf4ba01c228ecb1448b4cb10` | `19cd2868e9611eacabc5e333dd3b4b6573936999` |
| OCI digest | `sha256:902def7d5e618e6b36a891c31c84d7ef8d64dff3eb08403ed8bf8361c1765d34` | `sha256:c94e63ca156f73d2419db1f256152a49fde317590f5a3d6cec96cd21b7f565fd` |

The OCI repository is `ghcr.io/mangue-dev/minddy`. Both manifests match the
annotated source commits. Both Cosign checks returned exit 0 with the published
`release.yml@refs/heads/production` identity and GitHub Actions OIDC issuer.
All twelve core asset checks returned `OK`. The tagged preflight returned exit 0;
see the [preflight record](min-407-public-preflight-2026-09-08.md).
This session did not repeat SBOM/provenance validation from MIN-414.

## Disposable host

A new Lima 2.2.0 VM named `min407-clean` uses Apple's VZ backend, 4 vCPUs,
8 GiB configured RAM, and a new 60 GiB virtual disk. Ubuntu 26.04 ARM64 cloud
image SHA-256:
`7bcf159e29ad0000bfed9c57875908c39268f5ed1257f4958fa6a9f5f60edd54`.
Initial checks showed no containers, no Docker volumes, no shared host mounts,
and no forwarded SSH agent. Docker runs inside the VM, independently of the
maintainer's Docker Desktop. Only public sources and generated disposable
configuration enter the VM; no maintainer checkout or existing database is copied.

Prerequisites: Docker Engine 29.8.0, Compose 5.5.1, Node 24.11.1, pnpm 10.28.0, Supabase CLI 2.117.0, PostgreSQL
client tools, Git, curl and Cosign 3.1.3. Node, Cosign and Supabase CLI downloads
were checksum-verified. Provisioning time is separate from installer timing.
The full mode was selected to keep test data local and avoid a provider account.
The app origin is `http://localhost` within the VM, with forge relay explicitly
disabled. Upstream Supabase files were fetched by the tagged helper and matched
commit `549db119c44c25167461812041ba198bde2b31a4` and the compatibility checksums.

## Executed installation and unchanged-configuration retry

The following command ran against the untouched `v0.10.25` checkout, with
`IMAGE` obtained from its verified container-identity asset:

```bash
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://localhost --admin-email admin@example.test \
  --supabase-dir "$HOME/acceptance/supabase" \
  --image "$IMAGE" --no-forge-relay
```

| Observation | Result |
| --- | --- |
| First attempt | Started `2026-09-08T11:18:35Z`; log ended `11:20:06Z`; exit 1 after about 91 seconds. |
| Failure | `container supabase-edge-functions is unhealthy` during `docker compose up -d --wait`; Minddy itself reported healthy. |
| Service state | Restarting, exit 1, `OOMKilled=false`; nine restarts at observation. |
| Dependency error | `@panva/jose` manifest retrieval from `https://jsr.io/@panva/jose/meta.json` fails with DNS resolution failure. |
| Network evidence | `docker inspect` shows only `minddy-full_default`; `docker network inspect minddy-full_default --format '{{.Internal}}'` returns `true`. |
| Environment protection | `stat -c '%a' deploy/self-hosted/.env` returns `600`; SHA-256 comparison before/after retry exits 0. Values remain private. |
| Retry | Same command, environment and image; started `11:20:34Z`, log ended `11:20:38Z`; exit 1 with the same unhealthy service. |
| Bootstrap | Not reached. `select to_regclass('public.projects'), to_regclass('public.issues');` on the disposable DB returns two nulls. |
| Immutable source | `git status --porcelain` is empty. The installer and full Compose overlay are identical between the two selected tags. |

The default internal network blocks the pinned upstream function's first-start
JSR dependency fetch. MIN-504 tracks the fix and requires an empty-cache
regression plus explicit network behavior before another published-release run.
The retry is a failed-installation recovery attempt; it does not substitute for
the required injected fault after first health and first-data creation. No
migration, account, project, issue, attachment, integration or lifecycle success
is claimed. No change to the frozen checkout or its network policy was used to
continue past the blocker.

## Documentation replay and deviations

A separate AI session received only the public site/repository URLs and task
instructions, with no local repository, credentials or prior conversation.
It found all four operations procedures within 97 seconds. The complete
[replay record](min-407-documentation-replay-2026-09-08.md) includes its exact
prompt, chosen mode, proposed commands, URL inventory and 5m54s timing.
That session performed document/metadata checks only, not an installation.

| Finding | Observed evidence | Disposition |
| --- | --- | --- |
| Incomplete asset download | The published three-file recipe followed by `shasum -a 256 -c SHA256SUMS` exits 1: release notes, update guide and both archives are absent. | Corrected recipe downloads all six core assets for both releases and verifies their source/digest identities. |
| Preflight runs from the default branch | The public recipe detaches only after invoking `validate:self-hosted`. | Corrected recipe detaches to the target tag before executing its runner. |
| Evidence manifest hashes itself | The published `find` pipeline includes the output `SHA256SUMS`; immediate verification exits 1. | Corrected pipeline excludes only its own output, uses relative paths, and verifies the result. Initial seal, reseal and verification after copying all pass. |
| Acceptance switches instances | Compose installation is followed by an unprovisioned source/local Supabase flow; the target OCI image is never deployed. | MIN-503 blocks MIN-407 until a coherent reference-instance lifecycle is published and exercised. |
| Operations assumes a different Compose layout | Bare upstream Compose commands and an upstream `.env` do not identify the combined environment/two-file deployment created by the full installer. | Included in MIN-503, covering maintenance, backup, update and blank restore. |
| Scheduler and runtime URL instructions disagree | Distribution says scheduler opt-in while reference profiles start it; diagnosis says rebuild with `NEXT_PUBLIC_*`. | Documentation now describes the default scheduler and container recreation with `MINDDY_PUBLIC_*`. |

The VM attempt uses the published installation guide's full-mode path with all
core assets downloaded and source/target signatures verified before the installer.
Dependencies were provisioned from the tagged checkout before release-asset
verification; this is recorded as a sequencing deviation from the strict
acceptance recipe, not a pass of that recipe. No immutable checkout is patched.
Changes in this pull request require publication and another replay; they do
not retroactively validate either existing tag.

## Remaining acceptance evidence

A first-time human run, successful first-health timing, administrator enrollment,
project/issue/attachment/integration identifiers, injected-fault recovery, observed
egress, digest-pinned update, and blank database plus Storage restore remain
required. MIN-407 stays in progress. The final report/checks task is reopened
because its earlier completed state did not establish these lifecycle results.

## Verification and handoff

- The existing clean-room suite passes all 15 tests.
- The corrected asset verification commands pass for both public releases;
  checksum sealing passes on initial creation, resealing and after copying.
- Owned-English, local Markdown links and `git diff --check` pass. Excluded
  paths, application source, migration files and translations are untouched.
- Only documentation and sanitized evidence are included in this change.
- The disposable VM is stopped after evidence collection, with its private
  generated configuration retained for diagnosis. It can be resumed with
  `limactl start min407-clean`; a future acceptance run needs a new empty VM.

The maintainer authorized reclaiming unused Docker data to make the free local
VM possible. Pruning only the two build caches reported 26.7 GB and 12.89 GB
reclaimed; measured host free space increased from about 31 GiB to 65 GiB before
VM creation. No database/Storage volumes, application containers, or Docker
installation were removed. This host maintenance is separate from acceptance.
