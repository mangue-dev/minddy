# Self-host minddy

This guide installs a functional minddy instance from a clean clone. It is
written as an execution contract: an operator or an AI agent can follow it
without access to Minddy Cloud, a Minddy account, or any Minddy-managed
provider. For the Cloud/self-hosted decision, data flows, and responsibility
split, start with [the edition guide](editions.md).

The supported result lets users sign up, create projects and issues, use
attachments, and receive realtime updates. For operations after installation,
read [the operations runbook](self-hosting-operations.md). For release
acceptance on an isolated host, use [the clean-room scenario](self-hosting-clean-room.md).
Before choosing a topology, read the binding
[self-hosted distribution contract](self-hosting-distribution.md), including
its release compatibility matrix and responsibility split.

## Install the desktop app first

Self-hosting is configured and opened from the minddy desktop app. Before
installing a local instance or preparing a server, install the signed app from
[minddy.app/download](https://www.minddy.app/download) and confirm that it opens.
Windows installation goes through Microsoft Store; there is no `.exe` installer.
macOS and Linux use the downloads shown for their platform.

Keep the app installed throughout this guide. Its native **minddy** menu is the
source-selection and recovery surface: macOS shows it in the global menu bar;
Windows and Linux reveal the hidden menu bar when you press **Alt**. Later steps
use **Connect to a Server…** to select either a local clone or a remote server.

## Supported topology

minddy consists of a Node.js web application and a complete Supabase stack.
PostgreSQL alone is not supported: the application also requires Supabase Auth,
Storage, and Realtime.

| Component | Supported choices | Required |
| --- | --- | --- |
| Web application | Any host that can run a Next.js production server behind HTTPS | Yes |
| Database, Auth, Realtime, Storage | A Supabase Cloud project on `supabase.com`, or the official self-hosted Supabase distribution | Yes |
| Object storage | The Storage backend of that Supabase instance (local volume or its configured S3-compatible backend) | Yes |
| Scheduled work | Built-in scheduler in the reference Compose profiles, or an equivalent HTTP scheduler | Yes in the reference server installation |
| Auth email | SMTP configured in Supabase/GoTrue | Recommended for a public service |
| Application email | Resend, explicitly configured, or no provider; `console` is development-only | No |
| AI | Per-user BYOK or local provider | No |
| Code agent | Desktop-local runtime, built-in self-hosted Docker sandboxes, or Vercel Sandbox | Yes in the reference server installation |
| GitHub, GitLab, application email, Web Push, scheduled routines | Operator-owned accounts and explicit configuration | No |

GitHub integration targets `github.com` and GitLab integration targets
`gitlab.com`. GitHub Enterprise Server and self-managed GitLab are not silently
substituted and are currently unsupported by these adapters.

GitHub and GitLab integrations are optional. Configure operator-owned GitHub
App and GitLab OAuth app credentials if you need them; without them, a user who
explicitly starts a Git connection can use the managed forge relay. It is a
connection channel, not a prerequisite for running the core: a self-hosted
instance can leave Git disabled or opt out with `--no-forge-relay` (or
`MINDDY_FORGE_RELAY=0`) and use operator-owned apps only. The relay's data flow
and operating model are documented in `docs/managed-forge-relay-plan.md`.

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
| Required to run a deployed instance | `MINDDY_PUBLIC_APP_URL`, `MINDDY_PUBLIC_SUPABASE_URL`, `MINDDY_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Set the selected public HTTPS or private HTTP origin. Copy the Supabase API URL, anon key, and service-role key from Supabase Cloud or the selected stack. Never expose the service-role key to a browser. |
| Generated bootstrap secrets | `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `CRON_SECRET`, `AGENT_RUNNER_SECRET` | The guided installers write missing values without replacing existing ones. Generate a replacement with `openssl rand -hex 32`; rotate it deliberately and preserve the old value when encrypted existing data requires it. |
| Recommended instance identity | `MINDDY_PUBLIC_SITE_NAME`, `MINDDY_PUBLIC_CONTACT_EMAIL`, `ADMIN_EMAILS`, `OAUTH_ISSUER` | Choose operator-owned public values. `OAUTH_ISSUER` is normally empty and is only needed when OAuth/MCP is intentionally published at an origin different from the app origin. |
| Optional capability settings | `EMAIL_PROVIDER`, Resend sender/key variables, GitHub/GitLab variables, Vercel domain variables, PostHog pairs, VAPID/APNs variables, `OPENROUTER_API_KEY`, and the matching integration secrets | Configure the complete set for the capability, following the comments in `.env.example`. An incomplete set is reported as disabled or incomplete rather than using an implicit provider. |
| Cloud-reserved settings | `MINDDY_MANAGED_AI`, `MINDDY_MANAGED_BILLING`, `MINDDY_MANAGED_FORGE`, Stripe price/key variables, `MINDDY_DESKTOP_FEED_URL`, `BLOB_READ_WRITE_TOKEN`, `APPLE_KEYCHAIN_PROFILE` | Leave absent or set the managed flags to `0` when self-hosting. They are for Minddy-operated managed services, release distribution, or build infrastructure—not prerequisites for the open-source core. |

`SUPABASE_SERVICE_ROLE_KEY` is required when `NODE_ENV=production`. The
server installer always creates the AI-key, feedback-SSO, runner, and scheduler
secrets. Git provider credentials are optional and remain operator-owned.
Secrets
must be at least 32 characters where the application validates them.

### Capacity recommendations

Treat these as resources available to minddy and Docker, not the machine's
total installed capacity.

| Route | Minimum | Recommended |
| --- | --- | --- |
| Single-user local minimal stack | 4 GB free RAM, 2 CPU cores, 10 GB free SSD | 8 GB free RAM, 4 CPU cores, 20 GB free SSD |
| Dedicated server with Supabase Cloud | 4 GB RAM, 2 CPU cores, 20 GB SSD | 8 GB RAM, 4 CPU cores, 40 GB or more SSD |
| Dedicated server with Supabase on the same host | 8 GB RAM, 4 CPU cores, 60 GB SSD | 16 GB or more RAM, 6 CPU cores, 100 GB or more SSD |

The same-host figures follow the [official Supabase Docker capacity guidance](https://supabase.com/docs/guides/self-hosting/docker).
The local estimate is lower because the supported minimal profile omits Studio,
analytics, Edge Functions, image transformation, the pooler, and other unused
containers. Database, attachments, and backup storage grow over time; keep
restorable backups on separate storage.

### Numo agents and routines

The reference server installation includes both interactive Numo agents and
scheduled routines. They enter the same launch and execution path. The scheduler
calls minddy on the private Compose network for due routines, while an interactive
run starts from the app; the built-in runner then opens one restricted Docker
sandbox per run on the server in either case:

```dotenv
AGENT_EXECUTION_BACKEND=self-hosted
AGENT_RUNNER_URL=http://agent-runner:6464
AGENT_CONTROL_ORIGIN=http://minddy:3000
```

The installer generates `AGENT_RUNNER_SECRET` and `CRON_SECRET`; the operator
does not configure a separate execution service or keep a desktop app online.
Starting Numo from the app therefore opens a server sandbox just like a routine.
An explicit desktop-local run remains a separate opt-in for working directly in
a folder attached to the desktop app.
The runner has access to the Docker socket so it can create sandboxes. The
sandbox containers do not receive that socket, the Supabase network, or instance
secrets. They receive CPU, memory, process, capability, and filesystem limits.
Only the trusted runner container has host-level Docker authority, so protect
the server and never expose port 6464.

`AGENT_EXECUTION_BACKEND=vercel` remains available for deployments that
deliberately use an operator-owned Vercel Sandbox project. The `local` backend
continues to mean desktop-initiated runs only.

For a public service, set `MINDDY_PUBLIC_APP_URL` to one absolute HTTPS origin with
no path or trailing slash. It is used for invitation links, OAuth/MCP metadata,
and webhook callbacks. The supported single-user command sets it to
`http://localhost:6463`. The ordinary development command keeps its separate
`http://localhost:3000` fallback.

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
```

Open the native **minddy** menu, press **Alt** first on Windows or Linux, and
choose **Connect to a Server… > Run local minddy on this computer**. Select the
cloned folder. The desktop app invokes `self-host:local --no-open`, checks the
dedicated port, bootstraps the minimal Supabase stack, builds minddy when needed,
waits for `/api/health`, and opens sign-up in its own window. It remembers the
folder for later launches. Quitting minddy stops both the application and its
local Supabase backend; reopening minddy starts both again.

The app-owned launcher binds minddy to loopback on port `6463`, validates
migration names and order, applies migrations, reconciles Storage, and writes
only missing `.env.local` values. The minimal profile leaves unused Supabase
services stopped. If startup fails, use **Help > Copy Diagnostic Report** before
falling back to a terminal.

For troubleshooting only, `pnpm self-host:local` can run the same launcher in a
terminal. Stop that process with `Ctrl+C` before returning to **Run local minddy
on this computer**; the desktop app refuses to claim a server owned by another
process. `--keep-backend` deliberately leaves Supabase allocated and is not part
of the normal desktop flow.

To reset an evaluation stack, explicitly destroy its local data and bootstrap it
again:

```bash
supabase db reset --local
pnpm bootstrap:supabase
```

`supabase db reset --local` is destructive. It is not an update or recovery
procedure for a running instance.

## Installation: Supabase Cloud or self-hosted Supabase

### Guided reference-profile installation

For either versioned Compose profile, use the guided installer from the release
directory. It asks for the deployment mode, app address, administrator, and
only the optional capabilities that should be enabled. It generates distinct
secrets, creates `deploy/self-hosted/.env` with mode `0600`, pulls and starts
the selected stack, and runs the existing idempotent Supabase bootstrap.

```bash
pnpm self-host:install
```

For non-interactive automation, pass every required input explicitly. Supabase
Cloud mode requires credentials for a project on `supabase.com`; full mode requires
the pinned upstream checkout and a PostgreSQL connection that is reachable by
the host running the bootstrap.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image 'ghcr.io/mangue-dev/minddy@sha256:replace-with-the-release-digest'
```

A server on a trusted home or office network does not need a domain. Use its
private IPv4 address with either Supabase Cloud or the complete Supabase stack,
and do not forward its ports on the router. The lower-memory Cloud example is:

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image 'ghcr.io/mangue-dev/minddy@sha256:replace-with-the-release-digest'
```

Private HTTP is accepted only for localhost and private IPv4 addresses. To run
Supabase on that same private server, fetch the pinned upstream checkout and use
full mode without `--supabase-host`:

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase \
  --image 'ghcr.io/mangue-dev/minddy@sha256:replace-with-the-release-digest'
```

This exposes minddy at `http://192.168.1.50` and the Supabase API at
`http://192.168.1.50:8000`. Restrict inbound TCP ports 80 and 8000 to the
trusted LAN, keep 443 closed unless it is otherwise needed, and never forward
80, 443, or 8000 on the router. A domain and HTTPS can be added later using the
operations runbook.

Before supplying `--image`, download the matching GitHub Release assets, verify
`SHA256SUMS`, and copy the `reference` value from `release-manifest.json`. The
option accepts only the immutable official GHCR digest, never a moving tag. The
installer never replaces an existing `.env` or changes its image pin. A later
invocation reuses that file and safely repeats Compose pulls, `up`, migrations,
and bucket reconciliation; it does not rotate data-encryption or cron secrets. Public
DNS, firewall ports 80 and 443, Supabase provisioning, and a restorable
backup policy remain operator responsibilities. The scheduler and agent runner
start as core services; managed AI, billing, analytics, email, Git hosting, and
other external integrations remain off unless configured deliberately.

The guided page and installer expose only two optional self-host choices:
`application-email` and `web-push`. Repeat `--enable <feature>` in
non-interactive commands. GitHub and GitLab need no setup: they connect from
within the app through the managed forge relay, and `--no-forge-relay` opts
out for deployments that must never contact minddy infrastructure. The
installer generates only the internal secrets required by those choices and
leaves external provider credentials blank for the operator to supply.
Stripe billing, PostHog/Vercel analytics, Minddy-managed AI, Vercel domain
management, and APNs release credentials are intentionally not offered as
initial self-host options.

Run the read-only diagnostic after installation and after maintenance. It
redacts credentials while checking configuration, compatibility, containers,
DNS/TLS, app health, scheduler and agent-runner state, disk space, and—when a database
URL is supplied—migrations and Storage.

```bash
pnpm self-host:doctor -- --mode managed --db-url 'postgresql://postgres:...@db.example.com:5432/postgres'
```

### Connect the desktop app to this instance

The native application menu is the source-selection and recovery surface on
macOS, Windows, and Linux. It remains available even when the selected server
cannot load. On macOS, open the global **minddy** menu. On Windows or Linux,
press **Alt** to reveal the hidden menu bar, then open **minddy**.

- Choose **Connect to a Server…**, enter the minddy application origin (for
  example, `https://tickets.example.com` or `http://192.168.1.50`), and select
  **Connect**. Public servers require HTTPS; HTTP is accepted only for localhost
  and private-network IPv4 addresses.
- Choose **Run local minddy on this computer** in that dialog only when the data
  source is a local clone. Stop any terminal-owned `pnpm self-host:local` process
  first, then select the clone's root folder; the app owns the local minddy and
  Supabase lifecycle from that point.
- Choose **Use minddy Cloud** from the same **minddy** menu to remove the custom
  source and return to Minddy Cloud.

The selected source is stored on that computer. Cookies are not copied between
Minddy Cloud and a self-hosted server, so the first switch can require signing
in or creating an account on the selected instance.

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
- `compose.full.yml` overlays minddy, Caddy, scheduled jobs, and the built-in
  agent runner on the
  exact official Supabase Docker revision recorded in the compatibility matrix.

The full profile does not copy Supabase into this repository. Fetch its pinned
upstream Docker directory with `scripts/fetch-official-supabase.mjs`, combine it
with the profile as shown in that directory's README, and keep every upstream
service image unchanged. Public paths expose only Caddy ports 80 and 443; a
private full-stack path additionally exposes Caddy port 8000 to its LAN. The
full profile binds PostgreSQL to loopback for bootstrap and maintenance.
They use health checks and start scheduling and server-side agent execution by
default. The README also documents automatic Caddy TLS and the loopback option
for an existing TLS load balancer.

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

The reference server installer generates `CRON_SECRET` and starts the scheduler.
Custom deployments may invoke the paths and schedules in
[`vercel.json`](../vercel.json) from an equivalent scheduler. Each request must
include:

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
