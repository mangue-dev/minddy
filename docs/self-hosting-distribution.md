# Self-hosted distribution contract

This document is the binding distribution and compatibility contract for a
self-hosted minddy release. It applies to every public `vMAJOR.MINOR.PATCH`
tag and is the entry point before following the installation and operations
runbooks.

## Distribution decision

The public [`mangue-dev/minddy`](https://github.com/mangue-dev/minddy)
repository is the only minddy distribution repository. Source, migrations,
self-hosting documentation, compatibility records, checksums, and future
deployment assets belong there and are released together from an immutable tag.
There is no separate minddy self-hosting repository, private deployment
repository, or unversioned installer that an operator must trust.

The canonical artifacts are the tagged source release and its GitHub release
assets, plus the official image at `ghcr.io/mangue-dev/minddy:vX.Y.Z`. The image
digest, platform list, SBOM/provenance locations, and signature identity are
recorded in the release manifest and documented in
[container-image.md](container-image.md). A Helm chart or installer is not an
additional supported distribution until it is versioned under
`deploy/self-hosted/`, listed in the release manifest, and documented here. The
upstream Supabase Docker configuration remains an external dependency; minddy
does not fork or republish it.

Each public release guarantees all of the following:

- a complete source tree, migration history, bootstrap and verification scripts;
- a compatibility entry in
  [`deploy/self-hosted/compatibility.json`](../deploy/self-hosted/compatibility.json);
- release notes, checksums, migration diff, immutable source tag, and a
  signed multi-platform OCI image with attached SBOM and provenance; and
- documentation for installation, maintenance, backup, restoration, and
  rollback.

It does not guarantee an operator's DNS, certificates, host capacity, upstream
Supabase availability, backup retention, or optional third-party service.

## Supported deployment paths

Both paths require minddy's Node.js application, one canonical HTTPS app
origin, and a Supabase service offering Postgres, Auth, Storage, and Realtime.
PostgreSQL by itself is not a supported substitute.

| Path | minddy provides | Operator provides and operates | Support boundary |
| --- | --- | --- | --- |
| **Simple** | Tagged application source, migrations, bootstrap/verification scripts, and runbooks | A managed Supabase project, app host, reverse proxy, secrets, backups, and scheduler | Supported when the Supabase project exposes the required APIs and `pnpm verify:supabase` succeeds. The managed provider's control plane and service incidents are outside minddy support. |
| **Complete** | The same minddy materials and an exact upstream Supabase compatibility pin | A complete official Supabase Docker stack, app host, proxy, secrets, persistent storage, backups, monitoring, and scheduler | Supported only with the upstream official Compose set and version in the compatibility matrix. Altered images, community charts, and individually upgraded Supabase services are operator-managed variants. |

The Supabase CLI local stack is for development and release acceptance only. It
must not be exposed as a production service and is not the complete deployment
path.

The versioned reference Compose profiles live in
[`deploy/self-hosted/`](../deploy/self-hosted/). The managed profile consumes an
operator-provided Supabase endpoint. The complete profile is an overlay applied
to a checksum-verified, commit-pinned checkout of the official Supabase Docker
directory; this repository never carries a maintained copy of that stack.

## Compatibility matrix

[`deploy/self-hosted/compatibility.json`](../deploy/self-hosted/compatibility.json)
is the machine-readable source of truth. The entry matching a release tag is
the only supported matrix for that release. Its values are intentionally exact:

- production hosts are Linux `amd64` or Linux `arm64`; other CPU architectures
  are not release-supported;
- the host must meet the recorded Docker Engine and Docker Compose plugin
  minimums; Docker Desktop is suitable for local acceptance but is not a
  production platform guarantee;
- the complete path uses the exact official `self-hosted/v0.7.2` Supabase
  Compose release and the image set it pins; upgrading a service image by hand
  is unsupported; and
- the simple path supports a managed service that provides the listed APIs and
  passes the release's verification command. A managed service has no
  operator-selected server version, so API capability—not an inferred internal
  version—is the compatibility check.

The matrix is changed in the same pull request as a compatibility change. A
later minddy release may add a new row, but it never silently widens the
support promise of an already-published tag.

## Data and upgrade contract

minddy migrations are forward-only. New installations start from
`20270106090000_baseline.sql` and apply the later versioned files in
`supabase/migrations/` using `pnpm bootstrap:supabase`. Existing instances with
pre-baseline history must use the documented
`pnpm repair:squashed-migrations` procedure before migration.

An operator upgrades one published minddy release at a time: block writes,
create and verify a restorable database-plus-Storage backup, apply the target
migrations, deploy the target application, verify, then reopen writes. The
application and schema are one release set. There are no generated down
migrations; a rollback after an incompatible migration restores the matching
application, PostgreSQL, Storage bytes, and configuration backup together.

## Network, jobs, and persistence

The operator terminates TLS at an operator-controlled reverse proxy such as
Caddy or Nginx. Public HTTP must redirect to HTTPS. The proxy exposes the app
and, where needed, the Supabase API at their configured public origins; it must
not expose PostgreSQL, Studio, or internal service ports to the Internet.
`MINDDY_PUBLIC_APP_URL`, Supabase Auth URLs, OAuth callbacks, and any proxy
headers must agree on that canonical origin.

Scheduled work is opt-in. minddy guarantees the documented authenticated HTTP
endpoints and their schedules in `vercel.json`; the operator chooses an HTTP
scheduler, protects `CRON_SECRET`, observes executions, and disables jobs
during maintenance and restore. No scheduler means those jobs remain disabled.

Persistent data consists of PostgreSQL, Supabase Storage object bytes, and the
operator's encrypted configuration and secrets. A complete backup captures all
three at one write-consistent point, plus the minddy tag and full Supabase
image/configuration identities. Local Docker volumes and S3-compatible Storage
are both valid when they are durable and are backed up with the corresponding
metadata. Ephemeral container filesystems are not persistent storage.

## Support policy and responsibility split

Minddy maintainers support the latest public release and its documented
previous-release upgrade path for the two matrix paths above. Support means
maintaining release metadata, migrations, verification tooling, and
best-effort community diagnosis of reproducible minddy defects. It does not
include operating an operator's infrastructure, providing an SLA, recovering
operator data, or supporting unpinned derivative deployments.

The operator is responsible for host and OS patching, capacity, Docker and
Supabase lifecycle, DNS, TLS, firewalling, access control, secrets, email,
backups, restore drills, monitoring, incident response, data-protection duties,
and every optional integration account. Minddy Cloud is a separate operated
service and is never a dependency or fallback for a self-hosted instance.

For installation, use [self-hosting.md](self-hosting.md). For an upgrade,
backup, restore, or rollback, use
[self-hosting-operations.md](self-hosting-operations.md).
