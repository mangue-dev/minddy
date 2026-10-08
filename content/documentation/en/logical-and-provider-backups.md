---
{
  "id": "logical-and-provider-backups",
  "locale": "en",
  "title": "Create a logical or provider-managed backup",
  "summary": "Use this procedure for source, managed database or custom Storage deployments.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H12"
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
      "docs/self-hosting-logical-operations.md",
      "content/knowledge/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "back-up-the-reference-instance",
    "restore-and-roll-back"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Identify the actual backend {#logical-and-provider-backups}

Use this procedure for source, managed database or custom Storage deployments. Keep the database, raw Storage and proxy commands mapped to the same installed instance. The self-host:backup, self-host:update and self-host:restore commands are read-only safety gates, not backup, deployment or restoration. A complete backup contains PostgreSQL including auth, storage metadata and migration history, raw Storage bytes, protected configuration and keys and the exact source/Supabase identities from one write-consistent point.


## Provider-managed Supabase {#provider}

For Supabase managed by a provider, record the project, database version, backup or snapshot identifier and its recovery point. Close Minddy, workers and scheduled writes, then use the provider’s supported consistency or maintenance controls for direct Auth, PostgREST and Storage writes. If those controls are unavailable, record that limit; stopping the application alone is insufficient. Use the SQL exports below only when your database role and provider support them, including Auth, Storage metadata, migration history and managed policies. Preserve raw object bytes using the provider-supported export or immutable backend snapshot separately from SQL. Preserve Minddy’s protected environment and encryption keys, plus the Auth/SMTP, URL, proxy and job settings you control. Platform roles and pgsodium keys may be provider-owned: do not pretend they are local files. The following SUPABASE_COMPOSE_DIR, docker compose, supabase.env, pgsodium and filesystem tar blocks apply only to an operator-controlled Supabase backend. Validate the provider’s complete restore into a separate empty project before relying on the copy. No provider backup/restore was executed for this documentation revision.

## Block writes and export SQL {#outage}

Close the application, workers, scheduler and public Supabase API. Direct PostgREST and Storage writes remain possible if you stop only the web app. Set SUPABASE_DB_URL privately and BACKUP_DIR to a new encrypted destination. Run the SQL exports below with the selected release tooling. Confirm every SQL file is non-empty and data.sql includes COPY sections for auth.users, storage.objects and application tables. The regular schema dump omits migration history, so its two separate exports are mandatory. Preserve managed Storage and Realtime policies.

```bash
set -euo pipefail
export MINDDY_REPO=/srv/minddy/source
export MINDDY_CURRENT_DIR=/srv/minddy/current
export SUPABASE_COMPOSE_DIR=/srv/supabase/docker
export MINDDY_ENV_FILE=/etc/minddy/minddy.env
export BACKUP_ROOT=/mnt/backup/minddy
export FROM_TAG=v0.11.0
```

```bash
export BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)-${FROM_TAG}"
export BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
test ! -e "$BACKUP_DIR"
install -d -m 0700 "$BACKUP_DIR/database" "$BACKUP_DIR/config"
git -C "$MINDDY_CURRENT_DIR" rev-parse HEAD > "$BACKUP_DIR/minddy-commit.txt"
git -C "$MINDDY_CURRENT_DIR" describe --tags --always --dirty > "$BACKUP_DIR/minddy-version.txt"
cd "$SUPABASE_COMPOSE_DIR"
docker compose images > "$BACKUP_DIR/supabase-images.txt"
docker compose ps > "$BACKUP_DIR/supabase-services.txt"
```

```bash
cd "$MINDDY_REPO"
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/data.sql" --use-copy --data-only \
  -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/history_schema.sql" --schema supabase_migrations
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/history_data.sql" --use-copy --data-only \
  --schema supabase_migrations
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/export-managed-policies.sql \
  > "$BACKUP_DIR/database/managed_policies.sql"
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select jsonb_build_object(
    'auth.users', (select count(*) from auth.users),
    'public.projects', (select count(*) from public.projects),
    'public.issues', (select count(*) from public.issues),
    'public.attachments', (select count(*) from public.attachments),
    'storage.buckets', (select count(*) from storage.buckets),
    'storage.objects', (select count(*) from storage.objects)
  )::text
" > "$BACKUP_DIR/database/counts.json"
```

## Preserve raw bytes and configuration {#bytes}

For operator-controlled filesystem Storage, stop storage and imgproxy after the SQL dump and archive the backend directory with numeric owners, ACLs and extended attributes. For S3, create an immutable raw backend snapshot/version instead. Never restore via /storage/v1/s3: it creates conflicting metadata. Managed providers control platform roles and filesystem access; use their supported backup and restore process and record its scope. Copy application/Supabase configuration, proxies, jobs, Auth templates, SMTP and any pgsodium root key privately. Include MINDDY_DATA_ROOT_KEY and retained encryption secrets. Database SQL alone does not contain attachment bytes.

```bash
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/config/minddy.env"
install -m 0600 "$SUPABASE_COMPOSE_DIR/.env" "$BACKUP_DIR/config/supabase.env"
tar --exclude='./volumes' --exclude='./.git' \
  -C "$SUPABASE_COMPOSE_DIR" \
  -czf "$BACKUP_DIR/config/supabase-compose.tar.gz" .
cd "$SUPABASE_COMPOSE_DIR"
if docker compose exec -T db test -f /etc/postgresql-custom/pgsodium_root.key; then
  docker compose exec -T db cat /etc/postgresql-custom/pgsodium_root.key \
    > "$BACKUP_DIR/config/pgsodium_root.key"
  chmod 0600 "$BACKUP_DIR/config/pgsodium_root.key"
fi
```

```bash
cd "$SUPABASE_COMPOSE_DIR"
docker compose stop storage imgproxy
test -d "$SUPABASE_COMPOSE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$SUPABASE_COMPOSE_DIR/volumes" \
  -czf "$BACKUP_DIR/storage-files.tar.gz" storage
tar -tzf "$BACKUP_DIR/storage-files.tar.gz" > "$BACKUP_DIR/storage-files.list"
cd "$BACKUP_DIR"
find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
sha256sum --check SHA256SUMS
```

## Seal and test the backup {#verify}

Generate and verify SHA256SUMS over the complete set, encrypt it, copy it off-host and verify again there. Record release and image identities, object counts and sample file hashes. A successful export is not a restore proof. Rehearse a blank-target restore using the saved versions and configuration before relying on the set; report provider limitations explicitly.
