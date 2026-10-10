# Second lightweight operations review for PR #397

Date: 2026-10-10. Reviewer: `agent:/root/second_operations`, with
`agent:/root/second_ai_integrations` for complete Italian and Brazilian
Portuguese prose review. This is agent review, not human operator acceptance.

## Scope and method

The assigned set contains fourteen guides: `choose-an-instance`,
`architecture-and-data-flows`, `authentication-and-email`,
`backups-and-restoration`, `encryption-and-data-boundaries`, `install-locally`,
`installation`, `instance-administration`, `instance-configuration`,
`self-hosted-diagnostics`, `storage-and-attachments`,
`transfer-between-instances`, `update-an-instance` and `workspace-encryption`.

The operations reviewer read every English body and fenced example and all
French, German and Spanish prose bodies, captions and alternative text in
bounded chunks. Truncated initial outputs were reread in smaller chunks. Italian
and Brazilian Portuguese full prose, captions and diagram labels were read by
the supporting reviewer; their evidence is in
[the second AI/integrations pass](second-pass-ai-integrations-2026-10-10.md).

All six locales' fenced code examples match the English examples byte for byte.
All 162 assigned-guide Bash blocks pass `bash -n`, which checks syntax without
executing their instructions. The matching technical runbook's twelve Bash
blocks also pass. All 78 referenced SVGs were read for label content and compared
with structured diagram labels; differences consist only of SVG line wrapping.
All 36 referenced PNGs were inspected on six temporary diagnostic contact sheets.
Existing cramped transfer descriptions and administrator tabs do not obscure the
required controls. No new capture or pixel-level acceptance is claimed.

## Corrections

Affected article IDs: `installation` and `backups-and-restoration` in all six
locales. Affected workflows: `H04`, `H12` and `H14`. Existing section IDs,
coverage mappings, aliases, related guides and illustration content are retained.
Figure metadata revisions advance with each reviewed article; original PNG/SVG
bytes and capture dates remain unchanged.

The published v0.11.0 managed OCI runner uses the same application image that
omits `agent-runner-storage.mjs`. Its installer starts the entire Compose profile
with `--wait` before bootstrap, so the previous managed example could not
complete unchanged. The example now prepares configuration with `--skip-start`,
explains the release-label correction and requires corrected matching tooling
and managed-profile verification before startup. Full-profile engineering
rehearsals remain explicitly distinct from provider-managed acceptance.

The logical backup copied a standalone pgsodium root file but its restore
sequence never restored that file before `run.sh start`. The revised pinned
operator-controlled procedure archives the complete inspected `db-config`
volume with numeric ownership, permissions, ACLs and extended attributes. It
restores that archive into a verified-new volume before the first database
start, using the saved PostgreSQL image and the existing rehearsed tar helper
pattern. Missing key archives, existing destination volumes, unsupported key
mounts and legacy standalone-key sets stop rather than generating replacement
keys. The persistent override uses a unique `docker-compose.restore-keys.*.yml`
file appended through the pinned `run.sh config add` operation, preserving prior
overrides when backing up and restoring an already recovered instance.

A second reviewer identified the need for a unique override when a prior
restoration already supplied one; the final sequence retains those files and
appends the new target mapping last. The generated key-override YAML mapping
was parsed independently, including its nested `volumes.db-config.name` value.
Bash syntax checks alone cannot validate that payload.

The configuration archive excludes `volumes/`, which includes required static
initialization and Kong files as well as mutable data. Logical backup now
records the upstream source commit. Restoration requires that matching checkout,
checks the required static files and rejects populated database/Storage targets.
Bash contexts use `set -euo pipefail` so failed checks, helper runs or extraction
stop before startup. The matching
[`docs/self-hosting-logical-operations.md`](../../../docs/self-hosting-logical-operations.md)
procedure receives the same correction. The coordinator also clarifies the
all-profile v0.11.0 blocker before commands in `docs/self-hosting.md`.

## Source and retained evidence

Sources actually read include tagged v0.11.0 `Dockerfile`,
`deploy/self-hosted/compose.managed.yml` and `scripts/self-hosting-install.mjs`,
plus the complete pinned upstream `docker/run.sh` and relevant
`docker/docker-compose.yml` sections. The upstream checkout at
`/tmp/m664-tooling-restore-bp6lbc18/new-compiler-upstream` resolves to
`549db119c44c25167461812041ba198bde2b31a4`.

The pinned upstream mounts `db-config` at `/etc/postgresql-custom` explicitly to
persist the pgsodium key. `run.sh start` immediately executes Compose startup;
`config add` preserves the prior Compose file list and supports unique
`docker-compose.*.yml` overrides. No user/group ID is invented: the archive
preserves the source volume's recorded numeric metadata.

Retained evidence was read in `operator-recovery-execution.md`,
`operator-evidence/restore-engineering.json` and
`runner-pinned-independent-review-2026-10-08.json`. It establishes prior
physical key-volume helper usage, not a fresh logical restore or managed
installation. The new sequencing is source reviewed and syntax checked only.
The authoritative knowledge summary does not contain the faulty concrete
command sequence and does not require a matching content change.

## Validation and limits

The coordinator records the complete documentation, release, knowledge,
owned-English, metadata and diff checks in the combined second-pass report.
No Docker command, server, build, installation, backup, restoration, provider
call or live application write was executed in this pass. No unchanged tagged
release, managed installation or new logical restoration acceptance is inferred
from static source review. Existing procedural limitations remain visible.
