---
{
  "id": "restore-and-roll-back",
  "locale": "de",
  "title": "Einen vollständigen Satz auf leerem Ziel wiederherstellen",
  "summary": "Wiederherstellung überschreibt ihr Ziel und führt keine Daten zusammen.",
  "topic": "Instanz betreiben",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H14"
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "back-up-the-reference-instance",
    "logical-and-provider-backups",
    "update-an-instance"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "restore-and-roll-back-flow",
      "kind": "diagram",
      "src": "/documentation/de/restore-and-roll-back-flow.svg",
      "alt": "Diagramm: Geprüftes vollständiges externes Backup. Leeres isoliertes Ziel mit passenden Versionen. Datenbank, Bytes und Schlüssel gemeinsam. Konto, Inhalte und Bytes vor Öffnung prüfen.",
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Geprüftes vollständiges externes Backup. Leeres isoliertes Ziel mit passenden Versionen. Datenbank, Bytes und Schlüssel gemeinsam. Konto, Inhalte und Bytes vor Öffnung prüfen.",
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
    "restore-and-roll-back-flow"
  ]
}
---

## Einen vollständigen Satz auf leerem Ziel wiederherstellen {#restore-and-roll-back}

Wiederherstellung überschreibt ihr Ziel und führt keine Daten zusammen. Holen Sie das versiegelte externe Backup, prüfen Sie SHA256SUMS und lassen Sie Quelldaten unverändert. Zielzugang, Scheduler und externe Worker bleiben gestoppt. Physisches full-Restore verlangt gesicherte Architektur und exaktes PostgreSQL-Image. Holen Sie Quelltag und festgelegtes Upstream in neue Verzeichnisse und installieren Sie eingefrorene Werkzeuge. Prüfen Sie fehlendes Ziel-Datenbankverzeichnis, keine Storage-Objekte und kein db-config-Volume. Führen Sie auf dem leeren physischen Ziel keinen normalen Installer oder Bootstrap aus.


![Diagramm: Geprüftes vollständiges externes Backup. Leeres isoliertes Ziel mit passenden Versionen. Datenbank, Bytes und Schlüssel gemeinsam. Konto, Inhalte und Bytes vor Öffnung prüfen.](/documentation/de/restore-and-roll-back-flow.svg)

## full-Dateisystem wiederherstellen {#physical}

Nutzen Sie die vollständige physische Sequenz mit neuen Pfaden und Volumenamen. Sie entfernt gestoppte Quellcontainer ohne Volumenlöschung, stellt kaltes PostgreSQL und Storage zusammen wieder her, restauriert db-config mit gesichertem Image und vergleicht dieses vor Datenbankstart. Ändern Sie in der geschützten Umgebung nur Zielpfade, öffentliche Origins und Auth-Weiterleitungen. Erhalten Sie JWT, Passwörter, Vault-/Anwendungsschlüssel und Release-/Imageidentität. RESTORE_OVERRIDE muss bei jeder weiteren Operation bleiben; Weglassen kann Quellvolumes auswählen. Kompilieren Sie die Offline-Hauptfunktion, starten Sie Abhängigkeiten und Anwendung/Runner und prüfen Sie Wartungsbereitschaft vor Öffnung.


Definieren Sie vor dem ersten compose down den [installierten Compose-Kontext der Quellinstanz](/de/dokumentation/back-up-the-reference-instance#context) einschließlich ihres vorhandenen Overrides.

Falls storage-volume.tar.gz vorhanden ist, stellen Sie das Archiv in einem neuen benannten Linux-Volume wieder her und verbinden Sie genau dieses Volume über den dauerhaften Restore-Override, bevor Sie Storage starten. Die Prüfung auf ein leeres Ziel gilt auch für dieses Volume.

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

## Logischen Satz wiederherstellen {#logical}

Provisionieren Sie für logisches Restore einen leeren Stack mit aufgezeichneten PostgreSQL-/Supabase-Versionen und passenden Konfigurationen/Schlüsseln. Prüfen Sie Zieldatenbank und Rohstorage vor SQL. Stellen Sie Rollen, Schema und Daten in einer Transaktion wieder her, anschließend Migrationshistorie und verwaltete Richtlinien. Stoppen Sie Ziel-Storage und restaurieren Sie Rohdateien oder S3-Snapshot in ein neues leeres Backend. Kein Upload über Storage-API. Managed-Anbieter verlangen ihr eigenes Restore-Verfahren statt Dateisystembefehlen. Verwenden Sie den gesicherten Anwendungskommit und seine Schlüssel mit isolierten Ziel-Origins.


Die folgenden Befehle für logische Extraktion, run.sh und Dateisystem-Storage gelten nur für ein vom Betreiber kontrolliertes Backend. Stellen Sie bei verwaltetem Supabase Datenbank und rohe Objektbytes mit dem unterstützten Anbieterprozess in einem leeren Ziel wieder her. Konfigurieren und starten Sie Minddy anschließend nach [der Quellinstallation](/de/dokumentation/managed-or-source-installation#source). Führen Sie für ein Projekt auf supabase.com keine lokalen Compose-Befehle aus.

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


Starten Sie die wiederhergestellte Anwendung nach Quellbuild und Prüfung mit pnpm start oder dem aufgezeichneten Prozessmanager aus [der Quellinstallation](/de/dokumentation/managed-or-source-installation#source). Halten Sie öffentlichen Zugang und Jobs bis zum Bestehen der folgenden Prüfungen geschlossen.

## Ergebnis überprüfen {#verify}

Vergleichen Sie erfasste Datensatz- und Objektzahlen. Melden Sie sich mit wiederhergestelltem Konto und MFA an, lesen Sie verschlüsselte Projekte/Tickets/Seiten und laden Sie Objekte jedes Buckets mit gleichem SHA-256 herunter. Prüfen Sie Integrationen, widerrufene Schlüssel, Realtime, Jobs, OAuth/MCP und Callback-Origins. Erfassen Sie Zielpfade, Volumes, Versionen, Dauer und beobachtetes Datenverlustfenster. Verwenden Sie nach Migrationsfehler den passenden Vorupdatesatz. Nach Backup wieder geöffnete Schreibzugriffe können bei Rücksetzung verloren gehen. Erfinden Sie keine Rückwärtsmigrationen und erklären Sie gesunde Container nicht zur Wiederherstellungsprüfung.
