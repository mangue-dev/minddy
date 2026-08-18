# Operate a self-hosted minddy instance

This runbook begins **after** the installation described in
[`self-hosting.md`](self-hosting.md). It covers an update between two
consecutive published versions, a complete backup and restoration on
a blank Supabase battery. The examples assume an application and the
official Docker distribution of Supabase, but the invariants remain the
same with another orchestrator.

A minddy backup is only complete if it contains together:

- PostgreSQL, including Auth, Storage metadata and log history
  migration;
- the bytes of the Storage backend;
- the configuration and secrets of the Supabase application **and**;
- the exact version of the code and images deployed.

A PostgreSQL dump alone does not contain Storage files. A copy of the
Storage files alone contain neither their metadata nor their permissions.

## Supported versions policy

- An exploitable version is an immutable Git tag `vMAJEUR.MINEUR.CORRECTIF`.
  Do not deploy a mobile branch (`main`, `production`) nor an archive without
  its commit.
- Migrations are tested in the order of released versions. Go from one
  tag to the next published tag, without skipping. Repeat this runbook to catch up
  several versions.
- The last published version is the maintained version. The previous one is not
  kept only as a short rollback target, when migrations of the
  new tag are explicitly compatible with it. The fixes of
  security are applied to the latest version, not backported by default.
- Before `v1.0.0`, a minor version may change the configuration or request
  maintenance. After `v1.0.0`, a major version upgrade may require
  a dedicated procedure. In both cases, the release notes and the diff of
  migrations take precedence over this runbook.
- Update the Supabase and minddy distribution separately. Don't change
  at the same time minddy, the major version of PostgreSQL and the images
  Supabase: a breakdown would no longer have an isolatable cause. An upgrade
  major version of PostgreSQL follows the runbook of the Supabase version used.

## Variables used in commands

Adapt these paths once and keep PostgreSQL URLs out of history
of the shell. `BACKUP_ROOT` must be an encrypted volume, separate from the storage disk.
production, with enough space for base and storage.

```bash
export FROM_TAG=v0.9.4
export TO_TAG=v0.9.5
export MINDDY_REPO=/srv/minddy/source
export MINDDY_CURRENT_DIR=/srv/minddy/current
export TARGET_RELEASE_DIR="/srv/minddy/releases/$TO_TAG"
export MINDDY_ENV_FILE=/etc/minddy/minddy.env
export SUPABASE_COMPOSE_DIR=/srv/supabase/docker
export BACKUP_ROOT=/mnt/backup/minddy
export SUPABASE_DB_URL='postgresql://postgres:…@127.0.0.1:5432/postgres'
export NEXT_PUBLIC_SUPABASE_URL='https://supabase.example.test'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='…'
export SUPABASE_SERVICE_ROLE_KEY='…'
```

Do not prefix a command with secrets: they would appear in the line
order or logs. The exports above are illustrative; in
production, load them from the instance secrets manager.

## Before any maintenance

### Decide and announce the window

The safe procedure has a **write unavailability** of the start of the
saved at the end of the checks. Display a maintenance page and announce
the planned duration. Also block direct access to the public Supabase API:
stopping only the frontend does not prevent an already authenticated client from writing
in PostgREST or Storage.

Before the window:

1. prepare the new checkout, install its dependencies and build it
   with its final `NEXT_PUBLIC_*` variables;
2. read the notes of both versions and look at migrations, dependencies
   and the environment;
3. check disk capacity, off-host destination and latest
   trial restoration;
4. measure the duration of the last backup and set an abort point;
5. keep the previous binary or checkout and its configuration immediately
   restartable.

```bash
cd "$MINDDY_REPO"
git fetch --tags
git rev-parse --verify "${FROM_TAG}^{commit}"
git rev-parse --verify "${TO_TAG}^{commit}"
git merge-base --is-ancestor "$FROM_TAG" "$TO_TAG"
test "$(git -C "$MINDDY_CURRENT_DIR" rev-parse HEAD)" = \
  "$(git rev-parse "${FROM_TAG}^{commit}")"
git log --oneline "$FROM_TAG..$TO_TAG"
git diff --stat "$FROM_TAG..$TO_TAG"
git diff "$FROM_TAG..$TO_TAG" -- .env.example package.json pnpm-lock.yaml supabase/migrations
if ! test -d "$TARGET_RELEASE_DIR"; then
  git worktree add --detach "$TARGET_RELEASE_DIR" "$TO_TAG"
fi
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git rev-parse "${TO_TAG}^{commit}")"
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_RELEASE_DIR/.env.local"
cd "$TARGET_RELEASE_DIR"
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm build
```

Abort before unavailability if target tag is absent, if source tag
does not match the actually deployed commit, if a required variable does not have
of value, if the previous backup is not readable or if the free space
is insufficient.

### Classify environment changes

Compare `.env.example`, without blindly copying its values. Record for
each difference: addition, removal, renaming, default value, secret to
generate and component to restart.

- `NEXT_PUBLIC_*` is incorporated into the Next.js build: any modification imposes a
  new build, not just a reboot.
- The other application variables are read on the server side and impose the
  restart of the application and the workers concerned.
- The Supabase stack variables require recreating the service(s) that
  consume them. Check especially Auth, Storage, Realtime and proxy.
- Do not regenerate `GIT_TOKEN_ENCRYPTION_SECRET`,
  `AI_KEY_ENCRYPTION_SECRET` or `FEEDBACK_SSO_ENCRYPTION_SECRET` during a
  update: data already encrypted would become unreadable without
  dedicated rotation migration.
- A rotation of `CRON_SECRET`, OAuth/webhook keys or API keys requires a
  coordinated switching of their callers. A rotation of the JWT Supabase secret
  invalidates sessions and requires regenerating the keys that depend on them.
- Keep the old names still documented as aliases until the
  release notes authorize their removal.

## Complete and consistent backup

### 1. Create and identify the backup set

At the start of the window, put the application, its workers and the scheduler in
maintenance, then block the Supabase API to the reverse proxy. Leave PostgreSQL
available locally for dump.

```bash
export BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)-${FROM_TAG}"
export BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
install -d -m 0700 "$BACKUP_DIR/database" "$BACKUP_DIR/config"
cd "$MINDDY_CURRENT_DIR"
git rev-parse HEAD > "$BACKUP_DIR/minddy-commit.txt"
git describe --tags --always --dirty > "$BACKUP_DIR/minddy-version.txt"
cd "$SUPABASE_COMPOSE_DIR"
docker compose images > "$BACKUP_DIR/supabase-images.txt"
docker compose ps > "$BACKUP_DIR/supabase-services.txt"
```

The suffix `-dirty` is an abort reason: check in and version the files first.
changes deployed. Also keep in the operating log the time at
which the writes were blocked.

### 2. Sauvegarder PostgreSQL

The Supabase CLI applies the necessary filters to managed roles and schemas.
The two `history_*` files are separated because the normal schema dump does not include
not the `supabase_migrations` register. Do not remove `auth` data or
`storage`: they carry the accounts and metadata of the objects.

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

Immediately verify that all six files are non-empty and that `data.sql`
contains in particular `COPY` sections for `auth.users`, `storage.objects` and
minddy's `public` tables. An absence means that the URL or version of
CLI did not produce a full backup; do not continue with the update.

### 3. Back up secrets and configuration

Copy to `config/`, retaining permissions:

- `MINDDY_ENV_FILE` and configuration of the application service;
- `.env`, `docker-compose.yml`, stack overrides and `run.sh` scripts
  Supabase;
- configuration of the reverse proxy, DNS/TLS and scheduler;
- the image manifest, Storage backend parameters and templates
  Unversioned Auth/SMTP;
- the root key `pgsodium`, if the stack has one. With distribution
  Docker Supabase, control
  `/etc/postgresql-custom/pgsodium_root.key` in the `db` service and archive it
  separately. Without it, any Vault secrets are not recoverable.

For example, for the two main files:

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

Archive service, proxy and scheduler definitions in the same way
specific to your host. The `--exclude='./volumes'` is important: Storage is
saved separately, after stopping it, in the next step.

Do not leave this directory unencrypted after the window. Encrypt it with the tool
backup of the organization, send it off-host, verify its recovery,
then apply the expected retention time. A hash does not replace or
encryption or off-site copying.

### 4. Sauvegarder Storage

Stop the `storage` service **after** the base dump and before copying. The
writes are already blocked: the dump metadata and the bytes therefore have the
same logical point.

#### Backend file of the Docker distribution

The official edit is `volumes/storage`. Confirm the path in Compose
real; real; never use a guess for an archive command.

```bash
cd "$SUPABASE_COMPOSE_DIR"
docker compose stop storage imgproxy
test -d "$SUPABASE_COMPOSE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$SUPABASE_COMPOSE_DIR/volumes" \
  -czf "$BACKUP_DIR/storage-files.tar.gz" storage
tar -tzf "$BACKUP_DIR/storage-files.tar.gz" > "$BACKUP_DIR/storage-files.list"
```

#### Backend S3 ou compatible S3

Also stop `storage`, then create an immutable snapshot/version with the
supplier. Failing that, copy **the raw backend bucket** to a bucket of
backup with the backend identifiers and control source/destination with
`rclone check` or the provider's equivalent.

Do not use the S3-enabled endpoint `/storage/v1/s3` for a restore
physics coupled with the PostgreSQL dump: this endpoint itself creates
metadata, which would conflict with `storage.objects` restored since
the base. The snapshot must preserve the opaque internal keys of the backend.

### 5. Seal and control

```bash
cd "$BACKUP_DIR"
find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
sha256sum --check SHA256SUMS
du -sh "$BACKUP_DIR"
```

Copy the game off the host and redo `sha256sum --check` on the copy. A
backup is only declared successful after trial restoration; control of
hash only proves that the copied files have not changed.

Storage remains stopped at this point. For a backup without updating, restart
`storage` and `imgproxy`, check them, then reopen the accesses in order
reverse of their closure. For an update, continue below.

## Update to the next version

### Ordre obligatoire

The safe order is: **block writes → save → migrate the database with the
target code → deploy target application → verify → reopen**.

Never start the new application before its migrations. Don't let
no longer will the old application write during or after a migration whose
Backward compatibility is not explicitly announced.

### 1. Confirm the release prepared before the window

The preparation of the “Before any maintenance” section must have already created
and constructs an immutable directory or image. Don't pay for the download
dependencies or build during downtime. Just confirm
the artifact:

```bash
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git -C "$MINDDY_REPO" rev-parse "${TO_TAG}^{commit}")"
test -d "$TARGET_RELEASE_DIR/.next"
test -f "$TARGET_RELEASE_DIR/.env.local"
```

The build must receive production `NEXT_PUBLIC_*` values. Do not reuse
not a `.next` constructed for another origin or another Supabase instance.

### 2. After backup, apply migrations

This step modifies the base and may be **irreversible**. Only run it if
PostgreSQL and Storage have been backed up, the hashes are valid and the
off-host copy is accessible.

```bash
cd "$SUPABASE_COMPOSE_DIR"
docker compose up -d storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
```

First load the three Supabase variables into the shell. The `.env.local`
protected is the copy of the current environment created before the window; the
bootstrap only completes its missing values and never replaces a
existing secret. Its `--env-file` option voluntarily accepts only one file
located in the clone: do not directly pass a preserved environment to it
in `/etc`. Consciously report any new values in the data manager
secrets before activating the release.

The bootstrap executes `supabase db push`, reconciles the buckets and launches the
controls. Versioned SQL migrations take precedence; don't stick them by hand
in Studio and don't mark a migration `applied` to work around a failure.

If the repository has just moved from 211 migration history to baseline,
first follow the “Transition from pre-baseline history” section of
[`self-hosting.md`](self-hosting.md). This is an exceptional operation, never
a recurring update step.

### 3. Deploy and verify before reopening

Enable `TARGET_RELEASE_DIR` in service manager, recreate the
services whose environment has changed and start the new application without
remove the maintenance page. Then execute:

```bash
cd "$TARGET_RELEASE_DIR"
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
curl --fail --silent --show-error "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health"
```

With a test account, then check: connection/disconnection, opening
of a project, creation and modification of a ticket, upload then download
of an attachment, real-time update in two sessions and execution of a
background work without dangerous effects. Check application logs, Auth,
PostgREST, Realtime and Storage during these actions.

First reopen the application, then Supabase public access and finally
the scheduler. Note the time, tag, commit, migrations applied,
downtime and backup ID in log
of exploitation.

## Restore to a pristine environment

The restoration is **destructive for its target** and imposes unavailability
total. Use a new stack without users or objects. If the target
already contains data, stop: this runbook is not a merge.

### 1. Validate and prepare the target

First define targets explicitly named restore:

```bash
export RESTORE_DB_URL='postgresql://postgres:…@restore-db:5432/postgres'
export RESTORE_SUPABASE_DIR=/srv/restore/supabase/docker
export RESTORE_SUPABASE_URL='https://restore-supabase.example.test'
export RESTORE_ANON_KEY='…'
export RESTORE_SERVICE_ROLE_KEY='…'
export RESTORE_REPORT_DIR="/srv/restore/reports/$BACKUP_ID"
```

1. get the offsite backup and check `SHA256SUMS`;
2. provision the same PostgreSQL major version and versions
   of Supabase images than in `supabase-images.txt`;
3. restore Supabase configuration and its secrets before first boot
   useful, or document voluntarily renewed secrets;
4. Start the blank Supabase stack to initialize its internal schematics, but
   keep its public proxy closed and the minddy application stopped;
5. confirm that the target database and the target Storage backend are indeed the targets
   expected disposables.

On a new target directory, the archived configuration can be reposted as follows:
before starting. Extraction writes the saved Compose files: do not
Never run it in the production directory or a non-empty target.

```bash
install -d -m 0700 "$RESTORE_SUPABASE_DIR"
tar -C "$RESTORE_SUPABASE_DIR" \
  -xzf "$BACKUP_DIR/config/supabase-compose.tar.gz"
install -m 0600 "$BACKUP_DIR/config/supabase.env" \
  "$RESTORE_SUPABASE_DIR/.env"
```

If `config/pgsodium_root.key` exists, restore it to volume `db-config`
according to the procedure of the archived Supabase version **before** loading the
data. Do not boot with a newly generated key when the database
saved contains Vault secrets.

Then initialize the stack without exposing its proxy:

```bash
cd "$RESTORE_SUPABASE_DIR"
sh run.sh start
docker compose ps
```

Use a separate PostgreSQL restore URL to render an error
visible target:

```bash
cd "$BACKUP_DIR"
sha256sum --check SHA256SUMS
psql "$RESTORE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "select current_database(), inet_server_addr(), version()"
```

### 2. Restaurer PostgreSQL

On the initialized but blank database, restore roles, schema and data in a
transaction. `session_replication_role = replica` prevents triggers from
replay effects while loading.

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
```

An error cancels the transaction concerned. Read the first error; don't
Do not arbitrarily remove a table or constraint from the dump. A difference
Auth, Storage, extension or PostgreSQL version generally means that the
target stack is not the one in the manifest.

### 3. Restore Storage bytes

Stop `storage` and `imgproxy` on the target. For the file backend, inspect
first list the archive, confirm that the target path is that of the
Compose blank, then extract:

```bash
cd "$RESTORE_SUPABASE_DIR"
docker compose stop storage imgproxy
tar -tzf "$BACKUP_DIR/storage-files.tar.gz" | sed -n '1,20p'
test -d "$RESTORE_SUPABASE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$RESTORE_SUPABASE_DIR/volumes" \
  -xzf "$BACKUP_DIR/storage-files.tar.gz"
docker compose up -d storage imgproxy
```

Extraction replaces homonymous files: it is only authorized on the
blank backend validated in the previous step. For an S3 backend, restore the
snapshot in an empty backend bucket, configure `GLOBAL_S3_BUCKET` to this
bucket then start Storage. Do not re-import objects via the Storage API
after restoring `storage.objects`.

### 4. Rest minddy and check the restoration

Check out the `minddy-commit.txt` commit, restore the application secrets,
only adapt the test environment URLs, then rebuild
the application. If the Supabase secrets have been renewed, also replace the
anon keys/mindy side service; users will have to log in again after
a rotation of the JWT secret.

```bash
export RESTORE_APP_URL='https://restore-tickets.example.test'
export NEXT_PUBLIC_SUPABASE_URL="$RESTORE_SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$RESTORE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$RESTORE_SERVICE_ROLE_KEY"
export NEXT_PUBLIC_APP_URL="$RESTORE_APP_URL"
export RESTORE_RELEASE_DIR="/srv/restore/minddy/releases/$BACKUP_ID"
git -C "$MINDDY_REPO" worktree add --detach "$RESTORE_RELEASE_DIR" \
  "$(cat "$BACKUP_DIR/minddy-commit.txt")"
cd "$RESTORE_RELEASE_DIR"
install -m 0600 "$BACKUP_DIR/config/minddy.env" .env.local
pnpm install --frozen-lockfile
pnpm build
pnpm bootstrap:supabase -- --db-url "$RESTORE_DB_URL" --env-file .env.local
pnpm verify:supabase --db-url "$RESTORE_DB_URL" \
  --supabase-url "$RESTORE_SUPABASE_URL" \
  --service-role-key "$RESTORE_SERVICE_ROLE_KEY"
```

The bootstrap should not apply any old migrations; he can only
apply those after the saved point if you consciously
checked out a newer tag. For faithful testing, use the commit first
saved.

Compare the restored row counts with those sealed in the backup:

```bash
install -d -m 0700 "$RESTORE_REPORT_DIR"
psql "$RESTORE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select jsonb_build_object(
    'auth.users', (select count(*) from auth.users),
    'public.projects', (select count(*) from public.projects),
    'public.issues', (select count(*) from public.issues),
    'public.attachments', (select count(*) from public.attachments),
    'storage.buckets', (select count(*) from storage.buckets),
    'storage.objects', (select count(*) from storage.objects)
  )::text
" > "$RESTORE_REPORT_DIR/counts.json"
diff -u "$BACKUP_DIR/database/counts.json" \
  "$RESTORE_REPORT_DIR/counts.json"
```

Then replay the functional journey of the update and download several
objects in each bucket, including a private attachment.

A restoration is declared tested only if:

- the hashes are valid and all SQL commands complete without errors;
- `verify:supabase` passes;
- the agreed counts correspond;
- a restored user can authenticate and read their data;
- restored Storage objects are actually downloadable;
- the date, duration, RPO observed and deviations are recorded.

Test this procedure at least after changing Supabase versions or
backend Storage and according to the frequency imposed by your RPO/RTO.

## Rollback and point of no return

| Moment of failure | Safe action |
| --- | --- |
| Before any migration | Restart the source tag with its environment; the backup remains usable. |
| After a migration, before opening | Only restart the old tag if the notes declare all backward compatible migrations. Otherwise restore the full game. |
| After opening for writing | Close immediately. Only restore the old snapshot after accepting the loss of subsequent writes or exporting them for manual recovery. |
| Secret rotation or backend change | Restore configuration, database and Storage together. A code rollback alone does not recreate a lost secret or moved objects. |

minddy migrations are forward facing and have no `down`
automatic. Don't invent reverse SQL incidentally. A deletion of
column/table, a data transformation, a change of type, a
rewriting identifiers or consolidating history is a point of
no return: rollback involves complete restoration.

Keep the old release and backup until the end of the period
observation. Deleting the old PostgreSQL volume, from the old bucket
or snapshot is itself irreversible and never forms part of the
update procedure.

## Diagnostics courants

Start by preserving the original error and time. Collect the outputs in
masking URL with password, JWT, cookies, `Authorization` headers and content
user.

```bash
cd "$MINDDY_REPO"
git -C "$MINDDY_CURRENT_DIR" describe --tags --always --dirty
cd "$MINDDY_CURRENT_DIR"
node -p "require('./package.json').version"
cd "$SUPABASE_COMPOSE_DIR"
docker compose ps
docker compose images
docker compose logs --since 15m --tail 300 db auth rest realtime storage
df -h
df -i
```

| Symptom | Controls and decision |
| --- | --- |
| Migration refused | Read the first `supabase db push` error, check disk, locks and `supabase_migrations.schema_migrations`. Correct the cause then restart: only the missing migrations are applied. Do not modify the registry by hand. |
| `relation does not exist`, column missing | The application probably started before the database or does not point to the migrated database. Return the maintenance, compare the URLs and restart the bootstrap of the deployed tag. |
| 401s generalized after restoration | Check the consistency between JWT secret, anon/service keys and application variables. After a voluntary rotation, force a new authentication; don't hand over an old key with a new secret. |
| 502/503 | Check `docker compose ps`, healthchecks and logs of the service behind the proxy. Check DNS/TLS and external URLs before looping again. |
| Unable to upload | Launch `verify:supabase`, check the buckets and policy `attachments insert`, space/inodes, mount permissions or S3 identifiers. |
| Object listed but download 404 | The `storage.objects` metadata exists but the bytes are missing in the backend. Compare snapshot, bucket/prefix and manifest; don't remove the metadata to hide the inconsistency. |
| File present but missing from API | The bytes and base do not come from the same point, or the file was copied directly into an unexpected format. Return to the consistent dump/snapshot pairing. |
| Real time absent | Verify that `supabase_realtime` exists with `verify:supabase`, then Realtime logs, JWT secret, WebSocket proxy and table subscription. |
| Inactive Background Jobs or 401 | Check the scheduler, the canonical URL and that its bearer corresponds to the current `CRON_SECRET`. Do not log this bearer. |
| Correct build, wrong URL in browser | A `NEXT_PUBLIC_*` value has changed without rebuilding. Rebuild then replace the artifact; a reboot alone is not enough. |
| SQL Restore Fails | Confirm that the target is blank and uses the PostgreSQL images/major from the manifest. An error in `data.sql` is often an Auth/Storage discrepancy; do not proceed with a partial restoration. |

To check only minddy invariants without modifying the schema, use
always `pnpm verify:supabase`. If the diagnosis requires a modification of
production, resume from a consistent backup and a new production window
maintenance.

## Infrastructure references

- [Backup and restore with the Supabase CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Backend and S3 protocol of Supabase Storage](https://supabase.com/docs/guides/self-hosting/self-hosted-s3)
- [PostgreSQL upgrade of a Supabase stack](https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17)
