# Validate self-hosting in a clean room

This is the release acceptance scenario for a third-party minddy operator. It
starts from two consecutive immutable releases and uses no local minddy files,
accounts, production secrets, or Minddy Cloud services. The procedure is
destructive: run it only on a disposable host and disposable Supabase stacks.

The [current public v0.10.29 → v0.10.30 report](validation/min-407-public-v29-v30-2026-09-08.md)
records the corrected immutable artifacts, independent installation and lifecycle
evidence, and the separate first-time human acceptance requirement (MIN-508).
The [initial public attempt](validation/min-407-public-clean-room-2026-09-08.md)
and [local candidate report](validation/min-407-local-candidate-2026-09-08.md)
remain historical evidence. Local runs are engineering checks; they do not
replace an unmodified public-release replay or the human acceptance session.

The installation and operations runbooks remain the source of truth. This page
adds an ordered acceptance record around them:

- [install and bootstrap](self-hosting.md);
- [backup, update, restore, and rollback](self-hosting-operations.md).

## Acceptance boundary

Use a newly provisioned VM or workstation with an empty home directory for the
test account. Do not mount a maintainer checkout, password manager, SSH agent,
cloud CLI configuration, Docker volume, or browser profile. Network access is
needed only for the public Git repository, package registries, container images,
Supabase Auth password-compromise checks (`api.pwnedpasswords.com`), the
selected optional provider, and loopback services.

The normal run is accepted only when both refs are annotated
`vMAJOR.MINOR.PATCH` release tags. Before the repository's first public release,
the explicit prepublication path below may instead use annotated
`preflight/vMAJOR.MINOR.PATCH` candidate refs from a checksummed Git bundle. In
both modes, the older commit must be an ancestor of the newer commit and both
commits must contain this scenario, the bootstrap, migrations, and both
self-hosting runbooks. A branch, bare commit SHA, uncommitted change, or locally
patched checkout is never acceptance evidence.

Prepublication evidence is conditional: it passes the lifecycle contract but
does not claim that a public release exists. It becomes release evidence only
when the final `vMAJOR.MINOR.PATCH` tags point to the exact commit identities in
the report. Any change to either candidate commit invalidates the run.

Use unique, non-production values throughout. The examples reserve `.test`
domains and local ports deliberately.

## Product acceptance criteria

This acceptance validates the distribution as a product, not merely a build.
Use the table as a release gate. A row passes only with the stated sanitized
evidence; an exception requires a separately tracked blocking issue.

| Outcome | Measurable criterion | Required evidence |
| --- | --- | --- |
| Choose a deployment mode | A first-time operator selects `managed` or `full` in the guided installer, states why the other mode is unsuitable, and supplies only the inputs requested for the selected mode. | Selected mode, input checklist with values redacted, and the operator's one-sentence rationale. |
| Trust immutable artifacts | Before any code or image runs, the operator verifies the GitHub Release `SHA256SUMS`, source tag object and commit, release manifest, and OCI signature for the `image@sha256` reference. | Command exit codes; tag object, commit, and digest only. |
| Reach a healthy instance | Starting after the selected Supabase endpoint or pinned upstream checkout is ready, the installer reaches a passing `self-host:doctor` health report within 45 minutes. | UTC start/end timestamps, elapsed minutes, and redacted doctor report. |
| Recover from one injected fault | Stop the minddy service after first health, rerun the installer without changing the environment file, and regain health with the same image digest and data identifiers. | Fault command, checkpoint file, environment-file checksum before/after, and doctor report. |
| Discover operations unaided | Starting from the published self-hosting guide, a human and a documentation-constrained AI each find the update, backup, restore, and rollback procedures within 10 minutes and identify the required backup components. | Start/end timestamps, links followed, commands identified, and any ambiguity or missing instruction. |

Do not count prerequisite provisioning time such as DNS propagation or a managed
Supabase provider outage toward the 45-minute target, but record it separately.
Do not waive an exceeded target, an unverified digest, or an undocumented
instruction by editing the release checkout.

## 1. Prepare the disposable host

Install Node.js 24, pnpm 10.28.0, Docker, the Supabase CLI, PostgreSQL client
tools, Git, curl, and Cosign. Then open a shell that has no inherited minddy or provider
configuration:

```bash
env -i \
  HOME="$HOME" \
  PATH="$PATH" \
  TERM="${TERM:-xterm}" \
  SHELL="${SHELL:-/bin/sh}" \
  bash --noprofile --norc
```

In that shell, stop on failed commands or unset inputs:

```bash
set -euo pipefail
```

Set only public test inputs. Never paste a production value into this shell or
the report. For an already published pair, clone the public repository:

```bash
export VALIDATION_MODE=release
export FROM_REF=vX.Y.Z
export TO_REF=vX.Y.Z
export CLEAN_ROOT="$HOME/minddy-clean-room"
export SOURCE_DIR="$CLEAN_ROOT/source"
export BACKUP_ROOT="$CLEAN_ROOT/backups"
export REPORT_DIR="$CLEAN_ROOT/report"
install -d -m 0700 "$CLEAN_ROOT" "$BACKUP_ROOT" "$REPORT_DIR"
git clone https://github.com/mangue-dev/minddy.git "$SOURCE_DIR"
cd "$SOURCE_DIR"
git fetch --tags
git switch --detach "$TO_REF"
test -z "$(git status --porcelain)"
```

In release mode, download the matching public GitHub Release assets into a separate directory
before installing dependencies. Verify their checksums, verify that the
manifest matches the source tag, and extract the image reference. Never derive
the digest from a mutable image tag.

```bash
export RELEASE_ASSETS="$CLEAN_ROOT/release-assets"
for RELEASE_REF in "$FROM_REF" "$TO_REF"; do
  ASSET_DIR="$RELEASE_ASSETS/$RELEASE_REF"
  install -d -m 0700 "$ASSET_DIR"
  ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_REF"
  # SHA256SUMS covers all six core assets, not only the manifest and identity.
  for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
    "minddy-$RELEASE_REF-container.txt" \
    "minddy-$RELEASE_REF-source.tar.gz" \
    "minddy-$RELEASE_REF-migrations.tar.gz"; do
    curl --fail --show-error --location "$ASSET_BASE/$ASSET" \
      --output "$ASSET_DIR/$ASSET"
  done
  (
    cd "$ASSET_DIR"
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum --check SHA256SUMS
    else
      shasum -a 256 --check SHA256SUMS
    fi
    test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_REF"
    test "$(node -p 'require("./release-manifest.json").release.commit')" = \
      "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_REF^{commit}")"
    git -C "$SOURCE_DIR" rev-parse "$RELEASE_REF^{tag}"
    RELEASE_IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
    test "$RELEASE_IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_REF-container.txt")"
    printf '%s\n' "$RELEASE_IMAGE" | \
      LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
    cosign verify \
      --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
      --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
      "$RELEASE_IMAGE"
  )
done
export IMAGE="$(sed -n 's/^reference=//p' "$RELEASE_ASSETS/$FROM_REF/minddy-$FROM_REF-container.txt")"
export TARGET_IMAGE="$(sed -n 's/^reference=//p' "$RELEASE_ASSETS/$TO_REF/minddy-$TO_REF-container.txt")"
cd "$SOURCE_DIR"
```

Record the command exit codes and both digest-bearing image references. See
[container-image.md](container-image.md) for the additional provenance and SBOM
checks. An asset download, checksum, tag/commit comparison, or signature failure
blocks installation. `IMAGE` is the source-release pin; `TARGET_IMAGE` is the
separately verified update pin. Neither is derived from a mutable image tag.

For prepublication validation, receive only the candidate Git bundle and its
`SHA256SUMS` file from the release preparer. Do not receive a working tree or a
patch. Verify the bundle before importing its two annotated refs:

```bash
export VALIDATION_MODE=prepublication
export FROM_REF=preflight/v0.10.0
export TO_REF=preflight/v0.10.1
export CLEAN_ROOT="$HOME/minddy-clean-room"
export SOURCE_DIR="$CLEAN_ROOT/source"
export BACKUP_ROOT="$CLEAN_ROOT/backups"
export REPORT_DIR="$CLEAN_ROOT/report"
export CANDIDATE_BUNDLE="$CLEAN_ROOT/minddy-preflight.bundle"
cd "$CLEAN_ROOT"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
git init "$SOURCE_DIR"
git -C "$SOURCE_DIR" fetch "$CANDIDATE_BUNDLE" \
  "refs/tags/$FROM_REF:refs/tags/$FROM_REF" \
  "refs/tags/$TO_REF:refs/tags/$TO_REF"
git -C "$SOURCE_DIR" switch --detach "$TO_REF"
install -d -m 0700 "$BACKUP_ROOT" "$REPORT_DIR"
cd "$SOURCE_DIR"
```

Run the versioned preflight before installing dependencies or starting Docker.
Use the pnpm installed with the prerequisites; enabling global Corepack shims
is not needed and may require administrator access on a system Node install:

```bash
test "$(pnpm --version)" = 10.28.0
if [ "$VALIDATION_MODE" = prepublication ]; then
  pnpm validate:self-hosted -- --prepublication \
    --from-ref "$FROM_REF" --to-ref "$TO_REF" \
    --report "$REPORT_DIR/preflight.md"
else
  pnpm validate:self-hosted -- \
    --from-tag "$FROM_REF" --to-tag "$TO_REF" \
    --report "$REPORT_DIR/preflight.md"
fi
```

Stop if it reports `BLOCKED`. Do not substitute a branch or add missing files to
the checkout: that would test unpublished local state.

## 2. Install the source release and reference profile

```bash
git switch --detach "$FROM_REF"
test "$(git describe --tags --exact-match)" = "$FROM_REF"
test -z "$(git status --porcelain)"
pnpm install --frozen-lockfile
```

Choose the guided installer mode without maintainer advice. `managed` requires
an already-provisioned compatible Supabase project. `full` operates the pinned
upstream stack and can be exercised free of charge in an isolated local Linux
VM. Record why the other mode is unsuitable. The example below selects `full`
and uses the VM's own browser at `http://localhost`; a browser on a different
machine must use the documented private LAN address instead.

```bash
export MODE=full
export CURRENT_RELEASE_DIR="$SOURCE_DIR"
export SUPABASE_DIR="$CLEAN_ROOT/supabase"
export MINDDY_ENV_FILE="$SOURCE_DIR/deploy/self-hosted/.env"
node scripts/fetch-official-supabase.mjs --destination "$SUPABASE_DIR"
export INSTALL_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://localhost --admin-email admin@example.test \
  --supabase-dir "$SUPABASE_DIR" --image "$IMAGE" --no-forge-relay \
  --env-file "$MINDDY_ENV_FILE"
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json \
  > "$REPORT_DIR/first-doctor.json"
export INSTALL_HEALTHY_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
compose() {
  docker compose --env-file "$MINDDY_ENV_FILE" \
    -f "$SUPABASE_DIR/docker/docker-compose.yml" \
    -f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.full.yml" "$@"
}
```

The generated file must have mode `0600`. Keep it and all credentials out of
the report. The installer prepares the unchanged pinned upstream main function
with frozen dependencies and an offline compiler; it does not edit upstream
source or open the database's internal network.

For `managed`, use the [managed installer example](self-hosting.md#guided-reference-profile-installation),
pass the verified `IMAGE`, and keep that same environment, database and
single-file Compose context through every lifecycle step. A local source build
or `supabase start` is not a substitute for either installed reference profile.

### Local confirmation mailbox (disposable full-profile test only)

Auth confirmation email is separate from optional application notifications.
The official upstream template names `supabase-mail:2500` but does not provide
that service. For production, configure the `SMTP_*` values with your provider
using the installation guide. For this isolated test, start a pinned
[Mailpit inbox](https://mailpit.axllent.org/docs/install/docker/) after the stack
networks exist. It captures test mail locally and sends no external email.

```bash
docker run -d --name clean-room-mail \
  --network name=minddy-full_default,alias=supabase-mail \
  --network minddy-full_maintenance \
  -p 127.0.0.1:8025:8025 \
  -e MP_SMTP_BIND_ADDR=0.0.0.0:2500 \
  -e MP_SMTP_AUTH_ACCEPT_ANY=true -e MP_SMTP_AUTH_ALLOW_INSECURE=true \
  axllent/mailpit@sha256:df6c2541907e1be6fac21f509927cf6ed771617a1f4b361ef66d97bd05593d2d
```

For this local inbox only, set `SMTP_USER=` and `SMTP_PASS=` to empty values
in the protected deployment file, then run `compose up -d --wait auth`. Auth
otherwise tries authenticated SMTP over an unencrypted connection and rejects
the upstream test credentials. Production SMTP must use the provider's TLS and
authentication settings.

Open `http://localhost:8025` in the VM's browser. This inbox accepts test
credentials and is bound only to loopback. Do not use it for real accounts or
publish it on the Internet. Keep confirmation URLs and messages out of evidence.

## 3. Exercise the core as a new user

Use a private browser profile containing no existing cookies.

1. Open `http://localhost` and sign up as `admin@example.test`. Open the
   confirmation message at `http://localhost:8025`, follow its link, and complete
   the confirmation gesture. In managed mode use the configured provider inbox.
2. Enroll and verify TOTP MFA from account settings, then confirm that the
   account receives first-administrator access through `ADMIN_EMAILS`; no
   database console edit is allowed.
3. Store the recovery codes outside the test browser, sign out, sign in again,
   and complete the MFA challenge.
4. Create project `Clean Room` with key `ROOM`. Choose a new project, keep a
   default appearance, skip repository connections and AI description, and turn
   off Smart Assign when no AI provider is configured.
5. Create ticket `Survives update and restore`, set it to `In progress`, priority
   `Urgent`, effort `M`, and add the description `MIN-383 acceptance marker`.
   Turn off Smart-fill to enter these fields manually without an AI provider.
6. Upload a small text attachment containing only `clean-room-storage-marker`.
7. Sign out, sign in again, and confirm that the project, ticket, and attachment
   are readable.

Record timestamps and generated row identifiers, but no cookie, JWT, key, email
link, or attachment signed URL. Capture the following database counts:

```bash
compose exec -T --interactive=false db psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atc "
  select jsonb_build_object(
    'auth.users', (select count(*) from auth.users),
    'public.projects', (select count(*) from public.projects),
    'public.issues', (select count(*) from public.issues),
    'public.attachments', (select count(*) from public.attachments),
    'storage.objects', (select count(*) from storage.objects)
  )::text
" > "$REPORT_DIR/source-counts.json"
```

## 4. Exercise one optional integration and isolate the others

In project settings, create an `issues` integration named `Clean room caller`.
Store its one-time key in a shell variable without printing it, then submit a
second issue through the endpoint and payload shown by the application itself.
Confirm that it appears in triage with integration attribution. Revoke the key
and confirm that reusing it returns `401`.

The chosen integration is the only optional surface enabled for this run. Verify
the disabled surfaces before continuing:

- billing and managed quota UI stays absent;
- AI actions report that a provider key or local model is required;
- GitHub and GitLab connection actions stay unavailable until configured;
- Auth email reaches the local inbox; optional application email stays disabled;
- browser and server logs contain no request to `minddy.app`, Stripe, PostHog,
  Resend, Vercel, GitHub, GitLab, or OpenRouter;
- OAuth discovery, MCP endpoint values, links, and callback URLs use
  `http://localhost` (or the selected private origin), never a Minddy Cloud origin.

Any silent external request or `minddy.app` URL is a release blocker. Save only
the request host, path, status, and timestamp; remove headers and bodies.

### Capture actual runtime destinations

Run the observation on the disposable VM during account creation, the selected
integration call, and at least one scheduler interval. Finish dependency downloads
first, so package-manager traffic cannot be attributed to the application. Install
`tcpdump` from the VM distribution's repository if it is missing.

In the deployment shell, record the container-to-address mapping without exporting
environment variables. Then start a metadata-only capture in a second terminal:

```bash
compose ps --all --quiet | xargs docker inspect --format \
  '{{.Name}} {{index .Config.Labels "com.docker.compose.service"}} {{json .NetworkSettings.Networks}}' \
  > "$REPORT_DIR/container-network-map.txt"
date -u +%FT%TZ > "$REPORT_DIR/network-start.txt"
sudo tcpdump -i any -n -tt -l \
  'tcp[tcpflags] & tcp-syn != 0 or udp port 53' \
  > "$REPORT_DIR/network-metadata.txt" 2> "$REPORT_DIR/network-capture.log"
```

Stop the capture with Ctrl+C after the actions complete and record the end time
with `date -u +%FT%TZ`. Do not add `-A`, `-X`, or a packet-file output: request
payloads are unnecessary. Retain the capture summary, including dropped-packet
counts. Repeat the address mapping after recreating containers because addresses
can change. Map each observed source address to minddy, scheduler, runner, Auth,
or another named service; use DNS replies to resolve destination addresses. Record
unresolved addresses as unresolved, never as an allowed provider by assumption.

If host-origin DNS traffic cannot be assigned to a service, observe the application
namespaces directly on Linux. Run this in another deployment shell, exercise the
browser during the five-minute window, and retain all three capture summaries:

```bash
for SERVICE in minddy scheduler agent-runner; do
  CONTAINER="$(compose ps -q "$SERVICE")"
  test -n "$CONTAINER"
  PID="$(docker inspect "$CONTAINER" --format '{{.State.Pid}}')"
  test "$PID" -gt 0
  sudo nsenter --target "$PID" --net timeout 300 tcpdump -i any -n -tt -l \
    'tcp[tcpflags] & tcp-syn != 0 or udp port 53' \
    > "$REPORT_DIR/network-$SERVICE.txt" \
    2> "$REPORT_DIR/network-$SERVICE.log" &
done
wait
```

The filename identifies the observed service even when the request uses Docker's
loopback DNS resolver. Keep private/internal destinations distinct from external
ones and check IPv6 records too. Do not recreate these containers during this
window; a replacement container has a different namespace.

In the browser, open Developer Tools > Network before signing in, enable
**Preserve log**, clear existing entries, and perform the same actions. Export
**HAR (sanitized)** to a private file outside the repository. Even sanitized HAR
files can contain sensitive URLs and response bodies: publish only the hostname,
method, response status and time from each entry. Record the browser, capture
start/end, actions, and any request-filter settings with the export. Delete the
private HAR after extracting the evidence required for the report.


For example, save the private export as `$HOME/acceptance-private.har`, then
extract only these fields (the output contains no path, query, headers or body):

```bash
python3 - "$HOME/acceptance-private.har" "$REPORT_DIR/browser-destinations.json" <<'PYTHON'
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

entries = json.loads(Path(sys.argv[1]).read_text())["log"]["entries"]
records = [{
    "source": "browser",
    "host": urlsplit(entry["request"]["url"]).hostname,
    "method": entry["request"]["method"],
    "status": entry["response"]["status"],
    "startedAt": entry["startedDateTime"],
} for entry in entries]
Path(sys.argv[2]).write_text(json.dumps(records, indent=2) + "\n")
PYTHON
```

Compare browser destinations with the container capture. List every observed
external host and its owning service, including Auth's required password-check
service. Keep blocked attempts as findings even when no connection succeeds.
A quiet source requires an active observation window and a source-address mapping;
missing capture coverage is inconclusive. Seal these real observations with the
report. The fixture command below only checks the CI report format and policy;
it does not demonstrate that this installed instance made no external requests.

### CI egress contract

The CI contract records only the capture source, destination host, and its
policy decision. The four capture sources are `browser`, `server`,
`scheduler`, and `container`. A missing source blocks the report, so a quiet
source cannot be mistaken for an unobserved one.

For the minimal scenario, only the application, selected Supabase hostname,
and internal scheduler target are allowed. The full Compose profile additionally
makes its default network internal. Caddy alone joins `edge`; the loopback
maintenance bridge joins its own network, Auth has SMTP/password-check egress,
and the application and agent runner have operator-provider egress. The pinned
Auth service calls `api.pwnedpasswords.com` for compromised-password checks;
record this required platform traffic separately from application-provider
traffic when capturing the full daemon. Stripe, PostHog, Vercel, OpenRouter, Resend, telemetry, feedback,
and Minddy Cloud remain denied unless an operator explicitly declares the one
selected provider; Minddy Cloud is never allowed.

The report input is JSON produced by the capture layer and contains no request
body, path, query string, header, or credential. For example:

```bash
MINDDY_PUBLIC_APP_URL=http://minddy:3000 \
MINDDY_PUBLIC_SUPABASE_URL=https://project.supabase.co \
MINDDY_SCHEDULER_URL=http://minddy:3000 \
pnpm verify:self-hosted-egress -- \
  --egress-log test/fixtures/self-hosted-egress/minimal.json \
  --profile minimal \
  --report "$REPORT_DIR/egress-minimal.md"
```

Run the provider scenario separately and declare only its host with
`--profile provider --allow-host api.resend.com`. The resulting CI artifacts
make a required Supabase access distinguishable from a prohibited vendor leak.

## 5. Recover from one injected error

After the project, tickets, attachment, and integration record have been
created, inject one reversible application failure into the reference profile.
Do not edit the environment file, its checkpoint, or any container image.

```bash
sha256sum "$MINDDY_ENV_FILE" > "$REPORT_DIR/environment-before.sha256"
compose stop minddy
pnpm self-host:install -- --non-interactive --mode full \
  --supabase-dir "$SUPABASE_DIR" --image "$IMAGE" --env-file "$MINDDY_ENV_FILE"
sha256sum "$MINDDY_ENV_FILE" > "$REPORT_DIR/environment-after.sha256"
diff -u "$REPORT_DIR/environment-before.sha256" "$REPORT_DIR/environment-after.sha256"
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json \
  > "$REPORT_DIR/recovery-doctor.json"
```

The checkpoint is `${MINDDY_ENV_FILE}.install-state.json`. Collect only phase
names and their timestamps; keep the protected original unchanged:

```bash
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const { phases } = JSON.parse(readFileSync(`${process.env.MINDDY_ENV_FILE}.install-state.json`, "utf8"));
  console.log(JSON.stringify({ phases }, null, 2));
' > "$REPORT_DIR/recovery-checkpoint.json"
```

Confirm the same Docker image digest, project, tickets, attachment and revoked
integration identifiers. The installer must also work when `lsof` is installed
and the other services already occupy their published ports.

## 6. Back up and update

Follow [Complete cold backup](self-hosting-operations.md#complete-cold-backup-for-the-full-reference-profile)
and [Update the installed OCI instance](self-hosting-operations.md#update-the-installed-oci-instance)
using the exact same Compose context. Use `BACKUP_ROOT`, include the source
counts in the sealed backup, and verify a second copy. Do not start a source
server or a Supabase CLI local stack. The target configuration must use the
separately verified `TARGET_IMAGE`, preserve all generated secrets, and point
to the target tagged checkout.

After the update, sign in and compare the original IDs, issue fields,
integration attribution/revocation, and attachment bytes. Record migration
history with `compose exec -T --interactive=false db psql`, as above, and the actual Docker image ID
and repo digest. Record the write outage and time of verification.

## 7. Restore onto a blank stack

Follow [Restore the full profile](self-hosting-operations.md#restore-the-full-profile-to-a-blank-target).
Use a new upstream directory, empty data paths, a new database-key volume, and
a different private application origin. Record these blank-target facts before
loading the backup. Preserve the stopped source directories and sealed backup.
A fresh VM is preferred; sequential full stacks on the same disposable daemon
are allowed when their data paths and volumes are demonstrably separate.

After restoring the coordinated database, Storage bytes, keys, environment and
saved release, sign in with the restored account and MFA. Compare source and
restored counts, row identifiers, attachment download SHA-256, and integration
attribution/revocation. Confirm links, OAuth, MCP and callbacks use the restore
origin. A changed public origin must not require rebuilding the OCI image.

## 8. Replay published documentation with an AI agent

Start a separate AI session that has no repository checkout, shell history,
issue context, or chat transcript from this validation. Give it only the public
site and the published documentation URLs. Do not give it credentials, a
release bundle, or unpublished files. Ask it to choose a deployment mode, list
the required inputs, install from a tag and image digest, create the first
project and issue, recover from the documented injected failure, and locate the
update, backup, restore, and rollback procedures.

Record the exact prompt, documentation URLs opened, elapsed time, proposed
commands, and every question or ambiguous instruction. Redact any generated
credential-like string. A maintainer may answer only by pointing to an already
published document; a missing answer, a required hidden assumption, or a
recommendation to use a branch or mutable image tag is a release blocker.

## 9. Seal the evidence

Create `report.md` with this table. Every row needs a command, observation, or
sanitized artifact; a bare assertion is not evidence.

| Check | Result | Evidence |
| --- | --- | --- |
| Immutable consecutive tags |  | `preflight.md` |
| Public release assets and OCI digest |  | checksum result, tag object, commit, and digest |
| Guided mode choice and required inputs |  | mode rationale and redacted input checklist |
| First healthy reference profile within 45 minutes |  | UTC timestamps and `first-doctor.json` |
| Clean bootstrap and idempotent second run |  | timestamps and exit codes |
| Account and first administrator |  | redacted account ID and role |
| Project, ticket, and Storage object |  | IDs and `source-counts.json` |
| One integration enabled and revoked |  | redacted integration ID and HTTP statuses |
| Other optional services isolated |  | sanitized host/request audit |
| Recovery from injected application failure |  | environment checksums, checkpoint, and `recovery-doctor.json` |
| Coordinated backup sealed and copied |  | backup ID and checksum result |
| Update completed in required order |  | tag, migration list, downtime |
| Blank restore completed |  | target identity and verifier output |
| Restored data and bytes match |  | count diff and attachment hash |
| Documentation-only AI replay |  | sanitized prompt, links, timings, and ambiguities |

Remove secrets from logs, then seal the evidence directory:

```bash
if rg -n -i 'authorization:|bearer |service_role|postgres(ql)?://[^ ]+:[^@ ]+@' "$REPORT_DIR"; then
  echo "Potential secret in evidence; redact it before continuing." >&2
  exit 1
fi
(
  cd "$REPORT_DIR"
  # Relative paths keep the sealed evidence verifiable after copying it.
  # Exclude the output itself, including when resealing an existing report.
  if command -v sha256sum >/dev/null 2>&1; then
    find . -type f ! -path './SHA256SUMS' -print0 | sort -z | xargs -0 sha256sum \
      > SHA256SUMS
    sha256sum --check SHA256SUMS
  else
    find . -type f ! -path './SHA256SUMS' -print0 | sort -z | xargs -0 shasum -a 256 \
      > SHA256SUMS
    shasum -a 256 --check SHA256SUMS
  fi
)
```

Record every deviation as a blocking issue before accepting the release. A run
with a missing published tag, an unpublished fix, skipped Storage bytes, changed
counts, an unexplained outbound request, or an undocumented infrastructure edit
is `BLOCKED`, not a partial pass.
