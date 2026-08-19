# Self-host minddy

This guide installs a functional minddy instance from a clean clone. It is
written as an execution contract: an operator or an AI agent can follow it
without access to Minddy Cloud, a Minddy account, or private infrastructure.

The supported result lets users sign up, create projects and issues, use
attachments, and receive realtime updates. For operations after installation,
read [the operations runbook](self-hosting-operations.md). For release
acceptance on an isolated host, use [the clean-room scenario](self-hosting-clean-room.md).
Before choosing a topology, read the binding
[self-hosted distribution contract](self-hosting-distribution.md), including
its release compatibility matrix and responsibility split.

## Supported topology

minddy consists of a Node.js web application and a complete Supabase stack.
PostgreSQL alone is not supported: the application also requires Supabase Auth,
Storage, and Realtime.

| Component | Supported choices | Required |
| --- | --- | --- |
| Web application | Any host that can run a Next.js production server behind HTTPS | Yes |
| Database, Auth, Realtime, Storage | A managed Supabase project, or the official self-hosted Supabase distribution | Yes |
| Object storage | The Storage backend of that Supabase instance (local volume or its configured S3-compatible backend) | Yes |
| Scheduled work | Any HTTP scheduler that calls the documented cron endpoints with `CRON_SECRET`; Vercel Cron is one adapter | No, jobs remain disabled without it |
| Auth email | SMTP configured in Supabase/GoTrue | Recommended for a public service |
| Application email | Resend, explicitly configured, or no provider; `console` is development-only | No |
| AI | Per-user BYOK/local provider, or the managed OpenRouter mode | No |
| Code agent | Local runtime, or Vercel Sandbox when explicitly configured | No |
| GitHub, GitLab, Stripe, PostHog, Web Push, APNs, Vercel domains/analytics | Operator-owned accounts only | No |

GitHub integration targets `github.com` and GitLab integration targets
`gitlab.com`. GitHub Enterprise Server and self-managed GitLab are not silently
substituted and are currently unsupported by these adapters.

Do not configure a Minddy Cloud URL, key, sender address, analytics host, VAPID
subject, or Apple bundle ID on a third-party instance. An absent optional
integration stays disabled; it does not fall back to Minddy infrastructure.

## Prerequisites

- Node.js 24 and pnpm 10.28.0;
- Git and the [Supabase CLI](https://supabase.com/docs/guides/local-development);
- `psql` for remote-stack verification;
- Docker for the local Supabase topology, or an already-running managed or
  self-hosted Supabase project for the remote topology. A complete production
  deployment must meet the Docker Engine and Docker Compose plugin minimums in
  the [compatibility matrix](../deploy/self-hosted/compatibility.json).

Keep secrets in a host secrets manager or a mode-`0600` environment file. Never
commit `.env.local`, a service-role key, database URL, private key, or backup.

## Configuration contract

`.env.example` is the exhaustive reference for integration-specific settings.
This table is the short operational classification.

| Class | Variables | How to obtain them |
| --- | --- | --- |
| Required to run a deployed instance | `MINDDY_PUBLIC_APP_URL`, `MINDDY_PUBLIC_SUPABASE_URL`, `MINDDY_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Set the canonical HTTPS origin yourself. Copy the Supabase API URL, anon key, and service-role key from the selected Supabase project or stack. Never expose the service-role key to a browser. |
| Generated bootstrap secrets | `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `CRON_SECRET` | `pnpm bootstrap:supabase` writes missing values to `.env.local`. It never replaces existing values. Generate a replacement with `openssl rand -hex 32`; rotate it deliberately and preserve the old value when encrypted existing data requires it. |
| Recommended instance identity | `MINDDY_PUBLIC_SITE_NAME`, `MINDDY_PUBLIC_CONTACT_EMAIL`, `ADMIN_EMAILS`, `OAUTH_ISSUER` | Choose operator-owned public values. `OAUTH_ISSUER` is normally empty and is only needed when OAuth/MCP is intentionally published at an origin different from the app origin. |
| Optional capability settings | `EMAIL_PROVIDER`, Resend sender/key variables, GitHub/GitLab variables, Vercel domain variables, PostHog pairs, VAPID/APNs variables, `OPENROUTER_API_KEY`, `AGENT_EXECUTION_BACKEND`, `CRON_SECRET`, and the matching integration secrets | Configure the complete set for the capability, following the comments in `.env.example`. An incomplete set is reported as disabled or incomplete rather than using an implicit provider. |
| Cloud-reserved settings | `MINDDY_MANAGED_AI`, `MINDDY_MANAGED_BILLING`, Stripe price/key variables, `MINDDY_DESKTOP_FEED_URL`, `BLOB_READ_WRITE_TOKEN`, `APPLE_KEYCHAIN_PROFILE` | Leave absent or set the two managed flags to `0` when self-hosting. They are for Minddy-operated managed services, release distribution, or build infrastructure—not prerequisites for the open-source core. |

`SUPABASE_SERVICE_ROLE_KEY` is required when `NODE_ENV=production`. The
bootstrap also creates the five generated secrets for a local install so that
enabling an associated feature later does not require storing a weak placeholder.
Secrets must be at least 32 characters where the application validates them.

For a public service, set `MINDDY_PUBLIC_APP_URL` to one absolute HTTPS origin with
no path or trailing slash. It is used for invitation links, OAuth/MCP metadata,
and webhook callbacks. Locally it may be omitted, which means
`http://localhost:3000`.

## Installation: local Supabase from a clean clone

Use this topology for development, evaluation, and the clean-room acceptance
scenario. It starts Docker services from the versioned
[`supabase/config.toml`](../supabase/config.toml).

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm bootstrap:supabase
pnpm dev
```

`bootstrap:supabase` validates migration names and order, starts the local
stack, obtains local Supabase API keys, applies migrations, creates or corrects
Storage buckets, writes only missing values to `.env.local`, and verifies the
database and Storage API. Run it a second time to confirm idempotency.

Open `http://localhost:3000`, create an account, create a project, and create an
issue. `supabase status` prints the local mail inbox URL if email confirmation is
enabled.

To reset an evaluation stack, explicitly destroy its local data and bootstrap it
again:

```bash
supabase db reset --local
pnpm bootstrap:supabase
```

`supabase db reset --local` is destructive. It is not an update or recovery
procedure for a running instance.

## Installation: managed or self-hosted remote Supabase

### Guided reference-profile installation

For either versioned Compose profile, use the guided installer from the release
directory. It asks for the deployment mode, public domain, administrator, and
only the optional capabilities that should be enabled. It generates distinct
secrets, creates `deploy/self-hosted/.env` with mode `0600`, pulls and starts
the selected stack, and runs the existing idempotent Supabase bootstrap.

```bash
pnpm self-host:install
```

For non-interactive automation, pass every required input explicitly. Managed
mode requires credentials for an existing Supabase project; full mode requires
the pinned upstream checkout and a PostgreSQL connection that is reachable by
the host running the bootstrap.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --domain tickets.example.com --admin-email ops@example.com \
  --supabase-url https://supabase.example.com --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres'
```

The installer never replaces an existing `.env`. A later invocation reuses that
file and safely repeats Compose pulls, `up`, migrations, and bucket
reconciliation; it does not rotate data-encryption or cron secrets. DNS,
firewall ports 80 and 443, upstream Supabase provisioning, and a restorable
backup policy remain operator responsibilities. Scheduler, AI, billing,
analytics, email, Git hosting, and every other optional integration remain off
unless configured deliberately.

Run the read-only diagnostic after installation and after maintenance. It
redacts credentials while checking configuration, compatibility, containers,
DNS/TLS, app health, optional scheduler state, disk space, and—when a database
URL is supplied—migrations and Storage.

```bash
pnpm self-host:doctor -- --mode managed --db-url 'postgresql://postgres:...@db.example.com:5432/postgres'
```

The update, backup, and restore entry points are safety gates for the operation
runbook. They verify the inputs they can safely verify but never guess a Storage
backend or overwrite configuration or a restore target.

```bash
pnpm self-host:backup -- --backup-dir /mnt/backup/minddy/20260819T120000Z-v0.10.19
pnpm self-host:update -- --from-release v0.10.19 --to-release v0.10.20 \
  --backup-dir /mnt/backup/minddy/verified-v0.10.19
pnpm self-host:restore -- --backup-dir /mnt/backup/minddy/verified-v0.10.19 \
  --confirm-blank-target
```

First provision the Supabase project or self-hosted stack. Its API/Auth,
Storage, Realtime, and PostgreSQL endpoint must be reachable from the
application host. Use a database URL for a role allowed to apply migrations.

Export the transient inputs in a protected shell, then run the same bootstrap:

```bash
export MINDDY_PUBLIC_APP_URL='https://tickets.example.test'
export MINDDY_PUBLIC_SUPABASE_URL='https://supabase.example.test'
export MINDDY_PUBLIC_SUPABASE_ANON_KEY='...'
export SUPABASE_SERVICE_ROLE_KEY='...'
export SUPABASE_DB_URL='postgresql://postgres:...@db.example.test:5432/postgres'
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL"
```

The script does not derive API keys from a database URL. It verifies required
Supabase schemas, the `extensions.vector` extension, Realtime publication,
application configuration, buckets, and Storage policies. Buckets are managed
through the Storage API because a PostgreSQL schema dump does not create their
object-store backing data.

Install the produced `.env.local` values into the application host's secrets
manager, add `MINDDY_PUBLIC_APP_URL` and identity values, then start the
official release image documented in [container-image.md](container-image.md):

```bash
docker run --env-file /etc/minddy/minddy.env \
  --publish 127.0.0.1:3000:3000 \
  ghcr.io/mangue-dev/minddy:vX.Y.Z
```

Build the image without operator-specific public settings. Changing a
`MINDDY_PUBLIC_*` value requires a restart, not a rebuild.

## Reference Docker Compose profiles

The versioned profiles in
[`deploy/self-hosted/`](../deploy/self-hosted/) turn the official release image
into two supported deployment paths:

- `compose.managed.yml` runs minddy behind Caddy with an operator-provided
  Supabase project; and
- `compose.full.yml` overlays minddy, Caddy, and opt-in scheduled jobs on the
  exact official Supabase Docker revision recorded in the compatibility matrix.

The full profile does not copy Supabase into this repository. Fetch its pinned
upstream Docker directory with `scripts/fetch-official-supabase.mjs`, combine it
with the profile as shown in that directory's README, and keep every upstream
service image unchanged. Both paths expose only Caddy ports 80 and 443, use
health checks, and leave scheduled jobs disabled until the `scheduled-jobs`
profile is selected. The README also documents automatic Caddy TLS and the
loopback option for an existing TLS load balancer.

## Production configuration outside the repository

The following Supabase settings are not controlled by SQL migrations and must
be recorded in your platform configuration:

- Auth Site URL: the same value as `MINDDY_PUBLIC_APP_URL`.
- Auth redirect URLs: `<app-origin>/auth/callback` plus any intentional preview
  callback origins.
- Auth SMTP and templates: copy the versioned templates in
  `supabase/email-templates/` and use an operator-controlled sender/domain.
- Social sign-in providers: configure their client IDs and secrets in Supabase,
  not in the Next.js environment.
- Auth password, session, MFA, and rate-limit policy: start from
  [`auth-supabase-config.md`](auth-supabase-config.md) and adapt it to your own
  risk policy.

## Scheduled jobs

Background work is intentionally off until `CRON_SECRET` exists. Configure your
scheduler to invoke the paths and schedules in [`vercel.json`](../vercel.json),
or select only the jobs you operate. Each request must include:

```text
Authorization: Bearer <CRON_SECRET>
```

Do not log that header. Keep the scheduler disabled during maintenance and
restore; re-enable it only after the application and Supabase checks pass.

## Existing instances with pre-baseline migration history

New instances apply the baseline and initial-data migrations directly. An older
instance that already applied the historical migration set must not run `db
push` until its migration history has been repaired. Take a restorable backup,
verify schema drift, and perform this maintenance-window-only procedure:

```bash
pnpm repair:squashed-migrations -- --linked
pnpm repair:squashed-migrations -- --linked --apply
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL"
```

If the older instance has manually applied SQL, first compare it with the
baseline and create a versioned migration for intentional differences. Use the
explicit `--allow-manual-schema` mode only after reading its displayed
fingerprint and backup warning.

## Verify and troubleshoot installation

Verify a remote instance without changing its schema:

```bash
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

For local verification, run `pnpm verify:supabase --local`. Common failures:

- Missing Docker or Supabase CLI: install the missing prerequisite, then rerun
  the idempotent bootstrap.
- Missing remote API values: set all three Supabase variables; the database URL
  alone is insufficient.
- Bucket verification error: preserve the error, check the Storage service and
  service-role key, then rerun bootstrap. Do not delete a non-empty `avatars`
  bucket merely to clear the warning.
- Application starts with the wrong public URL: correct
  `MINDDY_PUBLIC_APP_URL`, then restart the container.

For updates, backups, restores, rollback decisions, and the wider diagnostic
table, continue with [the operations runbook](self-hosting-operations.md).
