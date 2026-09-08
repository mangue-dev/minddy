# Public documentation replay: Minddy v0.10.26

Documentation feasibility replay only. No installation, dependency execution, Docker operation, sign-up, application write, fault injection, upgrade, or restore was performed. The local repository, issue tracker, other tasks, shell history, credentials, and private artifacts were not inspected. Only public documentation/release metadata were fetched into this new isolated temporary directory. A checksum check was executed on downloaded public files.

## Exact task prompt

> Perform a documentation-only novice self-hosting replay for Minddy. You are the separate AI session explicitly required by the user's MIN-407 acceptance issue. Use only public https://minddy.app and https://github.com/mangue-dev/minddy documentation at public release v0.10.26 and linked public sources. Do not inspect local repository, other tasks, issue tracker, shell history, maintainer credentials or private artifacts. Do not change external state or install onto shared host. Independently choose a deployment mode, identify required inputs, exact public tag/digest verification and installation commands, first admin/project/issue/attachment flow, failure recovery, backup/update/restore/rollback. Record exact prompt, UTC timing, URLs visited and concrete ambiguous/missing steps. This is a documentation feasibility replay, NOT an executed installation; explicitly distinguish. Return a concise English report of confirmed blockers with URLs and evidence. You may browse public docs and fetch public files into a new isolated temporary directory; do not write repo files.

## Timing and outcome

Started 2026-09-08 11:10:00 UTC. By 11:11:37 UTC the installation, backup, update, restore, rollback, and new-account instructions had all been located (97 seconds; under the 10-minute discovery target). Public tag and partial checksum evidence was collected by 11:12:49 UTC. No 45-minute installation result is claimed. Report preparation followed; completion time is recorded separately in the response.

## Independently selected deployment

I chose `full` on a disposable Linux server confined to a trusted private LAN: it keeps database and attachment storage under the operator's control and permits the documented filesystem backup route. `managed` is unsuitable for this replay's chosen all-local data ownership objective and would require provisioning an external Supabase Cloud project.

Inputs: Linux amd64 or arm64; at least 8 GB RAM, 4 CPU cores, and 60 GB SSD (recommended 16 GB/6 cores/100 GB); Node 24, pnpm 10.28.0, Git, curl, PostgreSQL client, Supabase CLI, Docker Engine >=27.0.0, Compose plugin >=2.29.0; desktop app on the operator workstation; private app IPv4 origin; operator administrator email; empty upstream directory; protected environment file; separate encrypted backup destination; a deliberate Auth email/confirmation policy. Supabase revision: `self-hosted/v0.7.2`, commit `549db119c44c25167461812041ba198bde2b31a4`. Optional integrations remain unconfigured, and the documented forge-relay opt-out is used.

## Public release identity and proposed commands

The public GitHub API reports an annotated tag object `187e9200bc57393948ffa128d509d9c473cecf62`, pointing to commit `19cd2868e9611eacabc5e333dd3b4b6573936999`. The manifest agrees and identifies previous release `v0.10.25`. The tag object is unsigned; the documentation requires an annotated tag, not a signed Git tag. OCI signature verification is separately required and was not executed.

Published image: `ghcr.io/mangue-dev/minddy@sha256:c94e63ca156f73d2419db1f256152a49fde317590f5a3d6cec96cd21b7f565fd`.

The following is a proposed reconstruction using the public instructions. It was not run. Downloading all six listed assets fixes the documented incomplete-download example; that repair must not be counted as an unmodified acceptance replay.

```bash
export TAG=v0.10.26
mkdir release-assets
cd release-assets
for asset in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json minddy-v0.10.26-container.txt minddy-v0.10.26-source.tar.gz minddy-v0.10.26-migrations.tar.gz; do
  curl --fail --location --output "$asset" "https://github.com/mangue-dev/minddy/releases/download/$TAG/$asset"
done
shasum -a 256 -c SHA256SUMS
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
gh attestation verify minddy-v0.10.26-source.tar.gz --repo mangue-dev/minddy
cd ..
git clone --branch v0.10.26 https://github.com/mangue-dev/minddy.git source
cd source
git switch --detach v0.10.26
test "$(git cat-file -t v0.10.26)" = tag
test "$(git rev-parse v0.10.26)" = 187e9200bc57393948ffa128d509d9c473cecf62
test "$(git rev-parse 'v0.10.26^{commit}')" = 19cd2868e9611eacabc5e333dd3b4b6573936999
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase \
  --image "$IMAGE" --no-forge-relay
pnpm self-host:doctor
```

The operator must replace the illustrative private address, email and paths. The guide requires a host-reachable PostgreSQL connection but does not show a DB URL input in its full-mode example. I did not infer secret values or run the installer to discover its behavior.

## First useful data and recovery: identified, not executed

Connect the desktop app through minddy > Connect to a Server to the chosen app origin. The clean-room account recipe signs up with the email in `ADMIN_EMAILS`, confirms the email, enrolls TOTP in account settings, saves recovery codes, signs in again, and verifies administrator access. It then creates project `Clean Room` / `ROOM`, a ticket `Survives update and restore` (In progress, Urgent, effort M), and a text attachment containing `clean-room-storage-marker`; sign out/in and verify readability. Its explicit inbox instructions are for local Supabase, which creates the topology blocker below.

The documented fault is `docker compose ... stop minddy`, followed by rerunning the exact initial installer against the unchanged environment file and digest. For full mode it says to specify both original Compose files. Compare environment checksums, rerun doctor, and compare project/issue/attachment identifiers. No fault or recovery was executed.

Backup requires write isolation across application, workers, scheduler, and public Supabase APIs; database roles/schema/data plus migration history and managed policies; raw Storage bytes; application/Supabase/proxy/SMTP configuration and secrets (including a pgsodium root key if present); immutable source and service identities. Seal checksums, encrypt/copy off-host, and prove a blank-target restore.

Update order: close writes, capture verified backup, use the next published release, migrate with target code, deploy target, verify, reopen. v0.10.26 follows v0.10.25 and publishes no added SQL migrations. No later release was selected for installation. Restore imports SQL/history/policies and raw Storage into a blank compatible stack with isolated URLs, then restores matching application/configuration and checks data. Rollback before migration can restart the old release; after incompatible migration it requires the complete backup; writes after that backup would be lost unless separately preserved. The `self-host:backup`, `self-host:update`, and `self-host:restore` commands are documented read-only preflight gates, not implementations of these operations.

## Confirmed documentation blockers

1. **The acceptance checksum instructions omit files required by their own check.** `docs/self-hosting-clean-room.md` lines 95–105 requests only SHA256SUMS, manifest and container text, then checks the entire manifest. The v0.10.26 SHA256SUMS also lists RELEASE_NOTES.md, UPDATE.md, source and migration archives. The actual check on the downloaded metadata plus UPDATE returned exit 1 because RELEASE_NOTES and both archives were absent; the three present files passed. Following the exact three-file download would additionally omit UPDATE. Downloading all listed files is necessary but is not what the example says.

2. **The acceptance flow executes a default-branch preflight before selecting a release.** The release-mode recipe clones and fetches at lines 85–87, invokes `pnpm validate:self-hosted` at 144–157, and only detaches to FROM_REF at 166. No release checkout precedes the preflight. This conflicts with its own requirement that branch/local state never constitutes acceptance evidence. The safe sequence must detach and verify the intended published runner release before executing its code.

3. **The first-account/lifecycle scenario silently changes from reference server to an unprovisioned local stack.** After managed/full installation, lines 199–228 introduce a source-only local lifecycle and build/start, but include no local bootstrap command. Lines 234–236 require `supabase status`, a local email inbox, and localhost:3000. Those services were not established by the preceding full/managed recipe. An explicit separate local bootstrap/context switch or a complete account/lifecycle flow on the selected reference profile is required.

4. **Operations do not map back to the supported reference Compose deployment.** The installer and deployment README use `deploy/self-hosted/.env` and both upstream plus Minddy Compose files for full mode. Operations instead assumes `$SUPABASE_COMPOSE_DIR/.env` and repeatedly uses bare `docker compose`; it never establishes those are the same protected configuration and service project. Its backup instructions therefore refer to an environment location not created by the documented installer. Upgrade builds source and ends with “Start the target service,” without an exact procedure for updating the digest pin and recreating the reference app; installation explicitly promises never to change an existing image pin. The operator must invent the missing mapping, maintenance/Compose invocations, and image transition. No runtime failure is claimed; this is a missing executable procedure.

Additional contradiction: the binding distribution document says scheduled work is opt-in; the installation guide and deployment README say scheduler/runner start by default. The operations diagnosis row for stale public URL says rebuild with NEXT_PUBLIC settings, whereas installation/current image guidance says restart with MINDDY_PUBLIC settings. Both should be reconciled before treating the documents as a single operator contract.

## Public URLs visited

- https://minddy.app (web tool could not open apex; this is a tool limitation, not a confirmed product defect)
- https://www.minddy.app/
- https://www.minddy.app/download
- https://www.minddy.app/self-hosting
- https://www.minddy.app/self-hosting/install?route=team (read first step only; did not claim desktop installed)
- https://github.com/mangue-dev/minddy/tree/v0.10.26
- https://github.com/mangue-dev/minddy/blob/v0.10.26/docs/self-hosting.md
- https://github.com/mangue-dev/minddy/blob/v0.10.26/docs/self-hosting-operations.md
- https://github.com/mangue-dev/minddy/blob/v0.10.26/docs/container-image.md
- https://github.com/mangue-dev/minddy/blob/v0.10.26/docs/self-hosting-clean-room.md
- https://github.com/mangue-dev/minddy/blob/v0.10.26/docs/self-hosting-distribution.md
- https://github.com/mangue-dev/minddy/tree/v0.10.26/deploy/self-hosted
- https://github.com/mangue-dev/minddy/releases/tag/v0.10.26
- https://raw.githubusercontent.com/mangue-dev/minddy/v0.10.26/docs/self-hosting.md
- https://raw.githubusercontent.com/mangue-dev/minddy/v0.10.26/docs/self-hosting-operations.md
- https://raw.githubusercontent.com/mangue-dev/minddy/v0.10.26/docs/container-image.md
- https://raw.githubusercontent.com/mangue-dev/minddy/v0.10.26/docs/self-hosting-clean-room.md
- https://raw.githubusercontent.com/mangue-dev/minddy/v0.10.26/docs/self-hosting-distribution.md
- https://raw.githubusercontent.com/mangue-dev/minddy/v0.10.26/deploy/self-hosted/README.md
- https://raw.githubusercontent.com/mangue-dev/minddy/v0.10.26/docs/releases.md
- https://raw.githubusercontent.com/mangue-dev/minddy/v0.10.26/deploy/self-hosted/compatibility.json
- https://github.com/mangue-dev/minddy/releases/download/v0.10.26/SHA256SUMS
- https://github.com/mangue-dev/minddy/releases/download/v0.10.26/release-manifest.json
- https://github.com/mangue-dev/minddy/releases/download/v0.10.26/minddy-v0.10.26-container.txt
- https://github.com/mangue-dev/minddy/releases/download/v0.10.26/UPDATE.md
- https://api.github.com/repos/mangue-dev/minddy/git/ref/tags/v0.10.26
- https://api.github.com/repos/mangue-dev/minddy/git/tags/187e9200bc57393948ffa128d509d9c473cecf62
- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

The linked live Supabase guide currently describes self-hosted/v0.8.0; I retained Minddy's exact v0.7.2 compatibility pin. A Python HTTPS trust-store error during an initial raw-file fetch was bypassed by using normal certificate-verifying curl; TLS verification was never disabled. It is not counted as a Minddy defect.

Completed 2026-09-08 11:15:54 UTC. Total elapsed: 5 minutes 54 seconds.
