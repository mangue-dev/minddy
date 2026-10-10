# Logical backups for custom or managed deployments

This advanced runbook covers source deployments and provider-managed database/Storage
backups. For the installed Docker reference profiles, start with
[reference operations](self-hosting-operations.md) and keep its Compose context.
Do not switch an OCI installation to a source server to perform acceptance.

## Command safety gates

`pnpm self-host:update`, `pnpm self-host:backup`, and
`pnpm self-host:restore` are read-only preflight wrappers for this runbook.
They validate the protected configuration and, where applicable, an existing
`SHA256SUMS` backup manifest. They deliberately do not infer an object-Storage
backend, write outage, target database, or restore destination. Use them to
make the responsibility boundary explicit, then execute the reviewed procedure
below.

```bash
pnpm self-host:backup -- --backup-dir /mnt/backup/minddy/20260819T120000Z-v0.10.19
pnpm self-host:update -- --from-release v0.10.19 --to-release v0.10.20 \
  --backup-dir /mnt/backup/minddy/verified-v0.10.19
pnpm self-host:restore -- --backup-dir /mnt/backup/minddy/verified-v0.10.19 \
  --confirm-blank-target
```

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
set -euo pipefail
export FROM_TAG=v0.9.4
export TO_TAG=v0.9.5
export MINDDY_REPO=/srv/minddy/source
export MINDDY_CURRENT_DIR=/srv/minddy/current
export TARGET_RELEASE_DIR="/srv/minddy/releases/$TO_TAG"
export MINDDY_ENV_FILE=/etc/minddy/minddy.env
export SUPABASE_COMPOSE_DIR=/srv/supabase/docker
export BACKUP_ROOT=/mnt/backup/minddy
export SUPABASE_DB_URL='postgresql://postgres:...@127.0.0.1:5432/postgres'
export MINDDY_PUBLIC_SUPABASE_URL='https://supabase.example.test'
export MINDDY_PUBLIC_SUPABASE_ANON_KEY='...'
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
4. Prepare the target release once; `MINDDY_PUBLIC_*` values are read when the container starts.
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
and restart after changing a `MINDDY_PUBLIC_*` variable; rebuilding is unnecessary.

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
git -C "$SUPABASE_COMPOSE_DIR" rev-parse HEAD > "$BACKUP_DIR/supabase-commit.txt"
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
pgsodium root key, preserve its complete key volume with the original numeric
ownership, permissions, ACLs and extended attributes. Retain the helper’s exact
PostgreSQL image for recovery. A different key mount needs a verified
backend-specific backup and restore procedure. Vault data cannot be recovered
without its matching key.

```bash
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/config/minddy.env"
install -m 0600 "$SUPABASE_COMPOSE_DIR/.env" "$BACKUP_DIR/config/supabase.env"
tar --exclude='./volumes' --exclude='./.git' \
  -C "$SUPABASE_COMPOSE_DIR" \
  -czf "$BACKUP_DIR/config/supabase-compose.tar.gz" .
cd "$SUPABASE_COMPOSE_DIR"
DB_CONTAINER="$(docker compose ps -q db)"
test -n "$DB_CONTAINER"
DB_CONFIG_VOLUME="$(docker inspect "$DB_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/etc/postgresql-custom"}}{{.Name}}{{end}}{{end}}')"
BACKUP_HELPER_IMAGE="$(docker inspect "$DB_CONTAINER" --format '{{.Image}}')"
printf '%s\n' "$BACKUP_HELPER_IMAGE" > "$BACKUP_DIR/config/postgres-image-id.txt"
if [ -z "$DB_CONFIG_VOLUME" ]; then
  echo "This key mount needs a verified backend-specific backup and restore procedure." >&2
  exit 1
fi
docker run --rm --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$DB_CONFIG_VOLUME,dst=/keys,readonly" \
  "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -czf - -C /keys . \
  > "$BACKUP_DIR/config/db-config.tar.gz"
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
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
curl --fail --silent --show-error "$MINDDY_PUBLIC_SUPABASE_URL/auth/v1/health"
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

Before the first database start, the sequence below restores the saved key-volume archive into a new volume and adds a unique `docker-compose.restore-keys.*.yml` to the installed Compose file list. Keep that override for every later operation. Legacy backups containing only `pgsodium_root.key` must use a verified recovery procedure that restores its original ownership, permissions and mount before startup; the sequence stops rather than generating replacement keys.

Prepare the saved upstream Supabase checkout first, with its original static files under `volumes/`, and point `RESTORE_SUPABASE_DIR` to its `docker` directory. The configuration archive deliberately excludes `volumes/`; it cannot provision this checkout by itself. The checks below require its saved commit and initialization files and reject existing database or Storage data. Keep public ingress blocked, and run the Bash sequence with `set -euo pipefail` so a failed check or extraction stops before startup.

```bash
set -euo pipefail
export RESTORE_DB_URL='postgresql://postgres:...@restore-db:5432/postgres'
export RESTORE_SUPABASE_URL='https://restore-supabase.example.test'
export RESTORE_APP_URL='https://restore-tickets.example.test'
export RESTORE_ANON_KEY='...'
export RESTORE_SERVICE_ROLE_KEY='...'
export RESTORE_SUPABASE_DIR=/srv/restore/supabase/docker
test "$(git -C "$RESTORE_SUPABASE_DIR" rev-parse HEAD)" = \
  "$(cat "$BACKUP_DIR/supabase-commit.txt")"
for file in volumes/db/realtime.sql volumes/db/webhooks.sql volumes/db/roles.sql \
  volumes/db/jwt.sql volumes/db/_supabase.sql volumes/db/logs.sql \
  volumes/db/pooler.sql volumes/api/kong.yml volumes/api/kong-entrypoint.sh \
  volumes/pooler/pooler.exs; do
  test -f "$RESTORE_SUPABASE_DIR/$file"
done
test ! -d "$RESTORE_SUPABASE_DIR/volumes/db/data"
if [ -e "$RESTORE_SUPABASE_DIR/volumes/storage" ]; then
  STORAGE_FIRST_OBJECT="$(find "$RESTORE_SUPABASE_DIR/volumes/storage" -type f -print -quit)"
  test -z "$STORAGE_FIRST_OBJECT"
fi
tar -C "$RESTORE_SUPABASE_DIR" \
  -xzf "$BACKUP_DIR/config/supabase-compose.tar.gz"
install -m 0600 "$BACKUP_DIR/config/supabase.env" "$RESTORE_SUPABASE_DIR/.env"
cd "$RESTORE_SUPABASE_DIR"
if [ -f "$BACKUP_DIR/config/pgsodium_root.key" ] && \
   [ ! -f "$BACKUP_DIR/config/db-config.tar.gz" ]; then
  echo "Legacy standalone key backup: restore its original ownership and mount before startup." >&2
  exit 1
fi
test -f "$BACKUP_DIR/config/db-config.tar.gz"
test -f "$BACKUP_DIR/config/postgres-image-id.txt"
export RESTORE_DB_CONFIG=minddy-logical-restored-db-config
if docker volume inspect "$RESTORE_DB_CONFIG" >/dev/null 2>&1; then
  echo "Refusing to overwrite an existing key restore volume." >&2
  exit 1
fi
RESTORE_KEYS_OVERRIDE="$(mktemp docker-compose.restore-keys.XXXXXX.yml)"
BACKUP_HELPER_IMAGE="$(cat "$BACKUP_DIR/config/postgres-image-id.txt")"
docker image inspect "$BACKUP_HELPER_IMAGE" >/dev/null
docker volume create "$RESTORE_DB_CONFIG"
docker run --rm -i --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$RESTORE_DB_CONFIG,dst=/keys" \
  "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -xzf - -C /keys \
  < "$BACKUP_DIR/config/db-config.tar.gz"
cat > "$RESTORE_KEYS_OVERRIDE" <<EOF
volumes:
  db-config:
    name: $RESTORE_DB_CONFIG
EOF
sh run.sh config add "$RESTORE_KEYS_OVERRIDE"
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
export MINDDY_PUBLIC_SUPABASE_URL="$RESTORE_SUPABASE_URL"
export MINDDY_PUBLIC_SUPABASE_ANON_KEY="$RESTORE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$RESTORE_SERVICE_ROLE_KEY"
export MINDDY_PUBLIC_APP_URL="$RESTORE_APP_URL"
pnpm install --frozen-lockfile
pnpm build
pnpm verify:supabase --db-url "$RESTORE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
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
| Browser has a stale public URL | Set the intended `MINDDY_PUBLIC_*` values in the protected runtime environment and recreate the application container with that environment. No image rebuild is required. |

## References

- [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Supabase Storage S3 backend](https://supabase.com/docs/guides/self-hosting/self-hosted-s3)
