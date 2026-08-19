# Operate a self-hosted minddy instance

This runbook starts after [installation](self-hosting.md). It covers complete
backups, upgrades between consecutive releases, restore to a blank stack,
rollback decisions, and first-line diagnosis.

The commands use the official Docker Supabase layout as an example. A managed
Supabase project or another orchestrator is supported when its equivalent backup
captures the same database, Storage bytes, configuration, and immutable release.

## Operating invariants

A complete minddy backup contains all of the following from one write-consistent
point in time:

- PostgreSQL, including `auth`, `storage` metadata, and migration history;
- raw bytes of the Supabase Storage backend;
- application and Supabase configuration, including secrets and any pgsodium
  root key;
- the exact source commit and Supabase image versions that produced the data.

Neither a database dump nor an object-storage copy is sufficient alone. A
database dump contains Storage metadata but not file bytes; Storage bytes do not
contain object metadata, policies, accounts, or migrations.

Deploy immutable `vMAJOR.MINOR.PATCH` tags, never a moving branch. Upgrade from
each published tag to the next without skipping releases. Do not combine a
minddy release upgrade with a PostgreSQL major upgrade or a Supabase image
upgrade. Read release notes and migration diffs before every change.

## Set the operating context

Load secrets from the host's secret manager. The illustrative variables below
are paths and identifiers; do not paste real secrets into shell history or logs.
`BACKUP_ROOT` must be encrypted, off the production Storage disk, and large
enough for the database and Storage backend.

```bash
export FROM_TAG=v0.9.4
export TO_TAG=v0.9.5
export MINDDY_REPO=/srv/minddy/source
export MINDDY_CURRENT_DIR=/srv/minddy/current
export TARGET_RELEASE_DIR="/srv/minddy/releases/$TO_TAG"
export MINDDY_ENV_FILE=/etc/minddy/minddy.env
export SUPABASE_COMPOSE_DIR=/srv/supabase/docker
export BACKUP_ROOT=/mnt/backup/minddy
export SUPABASE_DB_URL='postgresql://postgres:...@127.0.0.1:5432/postgres'
export NEXT_PUBLIC_SUPABASE_URL='https://supabase.example.test'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='...'
export SUPABASE_SERVICE_ROLE_KEY='...'
```

## Before maintenance

An upgrade requires a write outage from the beginning of backup through all
verification. Put the web application, workers, and scheduler into maintenance,
then block public Supabase API access at the reverse proxy. Stopping only the
web application does not prevent authenticated clients from writing directly to
PostgREST or Storage.

Before the outage:

1. Announce the window and an abort deadline.
2. Confirm recent successful restoration, available disk space, and an
   off-host backup destination.
3. Read release notes and inspect changed dependencies, `.env.example`, and
   migrations.
4. Prepare and build the target release with its final `NEXT_PUBLIC_*` values.
5. Keep the current release and configuration restartable.

```bash
cd "$MINDDY_REPO"
git fetch --tags
git rev-parse --verify "${FROM_TAG}^{commit}"
git rev-parse --verify "${TO_TAG}^{commit}"
git merge-base --is-ancestor "$FROM_TAG" "$TO_TAG"
test "$(git -C "$MINDDY_CURRENT_DIR" rev-parse HEAD)" = \
  "$(git rev-parse "${FROM_TAG}^{commit}")"
git diff "$FROM_TAG..$TO_TAG" -- .env.example package.json pnpm-lock.yaml supabase/migrations
if ! test -d "$TARGET_RELEASE_DIR"; then
  git worktree add --detach "$TARGET_RELEASE_DIR" "$TO_TAG"
fi
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_RELEASE_DIR/.env.local"
cd "$TARGET_RELEASE_DIR"
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm build
```

Do not blindly copy `.env.example` during an upgrade. Preserve encryption
secrets, coordinate external callers before rotating webhook or cron secrets,
and rebuild after changing a `NEXT_PUBLIC_*` variable.

## Create a complete backup

After writes are blocked, create a unique backup directory and capture the
running source and image identities. A dirty Git checkout is an abort condition:
version the deployed change before backing it up.

```bash
export BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)-${FROM_TAG}"
export BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
install -d -m 0700 "$BACKUP_DIR/database" "$BACKUP_DIR/config"
git -C "$MINDDY_CURRENT_DIR" rev-parse HEAD > "$BACKUP_DIR/minddy-commit.txt"
git -C "$MINDDY_CURRENT_DIR" describe --tags --always --dirty > "$BACKUP_DIR/minddy-version.txt"
cd "$SUPABASE_COMPOSE_DIR"
docker compose images > "$BACKUP_DIR/supabase-images.txt"
docker compose ps > "$BACKUP_DIR/supabase-services.txt"
```

The Supabase CLI filters platform-owned roles and schemas. Migration history is
dumped separately because the regular schema dump omits it. `auth` and `storage`
data are required: they hold accounts and object metadata.

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

Check that every SQL file is non-empty and that `data.sql` has `COPY` sections
for `auth.users`, `storage.objects`, and minddy public tables. Do not continue
if it does not. `managed_policies.sql` preserves minddy policy changes on
Supabase-owned Storage and Realtime structures.

Copy the application environment, Supabase environment and Compose files,
reverse-proxy/TLS/DNS/scheduler definitions, Storage backend parameters, and
unversioned Auth/SMTP templates. Preserve permissions. If the stack uses a
pgsodium root key, archive it separately; Vault data cannot be recovered without
the matching key.

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

Stop Storage only after the database dump. At this point writes are blocked, so
the SQL metadata and copied bytes represent the same logical point.

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

For S3 or an S3-compatible backend, stop Storage and create an immutable raw
backend snapshot/version instead. Do not restore a database/Storage pair through
`/storage/v1/s3`: that API creates metadata that conflicts with restored
`storage.objects` records. Encrypt the backup, copy it off-host, and run the
checksum check again there. A backup is successful only after a test restore.

## Upgrade to the next release

The required order is **block writes → back up → migrate with target code →
deploy target → verify → reopen**. Never start the target application before
its migrations, and do not let the old release write after a migration unless
release notes explicitly declare backward compatibility.

```bash
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git -C "$MINDDY_REPO" rev-parse "${TO_TAG}^{commit}")"
test -d "$TARGET_RELEASE_DIR/.next"
cd "$SUPABASE_COMPOSE_DIR"
docker compose up -d storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
curl --fail --silent --show-error "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health"
```

The bootstrap applies only missing migrations, reconciles Storage buckets, and
verifies the result. Do not paste SQL into Studio or mark a failed migration as
applied. Start the target service while maintenance remains active. With a test
account, verify sign-in, project and issue create/edit, attachment upload and
download, Realtime in two sessions, and one harmless scheduled job. Then reopen
in this order: application, Supabase public access, scheduler.

## Restore to a blank environment

Restoration is destructive for its target and is not a merge procedure. Use an
empty Supabase stack, empty Storage backend, and a distinct restore application
origin. Keep its public proxy closed until verification completes.

1. Fetch the off-host backup and run `sha256sum --check SHA256SUMS`.
2. Provision the PostgreSQL major version and Supabase image versions in
   `supabase-images.txt`.
3. Restore Supabase configuration, secrets, and a pgsodium root key before
   useful startup. Do not boot a saved Vault database with a newly generated key.
4. Start the blank stack only to initialize platform structures.
5. Confirm the restore database URL and raw Storage backend are the intended
   empty targets.

```bash
export RESTORE_DB_URL='postgresql://postgres:...@restore-db:5432/postgres'
export RESTORE_SUPABASE_URL='https://restore-supabase.example.test'
export RESTORE_APP_URL='https://restore-tickets.example.test'
export RESTORE_ANON_KEY='...'
export RESTORE_SERVICE_ROLE_KEY='...'
export RESTORE_SUPABASE_DIR=/srv/restore/supabase/docker
install -d -m 0700 "$RESTORE_SUPABASE_DIR"
tar -C "$RESTORE_SUPABASE_DIR" \
  -xzf "$BACKUP_DIR/config/supabase-compose.tar.gz"
install -m 0600 "$BACKUP_DIR/config/supabase.env" "$RESTORE_SUPABASE_DIR/.env"
cd "$RESTORE_SUPABASE_DIR"
sh run.sh start
psql "$RESTORE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
  'select current_database(), inet_server_addr(), version()'
```

Restore PostgreSQL in the recorded order. An error means the target is not
compatible or not blank; read the first error and do not continue with a partial
restore.

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/roles.sql" \
  --file "$BACKUP_DIR/database/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$BACKUP_DIR/database/data.sql" \
  --dbname "$RESTORE_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/history_schema.sql" \
  --file "$BACKUP_DIR/database/history_data.sql" \
  --dbname "$RESTORE_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/managed_policies.sql" \
  --dbname "$RESTORE_DB_URL"
```

Stop target Storage and restore raw bytes. For the file backend, extraction is
allowed only after confirming the target path is empty and correct:

```bash
cd "$RESTORE_SUPABASE_DIR"
docker compose stop storage imgproxy
test -d "$RESTORE_SUPABASE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$RESTORE_SUPABASE_DIR/volumes" \
  -xzf "$BACKUP_DIR/storage-files.tar.gz"
docker compose up -d storage imgproxy
```

For S3, restore the raw snapshot into a new empty backend bucket and point the
restored Storage service to it. Do not re-import objects via the Storage API.
Check out the saved `minddy-commit.txt`, copy `minddy.env` into its clone as
`.env.local`, alter only isolated restore URLs, build, and verify.

```bash
export RESTORE_RELEASE_DIR="/srv/restore/minddy/releases/$BACKUP_ID"
git -C "$MINDDY_REPO" worktree add --detach "$RESTORE_RELEASE_DIR" \
  "$(cat "$BACKUP_DIR/minddy-commit.txt")"
cd "$RESTORE_RELEASE_DIR"
install -m 0600 "$BACKUP_DIR/config/minddy.env" .env.local
export NEXT_PUBLIC_SUPABASE_URL="$RESTORE_SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$RESTORE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$RESTORE_SERVICE_ROLE_KEY"
export NEXT_PUBLIC_APP_URL="$RESTORE_APP_URL"
pnpm install --frozen-lockfile
pnpm build
pnpm verify:supabase --db-url "$RESTORE_DB_URL" \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

Compare restored counts with `database/counts.json`, authenticate as a restored
user, inspect projects/issues, and download objects from every bucket. Record
the date, duration, observed RPO, and any deviation.

## Rollback and diagnosis

| Failure point | Safe action |
| --- | --- |
| Before migrations | Restart the source tag with its existing configuration. |
| After migrations, before writes reopen | Restart the old tag only when release notes confirm backward compatibility; otherwise restore the complete backup. |
| After writes reopen | Close writes. Restoring an earlier snapshot loses later writes unless they are separately exported. |
| Secret rotation or Storage backend change | Restore configuration, database, and Storage together; a code-only rollback cannot recover a lost key or object. |

Migrations are forward-only. Do not invent reverse SQL during an incident.
Preserve the original error, timestamp, and redacted logs. Never retain URLs with
passwords, JWTs, cookies, Authorization headers, or user content.

| Symptom | First action |
| --- | --- |
| Migration fails or a relation is missing | Return to maintenance, read the first `supabase db push` error, check disk/locks/URLs, then rerun bootstrap for the deployed tag. Never edit migration history manually. |
| Broad 401 responses after restore | Verify the Supabase JWT secret, anon key, service-role key, and app variables belong to the same stack. |
| Upload fails or object download is 404 | Run `pnpm verify:supabase`, then compare Storage policies and metadata against the raw backend snapshot. |
| Realtime does not connect | Verify the Realtime publication, JWT configuration, WebSocket proxy, and Realtime logs. |
| Cron job is idle or returns 401 | Check scheduler enablement, canonical app origin, and the current `CRON_SECRET` bearer without logging it. |
| Browser has a stale public URL | Rebuild with the intended `NEXT_PUBLIC_*` values and redeploy the build. |

## References

- [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Supabase Storage S3 backend](https://supabase.com/docs/guides/self-hosting/self-hosted-s3)
