---
{
  "id": "managed-or-source-installation",
  "locale": "en",
  "title": "Install with managed Supabase or from source",
  "summary": "Managed Supabase describes who operates the backend.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "deploy/self-hosted/compose.managed.yml"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "instance-configuration",
    "logical-and-provider-backups",
    "proxy-network-and-jobs"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/en/managed-or-source-installation-flow.svg",
      "alt": "Diagram: Your managed Supabase project. PostgreSQL, Auth, Storage, Realtime. OCI profile OR tagged source application. Profile-specific jobs and backup procedure.",
      "caption": "These components have distinct responsibilities. Your managed Supabase project. PostgreSQL, Auth, Storage, Realtime. OCI profile OR tagged source application. Profile-specific jobs and backup procedure.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "managed-or-source-installation-flow"
  ]
}
---

## Choose the application delivery {#managed-or-source-installation}

Managed Supabase describes who operates the backend. It can accompany the official OCI application profile or a source application server. Keep these deployments distinct in installation and acceptance records. Your backend must expose PostgreSQL, Auth, Storage and Realtime. For the guided managed OCI profile, supply a project on supabase.com, its public URL, anon and service-role keys and a PostgreSQL connection reachable from bootstrap tooling. Use your own project; Minddy Cloud credentials are not installation inputs.


![Diagram: Your managed Supabase project. PostgreSQL, Auth, Storage, Realtime. OCI profile OR tagged source application. Profile-specific jobs and backup procedure.](/documentation/en/managed-or-source-installation-flow.svg)

## Install the managed OCI profile {#managed}

From the verified release directory, run the guided command below. IMAGE is the digest verified in the compatibility article. Values containing ... are examples, not usable credentials. Obtain real values privately and avoid command history or shared logs containing secrets. The installer preserves an existing protected environment, includes its scheduler and runner and keeps optional services off until configured. Configure Auth SMTP and exact redirects separately in your Supabase project.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

## Complete a source deployment {#source}

For source delivery, install frozen dependencies from the tagged checkout, supply the required application and Supabase environment, run bootstrap, build and run the production server behind your reverse proxy. Set runtime MINDDY_PUBLIC_* values before startup. You provide a durable scheduler with the authenticated schedules documented in the network article; a source build alone supplies no running jobs. Verify database migrations and Storage, then exercise Auth, issue creation, file bytes and Realtime. Back up this instance through the logical/provider procedure. Do not test an OCI installation by switching to a source server.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
