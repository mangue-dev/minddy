---
{
  "id": "backups-and-restoration",
  "locale": "en",
  "title": "Backups and restoration",
  "summary": "Preserve database, Storage, configuration and encryption keys, choose a backup method and restore a complete set to a blank target.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H11",
    "H12",
    "H14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "content/knowledge/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "update-an-instance"
  ],
  "aliases": [
    "back-up-the-reference-instance",
    "self-hosting-operations",
    "logical-and-provider-backups",
    "restore-and-roll-back"
  ],
  "tags": [
    "Create a cold backup of the full filesystem profile",
    "Create a logical or provider-managed backup",
    "Restore a complete set to a blank target"
  ],
  "figures": [
    {
      "id": "restore-and-roll-back-flow",
      "kind": "diagram",
      "src": "/documentation/en/restore-and-roll-back-flow.svg",
      "alt": "Diagram: Verified complete off-host backup. Blank isolated target with matching versions. Restore database, raw bytes and keys together. Verify account/content/file bytes before opening.",
      "caption": "Read the stages in order. Verified complete off-host backup. Blank isolated target with matching versions. Restore database, raw bytes and keys together. Verify account/content/file bytes before opening.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Verified complete off-host backup"
          },
          {
            "title": "Blank isolated target with matching versions"
          },
          {
            "title": "Restore database, raw bytes and keys together"
          },
          {
            "title": "Verify account/content/file bytes before opening"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "restore-and-roll-back-flow"
  ]
}
---

A recoverable backup keeps the database, raw Storage bytes, configuration, encryption keys and application release together. Choose the filesystem, logical or provider procedure for your installed profile, preserve the matching set off-host and rehearse restoration to a blank target before relying on it. Restoring a backup can lose writes made after that backup.

## Create a cold backup of the full filesystem profile {#back-up-the-reference-instance}

Use this Linux procedure only for the full reference profile with the pinned official Supabase filesystem Storage layout. A physical restore requires the same CPU architecture and exact PostgreSQL image. Managed Supabase, S3 and source deployments use the logical/provider procedure. Announce a write outage and stop external workers. Keep the backup destination encrypted, large enough and outside active data. Never use `down --volumes` on the source. The backup captures database, Auth, Storage records and bytes, migrations, policies, Vault keys, configuration and release identities together.

### Set the installed Compose context {#context}

Replace the example release and paths with the instance actually installed. Set `MODE=full`. Preserve any existing restore override in every Compose command. Never run bare upstream `docker compose` because it omits the minddy overlay and protected environment. Do not source or print the environment. The following backup stops every service before copying PostgreSQL files.

```bash
set -euo pipefail
export MODE=full
export CURRENT_RELEASE_DIR=/srv/minddy/releases/vX.Y.Z
export SUPABASE_DIR=/srv/minddy/supabase
export MINDDY_ENV_FILE=/etc/minddy/instance.env
export BACKUP_ROOT=/mnt/backup/minddy
compose() {
  local files=()
  if [ "$MODE" = full ]; then
    files+=(-f "$SUPABASE_DIR/docker/docker-compose.yml")
  fi
  files+=(-f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.$MODE.yml")
  if [ -n "${RESTORE_OVERRIDE:-}" ]; then
    files+=(-f "$RESTORE_OVERRIDE")
  fi
  if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
    files+=(-f "$RUNNER_FIX_OVERRIDE")
  fi
  docker compose --env-file "$MINDDY_ENV_FILE" "${files[@]}" "$@"
}
compose ps
```

### Seal the matching set {#backup}

Run the cold-copy sequence below while all writes remain stopped. It records the source and image identities, archives upstream filesystem data and the `db-config` key volume and preserves the deployment files and protected environment. A `db-config` lookup failure is an abort condition. Preserve release assets and OCI digests; retain the database image by digest for restoration. A backup containing the root key and ciphertext relies on its outer encryption and access controls for confidentiality.

```bash
export BACKUP_DIR="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$BACKUP_DIR"
install -d -m 0700 "$BACKUP_DIR"
compose ps --format json > "$BACKUP_DIR/services.json"
compose images --format json > "$BACKUP_DIR/images.json"
git -C "$CURRENT_RELEASE_DIR" rev-parse HEAD > "$BACKUP_DIR/source-commit.txt"
git -C "$SUPABASE_DIR" rev-parse HEAD > "$BACKUP_DIR/supabase-commit.txt"
DB_CONTAINER="$(compose ps -q db)"
test -n "$DB_CONTAINER"
DB_CONFIG_VOLUME="$(docker inspect "$DB_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/etc/postgresql-custom"}}{{.Name}}{{end}}{{end}}')"
test -n "$DB_CONFIG_VOLUME"
BACKUP_HELPER_IMAGE="$(docker inspect "$DB_CONTAINER" --format '{{.Image}}')"
printf '%s\n' "$BACKUP_HELPER_IMAGE" > "$BACKUP_DIR/postgres-image-id.txt"
STORAGE_CONTAINER="$(compose ps -q storage)"
test -n "$STORAGE_CONTAINER"
STORAGE_VOLUME="$(docker inspect "$STORAGE_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/storage"}}{{.Name}}{{end}}{{end}}')"
compose stop
sudo tar --numeric-owner --acls --xattrs -C "$SUPABASE_DIR" \
  -czf "$BACKUP_DIR/supabase-docker.tar.gz" docker
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/instance.env"
docker run --rm --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$DB_CONFIG_VOLUME,dst=/keys,readonly" \
  "$BACKUP_HELPER_IMAGE" -czf - -C /keys . > "$BACKUP_DIR/db-config.tar.gz"
if [ -n "$STORAGE_VOLUME" ]; then
  docker run --rm --network none --user 0:0 --entrypoint tar \
    --mount "type=volume,src=$STORAGE_VOLUME,dst=/objects,readonly" \
    "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -czf - -C /objects . \
    > "$BACKUP_DIR/storage-volume.tar.gz"
fi
tar -C "$CURRENT_RELEASE_DIR" -czf "$BACKUP_DIR/deployment.tar.gz" deploy/self-hosted
if [ -n "${RESTORE_OVERRIDE:-}" ]; then
  install -m 0600 "$RESTORE_OVERRIDE" "$BACKUP_DIR/source-volume-override.yml"
fi
if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
  test -n "${RUNNER_FIX_DIR:-}"
  install -m 0600 "$RUNNER_FIX_OVERRIDE" "$BACKUP_DIR/runner-fix-override.yml"
  tar -C "$RUNNER_FIX_DIR" -czf "$BACKUP_DIR/runner-fix-files.tar.gz" \
    agent-runner.mjs agent-runner-storage.mjs SHA256SUMS Dockerfile.agent-sandbox sandbox-image.txt functions-bundle.json functions-bundle.tagged.json
  docker image save "$(cat "$RUNNER_FIX_DIR/sandbox-image.txt")" | gzip > "$BACKUP_DIR/runner-sandbox-image.tar.gz"
fi
sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR/supabase-docker.tar.gz"
(
  cd "$BACKUP_DIR"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum --check SHA256SUMS
)
```

### Verify off-host and rehearse restoration {#verify}

Copy the sealed set to an independent disk or host and verify `SHA256SUMS` there. A second copy on the same host is insufficient protection against host loss. Keep TLS certificate storage separately if your retention policy requires it. For backup-only maintenance, restart with `compose up -d --wait` after verifying the sealed copy. Before calling the backup usable, restore it to a blank isolated target, authenticate including MFA, inspect retained issues and download attachments with matching SHA-256. Keep the matching historical keys.

If the instance uses the pinned runner workaround, preserve `RUNNER_FIX_OVERRIDE` and `RUNNER_FIX_DIR` alongside any restore override. The additional files are part of the matching recovery set. Restore their absolute paths, or deliberately update both mounts to the restored location, before starting the runner.

The cold-backup command also detects a filesystem Storage named volume and archives its bytes separately. A bind mount remains covered by `supabase-docker.tar.gz`. Neither case covers an S3/provider backend.

## Create a logical or provider-managed backup {#logical-and-provider-backups}

Use this procedure for source, managed database or custom Storage deployments. Keep the database, raw Storage and proxy commands mapped to the same installed instance. The `self-host:backup`, `self-host:update` and `self-host:restore` commands are read-only safety gates, not backup, deployment or restoration. A complete backup contains PostgreSQL including auth, storage metadata and migration history, raw Storage bytes, protected configuration and keys and the exact source/Supabase identities from one write-consistent point.

### Provider-managed Supabase {#provider}

For Supabase managed by a provider, record the project, database version, backup or snapshot identifier and its recovery point. Close minddy, workers and scheduled writes, then use the provider’s supported consistency or maintenance controls for direct Auth, PostgREST and Storage writes. If those controls are unavailable, record that limit; stopping the application alone is insufficient. Use the SQL exports below only when your database role and provider support them, including Auth, Storage metadata, migration history and managed policies. Preserve raw object bytes using the provider-supported export or immutable backend snapshot separately from SQL. Preserve minddy’s protected environment and encryption keys, plus the Auth/SMTP, URL, proxy and job settings you control. Platform roles and `pgsodium` keys may be provider-owned: do not pretend they are local files. The following `SUPABASE_COMPOSE_DIR`, `docker compose`, `supabase.env`, `pgsodium` and filesystem tar blocks apply only to an operator-controlled Supabase backend. Validate the provider’s complete restore into a separate empty project before relying on the copy. No provider backup/restore was executed for this documentation revision.

### Block writes and export SQL {#outage}

Close the application, workers, scheduler and public Supabase API. Direct PostgREST and Storage writes remain possible if you stop only the web app. Set `SUPABASE_DB_URL` privately and `BACKUP_DIR` to a new encrypted destination. Run the SQL exports below with the selected release tooling. Confirm every SQL file is non-empty and `data.sql` includes `COPY` sections for `auth.users`, `storage.objects` and application tables. The regular schema dump omits migration history, so its two separate exports are mandatory. Preserve managed Storage and Realtime policies.

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

### Preserve raw bytes and configuration {#bytes}

For operator-controlled filesystem Storage, stop storage and `imgproxy` after the SQL dump and archive the backend directory with numeric owners, ACLs and extended attributes. For S3, create an immutable raw backend snapshot/version instead. Never restore via `/storage/v1/s3`: it creates conflicting metadata. Managed providers control platform roles and filesystem access; use their supported backup and restore process and record its scope. Copy application/Supabase configuration, proxies, jobs, Auth templates, SMTP and any `pgsodium` root key privately. Include `MINDDY_DATA_ROOT_KEY` and retained encryption secrets. Database SQL alone does not contain attachment bytes.

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

### Seal and test the backup {#logical-and-provider-backups-verify}

Generate and verify `SHA256SUMS` over the complete set, encrypt it, copy it off-host and verify again there. Record release and image identities, object counts and sample file hashes. A successful export is not a restore proof. Rehearse a blank-target restore using the saved versions and configuration before relying on the set; report provider limitations explicitly.

## Restore a complete set to a blank target {#restore-and-roll-back}

Restoration is destructive for its target and is not a merge. Fetch the sealed off-host backup, verify `SHA256SUMS` and retain the source data unchanged. Keep target public ingress, scheduler and external workers stopped. Full-profile physical restoration needs the saved architecture and exact PostgreSQL image. Obtain the saved source tag and pinned upstream in new directories and install frozen tooling. Confirm no target database data directory, Storage objects or `db-config` volume exists. Do not run ordinary installer/bootstrap over an empty physical restore target.


![Diagram: Verified complete off-host backup. Blank isolated target with matching versions. Restore database, raw bytes and keys together. Verify account/content/file bytes before opening.](/documentation/en/restore-and-roll-back-flow.svg)

### Restore full-profile filesystem data {#physical}

Use the complete physical sequence below with new unused paths and volume names. It removes stopped source containers without deleting their volumes, extracts cold PostgreSQL and Storage together, restores `db-config` with the saved image and compares that image before starting PostgreSQL. Edit only target paths, public origins and Auth redirects in the protected restored environment. Preserve JWT, passwords, Vault and application keys and saved image/release identity. Keep `RESTORE_OVERRIDE` for every later operation; omitting it can select source volumes. Recompile the offline main function, start dependencies and application/runner and check maintenance readiness before reopening.


Before the first `compose down`, define the source instance’s [installed Compose context](/docs/backups-and-restoration#context), including its existing override.

When `storage-volume.tar.gz` exists, restore it into a new Linux named volume and attach that exact volume through the persistent restore override before starting Storage. The empty-target guard also applies to this volume.

```bash
compose down
export CURRENT_RELEASE_DIR=/srv/minddy/releases/saved-source
export SUPABASE_DIR=/srv/minddy/supabase-restored
export MINDDY_ENV_FILE=/etc/minddy/restored.env
export RESTORE_OVERRIDE=/etc/minddy/restore-volumes.yml
export RESTORE_DB_CONFIG=minddy-restored-db-config
(cd "$BACKUP_DIR"; sha256sum --check SHA256SUMS)
test ! -d "$SUPABASE_DIR/docker/volumes/db/data"
test -z "$(find "$SUPABASE_DIR/docker/volumes/storage" -type f -print -quit 2>/dev/null)"
if docker volume inspect "$RESTORE_DB_CONFIG" >/dev/null 2>&1; then
  echo "Refusing to overwrite an existing restore volume." >&2
  exit 1
fi
sudo tar --numeric-owner --acls --xattrs -xzf "$BACKUP_DIR/supabase-docker.tar.gz" \
  -C "$SUPABASE_DIR"
install -m 0600 "$BACKUP_DIR/instance.env" "$MINDDY_ENV_FILE"
if [ -f "$BACKUP_DIR/runner-fix-files.tar.gz" ]; then
  : "${RUNNER_FIX_DIR:?Set the new absolute restore runner tooling directory}"
  : "${RUNNER_FIX_OVERRIDE:?Set its new absolute restore runner override path}"
  test "$RUNNER_FIX_OVERRIDE" = "$RUNNER_FIX_DIR/compose.runner-fix.yml"
  test ! -e "$RUNNER_FIX_DIR"
  sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
  tar -xzf "$BACKUP_DIR/runner-fix-files.tar.gz" -C "$RUNNER_FIX_DIR"
  (cd "$RUNNER_FIX_DIR"; sha256sum --check SHA256SUMS)
  gzip -dc "$BACKUP_DIR/runner-sandbox-image.tar.gz" | docker image load
  export RUNNER_SANDBOX_IMAGE="$(cat "$RUNNER_FIX_DIR/sandbox-image.txt")"
  docker image inspect "$RUNNER_SANDBOX_IMAGE" >/dev/null
  install -m 0600 "$BACKUP_DIR/runner-fix-override.yml" \
    "$RUNNER_FIX_DIR/compose.runner-fix.source.yml"
  cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: $RUNNER_SANDBOX_IMAGE
    volumes:
      - $RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro
      - $RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro
EOF
  chmod 0600 "$RUNNER_FIX_OVERRIDE"
fi
cat > "$RESTORE_OVERRIDE" <<EOF
volumes:
  db-config:
    name: $RESTORE_DB_CONFIG
  deno-cache:
    name: minddy-restored-deno-cache
  caddy_data:
    name: minddy-restored-caddy-data
  caddy_config:
    name: minddy-restored-caddy-config
EOF
compose() {
  local files=(
    -f "$SUPABASE_DIR/docker/docker-compose.yml"
    -f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.full.yml"
    -f "$RESTORE_OVERRIDE"
  )
  if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
    files+=(-f "$RUNNER_FIX_OVERRIDE")
  fi
  docker compose --env-file "$MINDDY_ENV_FILE" "${files[@]}" "$@"
}
BACKUP_HELPER_IMAGE="$(cat "$BACKUP_DIR/postgres-image-id.txt")"
docker image inspect "$BACKUP_HELPER_IMAGE" >/dev/null
docker volume create "$RESTORE_DB_CONFIG"
docker run --rm -i --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$RESTORE_DB_CONFIG,dst=/keys" \
  "$BACKUP_HELPER_IMAGE" -xzf - -C /keys < "$BACKUP_DIR/db-config.tar.gz"
if [ -f "$BACKUP_DIR/storage-volume.tar.gz" ]; then
  export RESTORE_STORAGE_VOLUME=minddy-restored-filesystem-storage
  if docker volume inspect "$RESTORE_STORAGE_VOLUME" >/dev/null 2>&1; then
    echo "Refusing to overwrite an existing Storage restore volume." >&2
    exit 1
  fi
  docker volume create "$RESTORE_STORAGE_VOLUME"
  docker run --rm -i --network none --user 0:0 --entrypoint tar \
    --mount "type=volume,src=$RESTORE_STORAGE_VOLUME,dst=/objects" \
    "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -xzf - -C /objects \
    < "$BACKUP_DIR/storage-volume.tar.gz"
  cat >> "$RESTORE_OVERRIDE" <<EOF
  $RESTORE_STORAGE_VOLUME:
    external: true
services:
  storage:
    volumes:
      - $RESTORE_STORAGE_VOLUME:/var/lib/storage
EOF
fi
compose create db
test "$(docker inspect "$(compose ps --all -q db)" --format '{{.Image}}')" = \
  "$BACKUP_HELPER_IMAGE"
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
if [ -f "$BACKUP_DIR/runner-fix-files.tar.gz" ]; then
  install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" \
    "$CURRENT_RELEASE_DIR/deploy/self-hosted/functions-bundle.json"
fi
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
compose up -d --wait minddy agent-runner
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

### Restore managed or source backups {#logical}

For logical restoration, provision a blank stack with recorded PostgreSQL/Supabase versions and the matching configuration/keys. Confirm the target database and raw Storage destination before executing SQL. Restore roles, schema and data in one transaction, then migration history and managed policies. Stop target Storage and restore raw filesystem bytes or the S3 snapshot into a new empty backend. Do not upload through the Storage API. Managed providers require their supported restore workflow rather than filesystem commands. Check out the saved application commit and preserve its keys while changing isolated target origins.


The following logical extraction, `run.sh` and filesystem Storage commands are only for an operator-controlled backend. For provider-managed Supabase, restore database and raw object bytes into an empty provider target using its supported process, then configure and start minddy using the [source installation procedure](/docs/installation#source). Do not run local Compose commands for a supabase.com project.

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

```bash
cd "$RESTORE_SUPABASE_DIR"
docker compose stop storage imgproxy
test -d "$RESTORE_SUPABASE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$RESTORE_SUPABASE_DIR/volumes" \
  -xzf "$BACKUP_DIR/storage-files.tar.gz"
docker compose up -d storage imgproxy
```

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


After the source build and verification above, start the recovered application with `pnpm start` or the recorded process supervisor from the [source installation procedure](/docs/installation#source). Keep public ingress and jobs closed until the checks below pass.

### Prove recovery before relying on it {#restore-and-roll-back-verify}

Compare recorded database/object counts. Authenticate with the restored account and MFA, read encrypted project/issue/page content and download objects from every bucket with matching SHA-256. Check restored integrations, revoked keys, Realtime, jobs, OAuth/MCP and callback origins. Record destination paths, volumes, versions, elapsed time and observed data loss window. After migration failure, use the matching pre-update set for rollback. Reopening writes after backup introduces later changes that a rollback can lose. Never invent reverse migrations or claim a successful restore from healthy containers alone.
