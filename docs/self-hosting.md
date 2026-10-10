# Self-host minddy

Start a new installation with the
[step-by-step installer](https://www.minddy.app/self-hosting/install), which
guides you through the local or shared-server choices. Use this document as
the technical reference for prerequisites, configuration, and verification.

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
| AI | Per-user provider reachable from the server, or managed AI in the cloud edition | No |
| Numo code work | Built-in self-hosted Docker sandboxes or Vercel Sandbox | Yes in the reference server installation |
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
| Generated bootstrap secrets | `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `MINDDY_DATA_ROOT_KEY`, `CRON_SECRET`, `AGENT_RUNNER_SECRET` | The guided installers write missing values without replacing existing ones. Generate a replacement with `openssl rand -hex 32`; rotate it deliberately and preserve the old value when encrypted existing data requires it. |
| Recommended instance identity | `MINDDY_PUBLIC_SITE_NAME`, `MINDDY_PUBLIC_CONTACT_EMAIL`, `ADMIN_EMAILS`, `OAUTH_ISSUER` | Choose operator-owned public values. `OAUTH_ISSUER` is normally empty and is only needed when OAuth/MCP is intentionally published at an origin different from the app origin. |
| Optional product feedback | `MINDDY_FEEDBACK_KEY`, `MINDDY_DOCUMENTATION_FEEDBACK_KEY` | Use separate server-only feedback integration keys for general app feedback and documentation error reports. Select the Documentation objective on the documentation integration. Reports require sign-in; their article metadata is appended by the server after submission. The documentation report button is disabled when its key is absent. |
| Optional capability settings | `EMAIL_PROVIDER`, Resend sender/key variables, GitHub/GitLab variables, PostHog pairs, `MINDDY_PUBLIC_ERROR_TRACKING`, VAPID/APNs/WNS variables, `OPENROUTER_API_KEY`, and the matching integration secrets | Configure the complete set for the capability, following the comments in `.env.example`. An incomplete set is reported as disabled or incomplete rather than using an implicit provider. Error tracking additionally requires the explicit `MINDDY_PUBLIC_ERROR_TRACKING=1` opt-in (see [docs/error-tracking.md](error-tracking.md)). |
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

### Numo conversations, code work, and routines

The reference server installation includes interactive Numo conversations,
delegated code work, and scheduled routines. A request from the Numo page, the
contextual floating button, an in-product action, or a due routine enters the same
conversation path. Numo uses Minddy tools directly and asks the built-in runner
to open one restricted Docker sandbox on the server only when repository work is
needed:

```dotenv
AGENT_EXECUTION_BACKEND=self-hosted
AGENT_RUNNER_URL=http://agent-runner:6464
AGENT_CONTROL_ORIGIN=http://minddy:3000
```

The installer generates `AGENT_RUNNER_SECRET` and `CRON_SECRET`; the operator
does not configure a separate execution service or keep a desktop app online.
Starting Numo from either the web or desktop app therefore uses the same server
execution path. No desktop application needs to stay online for scheduled work.
The runner has access to the Docker socket so it can create sandboxes. The
sandbox containers do not receive that socket, the Supabase network, or instance
secrets. They receive CPU, memory, process, capability, and filesystem limits.
Only the trusted runner container has host-level Docker authority, so protect
the server and never expose port 6464.

`AGENT_EXECUTION_BACKEND=vercel` remains available for deployments that
deliberately use an operator-owned Vercel Sandbox project. It requires a valid
`MINDDY_DATA_ROOT_KEY` (64 hexadecimal characters) to protect sandbox credential
refresh policies, even when `MINDDY_CONTENT_ENCRYPTION_ENABLED=false`. This
prerequisite also applies when the application runs on Vercel. Keep the existing
root key if one is already configured; otherwise generate it once with
`openssl rand -hex 32` and back it up separately from the database. Incomplete
configuration blocks agent execution before sandbox allocation. Desktop-local code
execution is retired; `AGENT_EXECUTION_BACKEND` accepts only `self-hosted` or
`vercel`.

For a public service, set `MINDDY_PUBLIC_APP_URL` to one absolute HTTPS origin with
no path or trailing slash. It is used for invitation links, OAuth/MCP metadata,
and webhook callbacks. The supported single-user command sets it to
`http://localhost:6463`. The ordinary development command keeps its separate
`http://localhost:3000` fallback.

## Installation: local Supabase from a clean clone

Use this topology for development and evaluation. For release acceptance, use
the [tagged reference-profile procedure](self-hosting-clean-room.md) instead.
This local topology starts Docker services from the versioned
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

For the published v0.11.0 OCI image, both `managed` and `full` profiles have a
missing runner helper. Generate configuration with `--skip-start` and follow the
[known distribution checks](#known-v0110-distribution-checks) before attempting
startup. The examples below require a corrected, matching release/tooling
combination for a complete installation; the retained full-profile engineering
rehearsal does not establish acceptance of the managed profile.

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

Authentication email needs its own SMTP setup. The upstream template's
`SMTP_HOST=supabase-mail` is a placeholder; the production profile does not
provide an inbox. First add `--skip-start` to generate the protected environment,
then edit its `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_ADMIN_EMAIL`, and `SMTP_SENDER_NAME` with your provider's settings. Keep
`ENABLE_EMAIL_AUTOCONFIRM=false`. Rerun the same installer after configuration.
Optional `application-email` notifications do not configure Auth email. An
isolated, free confirmation inbox is documented only for the
[disposable acceptance test](self-hosting-clean-room.md#local-confirmation-mailbox-disposable-full-profile-test-only).

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
Stripe billing, PostHog analytics, Minddy-managed AI, and APNs release credentials are intentionally not offered as
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
official release image. First follow [release verification](container-image.md#verify-a-published-image)
to set `IMAGE` to the verified digest in this shell:

```bash
docker run --env-file /etc/minddy/minddy.env \
  --publish 127.0.0.1:3000:3000 \
  "$IMAGE"
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
  [operator Auth configuration](self-hosting-auth.md) and adapt it to your own
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

## Workspace encryption setup

Minddy supports server-side AES-256-GCM encryption for workspace content and
files. Versioned project, user and system data keys are wrapped by
`MINDDY_DATA_ROOT_KEY`, a dedicated 32-byte key stored outside PostgreSQL.
The application decrypts for authorized access and AI processing. This is not
end-to-end encryption: a compromised application runtime or access to both the
root key and database can expose content. Auth login emails and routing metadata
remain readable; exports and content sent to external providers need their own
protection.

The server installer and local Supabase bootstrap generate the root key.
For a manual setup, generate it once with `openssl rand -hex 32` and store it in
the protected server environment. Never reuse an AI or forge secret, put the root
in SQL or a client bundle, or regenerate it during an update. Losing it makes
protected content unreadable. Keep a protected recovery copy, including the
historical roots needed for older backups. Encrypt and restrict access to any
backup that contains both the environment and database.

New local and server installations enable encryption by default. The guide offers
an explicit enabled/disabled choice and includes it in both the manual commands
and copied assistant prompt. Both modes generate the dedicated root key; the
opt-out affects workspace content encryption, not saved provider credentials.

For a new server installation, pass `--encryption enabled` (the default) or
`--encryption disabled` to `pnpm self-host:install`. The installer writes
`MINDDY_CONTENT_ENCRYPTION_ENABLED=true` or `false` accordingly, plus an
independent `MINDDY_DATA_ROOT_KEY` in the mode-0600 deployment environment.
The same choice applies to both managed and full Supabase profiles.

For the local desktop flow, prepare the configuration before opening the clone
in the desktop app:

```sh
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
# Use --encryption disabled instead to opt out.
```

This prepares the schema, Storage and `.env.local`, including the selected flag
and root key. Later desktop starts reuse those settings. Complete installation
and its migration/verification checks before importing data or using the instance.
Scheduled maintenance advances bounded legacy conversion and key rotation; an
initial flag or generated key alone does not prove historical data and retained
copies have all been converted. Use `docs/security/encryption/` for rollout,
readiness and recovery checks on existing data.

Reruns preserve the saved flag and root key. A conflicting explicit CLI choice
fails with instructions to review the environment instead of silently replacing
it. An existing configuration without the flag stays disabled until deliberately
configured; a missing root on an enabled instance blocks installation and must be
recovered. For a deliberate mode change, preserve the root, update the flag in
the protected environment and restart the application. Turning encryption off
never decrypts or permits plaintext writes to already protected data. Replacing
a root requires the guarded offline rewrap procedure in
`docs/security/encryption/root-key-rotation.md`. Rehearse database, Storage and
matching-key recovery in an isolated environment, and protect retained backups.


## Known v0.11.0 distribution checks

The v0.11.0 deployment template still records `MINDDY_RELEASE=0.10.30`.
For a new v0.11.0 instance, generate configuration with `--skip-start`, compare
its release and image fields against the selected compatibility row and verified
container asset, then explicitly set `MINDDY_RELEASE=0.11.0` in the protected file.
`--image` changes only the immutable image reference; the installer has no
`--release` option. Preserve generated credentials and encryption keys.

If the released installer stops after a large image progress log, use the exact
installed Compose context to run `compose pull --quiet`, then resume the same
installer with `--skip-pull`. This was exercised on a disposable full profile.
The current installer requests quiet pulls and has an explicit subprocess output
buffer. Registry and signature failures still require their own remedy.

The released offline function compiler expects jose 6.2.3 while the frozen direct
dependency resolves to 6.2.12. The current source pin now matches that frozen
dependency. The released OCI runner also lacks `agent-runner-storage.mjs`; the
current Dockerfile includes it. The disposable engineering rehearsal used the
locked 6.2.3 dependency and a read-only mount of the tagged helper. Those are
explicit adaptations, not acceptance of the unchanged published release. Obtain
a corrected release/tooling combination before accepting the standard deployment.
Never bypass identity checks or remove runner isolation.

The v0.11.0 scheduler does not include `/api/cron/numo-turns`; the current candidate
scheduler now calls it every minute. A candidate package version does not create
a published compatibility row.

The published runner also rejects allocation-suffixed sandbox names, transfers
base64 file chunks above Linux's per-environment-value limit, and initializes a
UID-10001 mode-0700 temporary store as root with every capability dropped. The
unverified initialization result can leave `/vercel/sandbox` absent, so a healthy
runner endpoint does not establish working repository cloning. Current candidate
fixes must be exercised with a fresh sandbox, a large file round trip and a real
code-workflow acceptance check. The local engineering rehearsal mounts the current
runner and storage helper read-only on the immutable v0.11.0 image; it is not an
acceptance of the untouched release or a newly published compatibility row.

### Pinned runner engineering workaround

For the published v0.11.0 image, the following explicit tooling variant also supplies the Basic authentication challenge required by Git HTTP clients. It is a workaround pinned to source commit 89ab340cb10ec729948fc6e596fb7ab0326fc470, not a newly published image or compatibility row. Use it only after completing the base installation. The two files must stay together, at their verified hashes, on persistent storage. These commands expose no runner port. The complete public [procedure](https://www.minddy.app/docs/install-a-server#runner-workaround) includes both verified download URLs, checksums, persistent mounts and operational limitations.

The published application image includes Node.js and Git but deliberately removes npm, npx and Corepack. The reference Compose profile also selects that image for workers through AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. This is insufficient for a fresh code worker: the OpenCode bootstrap uses npm to install its pinned runtime and plugin, even for a repository with no project dependencies. Without npm, execution stops at bootstrap; no project edit or test success can be inferred from the conversation. Use an operator-built and verified dedicated worker image with Node.js 24, npm, Git and the project’s required tools, selected by overriding AGENT_RUNNER_SANDBOX_IMAGE in the runner service. Keep the runner’s isolation constraints. Verify bootstrap, repository cloning, actual tests and the resulting diff before enabling code delegation. Fixing the runner files alone does not supply this worker toolchain.

This procedure also builds a separate code-worker image. The base is pinned, but Debian packages are resolved at build time; inspect the resulting Docker image ID and retain that exact image with the backup. Never substitute the application image after a restore. Building requires access to the base registry and Debian package repositories; fresh OpenCode bootstrap also needs the npm registry. The recipe supplies the bootstrap tools, not every project’s dependencies. Additional build tools require an explicitly maintained variant. The Compose overlay below sets the runner service’s image environment directly because the historical reference Compose file ignores a standalone AGENT_RUNNER_SANDBOX_IMAGE value in the protected file. The inline recipe and overlay are included in the linked public installation article.

The pinned storage helper also makes the sandbox workspace executable. Docker otherwise mounts this tmpfs with noexec, preventing the native OpenCode binary from starting and potentially surfacing a misleading musl-package fallback error. The correction retains nosuid, nodev, UID/GID 10001, mode 0700, read-only root filesystem, dropped capabilities and the disposable per-sandbox store. It does not grant executable access to host data or make the application image a suitable worker image.
