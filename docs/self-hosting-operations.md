# Operate a self-hosted minddy instance

Use the same release checkout, protected environment file, and Compose files
as the [guided installation](self-hosting.md). A source build or a Supabase CLI
local stack is a different instance and cannot validate this installation.

## Reference Compose context

Open Bash and set paths to the instance you installed. These values are paths,
not credentials. Keep `MINDDY_ENV_FILE` outside release checkouts for new
installations; existing installations may retain the generated `.env` path.

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
  docker compose --env-file "$MINDDY_ENV_FILE" "${files[@]}" \
    -f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.$MODE.yml" "$@"
}
compose ps
```

For `managed`, set `MODE=managed`; the function then uses only the managed
profile. Never run bare `docker compose` in the upstream Supabase directory:
it would omit the generated environment and minddy overlay. The full profile
uses fixed upstream container names, so two full stacks need separate Docker
daemons or must be operated sequentially.

The environment contains the public URLs, image pin, encryption secrets, and
absolute deployment paths. Do not `source` it as shell code or print it in a
report. The full profile routes server HTTP requests to `http://kong:8000`
through `SUPABASE_INTERNAL_URL`; browsers, session-cookie names, generated
links, and attachment URLs retain the public Supabase origin.

## Restart and recover an interrupted installation

```bash
compose stop minddy
cd "$CURRENT_RELEASE_DIR"
pnpm self-host:install -- --non-interactive --mode "$MODE" \
  --supabase-dir "$SUPABASE_DIR" --env-file "$MINDDY_ENV_FILE"
pnpm self-host:doctor -- --mode "$MODE" --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

In managed mode also supply the managed database connection to the installer
and doctor. In full mode it is derived privately from the existing environment.
A retry retains the image and generated secrets. PostgreSQL stays on its
internal network; a separate TCP proxy publishes only the host loopback port
54322 and API port 8001 for bootstrap and maintenance while Caddy is stopped. The installer recognizes ports owned by
the same running Compose project. It recompiles the pinned upstream main Edge
Function with frozen `jose` dependencies and networking disabled, then restarts
that stateless service. No JSR registry access is needed during startup.

## Complete cold backup for the full reference profile

This Linux procedure covers the pinned official Supabase **filesystem Storage**
layout. It stops the whole Compose project, including PostgreSQL, before
copying physical database files. It preserves Auth, application data, Storage
metadata and bytes, migration history, policies, Vault keys, and configuration
at one consistent point. Use the same CPU architecture and exact PostgreSQL
image when restoring it. A PostgreSQL major upgrade requires a separate logical
migration. For managed Supabase or S3, use the logical/provider procedure below.

Set an encrypted destination with sufficient space outside the active data
folder. Announce the write outage; stop any external workers that access the
database directly. Do not use `down --volumes` on the source.

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
compose stop
# No writes or open PostgreSQL files remain after every service has stopped.
sudo tar --numeric-owner --acls --xattrs -C "$SUPABASE_DIR" \
  -czf "$BACKUP_DIR/supabase-docker.tar.gz" docker
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/instance.env"
docker run --rm --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$DB_CONFIG_VOLUME,dst=/keys,readonly" \
  "$BACKUP_HELPER_IMAGE" -czf - -C /keys . > "$BACKUP_DIR/db-config.tar.gz"
# Keep the deployed Compose files. Recompile the offline function bundle on restore.
tar -C "$CURRENT_RELEASE_DIR" -czf "$BACKUP_DIR/deployment.tar.gz" deploy/self-hosted
if [ -n "${RESTORE_OVERRIDE:-}" ]; then
  install -m 0600 "$RESTORE_OVERRIDE" "$BACKUP_DIR/source-volume-override.yml"
fi
sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR/supabase-docker.tar.gz"
(
  cd "$BACKUP_DIR"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum --check SHA256SUMS
)
```

Copy this sealed, encrypted set to an independent backup disk or host and
verify the checksums there. Keep TLS certificate storage separately if your
certificate policy requires retaining it; Caddy can otherwise obtain new
certificates after restore. A local second copy checks the procedure, but is
not protection against host loss. Preserve the verified release assets and
OCI digests with the backup. Retain the original database image by digest;
`postgres-image-id.txt` detects a different local image before physical restore.

Keep writes closed through an update. For a backup-only operation, resume with
`compose up -d --wait` after the sealed copy has been verified.

## Update the installed OCI instance

The order is **stop writes → sealed backup → target migrations → target image →
verify → reopen**. Download the next release into a separate checkout, verify
its tag, asset checksums and signed OCI digest as in
[clean-room verification](self-hosting-clean-room.md#1-prepare-the-disposable-host),
and run its frozen dependency install. Compare compatibility rows first: do
not combine this procedure with an upstream Supabase image change.

Make a protected copy of the current environment for the target. In that copy,
change only `MINDDY_RELEASE`, `MINDDY_IMAGE`, `MINDDY_DEPLOY_DIR`, and
`MINDDY_ENV_FILE` to the verified target identities and absolute paths. Retain
all credentials, URLs, encryption keys and feature choices. This deliberate
configuration change is why a resumed installer rejects a different `--image`.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_ENV_FILE=/etc/minddy/target.env
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_ENV_FILE"
# Edit the four deployment identity fields in TARGET_ENV_FILE as described above.
# Review the release notes and the migration diff before proceeding.
compose up -d --wait db database-access kong auth rest storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm install --frozen-lockfile
# Derive the loopback URL without putting a password in shell history or logs.
SUPABASE_DB_URL="$(node --input-type=module -e '
  import {readFileSync} from "node:fs";
  import {parseEnvironment,fullBootstrapDatabaseUrl} from "./scripts/self-hosting-install.mjs";
  console.log(fullBootstrapDatabaseUrl(parseEnvironment(readFileSync(process.env.TARGET_ENV_FILE,"utf8"))));
')"
node scripts/bootstrap-supabase.mjs --db-url "$SUPABASE_DB_URL" \
  --env-file "$TARGET_ENV_FILE" --existing-env --supabase-url http://127.0.0.1:8001 --enable scheduler
unset SUPABASE_DB_URL
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
export MINDDY_ENV_FILE="$TARGET_ENV_FILE"
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose pull minddy agent-runner
compose up -d --wait minddy agent-runner scheduler
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network
compose up -d --wait
```

Caddy stays stopped until the last command, so both public entry points stay
closed during migrations. Then sign in, verify the recorded project and issue
identifiers, download the attachment and compare its SHA-256, and check the
revoked integration key still fails. Reopen external workers only after these
checks. Record the exact image digest and migration history. Managed mode uses
the same target-environment and image sequence, with provider-controlled database
and Storage backup/migration access instead of starting local database services.

## Restore the full profile to a blank target

Use a new host/VM with the same architecture or, for a disposable rehearsal,
stop and remove source containers **without removing their data** before using
a new upstream checkout and new Compose volumes. Fixed upstream container names
prevent simultaneous full stacks on one daemon. Keep the source data directories
and sealed backup untouched.

1. Verify the backup checksums. Obtain the saved source tag and pinned upstream
   checkout in new directories. Install the frozen tooling dependencies.
2. Before extraction, verify that the target has no `docker/volumes/db/data`
   directory, no Storage objects, and no `db-config` volume. Record those facts.
   Do not run the normal installer or bootstrap against this empty target.
3. Extract `supabase-docker.tar.gz` into the new upstream directory with
   `sudo tar --numeric-owner --acls --xattrs -xzf`. This restores the **cold**
   PostgreSQL files and raw Storage together. Create a new named volume and
   extract `db-config.tar.gz` into it with the saved PostgreSQL image as a helper.
   Mount it at `/etc/postgresql-custom` using a target-only Compose override
   (`volumes: { db-config: { name: <new-volume-name> } }`).
4. Restore the protected environment. Change its absolute deployment paths,
   public origins and Auth redirect values for the new host; preserve passwords,
   JWT, Vault and application encryption keys. Compile the offline main function
   into the new environment's `.functions` directory. Start only the database,
   loopback proxy and Supabase dependencies, using the same Compose files plus
   that volume override. Compare the database image ID before starting it.
5. Run the doctor against the restored database and migration history. Start
   minddy, runner and scheduler with Caddy still stopped. Do not bootstrap a
   different release over the restored snapshot.
6. Start Caddy, sign in with the restored account and MFA, and verify project,
   issue, integration and attachment identifiers plus the downloaded bytes.
   Confirm links, OAuth, MCP and callbacks use the new public origin. Record
   the target directories/volume name, counts and attachment SHA-256.

For a sequential rehearsal, the commands below create separate restored data
and volume identities. Run them from the saved source release tooling, after
verifying the backup and obtaining a fresh pinned upstream checkout. Replace the
example paths and volume names with new, unused values. `compose down` removes
only the stopped source containers and networks; its bind directories and named
volumes remain. Remove any disposable inbox container first if it holds those
networks open.

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
# Edit deployment paths, public origins, SITE_URL, SUPABASE_PUBLIC_URL,
# API_EXTERNAL_URL, host/site addresses, and ADDITIONAL_REDIRECT_URLS.
# Review the HTTP bind addresses when moving between localhost and a private LAN.
# Retain every secret and the saved release/image identity.
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
  docker compose --env-file "$MINDDY_ENV_FILE" \
    -f "$SUPABASE_DIR/docker/docker-compose.yml" \
    -f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.full.yml" \
    -f "$RESTORE_OVERRIDE" "$@"
}
BACKUP_HELPER_IMAGE="$(cat "$BACKUP_DIR/postgres-image-id.txt")"
docker image inspect "$BACKUP_HELPER_IMAGE" >/dev/null
docker volume create "$RESTORE_DB_CONFIG"
docker run --rm -i --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$RESTORE_DB_CONFIG,dst=/keys" \
  "$BACKUP_HELPER_IMAGE" -xzf - -C /keys < "$BACKUP_DIR/db-config.tar.gz"
# Create without starting; compare the resolved database image before it reads data.
compose create db
test "$(docker inspect "$(compose ps --all -q db)" --format '{{.Image}}')" = \
  "$BACKUP_HELPER_IMAGE"
cd "$CURRENT_RELEASE_DIR"
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
compose up -d --wait minddy agent-runner scheduler
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network
compose up -d --wait
```

Keep `RESTORE_OVERRIDE` in the restored instance's Compose context for every
future mutation, backup and update. A bare two-file `up` would select the source
volume names again. The doctor reads project status and the loopback API without
recreating containers. Start a new disposable inbox on the restored networks if
confirmation or recovery email is part of the rehearsal.

A rollback after migrations uses this complete pre-update backup on a blank
target. Changing only the application image back is allowed only when the
release notes explicitly guarantee schema compatibility. Keep the failed
updated stack stopped until the restored instance passes verification.

## Managed or custom Storage backups

The following logical procedure is for operator-managed source deployments,
managed Supabase and custom Storage backends. It is not a continuation of the
reference full-profile cold backup above. Map its database, Storage and proxy
commands to the **same** installed instance; provider snapshots must include raw
Storage bytes separately from PostgreSQL. Managed providers own their platform
roles and server filesystem, so use their supported restore workflow.

See the [logical backup and restore procedure](self-hosting-logical-operations.md)
for SQL schema/data exports, managed policies and provider Storage requirements.
