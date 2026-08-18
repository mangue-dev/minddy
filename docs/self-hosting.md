# Self-host minddy

minddy relies on a complete Supabase stack: PostgreSQL, Auth, Storage and
Realtime. A PostgreSQL database alone is not enough: migrations use
schemes `auth`, `storage`, `realtime` and `extensions`, and the application calls
the Auth and Storage APIs.

After initial installation, use the
[`runbook d'exploitation`](self-hosting-operations.md) to save,
update, restore and diagnose the instance. He points out the windows
of unavailability and irreversible operations before their orders.

Supabase is the **only mandatory infrastructure**. The minimum configuration
of a public server contains its canonical origin and the three Supabase accesses:

```dotenv
NEXT_PUBLIC_APP_URL=https://tickets.example.test
NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.test
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
```

In development, `NEXT_PUBLIC_APP_URL` can remain empty and is then worth
`http://localhost:3000`. It must be explicit on a public server: it
powers invite links, OAuth/MCP and GitLab webhooks, without ever
fall back on a URL from the minddy infrastructure. `NEXT_PUBLIC_SITE_NAME` and
`NEXT_PUBLIC_CONTACT_EMAIL` personalize public brand values.
`NEXT_PUBLIC_PRODUCT_FEEDBACK_URL` adds, if the operator wishes, a link
external “Share feedback”; missing, this link is hidden.

With this configuration, the core (accounts, projects, tickets, objectives, pages,
feedback, API and Supabase storage) starts. Stripe, OpenRouter, Vercel,
PostHog, Resend, pushes and forges are neither contacted nor necessary.

The versioned configuration for the local stack is
[`supabase/config.toml`](../supabase/config.toml). For an infrastructure
remote, start from the official self-hosted Supabase distribution and ensure
that these four services are exposed before launching the bootstrap.

## Prerequisites

- Node.js 24 and pnpm 10;
- the [Supabase CLI](https://supabase.com/docs/guides/local-development) in the
  `PATH` ;
- `psql` in the `PATH` (the bootstrap uses it to control the result);
- Docker for local mode, or a self-hosted Supabase stack already started;
- for remote mode, a PostgreSQL URL of a schema owner role,
  the public URL of the Supabase API, its anon key and its `service_role` key.

Never pass the `service_role` key to the browser or Git. She is not
necessary only for the shell which launches this procedure and is copied to `.env.local`,
a file ignored by Git.

## Local stack, from zero

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm bootstrap:supabase
pnpm dev
```

`bootstrap:supabase` starts the stack defined in `supabase/config.toml`, valid
the names and order of the baseline and pending migrations, applies the migrations,
completes `.env.local` and then checks the database and the Storage API. It generates the
application secrets that protect webhooks and encrypted data; the
Supabase keys are retrieved from `supabase status`.

The bootstrap can generate optional application secrets to prepare the
corresponding functions, but their mere presence does not activate them. In
In particular, managed services require `MINDDY_MANAGED_AI=1` or
`MINDDY_MANAGED_BILLING=1`, Resend requires `EMAIL_PROVIDER=resend`, and Vercel
Sandbox requires `AGENT_EXECUTION_BACKEND=vercel`.

## Optional abilities and replacements

| Capacity | Nature | Configuration / replacement |
| --- | --- | --- |
| Base, Auth, Realtime, Storage | obligatory | Complete Supabase battery; production storage remains the Storage of this instance |
| AI | replaceable | BYOK or local endpoint; OpenRouter quota managed only with `MINDDY_MANAGED_AI=1` |
| Code Officer | replaceable | Local Runtime, or Vercel Sandbox explicitly chosen with `AGENT_EXECUTION_BACKEND=vercel`; outside Vercel, `NEXT_PUBLIC_APP_URL` is also required to attach the control plane of this instance |
| Background jobs | replaceable | Any HTTP scheduler on `/api/cron/*`, protected by `CRON_SECRET`; `vercel.json` provides Vercel Cron adapter |
| Email Auth | replaceable | SMTP configured in Supabase/GoTrue |
| Application email | replaceable | `EMAIL_PROVIDER=resend` + key + senders, or `console` in development |
| Domains Vercel, Vercel Analytics/Speed ​​Insights, PostHog, Web Push, APNs, GitHub, GitLab, Stripe | optional | Absent = interface hidden/inactive and no network calls; Vercel telemetry requires `NEXT_PUBLIC_VERCEL_ANALYTICS=1` |

The provided forge adapters explicitly target `github.com` and
`gitlab.com`. GitHub Enterprise Server and self-hosted GitLab instances do not
are not selected silently: they are not yet supported and
require an alternative provider.

The senders, PostHog hosts, VAPID subject and bundle APNs have not voluntarily
no default value on a self-hosted instance: they must describe
the operator's infrastructure, never that of minddy.

### PostHog

PostHog remains in the public heart as an optional analytics provider. He doesn't
is not used to distinguish an edition and never contacts Minddy's project
Cloud from a self-hosted instance.

| Fashion | Configuration | Behavior |
| --- | --- | --- |
| Disabled (default) | No PostHog pair | No browser client or server is built, the `posthog-js` chunk is not downloaded and tracking calls are a no-op. |
| Operator PostHog | `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST`, and/or `POSTHOG_API_KEY` + `POSTHOG_HOST` | Only surfaces whose pair is complete transmit to the PostHog Cloud or the self-hosted endpoint chosen by the operator. Half configurations are never mixed. |
| Minddy Cloud | Minddy Cloud Project Keys; historical EU ingestion host is kept by the official profile | Same public code, separate operating configuration. No PostHog read or administration secrets are required by the application. |

The browser path respects the choice of cookies: before choice it works
in memory, an agreement allows persistence and a refusal cuts all capture
of the browser. The server path covers business facts that also exist
without browser (MCP, webhooks, crons); it doesn't write any cookies, goes through a
closed catalog and only accepts sanitized metadata. The operator is
responsible for documenting its destination, legal basis and retention.

The `vercel.json` versions the times used by the hosted product in order to
that a production deployment does not lose its jobs. Without `CRON_SECRET`, the
routes respond 401 before opening the database or an external service. An operator
Vercel who does not want any invocation must remove the `crons` section from his
deployment configuration. With another scheduler, call the same
routes with `Authorization: Bearer <CRON_SECRET>`.

To preserve existing deployments, old minddy values (choice
managed services, Resend, Sandbox, public telemetry and push identities)
remain recognized only when Vercel and the canonical origin
`*.minddy.app` together identify the official cloud. Vercel alone, a secret
alone or another domain never activates this compatibility profile. The
Explicit variables above remain the configuration of any other instance.

The command can be re-executed: `supabase db push` only applies migrations
absent and the values already present in `.env.local` are never
replaced. To start from an empty local base, the action is explicitly
destructive: `supabase db reset --local`, then restart the bootstrap.

## Remote self-hosted stack

The remote stack must be started and its APIs reachable. Export the values
before running the command:

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://supabase.example.test"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="…"
export SUPABASE_SERVICE_ROLE_KEY="…"
export SUPABASE_DB_URL="postgresql://postgres:…@db.example.test:5432/postgres"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL"
```

The script cannot derive HTTP keys from a PostgreSQL URL; he refuses
so start if one of these values is missing. After the migrations, it
control `vector` in the `extensions` schema, the required Supabase schemas, the
Realtime publication, `app_config` tables and values, active buckets and
the upload policy. Buckets are created or updated by the Storage API: they
are not part of a PostgreSQL schema dump. The historical bucket `avatars`, unused by minddy, is
deleted only if empty; if it contains objects, the command refuses
with a diagnosis so that they can be archived or consciously deleted.

## Transition from history before baseline

The repository consolidated the 211 historical migrations into a schema baseline and
an initial data migration. A **new instance** applies directly
these two files. For an existing instance, do not run `db push` before
to have saved the database and replaced its migration history: its schema
is already up to date, only `supabase_migrations.schema_migrations` must forget the
210 old versions and keep the baseline version
`20270106090000`.

Do this in a maintenance window, after a backup
restorable and after checking the absence of drift (`supabase db diff` or
a comparison with the production instance):

```bash
# Without --apply: verify that the instance carries exactly the 211 expected versions.
# --linked uses the project selected by `supabase link`.
pnpm repair:squashed-migrations -- --linked

# Remove only the 210 historical records; neither schema nor data changes.
pnpm repair:squashed-migrations -- --linked --apply
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL"
```

The script stops if the instance is not exactly at the old level
historical. Once the repair is made, the bootstrap does not reapply the
baseline and can continue normally with future migrations.

If the team had applied one or more SQL migrations by hand, the
register may be incomplete even though the diagram is present. Compare
first the diagram with the baseline and correct the desired deviations in a
versioned migration. The explicit mode below then replaces the registry
by the baseline; the copied imprint avoids repairs between two changes
history:

```bash
supabase db diff --linked --schema public,extensions,storage
pnpm repair:squashed-migrations -- --linked --allow-manual-schema
pnpm repair:squashed-migrations -- --linked --allow-manual-schema --apply \
  --confirm-history '<displayed fingerprint>'
```

## Verification and testing

To check an already prepared instance without modifying its schema:

```bash
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

`pnpm test:bootstrap:supabase` automatically tests the integrity of migrations,
diagnostics and the second execution of the environment generator. The path
to exercise on a disposable battery is local mode: launch `pnpm bootstrap:supabase`
in a new clone, then a second time; both passes must succeed.
