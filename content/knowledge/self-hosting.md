---
id: self-hosting
title: Self-hosting minddy
summary: Choose a supported topology, install minddy, configure its services, and understand the operator boundary.
category: deployment
audience: both
tags: [self-hosting, self host, deployment, docker, supabase, installation, local, server, numo]
lastReviewed: 2026-08-27
---

minddy is open source under the GNU AGPL v3.0 only. The only supported distribution is the public `mangue-dev/minddy` repository and its immutable tagged release assets. Do not use a moving branch, an unofficial deployment repository, or a third-party image. The exact release row in `deploy/self-hosted/compatibility.json` is the source of truth for the supported image digest, Supabase Compose revision, host architectures, and Docker minimums.

## Install the desktop app first

The supported self-host flow starts in the signed minddy desktop app. Install it
from [minddy.app/download](https://www.minddy.app/download) before preparing a
local clone or server. Windows installs through Microsoft Store and has no
`.exe`; macOS and Linux use their platform downloads. Confirm that the app opens.
Its native **minddy** menu selects the data source. Press **Alt** to reveal that
menu on Windows or Linux; macOS uses its global menu bar.

## What a self-hosted instance contains

The application is a Node.js/Next.js production server. It requires a Supabase service that provides all four of PostgreSQL, Auth, Storage, and Realtime; PostgreSQL alone is not sufficient. Storage metadata and file bytes are both part of the deployment. The two supported server paths are:

- **Managed Supabase:** minddy runs on the operator's host and connects to a compatible Supabase Cloud or operator-managed Supabase project.
- **Complete Supabase:** minddy runs with the exact official Supabase Docker release pinned by the compatibility matrix. The upstream checkout is fetched separately and is overlaid by `deploy/self-hosted/compose.full.yml`; minddy does not maintain a fork.

The Supabase CLI local stack is for development, evaluation, and release acceptance only. It is not a production deployment. Production hosts are Linux `amd64` or `arm64` on the versions recorded by the selected release. A public installation needs an operator-controlled reverse proxy with HTTPS. A private installation may use an RFC1918 IPv4 address over HTTP only when it stays on a trusted LAN and no router port is forwarded.

Minddy Cloud is not a dependency or fallback. A self-hosted instance does not silently use Minddy Cloud URLs, keys, analytics, billing, email, VAPID, Apple, or managed AI infrastructure. Missing optional integrations stay disabled. The operator owns the host, OS, Docker, Supabase, DNS, TLS, firewall, access control, secrets, email, backups, restore drills, monitoring, incident response, and data-protection obligations.

## Prerequisites and secrets

For the local path, install Node.js 24, pnpm 10.28.0 through Corepack, Git, the Supabase CLI, and Docker with a running daemon. For a server, also install `psql` and meet the selected release's Docker Engine and Docker Compose minimums. Keep secrets in a host secret manager or a mode-0600 environment file; never commit `.env.local`, `deploy/self-hosted/.env`, database URLs, service-role keys, private keys, or backups.

The deployed application needs these values:

- `MINDDY_PUBLIC_APP_URL`: one absolute canonical origin with no path or trailing slash; it is used for account links, OAuth/MCP metadata, and callbacks.
- `MINDDY_PUBLIC_SUPABASE_URL` and `MINDDY_PUBLIC_SUPABASE_ANON_KEY`: the public API origin and anon key of the selected Supabase service.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only and required in production; never expose it to a browser.

The installer generates `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `CRON_SECRET`, and `AGENT_RUNNER_SECRET` when they are needed. Preserve encryption secrets when upgrading. Configure a complete set of external credentials for any optional capability; an incomplete set is disabled rather than guessed. Leave `MINDDY_MANAGED_AI=0` and `MINDDY_MANAGED_BILLING=0` for self-hosting.

## Numo, routines, and server execution

The reference server profiles include interactive Numo runs, scheduled routines, and the built-in Docker sandbox runner. They use:

```dotenv
AGENT_EXECUTION_BACKEND=self-hosted
AGENT_RUNNER_URL=http://agent-runner:6464
AGENT_CONTROL_ORIGIN=http://minddy:3000
```

The installer generates `AGENT_RUNNER_SECRET` and `CRON_SECRET`. No Vercel account or desktop computer needs to remain online. Each server-side run gets its own restricted Docker sandbox. Sandboxes do not receive the Docker socket, the private Supabase network, or instance secrets. The trusted runner does have Docker socket authority, so protect the host and never publish port 6464 or the runner secret. `AGENT_EXECUTION_BACKEND=local` is for an explicitly desktop-local run; `vercel` is an operator-owned alternative, not an implicit self-host dependency.

## Local installation

Use a clean clone for a local single-user instance:

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

Open **minddy > Connect to a Server… > Run local minddy on this computer** and
select the clone. On Windows or Linux, press **Alt** first. The app invokes the
local launcher with browser navigation disabled, starts the minimal Supabase
stack, applies migrations and Storage configuration, builds minddy when needed,
waits for health, and opens sign-up in its own window. It owns shutdown and later
restarts. A terminal-owned `pnpm self-host:local` process is a troubleshooting
fallback only and must be stopped before the app can reclaim the folder.

`supabase db reset --local` destroys local data and is only for resetting an
evaluation stack, never for recovery.

## Server installation

For the normal reference deployment, run `pnpm self-host:install` from the tagged release directory. The guided installer asks for the mode, app origin, administrator, and selected optional capabilities; generates secrets; creates `deploy/self-hosted/.env` with mode 0600; starts the selected Compose profile; and runs the idempotent Supabase bootstrap. Prefer the managed profile when Supabase already exists. Use the complete profile only with the checksum-verified, commit-pinned official Supabase checkout.

For automation, provide every input explicitly. Use the immutable official GHCR digest from the matching GitHub Release manifest, never a moving tag:

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image 'ghcr.io/mangue-dev/minddy@sha256:<release-digest>'
```

The four initial optional choices are `application-email`, `web-push`, `github`, and `gitlab`. Stripe, PostHog/Vercel analytics, Minddy-managed AI, Vercel domain management, and APNs/WNS release credentials are intentionally not initial self-host choices. GitHub and GitLab integrations currently target `github.com` and `gitlab.com`, not GitHub Enterprise Server or self-managed GitLab.

For a public server, configure DNS, ports 80/443, Caddy or another reverse proxy, and matching Auth Site URL and redirect URLs. For a trusted private IPv4 installation, use private HTTP, restrict access to the LAN, and never forward ports 80, 443, 8000, database ports, or container ports on the router. The complete profile exposes only the proxy publicly and binds PostgreSQL to loopback. Do not expose Studio, PostgreSQL, Supavisor, or internal services.

After installation, run the read-only diagnostic and resolve every failure:

```bash
pnpm self-host:doctor -- --mode managed --db-url 'postgresql://postgres:...'
```

It checks redacted configuration, release compatibility, containers, scheduler, agent runner, disk space, and—when given a database URL—migrations and Storage. Confirm the app origin, health endpoint, Auth email delivery, a test account, a project, an issue, an attachment, and a first restorable backup before declaring the instance ready.

To make a self-hosted server the desktop app's data source, open the native
**minddy** menu on macOS or press **Alt** to reveal it on Windows and Linux. Choose
**Connect to a Server…**, enter the application's HTTPS origin or a private IPv4
HTTP origin, and connect. The menu remains usable if that origin fails to load.
Choose **Use minddy Cloud** there to remove the custom source. Use **Run local
minddy on this computer** only for a local clone folder, not for a remote server;
stop a terminal-owned local launcher first. The source choice is stored on the
computer, and Cloud and self-hosted sessions remain separate.

## Supabase and application configuration

The selected Supabase API/Auth, Storage, Realtime, and PostgreSQL endpoints must be reachable from the application host. The bootstrap does not derive Supabase API keys from a database URL. Supply the public URL, anon key, service-role key, and a migration-capable database URL; it verifies required schemas, `extensions.vector`, Realtime publication, application configuration, Storage buckets, and Storage policies. Buckets are reconciled through the Storage API because SQL dumps do not contain object-store bytes.

Configure Supabase Auth with the exact app origin, `/auth/callback`, an operator-owned SMTP sender, and the versioned templates in `supabase/email-templates/`. Social sign-in credentials belong in Supabase. Application email is optional, but `console` is development-only. Scheduled requests use `Authorization: Bearer <CRON_SECRET>`; never log that header. Disable the scheduler during maintenance and restore.

## Moving data from Minddy Cloud

The Data section of account settings can export a JSON transfer file and restore it on another minddy instance. Import is additive: it preserves project, issue, page, and personal-data IDs when safe; conflicts receive new IDs and are reported. It does not transfer passwords, API keys, OAuth tokens, repository credentials, or billing subscriptions. Reconnect those services on the self-hosted destination. Export from Cloud, install and verify the destination, then import and review the reported conflicts.
